import { beforeEach, describe, expect, it, vi } from 'vitest';

const { runAgentTurnMock, runDurableTurnMock, runExactCountMock, durableEnabledMock, persistMock, historyEnabledMock, selfConversationMock, resolveInputMock } = vi.hoisted(() => ({
    runAgentTurnMock: vi.fn(),
    runDurableTurnMock: vi.fn(),
    runExactCountMock: vi.fn(),
    durableEnabledMock: vi.fn(() => false),
    persistMock: vi.fn(),
    historyEnabledMock: vi.fn(() => true),
    selfConversationMock: vi.fn(),
    resolveInputMock: vi.fn(),
}));

vi.mock('../src/services/agentTurn.service', () => ({ runAgentTurn: runAgentTurnMock }));
vi.mock('../src/services/agentTurnReadV4Boundary.service', () => ({ runExactCommitmentCountV4: runExactCountMock }));
vi.mock('../src/services/agentTurnDurableBoundary.service', () => ({
    isDurableGeneralAgentTurnEnabled: durableEnabledMock,
    runDurableAgentTurn: runDurableTurnMock,
}));
vi.mock('../src/services/agentConversationTurn.service', () => ({
    isAgentConversationTurnPersistenceEnabled: historyEnabledMock,
    loadLatestAgentReadContext: vi.fn(async () => null),
    persistAgentConversationTurn: persistMock,
}));
vi.mock('../src/services/conversation.service', () => ({ getOrCreateSelfConversationId: selfConversationMock }));
vi.mock('../src/services/agentInputEnvelope.service', () => ({
    resolveAgentRequestInput: resolveInputMock,
    resolveTextSurface: vi.fn(() => 'mobile_text'),
}));
vi.mock('../src/services/agentDialogueState.service', () => ({
    buildDialogueScopeKey: vi.fn(() => 'agent:mobile'),
    getAgentDialogueReadContextSnapshot: vi.fn(() => null),
}));

import { turn } from '../src/controllers/agentTurn.controller';

function response() {
    const res: any = {};
    res.status = vi.fn(() => res);
    res.json = vi.fn(() => res);
    return res;
}

const answer = {
    kind: 'response',
    response: { status: 'answered', answer: 'Tienes un pendiente.', citations: [] },
};

beforeEach(() => {
    vi.clearAllMocks();
    runAgentTurnMock.mockResolvedValue(answer);
    runExactCountMock.mockResolvedValue({ kind: 'read', execution: { status: 'completed', conclusion: 'count', count: 0 } });
    selfConversationMock.mockResolvedValue('self-conversation-1');
    persistMock.mockResolvedValue(undefined);
    resolveInputMock.mockImplementation(({ body }: any) => ({
        envelope: {
            conversationId: body.conversationId ?? null,
            content: body.input,
            surface: 'mobile_text',
        },
    }));
});

describe('Agent Turn controller — main Ping history scope', () => {
    it('persists a main Ping turn in the actor self-chat when no conversationId is sent', async () => {
        const req: any = {
            user: { id: 'actor-1' },
            body: { input: '¿Qué pendientes tengo esta semana?', channel: 'mobile' },
            get: vi.fn(() => undefined),
        };
        const res = response();

        await turn(req, res);

        expect(selfConversationMock).toHaveBeenCalledWith('actor-1');
        expect(persistMock).toHaveBeenCalledWith(expect.objectContaining({
            actorUserId: 'actor-1',
            conversationId: 'self-conversation-1',
            dialogueConversationId: undefined,
            inputText: '¿Qué pendientes tengo esta semana?',
        }));
        expect(res.status).toHaveBeenCalledWith(200);
    });

    it('preserves an explicit conversation scope and does not replace it with self-chat', async () => {
        const req: any = {
            user: { id: 'actor-1' },
            body: { input: '¿Qué hablamos aquí?', conversationId: 'conversation-1', channel: 'mobile' },
            get: vi.fn(() => undefined),
        };
        const res = response();

        await turn(req, res);

        expect(selfConversationMock).not.toHaveBeenCalled();
        expect(persistMock).toHaveBeenCalledWith(expect.objectContaining({
            conversationId: 'conversation-1',
            dialogueConversationId: 'conversation-1',
        }));
    });

    it('also persists count reads from the main Ping surface', async () => {
        const req: any = {
            user: { id: 'actor-1' },
            body: { input: '¿Cuántos pendientes tengo?', readCapability: 'commitment_count_v4' },
            get: vi.fn(() => 'count-key'),
        };
        const res = response();

        await turn(req, res);

        expect(selfConversationMock).toHaveBeenCalledWith('actor-1');
        expect(persistMock).toHaveBeenCalledWith(expect.objectContaining({ conversationId: 'self-conversation-1' }));
    });

    it('returns a durable answer when the secondary history projection is unavailable', async () => {
        durableEnabledMock.mockReturnValue(true);
        runDurableTurnMock.mockResolvedValue(answer);
        persistMock.mockRejectedValue(new Error('history projection unavailable'));
        const req: any = {
            user: { id: 'actor-1' },
            body: { input: '¿Qué tengo para mañana?', channel: 'mobile' },
            get: vi.fn(() => 'durable-turn-key'),
        };
        const res = response();

        await turn(req, res);

        expect(runDurableTurnMock).toHaveBeenCalledWith(
            expect.objectContaining({ actorUserId: 'actor-1', input: '¿Qué tengo para mañana?' }),
            expect.any(Object),
            'durable-turn-key',
            undefined,
            undefined,
            expect.objectContaining({
                conversationId: 'self-conversation-1',
                clientTurnKey: 'durable-turn-key',
                inputText: '¿Qué tengo para mañana?',
                inputMode: 'text',
            }),
        );
        expect(res.status).toHaveBeenCalledWith(200);
        expect(res.json).toHaveBeenCalledWith(answer);
    });

    it('answers a voice turn that echoes the transcription prompt without running Core or recording it', async () => {
        const req: any = {
            user: { id: 'actor-1' },
            body: {
                input: 'contexto:\nTranscribe en español de Chile. Conserva nombres propios, fechas, horas y números; no traduzcas ni agregues palabras.',
                channel: 'mobile_voice',
            },
            get: vi.fn(() => 'm8-voice-session-turn'),
        };
        const res = response();

        await turn(req, res);

        expect(runAgentTurnMock).not.toHaveBeenCalled();
        expect(runDurableTurnMock).not.toHaveBeenCalled();
        expect(persistMock).not.toHaveBeenCalled();
        expect(res.json).toHaveBeenCalledWith({
            kind: 'response',
            response: { status: 'answered', answer: 'No te escuché bien. ¿Puedes repetirlo?', citations: [] },
        });
    });
});
