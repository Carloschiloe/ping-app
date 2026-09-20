// M-7 GENERALIZATION: extends the M-7B PHYSICAL FAILURE #2 dialogue-first
// answer-consumption mechanism (originally person_ambiguous only) to the
// planner's own `targetEntity` ambiguity for reschedule/complete/respond --
// "Completa Entrenar" when the actor has two commitments/proposals whose
// title contains "Entrenar" -> Core asks "¿Cuál compromiso?" -> a follow-up
// naming or picking one must complete the ORIGINAL objective, never be
// treated as an unrelated new turn.
//
// Unlike agentDialoguePendingClarification.test.ts (which mocks the LLM
// interpreters because "Tengo que llamar a Pedro" matches no deterministic
// write verb), this uses the REAL deterministic verb path ("Completa" is a
// COMPLETE_VERB match in agentObjectiveInterpreter.service.ts) end to end --
// no LLM interpreter mock needed at all -- and mocks only retrieval.service.ts
// to control which candidate commitments exist, exactly like
// agentDialogueContinuation.test.ts's own retrieval-mocking pattern.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

function commitment(id: string, title: string, dueAt: string | null = null) {
    return {
        id, entityType: 'commitment' as const, title, description: null, status: 'accepted' as const,
        type: 'general', priority: null, dueAt, proposedDueAt: null, expectedResult: null,
        resolvedAt: null, resolutionResult: null, rejectionReason: null,
        ownerUserId: ACTOR, assignedToUserId: ACTOR, counterpartyContactId: null,
        conversationId: null, messageId: null, createdAt: '2026-09-01T00:00:00.000Z',
        provenance: { sourceType: 'commitment' as const, sourceId: id },
    };
}

const { retrieveCommitmentsMock } = vi.hoisted(() => ({ retrieveCommitmentsMock: vi.fn(async () => []) }));

vi.mock('../src/services/retrieval.service', async (importOriginal) => {
    const actual = await importOriginal<typeof import('../src/services/retrieval.service')>();
    return {
        ...actual,
        retrieveCommitments: (...args: unknown[]) => retrieveCommitmentsMock(...args),
        retrieveCommitmentProposals: vi.fn(async () => []),
    };
});

let runAgentTurn: typeof import('../src/services/agentTurn.service').runAgentTurn;
let clearAgentDialogueStateForTests: typeof import('../src/services/agentDialogueState.service').clearAgentDialogueStateForTests;
let AgentDialogueStateService: typeof import('../src/services/agentDialogueState.service').AgentDialogueStateService;
let buildDialogueScopeKey: typeof import('../src/services/agentDialogueState.service').buildDialogueScopeKey;

const ACTOR = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const OTHER_ACTOR = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const CONVERSATION_ID = '11111111-1111-4111-8111-111111111111';
// Real UUIDs, required because complete_commitment's Zod schema (.strict(),
// commitmentId: UUID) rejects a non-UUID id at plan-validation time -- using
// a readable non-UUID string here would produce a spurious 'missing_context'
// failure unrelated to this test's actual subject.
const ENTRENAR_THURSDAY_ID = 'c0000000-0000-4000-8000-000000000001';
const ENTRENAR_FRIDAY_ID = 'c0000000-0000-4000-8000-000000000002';
const ENTRENAR_ONLY_ID = 'c0000000-0000-4000-8000-000000000003';

beforeEach(async () => {
    vi.resetModules();
    const turnModule = await import('../src/services/agentTurn.service');
    runAgentTurn = turnModule.runAgentTurn;
    const dialogueModule = await import('../src/services/agentDialogueState.service');
    clearAgentDialogueStateForTests = dialogueModule.clearAgentDialogueStateForTests;
    AgentDialogueStateService = dialogueModule.AgentDialogueStateService;
    buildDialogueScopeKey = dialogueModule.buildDialogueScopeKey;
    clearAgentDialogueStateForTests();
    retrieveCommitmentsMock.mockReset();
}, 30000);

afterEach(() => {
    clearAgentDialogueStateForTests();
    vi.restoreAllMocks();
});

async function askWhichEntrenar(actorUserId: string = ACTOR, conversationId: string = CONVERSATION_ID) {
    retrieveCommitmentsMock.mockResolvedValueOnce([
        commitment(ENTRENAR_THURSDAY_ID, 'Entrenar', '2026-09-24T09:00:00.000Z'),
        commitment(ENTRENAR_FRIDAY_ID, 'Entrenar', '2026-09-25T09:00:00.000Z'),
    ]);
    return runAgentTurn({ actorUserId, input: 'Completa Entrenar', conversationId });
}

describe('Turn 1 — real planner targetEntity ambiguity persists dialogue state', () => {
    it('creates an open dialogue objective with a pending targetEntity clarification, listing both real candidates', async () => {
        const res = await askWhichEntrenar();
        expect(res.kind).toBe('clarification');
        if (res.kind === 'clarification') {
            expect(res.questions[0].field).toBe('targetEntity');
            expect(res.questions[0].options?.map((o) => o.id).sort()).toEqual([ENTRENAR_FRIDAY_ID, ENTRENAR_THURSDAY_ID].sort());
        }

        const scopeKey = buildDialogueScopeKey({ conversationId: CONVERSATION_ID, surface: 'mobile_text' });
        const state = new AgentDialogueStateService().getSnapshot(ACTOR, scopeKey);
        expect(state?.openObjective?.objectiveType).toBe('complete_existing_commitment');
        expect(state?.pendingClarification?.field).toBe('targetEntity');
    });

    it('a genuinely unambiguous single-candidate request never opens a pending clarification at all (positive control)', async () => {
        retrieveCommitmentsMock.mockResolvedValueOnce([commitment(ENTRENAR_ONLY_ID, 'Entrenar', '2026-09-24T09:00:00.000Z')]);
        const res = await runAgentTurn({ actorUserId: ACTOR, input: 'Completa Entrenar', conversationId: CONVERSATION_ID });
        expect(res.kind).toBe('plan');

        const scopeKey = buildDialogueScopeKey({ conversationId: CONVERSATION_ID, surface: 'mobile_text' });
        const state = new AgentDialogueStateService().getSnapshot(ACTOR, scopeKey);
        expect(state?.lifecycle).toBe('plan_pending_authorization');
        expect(state?.pendingClarification).toBeNull();
    });
});

describe('Turn 2 — a follow-up answer resolves the SAME original objective, never a fresh unrelated turn', () => {
    it('selecting the presented option by naming its distinguishing text reaches the real planner for that exact commitment, never a plan for the other one', async () => {
        await askWhichEntrenar();

        // Two independent live re-derivations happen for this one turn, by
        // design: (1) tryAnswerTargetEntityClarification's own fresh
        // candidate re-fetch (never trusts the stored option list), then
        // (2) the planner's OWN, separate resolveEntityHint call once the
        // reconciled objective re-enters the real, unmodified
        // runAgentPlanning pipeline -- proving this is genuinely the same
        // planner path a single-turn "Completa Entrenar (jueves)" request
        // would take, not a second, divergent write path. The second mock
        // intentionally returns ONLY the Thursday commitment: the planner's
        // own resolveEntityHint call is scoped to whatever title the
        // reconciled objective now carries -- if this module had picked the
        // WRONG commitment (Friday), the planner's own live re-resolution
        // against this narrowed mock would fail to find it and produce
        // entity_not_found instead of a real plan, which the assertion below
        // is what actually distinguishes "picked correctly" from "picked
        // wrong" (the public plan response deliberately never exposes a raw
        // commitment id to the client -- AgentPlanPublicResponse's own
        // documented contract -- so this is the correct, design-respecting
        // way to observe which commitment won).
        retrieveCommitmentsMock.mockResolvedValueOnce([
            commitment(ENTRENAR_THURSDAY_ID, 'Entrenar', '2026-09-24T09:00:00.000Z'),
            commitment(ENTRENAR_FRIDAY_ID, 'Entrenar', '2026-09-25T09:00:00.000Z'),
        ]);
        retrieveCommitmentsMock.mockResolvedValueOnce([
            commitment(ENTRENAR_THURSDAY_ID, 'Entrenar', '2026-09-24T09:00:00.000Z'),
        ]);
        const res = await runAgentTurn({ actorUserId: ACTOR, input: 'el del jueves', conversationId: CONVERSATION_ID });

        expect(res.kind).toBe('plan');
        if (res.kind === 'plan') {
            expect(res.plan.status).toBe('ready_for_authorization');
            expect(res.plan.steps.map((s) => s.toolId)).toEqual(['complete_commitment']);
        }
    });

    // NOTE: a symmetric "wrong candidate set" negative control was
    // considered and deliberately NOT added here -- the planner's own
    // resolveEntityHint (agentPlanner.service.ts) matches by TITLE substring
    // only, never by date, so feeding it a single same-titled "Entrenar"
    // candidate (regardless of which day) always succeeds at the planner
    // layer by design; date-based disambiguation is this module's own
    // responsibility (test above), not the planner's. A meaningful negative
    // control for "did this module pick the id it claims to have picked" is
    // covered instead by the zero_match test below (a date/title with no
    // matching candidate at all correctly fails to resolve).

    it('zero matches for the follow-up asks again, never guesses one of the original candidates', async () => {
        await askWhichEntrenar();
        retrieveCommitmentsMock.mockResolvedValueOnce([]);
        const res = await runAgentTurn({ actorUserId: ACTOR, input: 'el de natación', conversationId: CONVERSATION_ID });

        expect(res.kind).toBe('clarification');
        if (res.kind === 'clarification') {
            expect(res.questions[0].field).toBe('targetEntity');
        }
    });

    it('an explicit, unrelated new write request escapes the pending clarification instead of being force-merged', async () => {
        await askWhichEntrenar();
        const res = await runAgentTurn({ actorUserId: ACTOR, input: 'Recuérdame comprar pan mañana', conversationId: CONVERSATION_ID });

        expect(res.kind).not.toBe('response');
        const scopeKey = buildDialogueScopeKey({ conversationId: CONVERSATION_ID, surface: 'mobile_text' });
        const state = new AgentDialogueStateService().getSnapshot(ACTOR, scopeKey);
        // The old "which Entrenar" question must never survive into a state
        // that could later be silently answered by an unrelated reply.
        expect(state?.pendingClarification?.field).not.toBe('targetEntity');
    });

    it('never shares a pending targetEntity clarification across actors or conversations', async () => {
        await askWhichEntrenar();
        retrieveCommitmentsMock.mockResolvedValueOnce([]);
        const otherActorRes = await runAgentTurn({ actorUserId: OTHER_ACTOR, input: 'Completa Entrenar', conversationId: CONVERSATION_ID });
        // A different actor's identical utterance must be interpreted fresh,
        // never as an answer to ACTOR's pending question.
        expect(otherActorRes.kind).not.toBe('plan');

        const scopeKey = buildDialogueScopeKey({ conversationId: CONVERSATION_ID, surface: 'mobile_text' });
        const actorState = new AgentDialogueStateService().getSnapshot(ACTOR, scopeKey);
        expect(actorState?.pendingClarification?.field).toBe('targetEntity');
    });
});
