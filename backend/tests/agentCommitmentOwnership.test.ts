import { beforeEach, describe, expect, it, vi } from 'vitest';

const { resolvePersonMock } = vi.hoisted(() => ({ resolvePersonMock: vi.fn() }));

vi.mock('../src/services/retrieval.service', () => ({
    resolvePerson: resolvePersonMock,
    retrieveCommitments: vi.fn(async () => []),
    retrieveCommitmentProposals: vi.fn(async () => []),
    retrieveVisibleCommitmentById: vi.fn(async () => null),
    resolveDirectConversation: vi.fn(async () => ({ conversationId: null, ambiguous: false, candidateCount: 0 })),
}));

const ACTOR_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const NOW = new Date('2026-10-03T12:00:00.000Z');

function objective(overrides: Record<string, unknown> = {}) {
    return {
        objectiveType: 'create_commitment_or_proposal' as const,
        targetEntities: { personHints: [], entityHints: ['llamar a una persona desconocida'] },
        constraints: { commitmentOwnership: 'personal' as const, responsibleHint: null },
        desiredOutcome: 'llamar a una persona desconocida',
        timeConstraints: { rawHint: 'mañana a las 10' },
        actor: ACTOR_ID,
        sourceUtterance: 'Agéndame mañana a las 10 llamar a una persona desconocida.',
        confidence: 0.9,
        ambiguities: [],
        source: 'llm' as const,
        ...overrides,
    };
}

describe('commitment ownership stays separate from content entities', () => {
    beforeEach(() => {
        resolvePersonMock.mockReset();
        resolvePersonMock.mockResolvedValue({ resolved: null, ambiguous: false, candidates: [] });
    });

    it('personal reminder with an unknown person in the action does not resolve identity', async () => {
        const { planObjective } = await import('../src/services/agentPlanner.service');
        const current = objective();
        const result = await planObjective({ actorUserId: ACTOR_ID, objective: current, input: current.sourceUtterance, now: NOW });

        expect(result.blockingAmbiguities).toEqual([]);
        expect(result.steps).toHaveLength(1);
        expect(result.steps[0].arguments).toMatchObject({ responsiblePersonId: null });
        expect(resolvePersonMock).not.toHaveBeenCalled();
    });

    it('personal reminder with an unknown company/place remains personal content', async () => {
        const input = 'Ponme para mañana revisar el local Puerto Azul.';
        const current = objective({
            targetEntities: { personHints: [], entityHints: ['revisar el local Puerto Azul'] },
            desiredOutcome: 'revisar el local Puerto Azul', sourceUtterance: input,
        });
        const { planObjective } = await import('../src/services/agentPlanner.service');
        const result = await planObjective({ actorUserId: ACTOR_ID, objective: current, input, now: NOW });

        expect(result.blockingAmbiguities).toEqual([]);
        expect(result.steps[0].arguments).toMatchObject({ responsiblePersonId: null });
        expect(resolvePersonMock).not.toHaveBeenCalled();
    });

    it('third-party assignment preserves identity resolution', async () => {
        const input = 'Asigna para mañana este compromiso a una persona desconocida.';
        const current = objective({
            targetEntities: { personHints: ['una persona desconocida'], entityHints: ['este compromiso'] },
            constraints: { commitmentOwnership: 'third_party', responsibleHint: 'una persona desconocida' },
            sourceUtterance: input,
        });
        const { planObjective } = await import('../src/services/agentPlanner.service');
        const result = await planObjective({ actorUserId: ACTOR_ID, objective: current, input, now: NOW });

        expect(result.blockingAmbiguities[0]?.field).toBe('responsible');
        expect(resolvePersonMock).toHaveBeenCalled();
    });

    it('ambiguous ownership blocks before identity resolution or execution', async () => {
        const input = 'Agenda esto para mañana con alguien.';
        const current = objective({
            targetEntities: { personHints: ['alguien'], entityHints: ['esto'] },
            constraints: { commitmentOwnership: 'ambiguous', responsibleHint: 'alguien' },
            sourceUtterance: input,
        });
        const { planObjective } = await import('../src/services/agentPlanner.service');
        const result = await planObjective({ actorUserId: ACTOR_ID, objective: current, input, now: NOW });

        expect(result.steps).toEqual([]);
        expect(result.blockingAmbiguities[0]?.field).toBe('commitmentOwnership');
        expect(resolvePersonMock).not.toHaveBeenCalled();
    });
});
