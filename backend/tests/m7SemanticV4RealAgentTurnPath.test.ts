import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AgentObjective } from '../src/types/agentPlan';
import type { NormalizedSemanticTurnV4 } from '../src/types/agentTurnCommit';
import type { AgentSemanticInterpretation } from '../src/services/agentSemanticInterpreter.service';
import type { SemanticV4Diagnostics } from '../src/services/canonicalSemanticProducer.service';
import {
    AgentSemanticV4HighFidelityReadOnlyResolver,
    createHighFidelityReadOnlyRepositoryForTest,
} from '../src/services/agentSemanticV4HighFidelityReadOnly.service';
import { AgentDialogueStateService, clearAgentDialogueStateForTests } from '../src/services/agentDialogueState.service';

const ACTOR = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const CONVERSATION = '11111111-1111-4111-8111-111111111111';
const COMMITMENT = '22222222-2222-4222-8222-222222222222';

const diagnostics: SemanticV4Diagnostics = {
    schemaValid: true,
    failure: null,
    providerRequestSucceeded: true,
    providerFailure: false,
    providerErrorClass: null,
    providerHttpStatus: null,
    providerErrorCode: null,
    providerErrorMessage: null,
    finishReason: 'stop',
    refusalPresent: false,
    contentPresent: true,
    contentLength: 10,
    normalizationSuccess: true,
    fallbackReason: null,
    model: 'precomputed-v4-fixture',
    latencyMs: 1,
    usage: { inputTokens: null, outputTokens: null, totalTokens: null, reasoningTokens: null },
};

function semantic(overrides: Partial<NormalizedSemanticTurnV4> = {}): NormalizedSemanticTurnV4 {
    return {
        version: 4,
        kind: 'read_request',
        domain: 'commitment',
        objectiveCompleteness: 'complete',
        lifecycleCommand: 'none',
        lifecycleTarget: 'unspecified',
        lifecycleEvidence: 'unknown',
        pendingSlotAnswer: 'not_a_slot_answer',
        continuationLike: 'unknown',
        candidateSlotType: null,
        independentObjective: 'yes',
        objectiveType: null,
        entityHints: [],
        slots: {},
        ambiguityFields: [],
        confidence: 0.95,
        source: 'llm',
        readMeaning: {
            queryShape: 'focused',
            explicitCollection: false,
            targetShape: 'commitment',
            relationship: { kind: 'general_recall' },
            temporalRole: 'none',
            commitmentStatus: null,
        },
        ...overrides,
    };
}

function interpretation(overrides: Record<string, unknown> = {}): Record<string, unknown> {
    return {
        intent: 'commitment_query',
        intentConfidence: 0.95,
        personHints: [],
        topicHints: [],
        textQuery: null,
        timeExpression: null,
        statusHints: null,
        requestedTransition: null,
        wantsCommitments: true,
        wantsMessages: false,
        wantsTranscriptions: false,
        wantsAttachments: false,
        wantsOverdueFocus: false,
        proposalFocus: null,
        isWriteActionRequest: false,
        ambiguityHints: [],
        source: 'llm',
        modelUsed: 'test-legacy-input',
        ...overrides,
    };
}

function objective(overrides: Partial<AgentObjective> = {}): AgentObjective {
    return {
        objectiveType: 'create_personal_commitment',
        targetEntities: { personHints: [], entityHints: ['revisar informe técnico'] },
        constraints: {},
        desiredOutcome: 'revisar informe técnico',
        timeConstraints: { rawHint: 'mañana' },
        actor: ACTOR,
        sourceUtterance: 'Anota revisar informe técnico mañana',
        confidence: 0.9,
        ambiguities: [],
        source: 'llm',
        ...overrides,
    };
}

function legacy(route: 'read' | 'write'): AgentSemanticInterpretation {
    return {
        route,
        objective: route === 'write' ? objective() : null,
        interpretation: interpretation({ isWriteActionRequest: route === 'write' }),
    } as AgentSemanticInterpretation;
}

function commitmentRow(id = COMMITMENT) {
    return {
            id,
            entityType: 'commitment',
            title: 'revisar informe técnico',
            description: null,
            status: 'accepted',
            type: 'task',
            priority: null,
            dueAt: '2026-09-27T15:00:00.000Z',
            proposedDueAt: null,
            expectedResult: null,
            resolvedAt: null,
            resolutionResult: null,
            rejectionReason: null,
            ownerUserId: ACTOR,
            assignedToUserId: null,
            counterpartyContactId: null,
            conversationId: CONVERSATION,
            messageId: null,
            createdAt: '2026-09-26T10:00:00.000Z',
            provenance: { sourceType: 'commitment', sourceId: id },
            authorizedActorUserIds: [ACTOR],
        } as any;
}

function repository() {
    return createHighFidelityReadOnlyRepositoryForTest({ commitments: [commitmentRow()] });
}

vi.mock('../src/services/retrieval.service', () => ({
    resolvePerson: vi.fn(async () => ({ resolved: null, ambiguous: false, candidates: [] })),
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

// The real turn path imports session/auth modules at module load. The
// certification boundary never calls their persistence methods, so keep the
// dependency inert rather than requiring Supabase credentials in this
// isolated test process.
vi.mock('../src/lib/supabaseAdmin', () => ({
    supabaseAdmin: { from: vi.fn() },
}));

describe('M-7 real /agent/turn boundary with a precomputed V4 input', () => {
    beforeEach(() => {
        process.env.NODE_ENV = 'test';
        process.env.PING_ENVIRONMENT = 'local';
        process.env.PING_SEMANTIC_V4_SHADOW = 'true';
        process.env.PING_SEMANTIC_V4_CORE_SHADOW = 'true';
        clearAgentDialogueStateForTests();
    });

    it('passes a real READ turn through context, V4 adapter, authorized resolver, disposition and plan shape', async () => {
        const { runAgentTurn } = await import('../src/services/agentTurn.service');
        const telemetry: any[] = [];
        const result = await runAgentTurn({ actorUserId: ACTOR, conversationId: CONVERSATION, input: 'Muéstrame el pendiente técnico' }, {
            inputInterpreter: { interpret: async () => interpretation() as any },
            precomputedSemanticV4: { semantic: semantic({ slots: { topic: 'revisar informe técnico' } }), diagnostics },
            semanticV4CoreShadowResolver: new AgentSemanticV4HighFidelityReadOnlyResolver(repository()),
            semanticV4CoreShadowObserver: (value) => telemetry.push(value),
        });

        expect(result.kind).toBe('response');
        expect(telemetry).toHaveLength(1);
        expect(telemetry[0].failure).toBeNull();
        expect(telemetry[0].core.disposition).toBe('ordinary_read');
        expect(telemetry[0].core.resolution.status).toBe('resolved');
        expect(telemetry[0].core.resolution.referenceKind).toBe('commitment');
        expect(telemetry[0].core.planShape.route).toBe('read');
        expect(telemetry[0].sideEffects).toEqual({
            toolsExecuted: false,
            persistenceWrites: 0,
            dialogueStateMutated: false,
            legacyResultChanged: false,
        });
    });

    it('passes a real WRITE turn to the existing planner boundary without authorization or execution', async () => {
        const { runAgentTurn } = await import('../src/services/agentTurn.service');
        const telemetry: any[] = [];
        const result = await runAgentTurn({ actorUserId: ACTOR, conversationId: CONVERSATION, input: 'Anota revisar informe técnico mañana' }, {
            inputInterpreter: { interpret: async () => interpretation({ isWriteActionRequest: true }) as any },
            objectiveInterpreter: { interpret: async () => objective() },
            precomputedSemanticV4: {
                semantic: semantic({
                    kind: 'write_request',
                    objectiveType: 'create_personal_commitment',
                    readMeaning: null,
                    slots: { title: 'revisar informe técnico', time: 'mañana' },
                }),
                diagnostics,
            },
            semanticV4CoreShadowResolver: new AgentSemanticV4HighFidelityReadOnlyResolver(repository()),
            semanticV4CoreShadowObserver: (value) => telemetry.push(value),
        });

        expect(result.kind).toBe('plan');
        expect((result as any).plan.status).toBe('ready_for_authorization');
        expect(telemetry).toHaveLength(1);
        expect(telemetry[0].failure).toBeNull();
        expect(telemetry[0].core.disposition).toBe('ordinary_write');
        expect(telemetry[0].core.planShape.route).toBe('write');
        expect(telemetry[0].core.planShape.objectiveType).toBe('create_personal_commitment');
        expect(telemetry[0].sideEffects.toolsExecuted).toBe(false);
        expect(telemetry[0].sideEffects.persistenceWrites).toBe(0);
    });

    it('preserves a real dialogue service across turns while V4 inputs are replayed independently', async () => {
        const { runAgentTurn } = await import('../src/services/agentTurn.service');
        const dialogueService = new AgentDialogueStateService();
        const telemetry: any[] = [];
        const common = {
            actorUserId: ACTOR,
            conversationId: CONVERSATION,
            channel: 'mobile',
            locale: 'es-CL',
        };
        const first = await runAgentTurn({ ...common, input: 'Anota revisar informe técnico mañana' }, {
            dialogueService,
            inputInterpreter: { interpret: async () => interpretation({ isWriteActionRequest: true }) as any },
            objectiveInterpreter: { interpret: async () => objective() },
            precomputedSemanticV4: { semantic: semantic({ kind: 'write_request', objectiveType: 'create_personal_commitment', readMeaning: null, slots: { title: 'revisar informe técnico', time: 'mañana' } }), diagnostics },
            semanticV4CoreShadowResolver: new AgentSemanticV4HighFidelityReadOnlyResolver(repository()),
            semanticV4CoreShadowObserver: (value) => telemetry.push(value),
        });
        const second = await runAgentTurn({ ...common, input: '¿Puedes decirme el estado del plan?' }, {
            dialogueService,
            inputInterpreter: { interpret: async () => interpretation({ isWriteActionRequest: false }) as any },
            precomputedSemanticV4: { semantic: semantic({ kind: 'read_request', readMeaning: { queryShape: 'focused', explicitCollection: false, targetShape: 'commitment', relationship: { kind: 'current_state' }, temporalRole: 'none', commitmentStatus: 'pending' }, slots: { topic: 'revisar informe técnico' } }), diagnostics },
            semanticV4CoreShadowResolver: new AgentSemanticV4HighFidelityReadOnlyResolver(repository()),
            semanticV4CoreShadowObserver: (value) => telemetry.push(value),
        });

        expect(first.kind).toBe('plan');
        expect(second.kind).toBe('response');
        expect(telemetry).toHaveLength(2);
        expect(telemetry.every((value) => value.failure === null)).toBe(true);
        expect(dialogueService.getSnapshot(ACTOR, CONVERSATION)).toBeTruthy();
        expect(telemetry.every((value) => value.sideEffects.persistenceWrites === 0)).toBe(true);
    });

    it('covers the real READ boundary for unique, set, empty, ambiguous, person and message scopes', async () => {
        const { runAgentTurn } = await import('../src/services/agentTurn.service');
        const cases = [
            {
                name: 'unique commitment',
                turn: semantic({ slots: { topic: 'revisar informe técnico' } }),
                repository: repository(),
                status: 'resolved',
                referenceKind: 'commitment',
            },
            {
                name: 'result set',
                turn: semantic({ readMeaning: { queryShape: 'collection', explicitCollection: true, targetShape: 'commitment', relationship: { kind: 'general_recall' }, temporalRole: 'none', commitmentStatus: null } }),
                repository: repository(),
                status: 'result_set',
                referenceKind: 'commitment',
            },
            {
                name: 'empty scope',
                turn: semantic({ slots: { topic: 'tema inexistente' } }),
                repository: createHighFidelityReadOnlyRepositoryForTest(),
                status: 'zero_match',
                referenceKind: 'commitment',
            },
            {
                name: 'ambiguous commitment',
                turn: semantic({ slots: { topic: 'revisar informe técnico' } }),
                repository: createHighFidelityReadOnlyRepositoryForTest({ commitments: [
                    commitmentRow('33333333-3333-4333-8333-333333333333'),
                    commitmentRow('44444444-4444-4444-8444-444444444444'),
                ] as any }),
                status: 'ambiguous',
                referenceKind: 'commitment',
            },
            {
                name: 'person scope',
                turn: semantic({ readMeaning: { queryShape: 'focused', explicitCollection: false, targetShape: 'person', relationship: { kind: 'person_relationship' }, temporalRole: 'none', commitmentStatus: null }, candidateSlotType: 'person', slots: { person: 'Daniel' } }),
                repository: createHighFidelityReadOnlyRepositoryForTest({ people: [{ actorUserId: ACTOR, person: { kind: 'user', id: '55555555-5555-4555-8555-555555555555', displayName: 'Daniel' } }] }),
                status: 'resolved',
                referenceKind: 'person',
            },
            {
                name: 'message scope',
                turn: semantic({ readMeaning: { queryShape: 'focused', explicitCollection: false, targetShape: 'message', relationship: { kind: 'message_relationship', relationship: 'content' }, temporalRole: 'none', commitmentStatus: null }, slots: { topic: 'reunión técnica' } }),
                repository: createHighFidelityReadOnlyRepositoryForTest({ messages: [{ id: '66666666-6666-4666-8666-666666666666', conversationId: CONVERSATION, senderId: ACTOR, content: 'reunión técnica', isSystem: false, createdAt: '2026-09-26T10:00:00.000Z', provenance: { sourceType: 'message', sourceId: '66666666-6666-4666-8666-666666666666' }, authorizedActorUserIds: [ACTOR] }] }),
                status: 'resolved',
                referenceKind: 'message',
            },
        ] as const;

        for (const [index, item] of cases.entries()) {
            const telemetry: any[] = [];
            const result = await runAgentTurn({ actorUserId: ACTOR, conversationId: `${CONVERSATION.slice(0, -1)}${index + 2}`, input: `consulta aislada ${item.name}` }, {
                inputInterpreter: { interpret: async () => interpretation() as any },
                precomputedSemanticV4: { semantic: item.turn, diagnostics },
                semanticV4CoreShadowResolver: new AgentSemanticV4HighFidelityReadOnlyResolver(item.repository),
                semanticV4CoreShadowObserver: (value) => telemetry.push(value),
            });
            expect(result.kind, item.name).toBe('response');
            expect(telemetry).toHaveLength(1);
            expect(telemetry[0].failure, item.name).toBeNull();
            expect(telemetry[0].core.resolution.status, item.name).toBe(item.status);
            expect(telemetry[0].core.resolution.referenceKind, item.name).toBe(item.referenceKind);
            expect(telemetry[0].sideEffects.persistenceWrites, item.name).toBe(0);
            expect(telemetry[0].sideEffects.toolsExecuted, item.name).toBe(false);
        }
    });
});
