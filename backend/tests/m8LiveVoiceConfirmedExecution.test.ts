import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import vm from 'node:vm';
import { getM8LiveVoiceClientHtml } from '../src/services/m8LiveVoiceClient.service';

// A voice confirmation ("Crear"/"sí") only yields a Core plan with
// confirmationState 'received' — nothing is written by /agent/turn. The live
// voice client must authorize + execute that exact digest (like the text
// client) and may only speak success from a verified execution result.

const PLAN = {
    planDigest: 'digest-voice-1',
    steps: [{ stepId: 'step-0', toolId: 'create_commitment' }],
};

function planTurn(confirmationState: 'required' | 'received') {
    return {
        kind: 'plan',
        confirmationState,
        confirmationRequested: confirmationState === 'received',
        plan: PLAN,
        presentation: {
            requiresExplicitConfirmation: true,
            confirmationLabel: 'Crear',
            cancelLabel: 'Cancelar',
            stepPresentations: [{ effectDescription: 'Se creará el compromiso «Llamar a Marcelo» mañana a las 10:00.' }],
        },
    };
}

function response(status: number, body: unknown) {
    return { ok: status >= 200 && status < 300, status, text: async () => JSON.stringify(body) };
}

async function waitFor(condition: () => boolean, label: string, timeoutMs = 2000): Promise<void> {
    const deadline = Date.now() + timeoutMs;
    while (!condition()) {
        if (Date.now() >= deadline) throw new Error(`Timed out waiting for ${label}`);
        await new Promise((resolve) => setTimeout(resolve, 5));
    }
}

function extractScript(html: string): string {
    const marker = '<script nonce="exec-test-nonce">';
    const start = html.indexOf(marker);
    const end = html.indexOf('</script>', start + marker.length);
    return html.slice(start + marker.length, end);
}

async function runConfirmationFlow(executionBody: unknown, options: { confirmationTranscript?: boolean; repeatConfirmation?: boolean } = {}) {
    const fetchCalls: Array<{ url: string; body: any }> = [];
    const sentProviderEvents: any[] = [];
    const turnResults = [planTurn('required'), planTurn('received'), planTurn('received')];
    let dataChannel: any = null;
    const fetchMock = vi.fn(async (input: string, init?: { body?: string }) => {
        const url = String(input);
        const body = init?.body ? JSON.parse(init.body) : undefined;
        fetchCalls.push({ url, body });
        if (url.endsWith('/agent/voice/live/session')) return response(201, { sdp: 'v=0\r\nanswer\r\n', sessionId: 'provider-1' });
        if (url.endsWith('/agent/voice/live/telemetry')) return response(202, {});
        if (url.endsWith('/agent/turn')) return response(200, turnResults.shift());
        if (url.endsWith('/agent/authorize')) return response(200, { authorizationId: 'auth-1', status: 'authorized' });
        if (url.endsWith('/agent/execute')) return response(200, executionBody);
        throw new Error(`Unexpected URL ${url}`);
    });
    const element = () => ({ textContent: '', className: '', hidden: false, muted: true, addEventListener: vi.fn(), play: vi.fn().mockResolvedValue(undefined) });
    const elements = new Map(['status', 'hint', 'orb', 'remote', 'retry', 'stop'].map((id) => [id, element()]));
    class FakePeerConnection {
        connectionState = 'connected'; iceConnectionState = 'connected'; iceGatheringState = 'complete';
        localDescription: { sdp: string } | null = null;
        addEventListener = vi.fn(); addTrack = vi.fn(); close = vi.fn();
        createDataChannel = vi.fn(() => {
            dataChannel = { readyState: 'open', send: (value: string) => sentProviderEvents.push(JSON.parse(value)) };
            return dataChannel;
        });
        createOffer = vi.fn(async () => ({ type: 'offer', sdp: 'v=0\r\nm=audio\r\nm=application\r\n' }));
        setLocalDescription = vi.fn(async (offer: { sdp: string }) => { this.localDescription = offer; });
        setRemoteDescription = vi.fn(async () => undefined);
    }
    let generated = 0;
    vm.runInNewContext(extractScript(getM8LiveVoiceClientHtml('exec-test-nonce')), {
        window: {
            __PING_CONFIG: {
                apiUrl: 'https://ping.test/api', authorization: 'Bearer test-token', voiceSessionId: 'voice-1',
                deviceSessionId: 'device-1', conversationId: '11111111-1111-4111-8111-111111111111',
                locale: 'es-CL', timezone: 'America/Santiago', protocolVersion: 1,
            },
            ReactNativeWebView: { postMessage: () => undefined },
            addEventListener: () => undefined,
            removeEventListener: () => undefined,
        },
        document: { getElementById: (id: string) => elements.get(id) },
        navigator: { mediaDevices: { getUserMedia: vi.fn(async () => ({ getTracks: () => [{ stop: vi.fn(), addEventListener: vi.fn() }] })) } },
        RTCPeerConnection: FakePeerConnection,
        crypto: { randomUUID: () => `turn-${++generated}` },
        fetch: fetchMock,
        setTimeout,
        clearTimeout,
        console,
    });
    await waitFor(() => dataChannel !== null && fetchCalls.some((call) => call.url.endsWith('/agent/voice/live/session')), 'session');
    dataChannel.onmessage?.({ data: JSON.stringify({ type: 'session.created', session: { id: 'provider-1' } }) });

    const presentations = () => sentProviderEvents
        .filter((event) => event.type === 'conversation.item.create')
        .map((event) => JSON.parse(event.item.output).core_presentation);
    const sendVoiceTurn = async (transcript: string, callId: string, withTranscript = true) => {
        const expected = presentations().length + 1;
        dataChannel.onmessage({ data: JSON.stringify({ type: 'input_audio_buffer.speech_started' }) });
        if (withTranscript) dataChannel.onmessage({ data: JSON.stringify({ type: 'conversation.item.input_audio_transcription.completed', transcript }) });
        dataChannel.onmessage({ data: JSON.stringify({ type: 'input_audio_buffer.speech_stopped' }) });
        await waitFor(() => sentProviderEvents.filter((event) => event.type === 'response.create' && event.response?.tool_choice === 'required').length >= expected, 'tool selection');
        dataChannel.onmessage({ data: JSON.stringify({ type: 'response.function_call_arguments.done', call_id: callId, arguments: JSON.stringify({ input: transcript }) }) });
        await waitFor(() => presentations().length >= expected, `presentation ${expected}`, 4000);
        dataChannel.onmessage({ data: JSON.stringify({ type: 'response.output_audio.done' }) });
    };

    await sendVoiceTurn('Mañana tengo que llamar a Marcelo a las diez', 'call-1');
    await sendVoiceTurn('Crear', 'call-2', options.confirmationTranscript !== false);
    if (options.repeatConfirmation) await sendVoiceTurn('Sí', 'call-3');
    return { fetchCalls, presentations: presentations() };
}

describe('M8 live voice confirmed plan execution', () => {
    beforeEach(() => {
        process.env.PING_ENVIRONMENT = 'production';
        process.env.M8_LIVE_VOICE_ENABLED = 'true';
    });
    afterEach(() => {
        delete process.env.M8_LIVE_VOICE_ENABLED;
    });

    it('authorizes and executes the confirmed digest once and speaks only the verified result', async () => {
        const { fetchCalls, presentations } = await runConfirmationFlow({
            authorizationId: 'auth-1',
            status: 'done',
            executedSteps: [{ stepId: 'step-0', toolId: 'create_commitment', status: 'succeeded', verified: true }],
            humanReadableSummary: '✓ El compromiso fue creado y verificado.',
        });

        const authorizeCalls = fetchCalls.filter((call) => call.url.endsWith('/agent/authorize'));
        const executeCalls = fetchCalls.filter((call) => call.url.endsWith('/agent/execute'));
        expect(authorizeCalls).toHaveLength(1);
        expect(executeCalls).toHaveLength(1);
        // Same contract as the text client: the turn that produced the plan is
        // the authorization source, bound to the exact digest and step set.
        expect(authorizeCalls[0].body).toMatchObject({
            input: 'Mañana tengo que llamar a Marcelo a las diez',
            channel: 'mobile_voice',
            conversationId: '11111111-1111-4111-8111-111111111111',
            planDigest: 'digest-voice-1',
            stepIds: ['step-0'],
            confirm: true,
        });
        expect(executeCalls[0].body).toMatchObject({
            authorizationId: 'auth-1',
            conversationId: '11111111-1111-4111-8111-111111111111',
        });
        expect(executeCalls[0].body.sourceTurnKey).toMatch(/^m8-voice-voice-1-/);

        expect(presentations[0]).toMatchObject({ kind: 'plan', confirmationRequired: true });
        expect(presentations[1]).toEqual({
            kind: 'response',
            authorizedText: 'Listo. El compromiso fue creado y verificado.',
            confirmationRequired: false,
        });
    });

    it('never speaks success when execution is not verified', async () => {
        const { fetchCalls, presentations } = await runConfirmationFlow({
            authorizationId: 'auth-1',
            status: 'failed',
            executedSteps: [],
            humanReadableSummary: '✗ create_commitment no se ejecutó (transient_failure).',
        });

        expect(fetchCalls.filter((call) => call.url.endsWith('/agent/execute'))).toHaveLength(1);
        expect(presentations[1].kind).toBe('response');
        expect(presentations[1].authorizedText).not.toMatch(/^Listo/);
        expect(presentations[1].authorizedText).toMatch(/No pude confirmar que la acción se completara/);
    });
    it('does not authorize a confirmation that only exists as the provider tool argument', async () => {
        const { fetchCalls, presentations } = await runConfirmationFlow({
            authorizationId: 'auth-1',
            status: 'done',
            executedSteps: [{ stepId: 'step-0', toolId: 'create_commitment', status: 'succeeded', verified: true }],
            humanReadableSummary: '✓ El compromiso fue creado y verificado.',
        }, { confirmationTranscript: false });

        expect(fetchCalls.some((call) => /\/agent\/(authorize|execute)$/.test(call.url))).toBe(false);
        expect(presentations[1].kind).toBe('response');
        expect(presentations[1].authorizedText).toMatch(/no hice ningún cambio/);
    });
    it('binds a repeated confirmation to the same plan turn so the server can replay instead of executing twice', async () => {
        const { fetchCalls } = await runConfirmationFlow({
            authorizationId: 'auth-1',
            status: 'done',
            executedSteps: [{ stepId: 'step-0', toolId: 'create_commitment', status: 'succeeded', verified: true }],
            humanReadableSummary: '✓ El compromiso fue creado y verificado.',
        }, { repeatConfirmation: true });

        const executeCalls = fetchCalls.filter((call) => call.url.endsWith('/agent/execute'));
        expect(executeCalls).toHaveLength(2);
        expect(executeCalls[1].body.sourceTurnKey).toBe(executeCalls[0].body.sourceTurnKey);
        expect(executeCalls[1].body.conversationId).toBe('11111111-1111-4111-8111-111111111111');
    });
});
