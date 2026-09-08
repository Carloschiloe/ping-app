export const AGENT_SURFACES = [
    'mobile_text',
    'mobile_voice',
    'desktop',
    'web',
    'tablet',
    'car',
    'device',
    'future',
] as const;

export type AgentSurface = typeof AGENT_SURFACES[number];
export type AgentInputModality = 'text' | 'voice' | 'future_multimodal';
export type VoiceSessionState =
    | 'idle'
    | 'listening'
    | 'capturing'
    | 'transcribing'
    | 'interpreting'
    | 'responding'
    | 'ended'
    | 'cancelled'
    | 'failed';

export type MicrophonePermissionState = 'unknown' | 'granted' | 'denied' | 'blocked' | 'restricted';
export type TranscriptStatus = 'partial' | 'final' | 'failed';

export interface TranscriptSegment {
    startMs: number;
    endMs: number;
    text: string;
    confidence: number | null;
    speakerRef?: string;
}

export interface CanonicalTranscript {
    transcriptId: string;
    audioRef: string;
    actorUserId: string;
    language: string | null;
    segments: TranscriptSegment[] | null;
    confidence: number | null;
    provider: string;
    model: string;
    observedAt: string;
    source: 'agent_voice';
    status: TranscriptStatus;
    text: string;
    provenance: {
        voiceSessionId: string;
        capturedAt: string;
        explicitConsent: true;
    };
}

export type ContextSignalType =
    | 'active_screen'
    | 'current_conversation'
    | 'current_commitment'
    | 'device_type'
    | 'timezone'
    | 'network_state';

export type ContextClass = 'session' | 'device' | 'user' | 'ambient';
export type ContextSensitivity = 'low' | 'medium' | 'high';

export interface ContextSignal {
    signalType: ContextSignalType;
    value: string;
    source: 'client_session' | 'server';
    contextClass: ContextClass;
    capturedAt: string;
    expiresAt: string;
    confidence: number;
    sensitivity: ContextSensitivity;
    permissionBasis: 'explicit_user_action' | 'foreground_session';
    provenance: {
        deviceSessionId: string;
        actorUserId: string;
    };
}

export interface ContextReferent {
    referentType: 'current_entity';
    canonicalEntityType: 'commitment' | 'conversation';
    canonicalEntityId: string;
    sourceTurnId: string;
    confidence: number;
    expiresAt: string;
    actorScope: string;
    resolvedFromSignal: ContextSignalType;
}

export interface AgentSession {
    sessionId: string;
    actorUserId: string;
    deviceSessionId: string;
    surface: AgentSurface;
    startedAt: string;
    lastInteractionAt: string;
    expiresAt: string;
    voiceSessionId: string | null;
    signals: ContextSignal[];
    referents: ContextReferent[];
}

export interface VoiceSession {
    voiceSessionId: string;
    agentSessionId: string;
    actorUserId: string;
    surface: AgentSurface;
    state: VoiceSessionState;
    startedAt: string;
    endedAt: string | null;
    failureCode?: string;
}

export interface AgentInputEnvelope {
    inputId: string;
    actorUserId: string;
    surface: AgentSurface;
    modality: AgentInputModality;
    content: string;
    audioRef: string | null;
    transcriptRef: string | null;
    conversationId: string | null;
    agentSessionId: string | null;
    deviceSessionId: string | null;
    locale: string | null;
    timeZone: string | null;
    capturedAt: string;
    explicitConsentContext: {
        captureInitiatedBy: 'user_action';
        voiceAuthorizationAllowed: false;
    } | null;
    provenance: {
        traceId: string;
        transcriptStatus: 'final' | null;
        provider: string | null;
        confidence: number | null;
    };
}

export interface AgentOutputEnvelope {
    outputId: string;
    inputId: string;
    text: string;
    modalities: Array<'text' | 'speech'>;
    speechRef: string | null;
    createdAt: string;
    provenance: {
        semanticSource: 'agent_response_text';
    };
}
