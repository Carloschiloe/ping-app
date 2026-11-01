import { beforeEach, describe, expect, it, vi } from 'vitest';

const { assistantTurnMock, persistMock, historyEnabledMock, selfConversationMock, resolveInputMock } = vi.hoisted(() => ({
    assistantTurnMock: vi.fn(),
    persistMock: vi.fn(),
    historyEnabledMock: vi.fn(() => true),
    selfConversationMock: vi.fn(),
    resolveInputMock: vi.fn(),
}));

vi.mock('../src/services/assistant/assistantTurn.service', () => ({ runAssistantModeTurn: assistantTurnMock }));
vi.mock('../src/services/agentConversationTurn.service', () => ({
    isAgentConversationTurnPersistenceEnabled: historyEnabledMock,
    persistAgentConversationTurn: persistMock,
}));
vi.mock('../src/services/conversation.service', () => ({ getOrCreateSelfConversationId: selfConversationMock }));
vi.mock('../src/services/agentInputEnvelope.service', () => ({ resolveAgentRequestInput: resolveInputMock }));

import { turn } from '../src/controllers/agentTurn.controller';

function response() {
    const res: any = { headersSent: false };
    res.status = vi.fn(() => res);
    res.json = vi.fn(() => { res.headersSent = true; return res; });
    return res;
}

function request(body: Record<string, unknown>) {
    return { user: { id: 'actor-1' }, body, get: vi.fn(() => undefined) } as any;
}

const answer = {
    kind: 'response',
    response: { status: 'answered', answer: 'Tienes un pendiente.', citations: [] },
};
const memory = { version: 1, refs: [], actions: [], messages: [] };

beforeEach(() => {
    vi.clearAllMocks();
    historyEnabledMock.mockReturnValue(true);
    assistantTurnMock.mockResolvedValue({ result: answer, memory });
    selfConversationMock.mockResolvedValue('self-conversation-1');
    persistMock.mockResolvedValue(undefined);
    resolveInputMock.mockImplementation(({ body }: any) => ({
        envelope: { conversationId: body.conversationId ?? null, content: body.input ?? 'transcrito', timeZone: null },
        referents: [],
    }));
});

describe('Agent Turn controller — every surface reaches the assistant', () => {
    it('answers a main Ping turn and keeps its memory in the actor self-chat', async () => {
        const res = response();
        await turn(request({ input: '¿Qué pendientes tengo esta semana?', channel: 'mobile', timezone: 'America/Santiago' }), res);

        expect(res.status).toHaveBeenCalledWith(200);
        expect(res.json).toHaveBeenCalledWith(answer);
        expect(assistantTurnMock).toHaveBeenCalledWith(expect.objectContaining({
            actorUserId: 'actor-1', text: '¿Qué pendientes tengo esta semana?',
            historyConversationId: 'self-conversation-1', dialogueConversationId: undefined,
            channel: 'text', userWordsHeard: true, timezone: 'America/Santiago',
        }));
        expect(persistMock).toHaveBeenCalledWith(expect.objectContaining({
            conversationId: 'self-conversation-1', inputText: '¿Qué pendientes tengo esta semana?',
            inputMode: 'text', result: answer, assistant: memory,
        }));
    });

    it('preserves an explicit conversation scope', async () => {
        await turn(request({ input: 'hola', conversationId: 'chat-1' }), response());
        expect(selfConversationMock).not.toHaveBeenCalled();
        expect(assistantTurnMock).toHaveBeenCalledWith(expect.objectContaining({ historyConversationId: 'chat-1', dialogueConversationId: 'chat-1' }));
    });

    it('a dictation the user reviewed counts as their words; an unreviewed one never confirms', async () => {
        await turn(request({ input: 'sí', reviewedVoiceInputToken: 'x'.repeat(30) }), response());
        expect(assistantTurnMock).toHaveBeenLastCalledWith(expect.objectContaining({ text: 'sí', userWordsHeard: true }));
        expect(persistMock).toHaveBeenLastCalledWith(expect.objectContaining({ inputMode: 'reviewed_voice_text' }));

        await turn(request({ voiceInputToken: 'x'.repeat(30) }), response());
        expect(assistantTurnMock).toHaveBeenLastCalledWith(expect.objectContaining({ text: 'transcrito', userWordsHeard: false }));
        expect(persistMock).toHaveBeenLastCalledWith(expect.objectContaining({ inputMode: 'voice' }));
    });

    it('live voice marks the channel, and a provider rendering cannot confirm', async () => {
        await turn(request({ input: 'sí', channel: 'mobile_voice', voiceInputSource: 'provider' }), response());
        expect(assistantTurnMock).toHaveBeenLastCalledWith(expect.objectContaining({ channel: 'voice', userWordsHeard: false }));
    });

    it('asks a live-voice user to repeat when the text is the transcription prompt echoed back', async () => {
        const res = response();
        await turn(request({
            input: 'contexto:\nTranscribe en español de Chile. Conserva nombres propios, fechas, horas y números; no traduzcas ni agregues palabras.',
            channel: 'mobile_voice', voiceInputSource: 'transcript',
        }), res);
        expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
            response: expect.objectContaining({ answer: 'No te escuché bien. ¿Puedes repetirlo?' }),
        }));
        expect(assistantTurnMock).not.toHaveBeenCalled();
        expect(persistMock).not.toHaveBeenCalled();
    });

    it('passes a Confirm/Cancel button decision through', async () => {
        await turn(request({ input: 'Confirmar', actionDecision: { action: 'a1', decision: 'confirm' } }), response());
        expect(assistantTurnMock).toHaveBeenLastCalledWith(expect.objectContaining({ actionDecision: { action: 'a1', decision: 'confirm' } }));
    });

    it('keeps the answer when history persistence fails, and skips history when it is disabled', async () => {
        persistMock.mockRejectedValueOnce(new Error('history down'));
        const res = response();
        await turn(request({ input: 'hola' }), res);
        expect(res.json).toHaveBeenCalledWith(answer);

        historyEnabledMock.mockReturnValue(false);
        await turn(request({ input: 'hola' }), response());
        expect(assistantTurnMock).toHaveBeenLastCalledWith(expect.objectContaining({ historyConversationId: undefined }));
        expect(persistMock).toHaveBeenCalledTimes(1);
    });

    it('maps a rejected input to its status without calling the assistant', async () => {
        const { AppError } = await import('../src/utils/AppError');
        resolveInputMock.mockImplementationOnce(() => { throw new AppError('Voice input expired', 410); });
        const res = response();
        await turn(request({ voiceInputToken: 'x'.repeat(30) }), res);
        expect(res.status).toHaveBeenCalledWith(410);
        expect(assistantTurnMock).not.toHaveBeenCalled();
    });
});
