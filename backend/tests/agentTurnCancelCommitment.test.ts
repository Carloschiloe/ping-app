// M-9 — end-to-end proof that "Cancela X" reaches a real, authorization-ready
// cancel_commitment plan through the exact same runAgentTurn pipeline every
// other write request uses, via the REAL deterministic verb path
// (CANCEL_VERB matches "cancela"/"cancelar"/"cancel") -- no LLM interpreter
// mock needed, mirroring this session's other new write-shaped mechanisms.
// Also directly certifies the historical-form safety property this feature
// depends on: "Cancelamos X" must still be forced to 'unsupported', never
// treated as a real write action and never silently narrated as a different
// transition (the exact bug this whole CANCEL_VERB mechanism exists to
// prevent, now verified end to end after cancel became a real capability).
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

function commitment(id: string, title: string, ownerUserId: string, status: string = 'accepted') {
    return {
        id, entityType: 'commitment' as const, title, description: null, status: status as any,
        type: 'general', priority: null, dueAt: null, proposedDueAt: null, expectedResult: null,
        resolvedAt: null, resolutionResult: null, rejectionReason: null,
        ownerUserId, assignedToUserId: ownerUserId, counterpartyContactId: null,
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

const ACTOR = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const OTHER_OWNER = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const ENTRENAR_ID = 'c0000000-0000-4000-8000-000000000005';

beforeEach(async () => {
    vi.resetModules();
    const turnModule = await import('../src/services/agentTurn.service');
    runAgentTurn = turnModule.runAgentTurn;
    const dialogueModule = await import('../src/services/agentDialogueState.service');
    clearAgentDialogueStateForTests = dialogueModule.clearAgentDialogueStateForTests;
    clearAgentDialogueStateForTests();
    retrieveCommitmentsMock.mockReset();
}, 30000);

afterEach(() => {
    clearAgentDialogueStateForTests();
    vi.restoreAllMocks();
});

describe('runAgentTurn — M-7 targetEntity clarification correctly resolves a cancel_existing_commitment follow-up (M-9 integration)', () => {
    // INTEGRATION REGRESSION: cancel_existing_commitment was never added to
    // TARGET_ENTITY_ELIGIBLE_OBJECTIVE_TYPES in agentDialogueContinuation.
    // service.ts when M-9 landed, even though it shares
    // planRescheduleOrCompleteOrRespond (and thus the exact same
    // field:'targetEntity' ambiguity) with reschedule/complete/respond.
    // Found during a deliberate cross-mechanism consolidation pass (never
    // assumed correct from the M-9 commit message), confirmed with a direct
    // end-to-end reproduction before either fix below was applied:
    //   turn 1 "Cancela Entrenar" correctly asked "¿Cuál compromiso?"
    //   turn 2 "el del jueves" was NOT recognized as answering that
    //     question -- it fell through to an isolated-turn read response,
    //     exactly the "assistant forgot what I just said" failure this
    //     entire dialogue-state mechanism exists to prevent.
    // A second, deeper bug surfaced once the first was fixed: even
    // recognized as an answer, the reconciled objective only carried the
    // resolved entity's TITLE forward (entityHints), which re-triggers the
    // identical ambiguity when the planner re-resolves it live (two
    // same-titled commitments still both match). Fixed by also threading the
    // resolved entity's own dueAt through timeConstraints.rawHint, letting
    // planRescheduleOrCompleteOrRespond re-derive the SAME single match from
    // live data via same-day dueAt narrowing -- never by trusting a
    // caller-supplied identity directly (entityHints stays raw text only,
    // by design; no targetEntityId field was added).
    const ID_THURSDAY = 'c0000000-0000-4000-8000-000000000020';
    const ID_FRIDAY = 'c0000000-0000-4000-8000-000000000021';

    function commitmentWithDueAt(id: string, title: string, dueAt: string) {
        return { ...commitment(id, title, ACTOR), dueAt };
    }

    it('"Cancela Entrenar" then "el del jueves" resolves the ambiguity and reaches a real plan, not a repeated question', async () => {
        retrieveCommitmentsMock.mockImplementation(async () => [
            commitmentWithDueAt(ID_THURSDAY, 'Entrenar', '2026-09-24T09:00:00.000Z'),
            commitmentWithDueAt(ID_FRIDAY, 'Entrenar', '2026-09-25T09:00:00.000Z'),
        ]);

        const first = await runAgentTurn({ actorUserId: ACTOR, input: 'Cancela Entrenar', channel: 'mobile', locale: 'es-CL' });
        expect(first.kind).toBe('clarification');

        const second = await runAgentTurn({ actorUserId: ACTOR, input: 'el del jueves', channel: 'mobile', locale: 'es-CL' });
        expect(second.kind).toBe('plan');
        if (second.kind === 'plan') {
            expect(second.plan.steps.map((s) => s.toolId)).toEqual(['cancel_commitment']);
            expect(second.plan.status).toBe('ready_for_authorization');
        }
    });

    it('answering with a different weekday resolves to a DIFFERENT plan (proves real re-derivation, not "always pick first")', async () => {
        retrieveCommitmentsMock.mockImplementation(async () => [
            commitmentWithDueAt(ID_THURSDAY, 'Entrenar', '2026-09-24T09:00:00.000Z'),
            commitmentWithDueAt(ID_FRIDAY, 'Entrenar', '2026-09-25T09:00:00.000Z'),
        ]);

        await runAgentTurn({ actorUserId: ACTOR, input: 'Cancela Entrenar', channel: 'mobile', locale: 'es-CL' });
        const thursdayPlan = await runAgentTurn({ actorUserId: ACTOR, input: 'el del jueves', channel: 'mobile', locale: 'es-CL' });

        await runAgentTurn({ actorUserId: ACTOR, input: 'Cancela Entrenar', channel: 'mobile', locale: 'es-CL' });
        const fridayPlan = await runAgentTurn({ actorUserId: ACTOR, input: 'el del viernes', channel: 'mobile', locale: 'es-CL' });

        expect(thursdayPlan.kind).toBe('plan');
        expect(fridayPlan.kind).toBe('plan');
        if (thursdayPlan.kind === 'plan' && fridayPlan.kind === 'plan') {
            expect(thursdayPlan.plan.planDigest).not.toBe(fridayPlan.plan.planDigest);
        }
    });
});

describe('runAgentTurn — "Cancela X" (imperative) reaches a real, authorization-ready cancel_commitment plan', () => {
    it('"Cancela Entrenar" produces a ready_for_authorization plan targeting cancel_commitment, with no side effect yet', async () => {
        retrieveCommitmentsMock.mockResolvedValueOnce([commitment(ENTRENAR_ID, 'Entrenar', ACTOR)]);
        const res = await runAgentTurn({ actorUserId: ACTOR, input: 'Cancela Entrenar', channel: 'mobile', locale: 'es-CL' });

        expect(res.kind).toBe('plan');
        if (res.kind === 'plan') {
            expect(res.plan.status).toBe('ready_for_authorization');
            expect(res.plan.steps.map((s) => s.toolId)).toEqual(['cancel_commitment']);
            expect(res.presentation.requiresExplicitConfirmation).toBe(true);
            const stepPresentation = res.presentation.stepPresentations[0];
            expect(stepPresentation.confirmationLabel).toBe('Cancelar compromiso');
            expect(stepPresentation.headline).toContain('Entrenar');
        }
    });

    it('"Cancelar Entrenar" and "Cancel Entrenar" (other imperative surface forms) also plan correctly', async () => {
        retrieveCommitmentsMock.mockResolvedValueOnce([commitment(ENTRENAR_ID, 'Entrenar', ACTOR)]);
        const es = await runAgentTurn({ actorUserId: ACTOR, input: 'Cancelar Entrenar', channel: 'mobile', locale: 'es-CL' });
        expect(es.kind).toBe('plan');

        retrieveCommitmentsMock.mockResolvedValueOnce([commitment(ENTRENAR_ID, 'Entrenar', ACTOR)]);
        const en = await runAgentTurn({ actorUserId: ACTOR, input: 'Cancel Entrenar', channel: 'mobile', locale: 'en-US' });
        expect(en.kind).toBe('plan');
    });

    it('SECURITY: an actor who is only the ASSIGNEE (not owner) of the target commitment never reaches a confirmable plan -- distinct from complete/reschedule, which both allow the assignee', async () => {
        // Owned by OTHER_OWNER; ACTOR would be an assignee in a shared
        // scenario, but this fixture's ownerUserId/assignedToUserId are
        // deliberately set so ACTOR is NEVER the owner -- the planner's own
        // cancel_existing_commitment branch must reject this before ever
        // building a step, exactly like tests/agentPlanner.test.ts's own
        // unit-level proof of the same asymmetry, now confirmed reachable
        // end to end through the real turn pipeline.
        retrieveCommitmentsMock.mockResolvedValueOnce([{ ...commitment(ENTRENAR_ID, 'Entrenar', OTHER_OWNER), assignedToUserId: ACTOR }]);
        const res = await runAgentTurn({ actorUserId: ACTOR, input: 'Cancela Entrenar', channel: 'mobile', locale: 'es-CL' });
        expect(res.kind).not.toBe('plan');
    });

    it('historical form "Cancelamos Entrenar" is NEVER treated as a write request -- stays unsupported, the exact safety property this whole mechanism protects', async () => {
        const res = await runAgentTurn({ actorUserId: ACTOR, input: 'Cancelamos Entrenar', channel: 'mobile', locale: 'es-CL' });
        expect(res.kind).not.toBe('plan');
    });

    it('REAL PHYSICAL FIXTURE, still protected end to end: "Cancelamos el compromiso ir a acostarse" never produces a plan of any kind, including complete_commitment (the original substitution bug)', async () => {
        const res = await runAgentTurn({ actorUserId: ACTOR, input: 'Cancelamos el compromiso ir a acostarse', channel: 'mobile', locale: 'es-CL' });
        // The write-objective path correctly forces 'unsupported' for this
        // historical form (never reaching cancel_existing_commitment nor
        // being substituted into complete_existing_commitment); the turn
        // then legitimately falls through to the READ path, which may
        // classify "Cancelamos X" as a historical-lifecycle query
        // (isHistoricalLifecycleQuery, an existing, separately-certified
        // mechanism unrelated to this fix). The one property THIS test
        // certifies is that no write plan is ever produced for this
        // historical form -- the exact shape/count of any read-side
        // retrieval call is that mechanism's own concern, already covered
        // by its own dedicated test suite, and asserting it here made this
        // test flaky under full-suite parallel runs (observed in CI: a
        // second, differently-shaped retrieveCommitments call sometimes
        // wins the mock.calls[0] slot depending on cross-file execution
        // order) without adding any real coverage this file's own job
        // (write-path safety) needs.
        expect(res.kind).not.toBe('plan');
    });
});
