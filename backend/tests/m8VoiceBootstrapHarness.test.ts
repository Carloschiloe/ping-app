import { describe, expect, it } from 'vitest';
import {
    M8_VOICE_BOOTSTRAP_TIMEOUTS_MS,
    M8_VOICE_PROTOCOL_VERSION,
    runM8VoiceBootstrapScenario,
} from '../src/services/m8VoiceBootstrapProtocol';

const healthy = {
    auth: 'valid' as const,
    backend: 'ok' as const,
    realtime: 'ok' as const,
    rtc: 'ok' as const,
};

describe('M8 deterministic bootstrap harness', () => {
    it.each([
        ['WebView before RN', { order: 'webview-first' as const }],
        ['RN before WebView', { order: 'native-first' as const }],
        ['lost first request', { order: 'webview-first' as const, dropFirstConfigRequest: true }],
        ['duplicate messages', { order: 'native-first' as const, duplicateMessages: true }],
        ['delayed response', { order: 'webview-first' as const, delayedConfig: true }],
        ['reload/remount', { order: 'webview-first' as const, reload: true }],
        ['reconnect', { order: 'native-first' as const, reconnect: true }],
    ])('%s reaches listening without side effects', (_name, scenario) => {
        const result = runM8VoiceBootstrapScenario({ ...healthy, ...scenario });
        expect(result.phase).toBe('audio_ready');
        expect(result.transitions).toContain('config_acknowledged');
        expect(result.transitions).toContain('auth_ready');
        expect(result.transitions).toContain('voice_session_received');
        expect(result.transitions).toContain('listening');
        expect(result.sideEffects).toBe(0);
        expect(result.transitions).not.toContain('failed');
    });

    it.each([
        ['invalid auth', { ...healthy, order: 'webview-first' as const, auth: 'invalid' as const }],
        ['backend error', { ...healthy, order: 'webview-first' as const, backend: 'error' as const }],
        ['realtime error', { ...healthy, order: 'native-first' as const, realtime: 'error' as const }],
        ['RTC timeout', { ...healthy, order: 'native-first' as const, rtc: 'timeout' as const }],
    ])('%s reaches a recoverable terminal state', (_name, scenario) => {
        const result = runM8VoiceBootstrapScenario(scenario);
        expect(result.phase).toBe('failed');
        expect(result.transitions).toContain('failed');
        expect(result.sideEffects).toBe(0);
    });

    it('publishes bounded protocol constants for the runtime and diagnostics', () => {
        expect(M8_VOICE_PROTOCOL_VERSION).toBe(1);
        expect(M8_VOICE_BOOTSTRAP_TIMEOUTS_MS.config).toBeGreaterThan(0);
        expect(M8_VOICE_BOOTSTRAP_TIMEOUTS_MS.providerSession).toBeGreaterThan(0);
    });
});
