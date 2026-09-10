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
