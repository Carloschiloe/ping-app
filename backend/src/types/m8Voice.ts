/**
 * Provider-neutral contract for the M8 voice spike.
 *
 * This is deliberately not a provider SDK type. It describes the boundary
 * between a live voice transport and the existing Ping Core so candidates can
 * be measured without creating a second agent or granting audio authority.
 */
export type M8VoiceTransport =
    | 'gpt_live_webrtc'
    | 'realtime_webrtc_sideband'
    | 'gpt_live_websocket'
    | 'chained_batch';

export type M8VoiceSessionState =
    | 'idle'
    | 'connecting'
    | 'listening'
    | 'thinking'
    | 'speaking'
    | 'interrupted'
    | 'fallback'
    | 'closed';

export type M8VoiceEventType =
    | 'session_started'
    | 'session_ready'
    | 'input_started'
    | 'transcript_partial'
    | 'transcript_final'
    | 'core_turn_started'
    | 'core_turn_completed'
    | 'assistant_audio_started'
    | 'assistant_audio_stopped'
    | 'barge_in'
    | 'fallback_entered'
    | 'session_closed';

export interface M8VoiceIdentityContext {
    actorUserId: string;
    conversationId: string;
    voiceSessionId: string;
    locale: string;
    timeZone: string;
}

export interface M8VoiceEvent {
    type: M8VoiceEventType;
    atMs: number;
    turnId?: string;
    text?: string;
    identity?: M8VoiceIdentityContext;
    confirmationRequired?: boolean;
    authorizationPreserved?: boolean;
    provider?: string;
    reason?: string;
    actionProposed?: boolean;
}

export interface M8VoiceSessionTrace {
    transport: M8VoiceTransport;
    identity: M8VoiceIdentityContext;
    events: M8VoiceEvent[];
    actionExecutions: number;
    persistenceMutations: number;
    toolCalls: number;
}

export interface M8VoiceSessionMeasurement {
    transport: M8VoiceTransport;
    valid: boolean;
    state: M8VoiceSessionState;
    turns: number;
    firstUsefulAudioMs: number | null;
    interruptionResponseMs: number | null;
    coreTurnDurationsMs: number[];
    identityContinuity: boolean;
    authorizationPreserved: boolean;
    confirmationRequiredForActions: boolean;
    sideEffects: number;
    violations: string[];
}

export interface M8VoiceArchitectureCandidate {
    id: M8VoiceTransport;
    mediaPath: 'full_duplex' | 'chained';
    interruption: 'native' | 'application' | 'none';
    coreIntegration: 'sideband' | 'backend_bridge' | 'existing_batch_boundary';
    privacyBoundary: 'backend_session_delegation' | 'backend_transcription' | 'client_provider_session';
    evidenceStatus: 'pending' | 'measured';
}
