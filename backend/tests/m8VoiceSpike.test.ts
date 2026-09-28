import { describe, expect, it } from 'vitest';
import { compareM8VoiceCandidates, measureM8VoiceSession } from '../src/services/m8VoiceSpike.service';
import type { M8VoiceSessionTrace } from '../src/types/m8Voice';

const identity = {
    actorUserId: 'actor-1',
    conversationId: 'conversation-1',
    voiceSessionId: 'voice-1',
    locale: 'es-CL',
    timeZone: 'America/Santiago',
};

function validTrace(): M8VoiceSessionTrace {
    return {
        transport: 'gpt_live_webrtc',
        identity,
        actionExecutions: 0,
        persistenceMutations: 0,
        toolCalls: 0,
        events: [
            { type: 'session_started', atMs: 0, identity },
            { type: 'session_ready', atMs: 40, identity },
            { type: 'input_started', atMs: 100, identity, turnId: 'turn-1' },
            { type: 'transcript_final', atMs: 240, identity, turnId: 'turn-1', text: 'consulta técnica' },
            { type: 'core_turn_started', atMs: 250, identity, turnId: 'turn-1' },
            { type: 'core_turn_completed', atMs: 520, identity, turnId: 'turn-1', authorizationPreserved: true, actionProposed: true, confirmationRequired: true },
            { type: 'assistant_audio_started', atMs: 600, identity, turnId: 'turn-1' },
            { type: 'barge_in', atMs: 780, identity, turnId: 'turn-1' },
            { type: 'assistant_audio_stopped', atMs: 790, identity, turnId: 'turn-1' },
            { type: 'input_started', atMs: 800, identity, turnId: 'turn-2' },
            { type: 'transcript_final', atMs: 920, identity, turnId: 'turn-2', text: 'continuación' },
            { type: 'core_turn_started', atMs: 930, identity, turnId: 'turn-2' },
            { type: 'core_turn_completed', atMs: 1100, identity, turnId: 'turn-2', authorizationPreserved: true, actionProposed: true, confirmationRequired: true },
            { type: 'assistant_audio_started', atMs: 1160, identity, turnId: 'turn-2' },
            { type: 'assistant_audio_stopped', atMs: 1300, identity, turnId: 'turn-2' },
            { type: 'session_closed', atMs: 1320, identity },
        ],
    };
}

describe('M8 voice spike contract', () => {
    it('preserves Core identity, confirmation and zero side effects through barge-in', () => {
        const measurement = measureM8VoiceSession(validTrace());
        expect(measurement.valid).toBe(true);
        expect(measurement.turns).toBe(2);
        expect(measurement.identityContinuity).toBe(true);
        expect(measurement.authorizationPreserved).toBe(true);
        expect(measurement.confirmationRequiredForActions).toBe(true);
        expect(measurement.interruptionResponseMs).toBe(10);
        expect(measurement.sideEffects).toBe(0);
    });

    it('rejects cross-context identity and action execution', () => {
        const trace = validTrace();
        trace.events[3] = { ...trace.events[3], identity: { ...identity, conversationId: 'other-conversation' } };
        trace.actionExecutions = 1;
        const measurement = measureM8VoiceSession(trace);
        expect(measurement.valid).toBe(false);
        expect(measurement.violations).toContain('identity_context_changed');
        expect(measurement.violations).toContain('side_effects_detected');
    });

    it('does not require confirmation for a read-only Core turn', () => {
        const trace = validTrace();
        trace.events = trace.events.map(event => event.type === 'core_turn_completed'
            ? { ...event, actionProposed: false, confirmationRequired: false }
            : event);
        const measurement = measureM8VoiceSession(trace);
        expect(measurement.valid).toBe(true);
        expect(measurement.confirmationRequiredForActions).toBe(true);
    });

    it('does not rank an unmeasured provider above evidence', () => {
        const ranked = compareM8VoiceCandidates([
            { id: 'chained_batch', mediaPath: 'chained', interruption: 'none', coreIntegration: 'existing_batch_boundary', privacyBoundary: 'backend_transcription', evidenceStatus: 'pending' },
            { id: 'gpt_live_webrtc', mediaPath: 'full_duplex', interruption: 'native', coreIntegration: 'backend_bridge', privacyBoundary: 'backend_session_delegation', evidenceStatus: 'pending' },
        ]);
        expect(ranked.every(candidate => candidate.evidenceStatus === 'pending')).toBe(true);
        expect(ranked).toHaveLength(2);
    });
});
