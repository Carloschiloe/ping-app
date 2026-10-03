// M-7 ownership regression: a person mentioned inside an actor-owned
// commitment is content, not a read-side identity referent. Third-party
// ownership remains the planner's identity-resolution responsibility.
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { resolvePersonMock, inputInterpretMock, objectiveInterpretMock } = vi.hoisted(() => ({
    resolvePersonMock: vi.fn(),
    inputInterpretMock: vi.fn(),
    objectiveInterpretMock: vi.fn(),
}));

vi.mock('../src/services/retrieval.service', () => ({
    resolvePerson: (...args: unknown[]) => resolvePersonMock(...args),
    resolveDirectConversation: vi.fn(async () => ({ conversationId: null, ambiguous: false, candidateCount: 0 })),
    retrieveCommitments: vi.fn(async () => []),
    retrieveCommitmentProposals: vi.fn(async () => []),
    retrieveCommitmentEvents: vi.fn(async () => []),
    retrieveMessages: vi.fn(async () => []),
    retrieveTranscriptions: vi.fn(async () => []),
    retrieveAttachments: vi.fn(async () => []),
    retrieveVisibleCommitmentById: vi.fn(async () => null),
    dedupeProvenance: (items: unknown[]) => items,
}));

vi.mock('../src/services/memory.service', () => ({
    retrieveMemory: vi.fn(async () => []),
    ingestMemoryFromEvent: vi.fn(async () => undefined),
}));

vi.mock('../src/services/agentInputInterpreter.service', async (importOriginal) => {
    const actual = await importOriginal<typeof import('../src/services/agentInputInterpreter.service')>();
    return {
        ...actual,
        LlmInputInterpreter: class {
            async interpret(input: string) {
                return inputInterpretMock(input);
            }
        },
    };
});

vi.mock('../src/services/agentObjectiveInterpreter.service', async (importOriginal) => {
    const actual = await importOriginal<typeof import('../src/services/agentObjectiveInterpreter.service')>();
    return {
        ...actual,
        LlmObjectiveInterpreter: class {
            async interpret(input: string, context: { actorUserId: string; conversationId?: string }) {
                return objectiveInterpretMock(input, context);
            }
        },
    };
});

const ACTOR = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const CONVERSATION = '11111111-1111-4111-8111-111111111111';

function writeInterpretation(overrides: Record<string, unknown> = {}) {
    return {
        intent: 'commitment_query',
        intentConfidence: 0.9,
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
        modelUsed: 'test-fake',
        ...overrides,
    };
}

function personalObjective(input: string, title: string) {
    return {
        objectiveType: 'create_personal_commitment' as const,
        targetEntities: { personHints: [], entityHints: [title] },
        constraints: { commitmentOwnership: 'personal' as const, responsibleHint: null },
        desiredOutcome: title,
        timeConstraints: { rawHint: 'tomorrow at 10' },
        actor: ACTOR,
        sourceUtterance: input,
        confidence: 0.9,
        ambiguities: [],
        source: 'llm' as const,
    };
}

beforeEach(() => {
    vi.resetModules();
    resolvePersonMock.mockReset().mockResolvedValue({ resolved: null, ambiguous: false, candidates: [] });
    inputInterpretMock.mockReset();
    objectiveInterpretMock.mockReset();
});

describe('personal ownership is resolved before read-side identity scope', () => {
    it('asks for the missing date, never for the person inside the content', async () => {
        const input = 'I have to call an unregistered person';
        inputInterpretMock.mockResolvedValue(writeInterpretation());
        objectiveInterpretMock.mockResolvedValue({
            ...personalObjective(input, 'call an unregistered person'),
            timeConstraints: { rawHint: null },
        });

        const { runAgentTurn } = await import('../src/services/agentTurn.service');
        const result = await runAgentTurn({ actorUserId: ACTOR, conversationId: CONVERSATION, input });

        expect(result.kind).toBe('clarification');
        expect(result.kind === 'clarification' ? result.questions[0].field : null).toBe('dueAt');
        expect(resolvePersonMock).not.toHaveBeenCalled();
    });

    it('does not resolve unknown people or companies across personal formulations', async () => {
        const cases = [
            ['I have to call an unregistered person', 'call an unregistered person'],
            ['I need to visit an unregistered company', 'visit an unregistered company'],
            ['I must review a contract with an unregistered person', 'review a contract with an unregistered person'],
        ] as const;

        const { runAgentTurn } = await import('../src/services/agentTurn.service');
        for (const [input, title] of cases) {
            inputInterpretMock.mockResolvedValueOnce(writeInterpretation());
            objectiveInterpretMock.mockResolvedValueOnce({
                ...personalObjective(input, title),
                timeConstraints: { rawHint: null },
            });
            const result = await runAgentTurn({ actorUserId: ACTOR, conversationId: `${CONVERSATION}-${title.length}`, input });
            expect(result.kind).toBe('clarification');
            expect(result.kind === 'clarification' ? result.questions[0].field : null).toBe('dueAt');
        }
        expect(resolvePersonMock).not.toHaveBeenCalled();
    });
});

describe('third-party ownership keeps canonical identity resolution', () => {
    it('asks for an authorized responsible person only when the objective assigns the action', async () => {
        inputInterpretMock.mockResolvedValue(writeInterpretation({ personHints: ['an unregistered person'] }));
        objectiveInterpretMock.mockResolvedValue({
            ...personalObjective('Assign tomorrow the review to an unregistered person', 'review the contract'),
            objectiveType: 'create_commitment_or_proposal',
            constraints: { commitmentOwnership: 'third_party', responsibleHint: 'an unregistered person' },
        });

        const { runAgentTurn } = await import('../src/services/agentTurn.service');
        const result = await runAgentTurn({ actorUserId: ACTOR, conversationId: CONVERSATION, input: 'Assign tomorrow the review to an unregistered person' });

        expect(result.kind).toBe('clarification');
        expect(['responsible', 'person_not_found']).toContain(
            result.kind === 'clarification' ? result.questions[0].field : null,
        );
        expect(resolvePersonMock).toHaveBeenCalledTimes(1);
    });

    it('does not execute when ownership is ambiguous', async () => {
        inputInterpretMock.mockResolvedValue(writeInterpretation());
        objectiveInterpretMock.mockResolvedValue({
            ...personalObjective('Schedule this tomorrow with someone', 'this'),
            objectiveType: 'create_commitment_or_proposal',
            constraints: { commitmentOwnership: 'ambiguous', responsibleHint: 'someone' },
        });

        const { runAgentTurn } = await import('../src/services/agentTurn.service');
        const result = await runAgentTurn({ actorUserId: ACTOR, conversationId: CONVERSATION, input: 'Schedule this tomorrow with someone' });

        expect(result.kind).toBe('clarification');
        expect(result.kind === 'clarification' ? result.questions[0].field : null).toBe('commitmentOwnership');
        expect(resolvePersonMock).not.toHaveBeenCalled();
    });
});
