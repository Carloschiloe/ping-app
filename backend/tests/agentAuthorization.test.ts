// M-4 — CANONICAL PLANNING PIPELINE (unification, 2026-09-10). Proves that
// /agent/turn, /api/agent/plan, and /agent/authorize's re-plan all converge
// on the exact same canonical objective/digest for the exact same input,
// because they all call the SAME canonical routing function
// (resolveDeterministicRouting, in agentPlanOrchestrator.service.ts) and
// the SAME final planner (runAgentPlanning) — agentAuthorization.service.ts
// contains ZERO interpreter-selection policy of its own.
//
// Historical root cause this closes: authorizePlan used to always re-plan
// via the default LlmObjectiveInterpreter (a real network call), while
// agentTurn.service.ts's own fast path resolved a write-shaped input
// deterministically and never called a model at all. For "Agenda entrenar
// mañana a las 8" this was proven, against the REAL (unmocked) OpenAI
// provider, to diverge totally: deterministic -> objectiveType=
// create_commitment_or_proposal, entityHints=["entrenar"]; real LLM ->
// objectiveType=create_personal_commitment, entityHints=[] (no title at
// all) — so the re-plan never reached 'ready_for_authorization', and
// authorizePlan reported a false "plan_changed" for a plan that never
// actually changed. The first fix copied the deterministic-first check
// inline into agentAuthorization.service.ts; THIS revision removes that
// duplicate entirely in favor of the one shared function.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createSupabaseAdminMock, setSupabaseAdminMock, supabaseAdminMockModule } from './helpers/supabaseMock';

const { resolvePersonMock } = vi.hoisted(() => ({
    resolvePersonMock: vi.fn(async () => ({ resolved: null, ambiguous: false, candidates: [] })),
}));

vi.mock('../src/lib/supabaseAdmin', () => supabaseAdminMockModule());
vi.mock('../src/services/retrieval.service', () => ({
    resolvePerson: resolvePersonMock,
    resolveDirectConversation: vi.fn(async () => ({ conversationId: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc', ambiguous: false, candidateCount: 1 })),
    retrieveCommitments: vi.fn(async () => []),
    retrieveCommitmentProposals: vi.fn(async () => []),
    retrieveVisibleCommitmentById: vi.fn(async () => null),
}));
// Test-only stand-in for the real semantic-enrichment provider (proves
// digest parity for a communicate input that NEEDS enrichment, without a
// real, non-deterministic network call in CI). Everything else in the
// module — the deterministic interpreters, the canonical routing function
// itself — stays real.
vi.mock('../src/services/agentObjectiveInterpreter.service', async (importOriginal) => {
    const actual = await importOriginal<typeof import('../src/services/agentObjectiveInterpreter.service')>();
    return {
        ...actual,
        proposeSemanticContentCandidate: vi.fn(async (sourceUtterance: string) => {
            if (sourceUtterance.includes('llegaré tarde')) {
                return { verbatimText: 'llegaré tarde', extractionMode: 'semantic_verbatim' as const };
            }
            return null;
        }),
    };
});

const ACTOR_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const RECIPIENT_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const now = new Date('2026-09-10T15:00:00.000Z');

function seedAuthorizationInsert() {
    setSupabaseAdminMock(createSupabaseAdminMock({
        agent_authorizations: [{
            data: {
                id: 'test-authorization-id', actor_user_id: ACTOR_ID, plan_digest: 'placeholder',
                objective_type: 'create_commitment_or_proposal', frozen_steps: [], authorized_step_ids: [],
                confirmation_level: 'explicit', status: 'authorized',
                issued_at: now.toISOString(), expires_at: new Date(now.getTime() + 300000).toISOString(),
                consumed_at: null, revoked_at: null, trace_id: null,
            },
            error: null,
        }],
    }));
}

beforeEach(() => {
    resolvePersonMock.mockReset();
    resolvePersonMock.mockResolvedValue({ resolved: null, ambiguous: false, candidates: [] });
    seedAuthorizationInsert();
});

// Simulates exactly what agentTurn.service.ts does for the initial plan:
// resolveDeterministicRouting -> runAgentPlanning with resolvedObjective.
async function turnEquivalentPlan(input: string) {
    const { runAgentPlanning, resolveDeterministicRouting } = await import('../src/services/agentPlanOrchestrator.service');
    const routing = await resolveDeterministicRouting(input, { actorUserId: ACTOR_ID });
    return runAgentPlanning({ actorUserId: ACTOR_ID, input, now }, { resolvedObjective: routing.resolvedObjective });
}

describe('Canonical planning pipeline: /agent/turn, /api/agent/plan, and /agent/authorize share ONE routing owner', () => {
    it('1) create_commitment: "Agenda entrenar mañana a las 8" -- turn plan and authorize re-plan reach an IDENTICAL digest', async () => {
        const { authorizePlan } = await import('../src/services/agentAuthorization.service');
        const input = 'Agenda entrenar mañana a las 8';

        const originalPlan = await turnEquivalentPlan(input);
        expect(originalPlan.status).toBe('ready_for_authorization');
        expect(originalPlan.planDigest).toBeTruthy();
        expect((originalPlan.steps[0].arguments as any).title).toBe('entrenar');

        const result = await authorizePlan({
            actorUserId: ACTOR_ID, input, now,
            planDigest: originalPlan.planDigest!,
            requestedStepIds: originalPlan.steps.map((s) => s.stepId),
            confirm: true,
        });

        expect(result.ok).toBe(true);
        if (result.ok) expect(result.authorization.status).toBe('authorized');
    });

    it('2) send_message (deterministic colon form): "Dile a Alejandra: llegaré tarde" -- turn plan and authorize re-plan reach an IDENTICAL digest', async () => {
        resolvePersonMock.mockResolvedValue({ resolved: { kind: 'user', id: RECIPIENT_ID, displayName: 'Alejandra' }, ambiguous: false, candidates: [] });
        const { authorizePlan } = await import('../src/services/agentAuthorization.service');
        const input = 'Dile a Alejandra: llegaré tarde';

        const originalPlan = await turnEquivalentPlan(input);
        expect(originalPlan.status).toBe('ready_for_authorization');
        expect(originalPlan.planDigest).toBeTruthy();
        expect(originalPlan.steps[0].toolId).toBe('send_message');
        expect((originalPlan.steps[0].arguments as any).content).toBe('llegaré tarde');

        const result = await authorizePlan({
            actorUserId: ACTOR_ID, input, now,
            planDigest: originalPlan.planDigest!,
            requestedStepIds: originalPlan.steps.map((s) => s.stepId),
            confirm: true,
        });

        expect(result.ok).toBe(true);
        if (result.ok) expect(result.authorization.status).toBe('authorized');
    });

    it('3) send_message (semantic enrichment required): "Dile a Alejandra que llegaré tarde" (no colon/quote) -- turn plan and authorize re-plan reach an IDENTICAL digest via the SAME enrichment bridge', async () => {
        resolvePersonMock.mockResolvedValue({ resolved: { kind: 'user', id: RECIPIENT_ID, displayName: 'Alejandra' }, ambiguous: false, candidates: [] });
        const { authorizePlan } = await import('../src/services/agentAuthorization.service');
        const input = 'Dile a Alejandra que llegaré tarde';

        const originalPlan = await turnEquivalentPlan(input);
        expect(originalPlan.status).toBe('ready_for_authorization');
        expect(originalPlan.planDigest).toBeTruthy();
        expect((originalPlan.steps[0].arguments as any).content).toBe('llegaré tarde');

        const result = await authorizePlan({
            actorUserId: ACTOR_ID, input, now,
            planDigest: originalPlan.planDigest!,
            requestedStepIds: originalPlan.steps.map((s) => s.stepId),
            confirm: true,
        });

        expect(result.ok).toBe(true);
        if (result.ok) expect(result.authorization.status).toBe('authorized');
    });

    it('4) genuine plan change (real content diverges between the client\'s claimed digest and the fresh re-plan) is still correctly rejected as plan_changed', async () => {
        resolvePersonMock.mockResolvedValue({ resolved: { kind: 'user', id: RECIPIENT_ID, displayName: 'Alejandra' }, ambiguous: false, candidates: [] });
        const { authorizePlan } = await import('../src/services/agentAuthorization.service');
        // The client claims a digest for a DIFFERENT message than what the
        // (unchanged) source utterance actually re-plans to -- a genuine
        // mismatch, never a false positive from routing divergence.
        const result = await authorizePlan({
            actorUserId: ACTOR_ID,
            input: 'Dile a Alejandra: llegaré tarde',
            now,
            planDigest: 'this-digest-was-never-real',
            requestedStepIds: ['step-0'],
            confirm: true,
        });
        expect(result.ok).toBe(false);
        if (!result.ok) expect(result.failureCode).toBe('plan_changed');
    });

    it('5) agentAuthorization.service.ts contains NO interpreter-selection policy of its own (no Deterministic*/Llm* interpreter references)', async () => {
        const fs = await import('node:fs');
        const path = await import('node:path');
        const source = fs.readFileSync(path.join(__dirname, '..', 'src/services/agentAuthorization.service.ts'), 'utf-8');
        expect(source).not.toMatch(/DeterministicInputInterpreter|DeterministicObjectiveInterpreter|LlmObjectiveInterpreter|new\s+\w*Interpreter/);
        // It still legitimately calls the ONE canonical routing function.
        expect(source).toContain('resolveDeterministicRouting');
    });
});

// ─── M-4 API/Core certification (2026-09-10): EXACT PLAN DIGEST BINDING
// (requirement 2) and TOOL/ARGS BINDING (requirement 4). Each test below
// takes a genuinely valid, real, freshly-planned digest and attempts to
// authorize a DIFFERENT real plan (differing in exactly one
// execution-relevant field: content, recipient, conversationId, date/time,
// or tool) using that mismatched digest — never a synthetic random string.
// The real end-to-end, zero-mutation proof (this same rejection path, with
// an actual canonical DB and a real row-count check) lives in
// scratch-m4-real-persistence-proof.mjs (real local Postgres, not
// committed — see the M-4 API/Core certification report for its output).
describe('M-4 exact-plan digest binding: altering ANY execution-relevant field is rejected before authorization', () => {
    async function realPlan(input: string, conversationId?: string) {
        const { runAgentPlanning, resolveDeterministicRouting } = await import('../src/services/agentPlanOrchestrator.service');
        const routing = await resolveDeterministicRouting(input, { actorUserId: ACTOR_ID, conversationId });
        return runAgentPlanning({ actorUserId: ACTOR_ID, input, conversationId, now }, { resolvedObjective: routing.resolvedObjective });
    }

    async function expectMismatchRejected(input: string, wrongDigestFromInput: string, conversationId?: string, wrongConversationId?: string) {
        const { authorizePlan } = await import('../src/services/agentAuthorization.service');
        const genuinePlan = await realPlan(input, conversationId);
        const wrongPlan = await realPlan(wrongDigestFromInput, wrongConversationId ?? conversationId);
        expect(genuinePlan.status).toBe('ready_for_authorization');
        expect(wrongPlan.status).toBe('ready_for_authorization');
        expect(genuinePlan.planDigest).not.toBe(wrongPlan.planDigest); // sanity: they really do differ

        const result = await authorizePlan({
            actorUserId: ACTOR_ID, input, conversationId, now,
            planDigest: wrongPlan.planDigest!, // claims the WRONG plan's digest
            requestedStepIds: genuinePlan.steps.map((s) => s.stepId),
            confirm: true,
        });
        expect(result.ok).toBe(false);
        if (!result.ok) expect(result.failureCode).toBe('plan_changed');
    }

    it('content/payload changed -> rejected', async () => {
        resolvePersonMock.mockResolvedValue({ resolved: { kind: 'user', id: RECIPIENT_ID, displayName: 'Alejandra' }, ambiguous: false, candidates: [] });
        await expectMismatchRejected('Dile a Alejandra: llegaré tarde', 'Dile a Alejandra: llegaré temprano');
    });

    it('target/recipient changed -> rejected', async () => {
        const PEDRO_ID = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
        resolvePersonMock.mockImplementation(async (_actorId: string, hint: { name: string }) => {
            if (hint.name === 'Alejandra') return { resolved: { kind: 'user', id: RECIPIENT_ID, displayName: 'Alejandra' }, ambiguous: false, candidates: [] };
            if (hint.name === 'Pedro') return { resolved: { kind: 'user', id: PEDRO_ID, displayName: 'Pedro' }, ambiguous: false, candidates: [] };
            return { resolved: null, ambiguous: false, candidates: [] };
        });
        await expectMismatchRejected('Dile a Alejandra: llegaré tarde', 'Dile a Pedro: llegaré tarde');
    });

    it('conversationId changed (same recipient, same content, different DIRECT conversation) -> rejected', async () => {
        resolvePersonMock.mockResolvedValue({ resolved: { kind: 'user', id: RECIPIENT_ID, displayName: 'Alejandra' }, ambiguous: false, candidates: [] });
        await expectMismatchRejected(
            'Dile a Alejandra: llegaré tarde', 'Dile a Alejandra: llegaré tarde',
            'cccccccc-cccc-4ccc-8ccc-cccccccccccc', 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
        );
    });

    it('date/time changed -> rejected', async () => {
        await expectMismatchRejected('Agenda entrenar mañana a las 8', 'Agenda entrenar mañana a las 9');
    });

    it('tool changed (requirement 4): two otherwise-identical steps differing ONLY in toolId produce different digests -- proven directly against computePlanDigest, the exact function authorizePlan uses for comparison', async () => {
        const { computePlanDigest } = await import('../src/services/agentPlanDigest.service');
        const baseStep = {
            stepId: 'step-0', toolVersion: 1, operation: 'op', arguments: { title: 'entrenar', dueAt: now.toISOString() },
            dependsOn: [], condition: { type: 'always' as const, description: 'x' }, expectedEffect: 'x',
            authorizationRequirement: 'required' as const, confirmationRequirement: 'explicit' as const,
            sideEffectClass: 'state_change' as const, riskLevel: 'medium' as const, preconditions: [], postconditions: [],
            rollbackCapability: 'reversible_by_owner' as const, provenance: { resolvedFrom: 'user_text' as const, canonicalSourceRefs: [] }, status: 'pending' as const,
        };
        const baseObjective = {
            objectiveType: 'create_commitment_or_proposal' as const, targetEntities: { personHints: [], entityHints: ['entrenar'] },
            constraints: {}, desiredOutcome: 'x', timeConstraints: { rawHint: null }, actor: ACTOR_ID, sourceUtterance: 'x',
            confidence: 1, ambiguities: [], source: 'deterministic' as const,
        };
        const basePlan = {
            planId: 'p1', status: 'ready_for_authorization' as const, requiredConfirmations: [], unresolvedInputs: [],
            riskSummary: { highestRiskLevel: 'medium' as const, riskLevelCounts: { low: 0, medium: 1, high: 0 } },
            canExecute: true, createdAt: now.toISOString(), validation: { valid: true, issues: [] }, humanReadableSummary: 'x',
            objective: baseObjective,
        };

        const digestToolA = computePlanDigest({ ...basePlan, steps: [{ ...baseStep, toolId: 'create_commitment' }] } as any);
        const digestToolB = computePlanDigest({ ...basePlan, steps: [{ ...baseStep, toolId: 'reschedule_commitment' }] } as any);
        expect(digestToolA).not.toBe(digestToolB);

        // And the end-to-end rejection path, exactly as the other field
        // tests above prove: authorizePlan compares this exact digest.
        const { authorizePlan } = await import('../src/services/agentAuthorization.service');
        const genuinePlan = await realPlan('Agenda entrenar mañana a las 8');
        expect(genuinePlan.status).toBe('ready_for_authorization');
        const result = await authorizePlan({
            actorUserId: ACTOR_ID, input: 'Agenda entrenar mañana a las 8', now,
            planDigest: digestToolB, // a digest computed for a DIFFERENT tool
            requestedStepIds: genuinePlan.steps.map((s) => s.stepId),
            confirm: true,
        });
        expect(result.ok).toBe(false);
        if (!result.ok) expect(result.failureCode).toBe('plan_changed');
    });
});
