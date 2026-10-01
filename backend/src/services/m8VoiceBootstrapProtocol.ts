export const M8_VOICE_PROTOCOL_VERSION = 1;

export const M8_VOICE_BOOTSTRAP_TIMEOUTS_MS = {
    config: 6_000,
    microphone: 15_000,
    peerOffer: 10_000,
    sessionRequest: 20_000,
    remoteDescription: 15_000,
    dataChannel: 15_000,
    providerSession: 20_000,
} as const;

export type M8VoiceBootstrapPhase =
    | 'idle'
    | 'webview_ready'
    | 'native_ready'
    | 'config_requested'
    | 'config_received'
    | 'config_acknowledged'
    | 'auth_ready'
    | 'voice_session_requested'
    | 'voice_session_received'
    | 'rtc_negotiating'
    | 'data_channel_ready'
    | 'listening'
    | 'audio_ready'
    | 'failed'
    | 'closed';

export type M8VoiceBootstrapEvent =
    | { type: 'webview_ready' }
    | { type: 'native_ready' }
    | { type: 'config_requested' }
    | { type: 'config_received' }
    | { type: 'config_acknowledged' }
    | { type: 'auth_ready' }
    | { type: 'voice_session_requested' }
    | { type: 'voice_session_received' }
    | { type: 'rtc_negotiating' }
    | { type: 'data_channel_ready' }
    | { type: 'listening' }
    | { type: 'audio_ready' }
    | { type: 'failed' }
    | { type: 'closed' };

export type M8VoiceBootstrapState = {
    phase: M8VoiceBootstrapPhase;
    transitions: M8VoiceBootstrapPhase[];
    sideEffects: number;
};

const allowed: Record<M8VoiceBootstrapPhase, readonly M8VoiceBootstrapPhase[]> = {
    idle: ['webview_ready', 'native_ready', 'failed', 'closed'],
    webview_ready: ['native_ready', 'config_requested', 'failed', 'closed'],
    native_ready: ['webview_ready', 'config_requested', 'failed', 'closed'],
    config_requested: ['config_requested', 'config_received', 'failed', 'closed'],
    config_received: ['config_acknowledged', 'failed', 'closed'],
    config_acknowledged: ['auth_ready', 'failed', 'closed'],
    auth_ready: ['voice_session_requested', 'failed', 'closed'],
    voice_session_requested: ['voice_session_received', 'failed', 'closed'],
    voice_session_received: ['rtc_negotiating', 'failed', 'closed'],
    rtc_negotiating: ['data_channel_ready', 'failed', 'closed'],
    data_channel_ready: ['listening', 'failed', 'closed'],
    listening: ['audio_ready', 'failed', 'closed', 'listening'],
    audio_ready: ['audio_ready', 'listening', 'failed', 'closed'],
    failed: ['webview_ready', 'native_ready', 'closed'],
    closed: ['webview_ready', 'native_ready'],
};

export function createM8VoiceBootstrapState(): M8VoiceBootstrapState {
    return { phase: 'idle', transitions: ['idle'], sideEffects: 0 };
}

export function transitionM8VoiceBootstrap(
    state: M8VoiceBootstrapState,
    event: M8VoiceBootstrapEvent,
): M8VoiceBootstrapState {
    const next = event.type as M8VoiceBootstrapPhase;
    if (!allowed[state.phase].includes(next)) {
        return { ...state, phase: 'failed', transitions: [...state.transitions, 'failed'] };
    }
    return { ...state, phase: next, transitions: [...state.transitions, next] };
}

export type M8VoiceBootstrapScenario = {
    order: 'webview-first' | 'native-first';
    dropFirstConfigRequest?: boolean;
    duplicateMessages?: boolean;
    delayedConfig?: boolean;
    reload?: boolean;
    auth: 'valid' | 'invalid';
    backend: 'ok' | 'slow' | 'error';
    realtime: 'ok' | 'error';
    rtc: 'ok' | 'timeout';
    reconnect?: boolean;
};

export function runM8VoiceBootstrapScenario(scenario: M8VoiceBootstrapScenario): M8VoiceBootstrapState {
    let state = createM8VoiceBootstrapState();
    const apply = (type: M8VoiceBootstrapEvent['type']) => {
        state = transitionM8VoiceBootstrap(state, { type } as M8VoiceBootstrapEvent);
    };
    const start = (allowRecovery = true) => {
        if (scenario.order === 'native-first') {
            apply('native_ready');
            apply('webview_ready');
        } else {
            apply('webview_ready');
            apply('native_ready');
        }
        apply('config_requested');
        if (scenario.dropFirstConfigRequest) apply('config_requested');
        if (scenario.delayedConfig) apply('config_requested');
        if (scenario.duplicateMessages) apply('config_requested');
        apply('config_received');
        apply('config_acknowledged');
        if (scenario.auth === 'invalid') { apply('failed'); return; }
        apply('auth_ready');
        apply('voice_session_requested');
        if (scenario.backend !== 'ok') { apply('failed'); return; }
        apply('voice_session_received');
        if (scenario.realtime !== 'ok' || scenario.rtc === 'timeout') { apply('failed'); return; }
        apply('rtc_negotiating');
        apply('data_channel_ready');
        apply('listening');
        apply('audio_ready');
        if (scenario.duplicateMessages) {
            apply('listening');
            apply('audio_ready');
        }
        if (scenario.reconnect && allowRecovery) {
            apply('closed');
            start(false);
        }
    };
    if (scenario.reload) {
        start();
        if (state.phase !== 'failed') {
            apply('closed');
            start(false);
        }
    } else {
        start();
    }
    return state;
}
