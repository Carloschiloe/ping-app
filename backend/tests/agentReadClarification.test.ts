import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { runCoreMock } = vi.hoisted(() => ({ runCoreMock: vi.fn() }));

vi.mock('../src/services/agentTurnCore.service', () => ({
    runAgentTurn: (...args: unknown[]) => runCoreMock(...args),
}));

const { runAgentTurn, clearReadConversationStateForTests } = await import('../src/services/agentTurn.service');

const ACTOR = 'actor-a';
const CONVERSATION = 'conversation-a';
const CANDIDATES = [
    { id: 'commitment-a', label: 'prueba copiar (2026-08-15T09:00:00.000Z)' },
    { id: 'commitment-b', label: 'entrenar (2026-09-07T13:30:00.000Z)' },
];

beforeEach(() => {
    clearReadConversationStateForTests();
    runCoreMock.mockReset();
});

afterEach(() => clearReadConversationStateForTests());

describe('read clarification continuity', () => {
    it('stores a real ambiguity and re-queries only the selected canonical id', async () => {
        runCoreMock
            .mockResolvedValueOnce({ kind: 'clarification', questions: [{ field: 'entity_ambiguous', question: '¿Cuál?', options: CANDIDATES }] })
            .mockResolvedValueOnce({
                kind: 'response',
                response: { status: 'answered', answer: 'prueba copiar: 15 de agosto', citations: [{ sourceType: 'commitment', sourceId: 'commitment-a' }] },
            });

        await runAgentTurn({ actorUserId: ACTOR, conversationId: CONVERSATION, input: '¿Para qué día estaba programado el atrasado?' });
        const result = await runAgentTurn({ actorUserId: ACTOR, conversationId: CONVERSATION, input: 'prueba copiar' });

        expect(result.kind).toBe('response');
        expect(runCoreMock).toHaveBeenNthCalledWith(
            2,
            expect.objectContaining({ input: expect.stringContaining('prueba copiar') }),
            expect.objectContaining({ authorizedCommitmentReferentId: 'commitment-a' }),
        );
    });

    it('does not share a selection across actors or conversations', async () => {
        runCoreMock.mockResolvedValue({ kind: 'clarification', questions: [{ field: 'entity_ambiguous', question: '¿Cuál?', options: CANDIDATES }] });
        await runAgentTurn({ actorUserId: ACTOR, conversationId: CONVERSATION, input: 'pregunta ambigua' });

        await runAgentTurn({ actorUserId: 'actor-b', conversationId: CONVERSATION, input: 'prueba copiar' });
        await runAgentTurn({ actorUserId: ACTOR, conversationId: 'conversation-b', input: 'prueba copiar' });

        expect(runCoreMock).toHaveBeenLastCalledWith(
            expect.objectContaining({ input: 'prueba copiar' }),
            expect.not.objectContaining({ authorizedCommitmentReferentId: expect.anything() }),
        );
    });

    it('lets an unrelated turn escape instead of trapping the conversation', async () => {
        runCoreMock
            .mockResolvedValueOnce({ kind: 'clarification', questions: [{ field: 'entity_ambiguous', question: '¿Cuál?', options: CANDIDATES }] })
            .mockResolvedValueOnce({ kind: 'response', response: { status: 'answered', answer: 'Estos son tus pendientes.', citations: [] } });

        await runAgentTurn({ actorUserId: ACTOR, conversationId: CONVERSATION, input: 'pregunta ambigua' });
        await runAgentTurn({ actorUserId: ACTOR, conversationId: CONVERSATION, input: '¿Qué tengo pendiente hoy?' });

        expect(runCoreMock).toHaveBeenLastCalledWith(
            expect.objectContaining({ input: '¿Qué tengo pendiente hoy?' }),
            {},
        );
    });
});
