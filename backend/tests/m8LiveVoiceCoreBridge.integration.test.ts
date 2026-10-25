import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import vm from 'node:vm';
import { getM8LiveVoiceClientHtml } from '../src/services/m8LiveVoiceClient.service';

type FakeElement = {
    textContent: string;
    className: string;
    hidden: boolean;
    muted: boolean;
    srcObject?: unknown;
    onplaying?: () => void;
    addEventListener: (type: string, listener: (...args: any[]) => void) => void;
    play: () => Promise<void>;
};

function fakeElement(): FakeElement {
    return {
        textContent: '',
        className: '',
        hidden: false,
        muted: true,
        addEventListener: vi.fn(),
        play: vi.fn().mockResolvedValue(undefined),
    };
}

function response(status: number, body: unknown): { ok: boolean; status: number; text: () => Promise<string> } {
    return {
        ok: status >= 200 && status < 300,
        status,
        text: async () => typeof body === 'string' ? body : JSON.stringify(body),
    };
}

async function waitFor(condition: () => boolean, label: string): Promise<void> {
    const deadline = Date.now() + 2000;
    while (!condition()) {
        if (Date.now() >= deadline) throw new Error(`Timed out waiting for ${label}`);
        await new Promise((resolve) => setTimeout(resolve, 10));
    }
}

describe('M8 Realtime → ping_core_turn → Ping Core bridge', () => {
    beforeEach(() => {
        process.env.PING_ENVIRONMENT = 'production';
        process.env.M8_LIVE_VOICE_ENABLED = 'true';
    });

    afterEach(() => {
        delete process.env.M8_LIVE_VOICE_ENABLED;
        vi.restoreAllMocks();
    });

    it('uses the final transcript, preserves temporal wording, and never authorizes locally', async () => {
        const elements = new Map([
            ['status', fakeElement()],
            ['hint', fakeElement()],
            ['orb', fakeElement()],
            ['remote', fakeElement()],
            ['retry', fakeElement()],
            ['stop', fakeElement()],
        ]);
        const postedNativeMessages: unknown[] = [];
        const sentProviderEvents: any[] = [];
        const fetchCalls: Array<{ url: string; init?: RequestInit }> = [];
        let dataChannel: FakeDataChannel | null = null;

        class FakeDataChannel {
            readyState = 'open';
            onmessage?: (event: { data: string }) => void;
            onopen?: () => void;
            onclose?: () => void;
            onerror?: () => void;
            send(value: string): void { sentProviderEvents.push(JSON.parse(value)); }
        }

        class FakePeerConnection {
            connectionState = 'connected';
            iceConnectionState = 'connected';
            iceGatheringState = 'complete';
            localDescription: { sdp: string } | null = null;
            ontrack?: (event: unknown) => void;
            onconnectionstatechange?: () => void;
            oniceconnectionstatechange?: () => void;
            onicegatheringstatechange?: () => void;
            addEventListener = vi.fn();
            addTrack = vi.fn();
            createDataChannel = vi.fn(() => {
                dataChannel = new FakeDataChannel();
                return dataChannel;
            });
            createOffer = vi.fn(async () => ({ type: 'offer', sdp: 'v=0\r\nm=audio\r\nm=application\r\n' }));
            setLocalDescription = vi.fn(async (offer: { sdp: string }) => { this.localDescription = offer; });
            setRemoteDescription = vi.fn(async () => undefined);
            close = vi.fn();
        }

        const micTrack = { stop: vi.fn(), addEventListener: vi.fn() };
        const mic = { getTracks: () => [micTrack] };
        const config = {
            apiUrl: 'https://ping.test/api',
            authorization: 'Bearer test-token',
            voiceSessionId: 'voice-bridge-1',
            deviceSessionId: 'device-bridge-1',
            conversationId: 'conversation-bridge-1',
            locale: 'es-CL',
            timezone: 'America/Santiago',
            protocolVersion: 1,
        };
        const corePlan = {
            kind: 'plan',
            confirmationState: 'required',
            plan: {
                planDigest: 'a'.repeat(64),
                steps: [{
                    stepId: 'step-0',
                    toolId: 'create_commitment',
                    arguments: { title: 'Comprar materiales', dueAt: '2026-10-26T13:00:00.000Z' },
                }],
            },
            presentation: {
                requiresExplicitConfirmation: true,
                headline: 'Crear compromiso',
                summary: 'Comprar materiales mañana a las 10:00',
                confirmationLabel: 'Crear',
                cancelLabel: 'Cancelar',
            },
        };
        const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
            const url = String(input);
            fetchCalls.push({ url, init });
            if (url.endsWith('/agent/voice/live/session')) return response(201, { sdp: 'v=0\r\nanswer\r\n', sessionId: 'provider-bridge-1' });
            if (url.endsWith('/agent/turn')) return response(200, corePlan);
            if (url.endsWith('/agent/voice/live/telemetry')) return response(202, {});
            throw new Error(`Unexpected URL ${url}`);
        });

        const document = {
            getElementById: (id: string) => elements.get(id),
        };
        const windowListeners = new Map<string, (...args: any[]) => void>();
        const context = {
            window: {
                __PING_CONFIG: config,
                ReactNativeWebView: { postMessage: (value: string) => postedNativeMessages.push(JSON.parse(value)) },
                addEventListener: (type: string, listener: (...args: any[]) => void) => windowListeners.set(type, listener),
                removeEventListener: (type: string) => windowListeners.delete(type),
            },
            document,
            navigator: { mediaDevices: { getUserMedia: vi.fn(async () => mic) } },
            RTCPeerConnection: FakePeerConnection,
            crypto: { randomUUID: () => 'turn-bridge-1' },
            fetch: fetchMock,
            setTimeout,
            clearTimeout,
            console,
        };
        vm.runInNewContext(extractScript(getM8LiveVoiceClientHtml('bridge-test-nonce')), context);

        await waitFor(() => fetchCalls.some((call) => call.url.endsWith('/agent/voice/live/session')), 'voice session request');
        expect(dataChannel).not.toBeNull();
        dataChannel!.onmessage?.({ data: JSON.stringify({ type: 'session.created', session: { id: 'provider-bridge-1' } }) });

        dataChannel!.onmessage?.({ data: JSON.stringify({ type: 'input_audio_buffer.speech_started' }) });
        dataChannel!.onmessage?.({ data: JSON.stringify({
            type: 'conversation.item.input_audio_transcription.completed',
            transcript: 'Crea un compromiso para mañana',
        }) });
        dataChannel!.onmessage?.({ data: JSON.stringify({ type: 'input_audio_buffer.speech_stopped' }) });
        await waitFor(() => sentProviderEvents.some((event) => event.type === 'response.create' && event.response?.tool_choice === 'required'), 'tool-selection response');

        dataChannel!.onmessage?.({ data: JSON.stringify({
            type: 'response.function_call_arguments.done',
            call_id: 'call-bridge-1',
            arguments: JSON.stringify({ input: 'texto inventado por el proveedor' }),
        }) });
        await waitFor(() => fetchCalls.some((call) => call.url.endsWith('/agent/turn')), 'Ping Core turn');

        const coreCall = fetchCalls.find((call) => call.url.endsWith('/agent/turn'))!;
        const body = JSON.parse(String(coreCall.init?.body));
        expect(body).toMatchObject({
            input: 'Crea un compromiso para mañana',
            channel: 'mobile_voice',
            locale: 'es-CL',
            timezone: 'America/Santiago',
            conversationId: 'conversation-bridge-1',
        });
        expect((coreCall.init?.headers as Record<string, string>)['Idempotency-Key']).toBe('m8-voice-voice-bridge-1-turn-bridge-1');
        expect(fetchCalls.some((call) => /\/agent\/(authorize|execute)$/.test(call.url))).toBe(false);

        await waitFor(() => sentProviderEvents.some((event) => event.type === 'conversation.item.create'), 'Core presentation output');
        const outputEvent = sentProviderEvents.find((event) => event.type === 'conversation.item.create');
        const output = JSON.parse(outputEvent.item.output);
        expect(output.core_presentation).toMatchObject({
            kind: 'plan',
            authorizedText: 'Comprar materiales mañana a las 10:00',
            confirmationRequired: true,
            confirmationLabel: 'Crear',
            cancelLabel: 'Cancelar',
        });
        expect(postedNativeMessages).toEqual(expect.arrayContaining([
            expect.objectContaining({ type: 'webview_ready' }),
            expect.objectContaining({ type: 'config_ack' }),
        ]));
    });
});

function extractScript(html: string): string {
    const marker = '<script nonce="bridge-test-nonce">';
    const start = html.indexOf(marker);
    const end = html.indexOf('</script>', start + marker.length);
    if (start < 0 || end < 0) throw new Error('Unable to extract live voice client script');
    return html.slice(start + marker.length, end);
}
