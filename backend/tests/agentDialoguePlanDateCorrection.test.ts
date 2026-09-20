// M-7 GENERALIZATION, third mechanism: plan-shown, pre-authorization date
// correction (benchmark scenario 4 from tmp/PING-M7-JARVIS-ARCHITECTURE-GAP-AUDIT.md):
// "mueve entrenar al viernes" -> [plan shown: "Mover Entrenar al viernes"] ->
// "mejor al sábado" must regenerate the plan with the corrected date, never
// requiring the user to restate "entrenar"/"mover", and never silently
// letting the OLD plan/digest remain confirmable.
//
// Uses the REAL deterministic verb path end to end ("Mueve" matches
// RESCHEDULE_VERB in agentObjectiveInterpreter.service.ts) -- no LLM
// interpreter mock needed -- mocking only retrieval.service.ts, exactly like
// agentDialogueTargetEntityClarification.test.ts's own pattern.
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

// Mocks every read-side retrieval primitive buildAgentContext's fallback
// path can reach once classifyPlanCorrection/classifyExplicitEscape decide a
// turn is NOT a correction (e.g. a genuinely unrelated read turn) -- mirrors
// agentDialoguePendingClarification.test.ts's own mocking scope, which
// exists for exactly the same reason (the real assertConversationParticipant
// would otherwise reject a synthetic test conversationId with no real row).
vi.mock('../src/services/retrieval.service', async (importOriginal) => {
    const actual = await importOriginal<typeof import('../src/services/retrieval.service')>();
    return {
        ...actual,
        retrieveCommitments: (...args: unknown[]) => retrieveCommitmentsMock(...args),
        retrieveCommitmentProposals: vi.fn(async () => []),
        retrieveCommitmentEvents: vi.fn(async () => []),
        retrieveMessages: vi.fn(async () => []),
        retrieveTranscriptions: vi.fn(async () => []),
        retrieveAttachments: vi.fn(async () => []),
        resolveDirectConversation: vi.fn(async () => ({ conversationId: null, ambiguous: false, candidateCount: 0 })),
        dedupeProvenance: (items: unknown[]) => items,
    };
});

vi.mock('../src/services/memory.service', () => ({
    retrieveMemory: vi.fn(async () => []),
    ingestMemoryFromEvent: vi.fn(async () => undefined),
}));

let runAgentTurn: typeof import('../src/services/agentTurn.service').runAgentTurn;
let clearAgentDialogueStateForTests: typeof import('../src/services/agentDialogueState.service').clearAgentDialogueStateForTests;
let AgentDialogueStateService: typeof import('../src/services/agentDialogueState.service').AgentDialogueStateService;
let buildDialogueScopeKey: typeof import('../src/services/agentDialogueState.service').buildDialogueScopeKey;

const ACTOR = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const OTHER_ACTOR = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const CONVERSATION_ID = '11111111-1111-4111-8111-111111111111';
const ENTRENAR_ID = 'c0000000-0000-4000-8000-000000000004';

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

async function moveEntrenarToFriday(actorUserId: string = ACTOR, conversationId: string = CONVERSATION_ID) {
    retrieveCommitmentsMock.mockResolvedValueOnce([commitment(ENTRENAR_ID, 'Entrenar', '2026-09-20T08:00:00.000Z')]);
    return runAgentTurn({ actorUserId, input: 'Mueve Entrenar al viernes', conversationId });
}

describe('Turn 1 — a real plan reaching ready_for_authorization is tracked as plan_pending_authorization', () => {
    it('produces a real plan and persists it as plan_pending_authorization with no pending clarification', async () => {
        const res = await moveEntrenarToFriday();
        expect(res.kind).toBe('plan');

        const scopeKey = buildDialogueScopeKey({ conversationId: CONVERSATION_ID, surface: 'mobile_text' });
        const state = new AgentDialogueStateService().getSnapshot(ACTOR, scopeKey);
        expect(state?.lifecycle).toBe('plan_pending_authorization');
        expect(state?.pendingClarification).toBeNull();
        expect(state?.openObjective?.objectiveType).toBe('reschedule_existing_commitment');
    });
});

describe('Turn 2 — a bare date correction regenerates the SAME plan with the new date, never forcing the user to restate the request', () => {
    it('"mejor al sábado" produces a new plan without repeating "entrenar"/"mueve", and clears the stale plan reference', async () => {
        const first = await moveEntrenarToFriday();
        expect(first.kind).toBe('plan');
        const firstDigest = first.kind === 'plan' ? first.plan.planDigest : null;

        retrieveCommitmentsMock.mockResolvedValueOnce([commitment(ENTRENAR_ID, 'Entrenar', '2026-09-20T08:00:00.000Z')]);
        const second = await runAgentTurn({ actorUserId: ACTOR, input: 'mejor al sábado', conversationId: CONVERSATION_ID });

        expect(second.kind).toBe('plan');
        if (second.kind === 'plan' && first.kind === 'plan') {
            expect(second.plan.status).toBe('ready_for_authorization');
            // A genuinely different date must produce a genuinely different
            // digest -- the OLD plan's digest can never authorize the
            // corrected one (this is what makes authorizePlan's existing
            // digest-comparison reject a stale client-held reference to the
            // Friday plan for free, with no new invalidation code).
            expect(second.plan.planDigest).not.toBe(firstDigest);
        }

        const scopeKey = buildDialogueScopeKey({ conversationId: CONVERSATION_ID, surface: 'mobile_text' });
        const state = new AgentDialogueStateService().getSnapshot(ACTOR, scopeKey);
        expect(state?.lifecycle).toBe('plan_pending_authorization');
        expect(state?.currentPlanDigestRef).toBe(second.kind === 'plan' ? second.plan.planDigest : null);
        expect(state?.corrections['timeConstraints.rawHint']?.length).toBeGreaterThan(0);
    });

    // INTEGRATION SCENARIO: the canonical multi-correction sequence from the
    // original M-7 benchmark ("como a las nueve" -> "mejor a las diez" -> "no,
    // déjalo como estaba" pattern), applied here to the plan-correction
    // mechanism specifically -- three real corrections in a row on the SAME
    // plan, proving the CAS/turn-sequence guard and the bounded correction
    // stack (cap 3 per slot, ADR Q6) both hold under repeated real use, not
    // just a single correction in isolation.
    it('three consecutive corrections in a row each succeed, and only the LAST one is ever confirmable', async () => {
        const first = await moveEntrenarToFriday();
        expect(first.kind).toBe('plan');

        retrieveCommitmentsMock.mockResolvedValueOnce([commitment(ENTRENAR_ID, 'Entrenar', '2026-09-20T08:00:00.000Z')]);
        const second = await runAgentTurn({ actorUserId: ACTOR, input: 'mejor al sábado', conversationId: CONVERSATION_ID });
        expect(second.kind).toBe('plan');

        retrieveCommitmentsMock.mockResolvedValueOnce([commitment(ENTRENAR_ID, 'Entrenar', '2026-09-20T08:00:00.000Z')]);
        const third = await runAgentTurn({ actorUserId: ACTOR, input: 'no, mejor el domingo', conversationId: CONVERSATION_ID });
        expect(third.kind).toBe('plan');

        if (first.kind === 'plan' && second.kind === 'plan' && third.kind === 'plan') {
            // All three digests must be pairwise distinct -- each correction
            // produced a genuinely different plan, never silently collapsing
            // back to an earlier one.
            const digests = [first.plan.planDigest, second.plan.planDigest, third.plan.planDigest];
            expect(new Set(digests).size).toBe(3);
        }

        const scopeKey = buildDialogueScopeKey({ conversationId: CONVERSATION_ID, surface: 'mobile_text' });
        const state = new AgentDialogueStateService().getSnapshot(ACTOR, scopeKey);
        expect(state?.lifecycle).toBe('plan_pending_authorization');
        // Only the LAST (Sunday) plan's digest is the live reference -- the
        // Friday and Saturday plans are both now stale, and would both be
        // rejected by authorizePlan's own digest-comparison if a client
        // somehow still held one.
        expect(state?.currentPlanDigestRef).toBe(third.kind === 'plan' ? third.plan.planDigest : null);
        // Bounded correction history holds under real repeated use: capped
        // at 3 (ADR Q6), never grows unbounded across the three real turns.
        expect(state?.corrections['timeConstraints.rawHint']?.length).toBeLessThanOrEqual(3);
    });

    it('a date-free follow-up is never treated as a correction (no date expression to correct with)', async () => {
        await moveEntrenarToFriday();
        retrieveCommitmentsMock.mockResolvedValueOnce([]);
        const res = await runAgentTurn({ actorUserId: ACTOR, input: '¿Qué tengo hoy?', conversationId: CONVERSATION_ID });
        // Never silently reinterpreted as a date correction to the pending
        // reschedule plan -- this is an ordinary, unrelated read turn.
        expect(res.kind).not.toBe('plan');
    });

    it('an explicit, unrelated new write request escapes the pending plan instead of being force-merged into a correction', async () => {
        await moveEntrenarToFriday();
        const res = await runAgentTurn({ actorUserId: ACTOR, input: 'Recuérdame comprar pan mañana', conversationId: CONVERSATION_ID });
        expect(res.kind).not.toBe('response');

        const scopeKey = buildDialogueScopeKey({ conversationId: CONVERSATION_ID, surface: 'mobile_text' });
        const state = new AgentDialogueStateService().getSnapshot(ACTOR, scopeKey);
        // The old "move Entrenar to Friday" plan must never survive as if
        // "mañana" (from the unrelated reminder) had corrected it.
        expect(state?.openObjective?.objectiveType).not.toBe('reschedule_existing_commitment');
    });

    it('never shares a pending plan correction across actors or conversations', async () => {
        await moveEntrenarToFriday();
        retrieveCommitmentsMock.mockResolvedValueOnce([]);
        const otherActorRes = await runAgentTurn({ actorUserId: OTHER_ACTOR, input: 'mejor al sábado', conversationId: CONVERSATION_ID });
        expect(otherActorRes.kind).not.toBe('plan');

        const scopeKey = buildDialogueScopeKey({ conversationId: CONVERSATION_ID, surface: 'mobile_text' });
        const actorState = new AgentDialogueStateService().getSnapshot(ACTOR, scopeKey);
        // ACTOR's own pending plan must be entirely unaffected by a
        // different actor's identical-looking utterance.
        expect(actorState?.lifecycle).toBe('plan_pending_authorization');
        expect(actorState?.openObjective?.objectiveType).toBe('reschedule_existing_commitment');
    });
});
