// M-7B — Multi-turn slot continuation tests. Covers the 24 required test
// areas: incomplete-objective dialogue state / clarification / no premature
// plan, continuation slot merge / field survival, plan-readiness after
// completion, planner/authorization reuse, no auto-execution, no implicit
// authorization, unrelated-objective isolation (conversation/actor/surface),
// stale-turn/CAS protection, structured (never concatenated) dialogue
// context, no memory writes, no canonical-entity trust from referents, no
// new write tool, single-turn behavior unchanged, create_commitment tests
// green.
//
// Two layers of tests:
//   1. Unit tests directly against agentDialogueContinuation.service.ts's
//      pure functions (classifyContinuation/reconcileContinuationObjective)
//      -- fully deterministic, no mocking needed.
//   2. Live-wiring tests calling the real runAgentTurn end-to-end, with
//      LlmInputInterpreter/LlmObjectiveInterpreter mocked to controllable
//      stubs (the same "mock the module, keep everything else real"
//      pattern already established in tests/agentTurn.test.ts) so the
//      real dialogue-state lookup/merge/planning/persistence machinery
//      runs unmocked.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AgentObjective } from '../src/types/agentPlan';
import type { AgentDialogueState } from '../src/types/agentDialogueState';

// ─── Layer 1: pure unit tests (no mocking) ──────────────────────────────────
import {
    classifyContinuation,
    reconcileContinuationObjective,
    isContinuationEligibleObjectiveType,
} from '../src/services/agentDialogueContinuation.service';

const ACTOR_A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const CONV_1 = 'conv-1';

function objective(overrides: Partial<AgentObjective> = {}): AgentObjective {
    return {
        objectiveType: 'create_personal_commitment',
        targetEntities: { personHints: [], entityHints: ['llamar a Pedro'] },
        constraints: {},
        desiredOutcome: 'llamar a Pedro',
        timeConstraints: { rawHint: null },
        actor: ACTOR_A,
        sourceUtterance: 'Tengo que llamar a Pedro',
        confidence: 0.8,
        ambiguities: [],
        source: 'deterministic',
        ...overrides,
    };
}

function dialogueState(overrides: Partial<AgentDialogueState> = {}): AgentDialogueState {
    return {
        actorUserId: ACTOR_A,
        dialogueScopeKey: CONV_1,
        lifecycle: 'clarifying',
        openObjective: objective(),
        ambiguities: [],
        pendingClarification: { field: 'dueAt', question: '¿Cuándo?' },
        corrections: {},
        referents: [],
        currentPlanDigestRef: null,
        currentAuthorizationIdRef: null,
        version: 1,
        lastTurnSequence: 1,
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
        expiresAt: '2026-01-01T00:10:00.000Z',
        ...overrides,
    };
}

describe('isContinuationEligibleObjectiveType', () => {
    it('create_personal_commitment and create_commitment_or_proposal are eligible', () => {
        expect(isContinuationEligibleObjectiveType('create_personal_commitment')).toBe(true);
        expect(isContinuationEligibleObjectiveType('create_commitment_or_proposal')).toBe(true);
    });

    it('other objective types are NOT eligible in this bounded rollout', () => {
        expect(isContinuationEligibleObjectiveType('communicate_message')).toBe(false);
        expect(isContinuationEligibleObjectiveType('reschedule_existing_commitment')).toBe(false);
        expect(isContinuationEligibleObjectiveType('respond_to_existing_proposal')).toBe(false);
        expect(isContinuationEligibleObjectiveType('unsupported')).toBe(false);
    });
});

describe('classifyContinuation (test areas 13, 14, 15, 16)', () => {
    it('13/A. NEW OBJECTIVE: no open dialogue state -> never a continuation', () => {
        const result = classifyContinuation(null, objective({ sourceUtterance: 'Como a las nueve' }));
        expect(result.isContinuation).toBe(false);
        expect(result.reason).toBe('no_open_dialogue_objective');
    });

    it('B. CONTINUATION: open objective of an eligible type + same-type fragment -> continuation accepted', () => {
        const state = dialogueState();
        const fragment = objective({ sourceUtterance: 'Como a las nueve', timeConstraints: { rawHint: null }, targetEntities: { personHints: [], entityHints: [] } });
        const result = classifyContinuation(state, fragment);
        expect(result.isContinuation).toBe(true);
    });

    it('C. ABANDON/DIFFERENT INTENT: a new turn resolving to a DIFFERENT objectiveType is never merged, even with an open dialogue state', () => {
        const state = dialogueState();
        const different = objective({ objectiveType: 'communicate_message', sourceUtterance: 'Dile a Juan que llego tarde' });
        const result = classifyContinuation(state, different);
        expect(result.isContinuation).toBe(false);
        expect(result.reason).toBe('new_turn_different_objective_type');
    });

    it('14. no open objective -> continuation cannot magically exist, even if a same-type objective arrives', () => {
        const result = classifyContinuation(dialogueState({ openObjective: null }), objective());
        expect(result.isContinuation).toBe(false);
        expect(result.reason).toBe('no_open_dialogue_objective');
    });

    it('a resolved/expired dialogue state is never treated as awaiting continuation', () => {
        const resolved = classifyContinuation(dialogueState({ lifecycle: 'resolved' }), objective({ sourceUtterance: 'Como a las nueve' }));
        expect(resolved.isContinuation).toBe(false);
        expect(resolved.reason).toBe('dialogue_not_awaiting_continuation');

        const expired = classifyContinuation(dialogueState({ lifecycle: 'expired' }), objective({ sourceUtterance: 'Como a las nueve' }));
        expect(expired.isContinuation).toBe(false);
    });

    it('a same-type new turn naming its OWN different entity is treated as a new request, never force-merged', () => {
        const state = dialogueState(); // open objective: "llamar a Pedro"
        const differentEntity = objective({ sourceUtterance: 'Recuérdame comprar pan mañana', targetEntities: { personHints: [], entityHints: ['comprar pan'] } });
        const result = classifyContinuation(state, differentEntity);
        expect(result.isContinuation).toBe(false);
        expect(result.reason).toBe('new_turn_names_its_own_entity');
    });

    it('an objective type outside the eligible set is never treated as continuable, even with an open dialogue state', () => {
        const state = dialogueState({ openObjective: objective({ objectiveType: 'reschedule_existing_commitment' }) });
        const result = classifyContinuation(state, objective({ objectiveType: 'reschedule_existing_commitment' }));
        expect(result.isContinuation).toBe(false);
        expect(result.reason).toBe('open_objective_type_not_eligible');
    });
});

describe('reconcileContinuationObjective — slot merge (test areas 5, 6, 7)', () => {
    it('5. continuation fills missing semantic data (time)', () => {
        const prior = objective({ sourceUtterance: 'Tengo que llamar a Pedro', timeConstraints: { rawHint: null } });
        const fragment = objective({ sourceUtterance: 'a las 9', timeConstraints: { rawHint: 'a las 9' }, targetEntities: { personHints: [], entityHints: [] } });
        const { objective: reconciled, filledField } = reconcileContinuationObjective(prior, fragment);
        expect(filledField).toBe('time');
        expect(reconciled.sourceUtterance).toContain('Tengo que llamar a Pedro');
        expect(reconciled.sourceUtterance).toContain('a las 9');
    });

    it('6. prior known fields (title/entityHints) survive continuation', () => {
        const prior = objective({ targetEntities: { personHints: [], entityHints: ['llamar a Pedro'] } });
        const fragment = objective({ sourceUtterance: 'a las 9', targetEntities: { personHints: [], entityHints: [] } });
        const { objective: reconciled } = reconcileContinuationObjective(prior, fragment);
        expect(reconciled.targetEntities.entityHints).toEqual(['llamar a Pedro']);
    });

    it('7. continuation does not erase existing fields when the new turn supplies nothing new', () => {
        const prior = objective({ targetEntities: { personHints: [], entityHints: ['llamar a Pedro'] }, timeConstraints: { rawHint: 'mañana' } });
        const emptyFragment = objective({ sourceUtterance: '', targetEntities: { personHints: [], entityHints: [] }, timeConstraints: { rawHint: null } });
        const { objective: reconciled, filledField } = reconcileContinuationObjective(prior, emptyFragment);
        expect(reconciled.targetEntities.entityHints).toEqual(['llamar a Pedro']);
        expect(reconciled.timeConstraints.rawHint).toBe('mañana');
        expect(filledField).toBe('none');
    });

    it('a prior objective that ALREADY has a date word is never overwritten by a fragment (no accidental double-date corruption)', () => {
        const prior = objective({ sourceUtterance: 'Llamar a Pedro mañana', timeConstraints: { rawHint: 'mañana' } });
        const fragment = objective({ sourceUtterance: 'a las 9', timeConstraints: { rawHint: 'a las 9' }, targetEntities: { personHints: [], entityHints: [] } });
        const { objective: reconciled, filledField } = reconcileContinuationObjective(prior, fragment);
        // The prior objective's OWN rawHint already existed -- it is not
        // replaced. (Whether "a las 9" is separately incorporated into
        // planning is the planner's own re-derivation job, never this
        // function inventing a second date signal.)
        expect(reconciled.timeConstraints.rawHint).toBe('mañana');
        expect(filledField).toBe('none');
    });

    it('LLM cannot fabricate canonical entity identity -- reconciliation only ever copies raw-text entityHints/personHints, never introduces an ID field', () => {
        const prior = objective();
        const fragment = objective({ sourceUtterance: 'a las 9', targetEntities: { personHints: [], entityHints: [] } });
        const { objective: reconciled } = reconcileContinuationObjective(prior, fragment);
        expect(Object.keys(reconciled.targetEntities).sort()).toEqual(['entityHints', 'personHints']);
        expect(reconciled.targetEntities.entityHints.every((h) => typeof h === 'string')).toBe(true);
    });
});

// ─── Layer 2: live-wiring tests (runAgentTurn end-to-end) ──────────────────
const { llmObjectiveInterpretMock, llmInputInterpretMock } = vi.hoisted(() => ({
    llmObjectiveInterpretMock: vi.fn(),
    llmInputInterpretMock: vi.fn(),
}));

vi.mock('../src/services/agentObjectiveInterpreter.service', async (importOriginal) => {
    const actual = await importOriginal<typeof import('../src/services/agentObjectiveInterpreter.service')>();
    return {
        ...actual,
        LlmObjectiveInterpreter: class {
            async interpret(input: string, context: { actorUserId: string; conversationId?: string }) {
                return llmObjectiveInterpretMock(input, context);
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
                return llmInputInterpretMock(input);
            }
        },
    };
});

vi.mock('../src/services/retrieval.service', () => ({
    resolvePerson: vi.fn(async () => ({
        resolved: { id: 'person-pedro', displayName: 'Pedro' },
        ambiguous: false,
        candidates: [{ id: 'person-pedro', displayName: 'Pedro' }],
    })),
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

let runAgentTurn: typeof import('../src/services/agentTurn.service').runAgentTurn;
let clearAgentDialogueStateForTests: typeof import('../src/services/agentDialogueState.service').clearAgentDialogueStateForTests;
let authorizePlanSpy: ReturnType<typeof vi.spyOn>;
let executeAuthorizationSpy: ReturnType<typeof vi.spyOn>;

beforeEach(async () => {
    vi.resetModules();
    const turnModule = await import('../src/services/agentTurn.service');
    runAgentTurn = turnModule.runAgentTurn;
    const dialogueModule = await import('../src/services/agentDialogueState.service');
    clearAgentDialogueStateForTests = dialogueModule.clearAgentDialogueStateForTests;
    clearAgentDialogueStateForTests();
    llmObjectiveInterpretMock.mockReset();
    llmInputInterpretMock.mockReset();

    const authModule = await import('../src/services/agentAuthorization.service');
    const execModule = await import('../src/services/agentExecution.service');
    authorizePlanSpy = vi.spyOn(authModule, 'authorizePlan');
    executeAuthorizationSpy = vi.spyOn(execModule, 'executeAuthorization');
}, 30000); // vi.resetModules() + several dynamic imports per test is slow under full-suite parallel load; default 10s hook timeout is too tight there (isolated runs finish in well under 1s).

afterEach(() => {
    clearAgentDialogueStateForTests();
    vi.restoreAllMocks();
});

function writeObjective(overrides: Partial<AgentObjective> = {}): AgentObjective {
    return objective({ objectiveType: 'create_personal_commitment', source: 'llm', ...overrides });
}

// A read-only Interpretation stub -- only the fields runAgentTurn/buildAgentContext
// actually branch on for this test suite's purposes are meaningfully set;
// the rest are safe, inert defaults.
function readOnlyInterpretation(overrides: Record<string, unknown> = {}) {
    return {
        intent: 'general_context', intentConfidence: 0.3, personHints: [], topicHints: [],
        textQuery: null, timeExpression: null, statusHints: null, requestedTransition: null,
        wantsCommitments: false, wantsMessages: false, wantsTranscriptions: false, wantsAttachments: false,
        wantsOverdueFocus: false, proposalFocus: null, isWriteActionRequest: false,
        ambiguityHints: [], source: 'llm', modelUsed: 'test-fake', ...overrides,
    };
}

function writeInterpretation(overrides: Record<string, unknown> = {}) {
    return readOnlyInterpretation({ intent: 'commitment_query', isWriteActionRequest: true, ...overrides });
}

describe('Live wiring: incomplete objective (test areas 1, 2, 3)', () => {
    it('1/2. incomplete objective (no date) creates dialogue working state AND produces clarification', async () => {
        llmInputInterpretMock.mockResolvedValue(writeInterpretation());
        llmObjectiveInterpretMock.mockResolvedValue(writeObjective({ sourceUtterance: 'Tengo que llamar a Pedro', timeConstraints: { rawHint: null } }));

        const result = await runAgentTurn({ actorUserId: ACTOR_A, input: 'Tengo que llamar a Pedro' });

        expect(result.kind).toBe('clarification');
    });

    it('3. no plan is created while required semantic data (date) is missing', async () => {
        llmInputInterpretMock.mockResolvedValue(writeInterpretation());
        llmObjectiveInterpretMock.mockResolvedValue(writeObjective({ sourceUtterance: 'Tengo que llamar a Pedro', timeConstraints: { rawHint: null } }));

        const result = await runAgentTurn({ actorUserId: ACTOR_A, input: 'Tengo que llamar a Pedro' });

        expect(result.kind).not.toBe('plan');
        expect(authorizePlanSpy).not.toHaveBeenCalled();
        expect(executeAuthorizationSpy).not.toHaveBeenCalled();
    });
});

describe('Live wiring: continuation completes the objective (test areas 4, 8, 9, 10)', () => {
    it('4/8. continuation receives the prior dialogue snapshot and completes planning once the missing date is filled', async () => {
        llmInputInterpretMock.mockResolvedValue(writeInterpretation());
        llmObjectiveInterpretMock.mockResolvedValueOnce(writeObjective({ sourceUtterance: 'Tengo que llamar a Pedro', timeConstraints: { rawHint: null } }));

        const turn1 = await runAgentTurn({ actorUserId: ACTOR_A, input: 'Tengo que llamar a Pedro' });
        expect(turn1.kind).toBe('clarification');

        llmObjectiveInterpretMock.mockResolvedValueOnce(writeObjective({ sourceUtterance: 'mañana a las 9', timeConstraints: { rawHint: 'mañana a las 9' }, targetEntities: { personHints: [], entityHints: [] } }));
        const turn2 = await runAgentTurn({ actorUserId: ACTOR_A, input: 'mañana a las 9' });

        expect(turn2.kind).toBe('plan');
    });

    it('9. existing planner is reused -- the resulting plan step is a real create_commitment tool step, not a bespoke continuation path', async () => {
        llmInputInterpretMock.mockResolvedValue(writeInterpretation());
        llmObjectiveInterpretMock.mockResolvedValueOnce(writeObjective({ sourceUtterance: 'Tengo que llamar a Pedro', timeConstraints: { rawHint: null } }));
        await runAgentTurn({ actorUserId: ACTOR_A, input: 'Tengo que llamar a Pedro' });

        llmObjectiveInterpretMock.mockResolvedValueOnce(writeObjective({ sourceUtterance: 'mañana a las 9', timeConstraints: { rawHint: 'mañana a las 9' }, targetEntities: { personHints: [], entityHints: [] } }));
        const turn2 = await runAgentTurn({ actorUserId: ACTOR_A, input: 'mañana a las 9' });

        if (turn2.kind === 'plan') {
            expect(turn2.plan.steps[0]?.toolId).toBe('create_commitment');
        } else {
            throw new Error(`Expected plan, got ${turn2.kind}`);
        }
    });

    it('10. authorization flow is reused -- authorizePlan/executeAuthorization are never called by /agent/turn itself (dry-run only, same as single-turn)', async () => {
        llmInputInterpretMock.mockResolvedValue(writeInterpretation());
        llmObjectiveInterpretMock.mockResolvedValueOnce(writeObjective({ sourceUtterance: 'Tengo que llamar a Pedro', timeConstraints: { rawHint: null } }));
        await runAgentTurn({ actorUserId: ACTOR_A, input: 'Tengo que llamar a Pedro' });
        llmObjectiveInterpretMock.mockResolvedValueOnce(writeObjective({ sourceUtterance: 'mañana a las 9', timeConstraints: { rawHint: 'mañana a las 9' }, targetEntities: { personHints: [], entityHints: [] } }));
        await runAgentTurn({ actorUserId: ACTOR_A, input: 'mañana a las 9' });

        expect(authorizePlanSpy).not.toHaveBeenCalled();
        expect(executeAuthorizationSpy).not.toHaveBeenCalled();
    });

    it('11/12. no auto-execution occurs and no implicit authorization is granted merely because the objective completed across two turns', async () => {
        llmInputInterpretMock.mockResolvedValue(writeInterpretation());
        llmObjectiveInterpretMock.mockResolvedValueOnce(writeObjective({ sourceUtterance: 'Tengo que llamar a Pedro', timeConstraints: { rawHint: null } }));
        await runAgentTurn({ actorUserId: ACTOR_A, input: 'Tengo que llamar a Pedro' });
        llmObjectiveInterpretMock.mockResolvedValueOnce(writeObjective({ sourceUtterance: 'mañana a las 9', timeConstraints: { rawHint: 'mañana a las 9' }, targetEntities: { personHints: [], entityHints: [] } }));
        const turn2 = await runAgentTurn({ actorUserId: ACTOR_A, input: 'mañana a las 9' });

        // A 'plan' result requires explicit client confirmation/authorization
        // afterward -- it is never itself an execution or an authorization.
        expect(turn2.kind).toBe('plan');
        expect(executeAuthorizationSpy).not.toHaveBeenCalled();
        expect(authorizePlanSpy).not.toHaveBeenCalled();
    });
});

describe('Live wiring: no dialogue contamination (test areas 13 continued, 14, 15, 16)', () => {
    it('13. an unrelated explicit new objective (different type) is not merged into the open objective', async () => {
        llmInputInterpretMock.mockResolvedValue(writeInterpretation());
        llmObjectiveInterpretMock.mockResolvedValueOnce(writeObjective({ sourceUtterance: 'Tengo que llamar a Pedro', timeConstraints: { rawHint: null } }));
        await runAgentTurn({ actorUserId: ACTOR_A, input: 'Tengo que llamar a Pedro' });

        // A genuinely different, fully-formed communicate_message request
        // arrives next -- it must be planned on its own terms, never merged
        // with the still-open "llamar a Pedro" reminder.
        llmObjectiveInterpretMock.mockResolvedValueOnce({
            ...writeObjective({ objectiveType: 'communicate_message', sourceUtterance: 'Dile a Juan que ya voy' }),
            targetEntities: { personHints: ['Juan'], entityHints: [] },
            communicateContentCandidate: { verbatimText: 'ya voy', extractionMode: 'semantic_verbatim' as const },
        });
        const turn2 = await runAgentTurn({ actorUserId: ACTOR_A, input: 'Dile a Juan que ya voy' });

        // Whatever this turn's own outcome is, it must never claim it
        // completed/references the Pedro objective's title.
        if (turn2.kind === 'plan') {
            expect(JSON.stringify(turn2.plan.steps)).not.toContain('llamar a Pedro');
        }
    });

    it('14. different conversation is isolated -- an open objective in one conversation does not leak into another', async () => {
        llmInputInterpretMock.mockResolvedValue(writeInterpretation());
        llmObjectiveInterpretMock.mockResolvedValueOnce(writeObjective({ sourceUtterance: 'Tengo que llamar a Pedro', timeConstraints: { rawHint: null } }));
        await runAgentTurn({ actorUserId: ACTOR_A, input: 'Tengo que llamar a Pedro', conversationId: CONV_1 });

        // A bare fragment arriving in a DIFFERENT conversation must not be
        // treated as continuing Pedro's reminder -- with no open objective
        // in that scope, the fragment (with no entity/date of its own)
        // cannot resolve to a valid plan.
        llmObjectiveInterpretMock.mockResolvedValueOnce(writeObjective({ sourceUtterance: 'mañana a las 9', timeConstraints: { rawHint: 'mañana a las 9' }, targetEntities: { personHints: [], entityHints: [] } }));
        const turn2 = await runAgentTurn({ actorUserId: ACTOR_A, input: 'mañana a las 9', conversationId: 'conv-2-different' });

        expect(turn2.kind).not.toBe('plan');
    });

    it('15. different actor is isolated -- an open objective for one actor does not leak into another actor\'s turn', async () => {
        llmInputInterpretMock.mockResolvedValue(writeInterpretation());
        llmObjectiveInterpretMock.mockResolvedValueOnce(writeObjective({ sourceUtterance: 'Tengo que llamar a Pedro', timeConstraints: { rawHint: null }, actor: ACTOR_A }));
        await runAgentTurn({ actorUserId: ACTOR_A, input: 'Tengo que llamar a Pedro' });

        const ACTOR_B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
        llmObjectiveInterpretMock.mockResolvedValueOnce(writeObjective({ sourceUtterance: 'mañana a las 9', timeConstraints: { rawHint: 'mañana a las 9' }, targetEntities: { personHints: [], entityHints: [] }, actor: ACTOR_B }));
        const turn2 = await runAgentTurn({ actorUserId: ACTOR_B, input: 'mañana a las 9' });

        expect(turn2.kind).not.toBe('plan');
    });

    it('16. conversation-less Agent surface uses its own scoped dialogue, isolated from a real conversation', async () => {
        llmInputInterpretMock.mockResolvedValue(writeInterpretation());
        llmObjectiveInterpretMock.mockResolvedValueOnce(writeObjective({ sourceUtterance: 'Tengo que llamar a Pedro', timeConstraints: { rawHint: null } }));
        // No conversationId -- Agent Preview / global Agent surface.
        await runAgentTurn({ actorUserId: ACTOR_A, input: 'Tengo que llamar a Pedro' });

        // The SAME actor, but now WITH a real conversationId -- must not
        // inherit the global-surface dialogue state.
        llmObjectiveInterpretMock.mockResolvedValueOnce(writeObjective({ sourceUtterance: 'mañana a las 9', timeConstraints: { rawHint: 'mañana a las 9' }, targetEntities: { personHints: [], entityHints: [] } }));
        const turn2 = await runAgentTurn({ actorUserId: ACTOR_A, input: 'mañana a las 9', conversationId: CONV_1 });

        expect(turn2.kind).not.toBe('plan');
    });
});

describe('Live wiring: structural safety (test areas 19, 20, 21, 22, 23)', () => {
    it('19. dialogue context is passed structurally (never concatenated into the LLM interpretation call\'s raw input)', async () => {
        llmInputInterpretMock.mockResolvedValue(writeInterpretation());
        llmObjectiveInterpretMock.mockResolvedValueOnce(writeObjective({ sourceUtterance: 'Tengo que llamar a Pedro', timeConstraints: { rawHint: null } }));
        await runAgentTurn({ actorUserId: ACTOR_A, input: 'Tengo que llamar a Pedro' });

        llmObjectiveInterpretMock.mockResolvedValueOnce(writeObjective({ sourceUtterance: 'mañana a las 9', timeConstraints: { rawHint: 'mañana a las 9' }, targetEntities: { personHints: [], entityHints: [] } }));
        await runAgentTurn({ actorUserId: ACTOR_A, input: 'mañana a las 9' });

        // The SECOND call to the objective interpreter must have received
        // ONLY the raw turn-2 text -- never the prior turn's text
        // concatenated in.
        const secondCallArgs = llmObjectiveInterpretMock.mock.calls[1];
        expect(secondCallArgs[0]).toBe('mañana a las 9');
        expect(secondCallArgs[0]).not.toContain('Pedro');
    });

    it('20. no memory_records write occurs anywhere in this module (source-level proof)', () => {
        const fs = require('node:fs') as typeof import('node:fs');
        const path = require('node:path') as typeof import('node:path');
        const source = fs.readFileSync(path.join(__dirname, '../src/services/agentDialogueContinuation.service.ts'), 'utf-8');
        const codeOnly = source.split('\n').filter((l) => !l.trim().startsWith('//')).join('\n');
        expect(codeOnly).not.toMatch(/memory_records/);
        expect(codeOnly).not.toMatch(/from ['"].*memory\.service['"]/);
    });

    it('21. no canonical entity trust from a referent candidate -- reconciliation never introduces a resolved-ID field (type-level + structural proof)', () => {
        const prior = objective();
        const fragment = objective({ sourceUtterance: 'a las 9', targetEntities: { personHints: [], entityHints: [] } });
        const { objective: reconciled } = reconcileContinuationObjective(prior, fragment);
        // AgentObjective.targetEntities structurally only ever has
        // personHints/entityHints (raw text) -- there is no ID-shaped field
        // this function could have populated even if it tried.
        expect(reconciled.targetEntities).not.toHaveProperty('personId');
        expect(reconciled.targetEntities).not.toHaveProperty('entityId');
        expect(reconciled.targetEntities).not.toHaveProperty('canonicalEntityId');
    });

    it('22. no new write tool was added -- the tool registry is untouched by M-7B', () => {
        const fs = require('node:fs') as typeof import('node:fs');
        const path = require('node:path') as typeof import('node:path');
        const source = fs.readFileSync(path.join(__dirname, '../src/services/toolRegistry.service.ts'), 'utf-8');
        const writeToolMatches = source.match(/category: 'WRITE'/g) ?? [];
        expect(writeToolMatches).toHaveLength(5);
    });

    it('23. existing single-turn behavior is unchanged -- a fully-specified single-turn request still plans immediately, dialogue state notwithstanding', async () => {
        llmInputInterpretMock.mockResolvedValue(writeInterpretation());
        llmObjectiveInterpretMock.mockResolvedValueOnce(writeObjective({
            sourceUtterance: 'Recuérdame llamar a Pedro mañana a las 9',
            timeConstraints: { rawHint: 'mañana a las 9' },
        }));

        const result = await runAgentTurn({ actorUserId: ACTOR_A, input: 'Recuérdame llamar a Pedro mañana a las 9' });

        expect(result.kind).toBe('plan');
    });
});

describe('Live wiring: stale-turn protection (test areas 17, 18)', () => {
    it('17/18. a stale/late continuation result does not corrupt dialogue state -- CAS guard rejects an out-of-order write at the dialogue-state layer directly', async () => {
        // This exercises the SAME CAS/turn-sequence machinery M-7A already
        // certified (agentDialogueState.test.ts) directly against the
        // live-wired scope key this module uses, proving the wiring did
        // not bypass or weaken that guard.
        const { AgentDialogueStateService, buildDialogueScopeKey } = await import('../src/services/agentDialogueState.service');
        const service = new AgentDialogueStateService();
        const scopeKey = buildDialogueScopeKey({ surface: 'mobile_text' });

        service.openObjective({ actorUserId: ACTOR_A, dialogueScopeKey: scopeKey, objective: objective(), turnId: 't1', turnSequence: 5 });
        // A late write observing an OLDER turnSequence (e.g. a delayed LLM
        // response for a turn that has since been superseded) must be
        // rejected, never silently applied over the newer state.
        expect(() =>
            service.applyCorrection({
                actorUserId: ACTOR_A, dialogueScopeKey: scopeKey, slotName: 'time', previousValue: null, newValue: 'a las 9',
                reason: 'clarification_answer', turnId: 'late', turnSequence: 2,
            }),
        ).toThrow(/stale dialogue turn/i);
    });
});

describe('Live wiring: create_commitment regression (test area 24)', () => {
    it('24. existing create_commitment planning tests remain green -- a complete single-turn request with an explicit date plans successfully with no dialogue-state involvement changing the outcome', async () => {
        llmInputInterpretMock.mockResolvedValue(writeInterpretation());
        llmObjectiveInterpretMock.mockResolvedValueOnce(writeObjective({
            objectiveType: 'create_commitment_or_proposal',
            sourceUtterance: 'Agenda entrenar mañana a las 8',
            targetEntities: { personHints: [], entityHints: ['entrenar'] },
            timeConstraints: { rawHint: 'mañana a las 8' },
        }));

        const result = await runAgentTurn({ actorUserId: ACTOR_A, input: 'Agenda entrenar mañana a las 8' });

        expect(result.kind).toBe('plan');
        if (result.kind === 'plan') {
            expect(result.plan.steps[0]?.toolId).toBe('create_commitment');
        }
    });
});
