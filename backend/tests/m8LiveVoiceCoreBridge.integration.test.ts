import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import vm from 'node:vm';

const { coreObjectiveMock, coreInputMock } = vi.hoisted(() => ({
    coreObjectiveMock: vi.fn(),
    coreInputMock: vi.fn(),
}));

// The voice provider remains simulated, but Ping Core is real: these mocks
// only replace the external semantic/retrieval dependencies so the bridge
// can execute the real runAgentTurn -> dialogue -> planner path offline.
vi.mock('../src/services/agentObjectiveInterpreter.service', async (importOriginal) => {
    const actual = await importOriginal<typeof import('../src/services/agentObjectiveInterpreter.service')>();
    return {
        ...actual,
        LlmObjectiveInterpreter: class {
            async interpret(input: string, context: unknown) {
                return coreObjectiveMock(input, context);
            }
        },
    };
});

vi.mock('../src/services/agentInputInterpreter.service', async (importOriginal) => {
    const actual = await importOriginal<typeof import('../src/services/agentInputInterpreter.service')>();
    return {
        ...actual,
        LlmInputInterpreter: class {
            async interpret(input: string) {
                return coreInputMock(input);
            }
        },
    };
});

vi.mock('../src/services/retrieval.service', () => ({
    resolvePerson: vi.fn(async () => ({ resolved: null, ambiguous: false, candidates: [] })),
    resolveDirectConversation: vi.fn(async () => ({ conversationId: null, ambiguous: false, candidateCount: 0 })),
    retrieveCommitments: vi.fn(async () => []),
    retrieveCommitmentProposals: vi.fn(async () => []),
    retrieveCommitmentEvents: vi.fn(async () => []),
    retrieveMessages: vi.fn(async () => []),
    retrieveTranscriptions: vi.fn(async () => []),
    retrieveAttachments: vi.fn(async () => []),
    retrieveVisibleCommitmentById: vi.fn(async () => null),
    dedupeProvenance: (items: any[]) => items,
}));

vi.mock('../src/services/memory.service', () => ({
    retrieveMemory: vi.fn(async () => []),
    ingestMemoryFromEvent: vi.fn(async () => undefined),
}));

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

function coreInputInterpretation() {
    return {
        intent: 'commitment_query',
        intentConfidence: 1,
        personHints: [],
        topicHints: [],
        textQuery: null,
        timeExpression: null,
        statusHints: null,
        requestedTransition: null,
        wantsCommitments: false,
        wantsMessages: false,
        wantsTranscriptions: false,
        wantsAttachments: false,
        wantsOverdueFocus: false,
        proposalFocus: null,
        isWriteActionRequest: true,
        ambiguityHints: [],
        source: 'llm',
        modelUsed: 'controlled-voice-test',
    };
}

function coreObjectiveFor(input: string) {
    const normalized = input.trim().toLowerCase();
    if (normalized === 'crea un compromiso para mañana') {
        return {
            objectiveType: 'create_commitment_or_proposal',
            targetEntities: { personHints: [], entityHints: [] },
            constraints: {},
            desiredOutcome: input,
            timeConstraints: { rawHint: 'mañana' },
            actor: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
            sourceUtterance: input,
            confidence: 1,
            ambiguities: [],
            source: 'llm',
        };
    }
    if (normalized === 'comprar materiales') {
        return {
            objectiveType: 'create_personal_commitment',
            targetEntities: { personHints: [], entityHints: ['Comprar materiales'] },
            constraints: {},
            desiredOutcome: input,
            timeConstraints: { rawHint: null },
            actor: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
            sourceUtterance: input,
            confidence: 1,
            ambiguities: [],
            source: 'llm',
        };
    }
    return {
        objectiveType: 'reschedule_existing_commitment',
        targetEntities: { personHints: [], entityHints: [] },
        constraints: {},
        desiredOutcome: input,
        timeConstraints: { rawHint: 'a las diez' },
        actor: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        sourceUtterance: input,
        confidence: 1,
        ambiguities: [],
        source: 'llm',
    };
}

describe('M8 Realtime → ping_core_turn → Ping Core bridge', () => {
    beforeEach(() => {
        process.env.PING_ENVIRONMENT = 'production';
        process.env.M8_LIVE_VOICE_ENABLED = 'true';
        coreInputMock.mockReset().mockResolvedValue(coreInputInterpretation());
        coreObjectiveMock.mockReset().mockImplementation(async (input: string) => coreObjectiveFor(input));
    });

    afterEach(() => {
        delete process.env.M8_LIVE_VOICE_ENABLED;
        vi.restoreAllMocks();
    });

    it('uses the final transcript, preserves temporal wording, and never authorizes locally', async () => {
        // Match the real provider contract used by the existing acceptance
        // test: Core receives provider semantics for the first two turns;
        // the final short temporal answer must be resolved by Core's own
        // pending-dialogue path, not by a fabricated provider plan.
        coreObjectiveMock.mockReset()
            .mockResolvedValueOnce(coreObjectiveFor('Crea un compromiso para mañana'))
            .mockResolvedValueOnce(coreObjectiveFor('Comprar materiales'))
            .mockImplementation(async (input: string) => coreObjectiveFor(input));
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
        const coreResults: any[] = [];
        const { runAgentTurn } = await import('../src/services/agentTurn.service');
        const { clearAgentDialogueStateForTests } = await import('../src/services/agentDialogueState.service');
        clearAgentDialogueStateForTests();

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
            conversationId: '11111111-1111-4111-8111-111111111111',
            locale: 'es-CL',
            timezone: 'America/Santiago',
            protocolVersion: 1,
        };
        const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
            const url = String(input);
            fetchCalls.push({ url, init });
            if (url.endsWith('/agent/voice/live/session')) return response(201, { sdp: 'v=0\r\nanswer\r\n', sessionId: 'provider-bridge-1' });
            if (url.endsWith('/agent/turn')) {
                const body = JSON.parse(String(init?.body));
                const result = await runAgentTurn({
                    actorUserId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
                    input: body.input,
                    conversationId: body.conversationId,
                    channel: body.channel,
                    locale: body.locale,
                    timezone: body.timezone,
                });
                coreResults.push(result);
                return response(200, result);
            }
            if (url.endsWith('/agent/voice/live/telemetry')) return response(202, {});
            throw new Error(`Unexpected URL ${url}`);
        });

        const document = {
            getElementById: (id: string) => elements.get(id),
        };
        const windowListeners = new Map<string, (...args: any[]) => void>();
        let generatedTurnId = 0;
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
            crypto: { randomUUID: () => `turn-bridge-${++generatedTurnId}` },
            fetch: fetchMock,
            setTimeout,
            clearTimeout,
            console,
        };
        vm.runInNewContext(extractScript(getM8LiveVoiceClientHtml('bridge-test-nonce')), context);

        await waitFor(() => fetchCalls.some((call) => call.url.endsWith('/agent/voice/live/session')), 'voice session request');
        expect(dataChannel).not.toBeNull();
        dataChannel!.onmessage?.({ data: JSON.stringify({ type: 'session.created', session: { id: 'provider-bridge-1' } }) });

        const sendVoiceTurn = async (transcript: string, callId: string): Promise<void> => {
            const expectedCoreCalls = coreResults.length + 1;
            const expectedPresentations = sentProviderEvents.filter((event) => event.type === 'conversation.item.create').length + 1;
            dataChannel!.onmessage?.({ data: JSON.stringify({ type: 'input_audio_buffer.speech_started' }) });
            dataChannel!.onmessage?.({ data: JSON.stringify({
                type: 'conversation.item.input_audio_transcription.completed',
                transcript,
            }) });
            dataChannel!.onmessage?.({ data: JSON.stringify({ type: 'input_audio_buffer.speech_stopped' }) });
            await waitFor(
                () => sentProviderEvents.filter((event) => event.type === 'response.create' && event.response?.tool_choice === 'required').length >= expectedCoreCalls,
                `tool-selection response ${expectedCoreCalls}`,
            );
            // A new turn must close the audio gate again. This also covers the
            // provider's alternate `response.audio.delta` event: it must not
            // become audible while Ping Core is still being consulted.
            const remote = elements.get('remote')!;
            expect(remote.muted).toBe(true);
            dataChannel!.onmessage?.({ data: JSON.stringify({ type: 'response.audio.delta', delta: 'provider text before Core' }) });
            expect(remote.muted).toBe(true);
            // The provider arguments are deliberately wrong. The bridge must
            // still forward only the final transcript captured above.
            dataChannel!.onmessage?.({ data: JSON.stringify({
                type: 'response.function_call_arguments.done',
                call_id: callId,
                arguments: JSON.stringify({ input: 'texto inventado por el proveedor' }),
            }) });
            await waitFor(() => coreResults.length >= expectedCoreCalls, `real Ping Core turn ${expectedCoreCalls}`);
            await waitFor(
                () => sentProviderEvents.filter((event) => event.type === 'conversation.item.create').length >= expectedPresentations,
                `Core presentation ${expectedPresentations}`,
            );
            // Complete the simulated provider audio response so the next
            // VAD turn enters the same listening state as the real client.
            dataChannel!.onmessage?.({ data: JSON.stringify({ type: 'response.output_audio.done' }) });
        };

        await sendVoiceTurn('Crea un compromiso para mañana', 'call-bridge-1');
        await sendVoiceTurn('Comprar materiales', 'call-bridge-2');
        await sendVoiceTurn('A las diez', 'call-bridge-3');
        await sendVoiceTurn('Imbécil, esto sigue sin funcionar', 'call-bridge-4');

        expect(coreResults.map((result) => result.kind)).toEqual(['clarification', 'clarification', 'plan', 'clarification']);
        expect(coreResults[0].questions.map((question: { field: string }) => question.field))
            .toEqual(expect.arrayContaining(['title', 'time']));
        expect(coreResults[1].questions.map((question: { field: string }) => question.field)).toEqual(['time']);
        expect(coreResults[2]).toMatchObject({ kind: 'plan', confirmationState: 'required' });
        expect(coreResults[2].presentation.stepPresentations[0]).toMatchObject({ targetLabel: 'Comprar materiales' });
        expect(coreResults[2].presentation.stepPresentations[0].dateLabel).toContain('10:00');

        const coreCalls = fetchCalls.filter((call) => call.url.endsWith('/agent/turn'));
        expect(coreCalls).toHaveLength(4);
        expect(coreCalls.map((call) => JSON.parse(String(call.init?.body)).input))
            .toEqual(['Crea un compromiso para mañana', 'Comprar materiales', 'A las diez', 'Imbécil, esto sigue sin funcionar']);
        expect(coreCalls.map((call) => JSON.parse(String(call.init?.body)))).toEqual(expect.arrayContaining([
            expect.objectContaining({ channel: 'mobile_voice', locale: 'es-CL', timezone: 'America/Santiago', conversationId: '11111111-1111-4111-8111-111111111111' }),
        ]));
        expect(new Set(coreCalls.map((call) => (call.init?.headers as Record<string, string>)['Idempotency-Key'])).size).toBe(4);
        expect(fetchCalls.some((call) => /\/agent\/(authorize|execute)$/.test(call.url))).toBe(false);

        const outputs = sentProviderEvents
            .filter((event) => event.type === 'conversation.item.create')
            .map((event) => JSON.parse(event.item.output).core_presentation);
        expect(outputs).toHaveLength(4);
        expect(outputs[2]).toMatchObject({
            kind: 'plan',
            confirmationRequired: true,
            confirmationLabel: 'Crear',
            cancelLabel: 'Cancelar',
        });
        expect(outputs[2].authorizedText).toMatch(/Comprar materiales.*10:00/);
        expect(outputs[3]).toEqual(expect.objectContaining({ kind: 'clarification' }));
        expect(outputs[3].authorizedText).not.toMatch(/no puedo verbalizar|lenguaje ofensivo/i);
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
