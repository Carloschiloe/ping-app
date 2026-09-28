import type {
    M8VoiceArchitectureCandidate,
    M8VoiceEvent,
    M8VoiceEventType,
    M8VoiceSessionMeasurement,
    M8VoiceSessionState,
    M8VoiceSessionTrace,
} from '../types/m8Voice';

const allowedTransitions: Record<M8VoiceSessionState, Partial<Record<M8VoiceEventType, M8VoiceSessionState>>> = {
    idle: { session_started: 'connecting' },
    connecting: { session_ready: 'listening', fallback_entered: 'fallback', session_closed: 'closed' },
    listening: { input_started: 'listening', transcript_partial: 'listening', transcript_final: 'thinking', session_closed: 'closed' },
    thinking: { core_turn_started: 'thinking', core_turn_completed: 'speaking', fallback_entered: 'fallback', session_closed: 'closed' },
    speaking: { assistant_audio_started: 'speaking', assistant_audio_stopped: 'listening', barge_in: 'interrupted', session_closed: 'closed' },
    interrupted: { input_started: 'listening', assistant_audio_stopped: 'listening', fallback_entered: 'fallback', session_closed: 'closed' },
    fallback: { input_started: 'listening', session_closed: 'closed' },
    closed: {},
};

function eventIdentityMatches(trace: M8VoiceSessionTrace, event: M8VoiceEvent): boolean {
    if (!event.identity) return true;
    return event.identity.actorUserId === trace.identity.actorUserId
        && event.identity.conversationId === trace.identity.conversationId
        && event.identity.voiceSessionId === trace.identity.voiceSessionId;
}

function measureLatency(events: M8VoiceEvent[], from: M8VoiceEventType, to: M8VoiceEventType): number | null {
    const start = events.find(event => event.type === from);
    const end = events.find(event => event.type === to && (!start || event.atMs >= start.atMs));
    return start && end ? end.atMs - start.atMs : null;
}

export function measureM8VoiceSession(trace: M8VoiceSessionTrace): M8VoiceSessionMeasurement {
    let state: M8VoiceSessionState = 'idle';
    const violations: string[] = [];
    const coreStarts = new Map<string, number>();
    const coreTurnDurationsMs: number[] = [];
    let turns = 0;
    let identityContinuity = true;
    let authorizationPreserved = true;
    let confirmationRequiredForActions = true;
    let firstUsefulAudioMs: number | null = null;
    let interruptionResponseMs: number | null = null;

    for (const event of trace.events) {
        if (event.atMs < 0) violations.push('negative_event_time');
        if (!eventIdentityMatches(trace, event)) {
            identityContinuity = false;
            violations.push('identity_context_changed');
        }
        const next: M8VoiceSessionState | undefined = allowedTransitions[state][event.type];
        if (!next) {
            violations.push(`invalid_transition:${state}->${event.type}`);
        } else {
            state = next;
        }
        if (event.type === 'core_turn_started' && event.turnId) coreStarts.set(event.turnId, event.atMs);
        if (event.type === 'core_turn_completed') {
            turns += 1;
            if (event.turnId && coreStarts.has(event.turnId)) {
                coreTurnDurationsMs.push(event.atMs - (coreStarts.get(event.turnId) as number));
            }
            if (event.actionProposed === true && event.confirmationRequired !== true) confirmationRequiredForActions = false;
            if (event.authorizationPreserved !== true) authorizationPreserved = false;
        }
        if (event.type === 'assistant_audio_started' && firstUsefulAudioMs === null) {
            firstUsefulAudioMs = measureLatency(trace.events, 'input_started', 'assistant_audio_started');
        }
        if (event.type === 'barge_in') {
            const stopped = trace.events.find(candidate => candidate.type === 'assistant_audio_stopped' && candidate.atMs >= event.atMs);
            interruptionResponseMs = stopped ? stopped.atMs - event.atMs : null;
            if (!stopped) violations.push('barge_in_without_audio_stop');
        }
    }

    const sideEffects = trace.actionExecutions + trace.persistenceMutations + trace.toolCalls;
    if (sideEffects > 0) violations.push('side_effects_detected');
    if (state !== 'closed' && trace.events.at(-1)?.type === 'session_closed') violations.push('close_state_mismatch');

    return {
        transport: trace.transport,
        valid: violations.length === 0,
        state,
        turns,
        firstUsefulAudioMs,
        interruptionResponseMs,
        coreTurnDurationsMs,
        identityContinuity,
        authorizationPreserved,
        confirmationRequiredForActions,
        sideEffects,
        violations,
    };
}

export function compareM8VoiceCandidates(candidates: M8VoiceArchitectureCandidate[]): M8VoiceArchitectureCandidate[] {
    return [...candidates].sort((left, right) => {
        if (left.evidenceStatus !== right.evidenceStatus) return left.evidenceStatus === 'measured' ? -1 : 1;
        if (left.mediaPath !== right.mediaPath) return left.mediaPath === 'full_duplex' ? -1 : 1;
        if (left.interruption !== right.interruption) return left.interruption === 'native' ? -1 : 1;
        return left.id.localeCompare(right.id);
    });
}
