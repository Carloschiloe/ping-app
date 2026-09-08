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

export type VoiceSessionEvent =
    | 'START_PERMISSION_CHECK'
    | 'CAPTURE_STARTED'
    | 'CAPTURE_STOPPED'
    | 'TRANSCRIPT_READY'
    | 'AGENT_SUBMITTED'
    | 'AGENT_FINISHED'
    | 'CANCEL'
    | 'FAIL'
    | 'RESET';

export type MicrophonePermissionState = 'unknown' | 'granted' | 'denied' | 'blocked' | 'restricted';

const TRANSITIONS: Record<VoiceSessionState, Partial<Record<VoiceSessionEvent, VoiceSessionState>>> = {
    idle: { START_PERMISSION_CHECK: 'listening', CANCEL: 'cancelled' },
    listening: { CAPTURE_STARTED: 'capturing', CANCEL: 'cancelled', FAIL: 'failed' },
    capturing: { CAPTURE_STOPPED: 'transcribing', CANCEL: 'cancelled', FAIL: 'failed' },
    transcribing: { TRANSCRIPT_READY: 'interpreting', CANCEL: 'cancelled', FAIL: 'failed' },
    interpreting: { AGENT_SUBMITTED: 'responding', CANCEL: 'cancelled', FAIL: 'failed', RESET: 'idle' },
    responding: { AGENT_FINISHED: 'ended', CANCEL: 'cancelled', FAIL: 'failed' },
    ended: { RESET: 'idle', START_PERMISSION_CHECK: 'listening' },
    cancelled: { RESET: 'idle', START_PERMISSION_CHECK: 'listening' },
    failed: { RESET: 'idle', START_PERMISSION_CHECK: 'listening' },
};

export function transitionVoiceSession(state: VoiceSessionState, event: VoiceSessionEvent): VoiceSessionState {
    const next = TRANSITIONS[state][event];
    if (!next) throw new Error(`invalid_voice_transition:${state}:${event}`);
    return next;
}

export function mapMicrophonePermission(input: {
    status?: string;
    granted: boolean;
    canAskAgain: boolean;
}): MicrophonePermissionState {
    if (input.granted || input.status === 'granted') return 'granted';
    if (input.status === 'undetermined') return 'unknown';
    if (input.status === 'restricted') return 'restricted';
    return input.canAskAgain ? 'denied' : 'blocked';
}

export function createEphemeralUuid(random = Math.random, now = Date.now()): string {
    let seed = `${now.toString(16).padStart(12, '0')}${Math.floor(random() * Number.MAX_SAFE_INTEGER).toString(16).padStart(14, '0')}`;
    seed = `${seed}${Math.floor(random() * Number.MAX_SAFE_INTEGER).toString(16).padStart(14, '0')}`.slice(0, 32);
    return `${seed.slice(0, 8)}-${seed.slice(8, 12)}-4${seed.slice(13, 16)}-a${seed.slice(17, 20)}-${seed.slice(20, 32)}`;
}

export function voiceStatusCopy(state: VoiceSessionState): string | null {
    switch (state) {
        case 'listening': return 'Preparando micrófono…';
        case 'capturing': return 'Escuchando…';
        case 'transcribing': return 'Transcribiendo…';
        case 'interpreting': return 'Revisa la transcripción';
        case 'responding': return 'Ping está respondiendo…';
        case 'cancelled': return 'Grabación cancelada';
        case 'failed': return 'No se pudo procesar la voz';
        default: return null;
    }
}
