import { beforeEach, describe, expect, it, vi } from 'vitest';

const ACTOR = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const FIRST_ID = '11111111-1111-4111-8111-111111111111';
const SECOND_ID = '22222222-2222-4222-8222-222222222222';

const { retrieveCommitmentsMock, retrieveVisibleCommitmentByIdMock } = vi.hoisted(() => ({
    retrieveCommitmentsMock: vi.fn(),
    retrieveVisibleCommitmentByIdMock: vi.fn(),
}));

vi.mock('../src/services/retrieval.service', async (importOriginal) => {
    const actual = await importOriginal<typeof import('../src/services/retrieval.service')>();
    return {
        ...actual,
        retrieveCommitments: (...args: unknown[]) => retrieveCommitmentsMock(...args),
        retrieveVisibleCommitmentById: (...args: unknown[]) => retrieveVisibleCommitmentByIdMock(...args),
        retrieveCommitmentProposals: vi.fn(async () => []),
        retrieveCommitmentEvents: vi.fn(async () => []),
        retrieveMessages: vi.fn(async () => []),
        retrieveTranscriptions: vi.fn(async () => []),
        retrieveAttachments: vi.fn(async () => []),
        resolvePerson: vi.fn(async () => ({ resolved: null, ambiguous: false, candidates: [] })),
        resolveDirectConversation: vi.fn(async () => ({ conversationId: null, ambiguous: false, candidateCount: 0 })),
        dedupeProvenance: (items: unknown[]) => items,
    };
});

vi.mock('../src/services/memory.service', () => ({
    retrieveMemory: vi.fn(async () => []),
}));

const { runAgentTurn, clearReadConversationStateForTests } = await import('../src/services/agentTurn.service');

function commitment(id: string, title: string, dueAt: string) {
    return {
        id, entityType: 'commitment' as const, title, description: null, status: 'accepted' as const,
        type: 'general', priority: null, dueAt, proposedDueAt: null, expectedResult: null,
        resolvedAt: null, resolutionResult: null, rejectionReason: null,
        ownerUserId: ACTOR, assignedToUserId: ACTOR, counterpartyContactId: null,
        conversationId: null, messageId: null, createdAt: '2026-08-01T00:00:00.000Z',
        provenance: { sourceType: 'commitment' as const, sourceId: id },
    };
}

const first = commitment(FIRST_ID, 'prueba copiar', '2026-08-15T09:00:00.000Z');
const second = commitment(SECOND_ID, 'entrenar', '2026-09-07T13:30:00.000Z');

beforeEach(() => {
    delete process.env.OPENAI_API_KEY;
    clearReadConversationStateForTests();
    retrieveCommitmentsMock.mockReset().mockResolvedValue([first, second]);
    retrieveVisibleCommitmentByIdMock.mockReset().mockImplementation(async (_actor: string, id: string) => id === FIRST_ID ? first : id === SECOND_ID ? second : null);
});

describe('ambiguous read entity continuity', () => {
    it('does not choose a date, then resolves the selected title through authorized canonical retrieval', async () => {
        const firstTurn = await runAgentTurn({
            actorUserId: ACTOR,
            input: '¿Y para qué día estaba programado el atrasado?',
            channel: 'mobile',
            locale: 'es-CL',
            conversationId: 'conversation-read-ambiguity',
        });

        expect(firstTurn.kind).toBe('clarification');
        if (firstTurn.kind !== 'clarification') return;
        expect(firstTurn.questions[0].field).toBe('entity_ambiguous');
        expect(firstTurn.questions[0].options).toHaveLength(2);

        const secondTurn = await runAgentTurn({
            actorUserId: ACTOR,
            input: 'prueba copiar',
            channel: 'mobile',
            locale: 'es-CL',
            conversationId: 'conversation-read-ambiguity',
        });

        expect(secondTurn.kind).toBe('response');
        if (secondTurn.kind !== 'response') return;
        expect(secondTurn.response.status).toBe('answered');
        expect(secondTurn.response.citations).toEqual([{ sourceType: 'commitment', sourceId: FIRST_ID }]);
        expect(retrieveVisibleCommitmentByIdMock).toHaveBeenCalledWith(ACTOR, FIRST_ID);
        expect(secondTurn.response.answer).toContain('prueba copiar');
        expect(secondTurn.response.answer).not.toContain('entrenar');
        expect(secondTurn.response.answer).toContain('15');
    });
});
