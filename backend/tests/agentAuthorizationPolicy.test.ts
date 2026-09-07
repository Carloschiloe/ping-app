import { describe, expect, it, vi } from 'vitest';
import type { AgentObjective, AgentPlan, AgentPlanStep } from '../src/types/agentPlan';

// No tool shipped today declares confirmationPolicy 'strong_explicit'
// (honestly disclosed in the M-4 report) -- the contract must still be
// enforced correctly if one ever does. `getToolContract` is mocked ONLY to
// add that one synthetic entry; every real toolId (send_message,
// create_commitment, ...) still resolves through the REAL registry
// (importOriginal), so "registry wins" stays proven against real contracts
// everywhere else in this file.
vi.mock('../src/services/toolRegistry.service', async (importOriginal) => {
    const actual = await importOriginal<typeof import('../src/services/toolRegistry.service')>();
    return {
        ...actual,
        getToolContract: (toolId: string) => (
            toolId === 'strong_tool'
                ? { toolId: 'strong_tool', version: 1, availability: 'available_now', confirmationPolicy: 'strong_explicit' }
                : actual.getToolContract(toolId)
        ),
    };
});

const { canAuthorize } = await import('../src/services/agentAuthorizationPolicy.service');

// M-4 — canAuthorize (sección 48) in isolation: real toolIds against the
// REAL toolRegistry (getToolContract is never mocked — this is the exact
// same "registry wins, never trust the plan's own claims" principle already
// established in agentPlanValidator.test.ts), fake plan/step scaffolding
// otherwise. This never touches Postgres — the DB-backed guarantees
// (digest binding, atomic consumption, replay) are proven separately in
// tests/agentPlanEndToEnd.test.ts, tests/postgres/agentAuthorizationExecution.integration.sql
// and scripts/e2e-agent-m4-local.mjs; this file isolates the pure policy
// DECISION function itself.
const ACTOR = 'actor-1';

function objective(overrides: Partial<AgentObjective> = {}): AgentObjective {
    return {
        objectiveType: 'communicate_message',
        targetEntities: { personHints: [], entityHints: [] },
        constraints: {},
        desiredOutcome: 'test',
        timeConstraints: { rawHint: null },
        actor: ACTOR,
        sourceUtterance: 'test',
        confidence: 0.9,
        ambiguities: [],
        source: 'deterministic',
        ...overrides,
    };
}

function step(overrides: Partial<AgentPlanStep> = {}): AgentPlanStep {
    return {
        stepId: 'step-0',
        toolId: 'send_message',
        toolVersion: 1,
        operation: 'Enviar mensaje',
        arguments: { conversationId: 'c1', content: 'hola' },
        dependsOn: [],
        condition: { type: 'always', description: 'Sin precondiciones.' },
        expectedEffect: 'test',
        authorizationRequirement: 'none',
        confirmationRequirement: 'explicit',
        sideEffectClass: 'reversible',
        riskLevel: 'low',
        preconditions: [],
        postconditions: [],
        rollbackCapability: 'reversible_by_owner',
        provenance: { resolvedFrom: 'user_text', canonicalSourceRefs: [] },
        status: 'pending',
        ...overrides,
    };
}

function plan(overrides: Partial<AgentPlan> = {}): AgentPlan {
    const steps = overrides.steps ?? [step()];
    return {
        planId: 'plan-1',
        objective: objective(),
        status: 'ready_for_authorization',
        steps,
        requiredConfirmations: [],
        unresolvedInputs: [],
        riskSummary: { highestRiskLevel: 'low', riskLevelCounts: { low: steps.length, medium: 0, high: 0 } },
        canExecute: true,
        createdAt: new Date().toISOString(),
        validation: { valid: true, issues: [] },
        humanReadableSummary: 'test',
        planDigest: 'x'.repeat(64),
        ...overrides,
    };
}

describe('canAuthorize — a valid plan and confirmation is allowed', () => {
    it('a ready_for_authorization plan, own actor, real step, explicit confirm -> allowed', () => {
        const result = canAuthorize({ plan: plan(), actorUserId: ACTOR, requestedStepIds: ['step-0'], confirm: true });
        expect(result.allowed).toBe(true);
        expect(result.issues).toEqual([]);
    });
});

describe('canAuthorize — sección 1: a valid plan is never itself authorization', () => {
    it('status=draft -> denied (tool_not_executable)', () => {
        const result = canAuthorize({ plan: plan({ status: 'draft', canExecute: false }), actorUserId: ACTOR, requestedStepIds: ['step-0'], confirm: true });
        expect(result.allowed).toBe(false);
        expect(result.issues[0].code).toBe('tool_not_executable');
    });
    it('status=needs_clarification -> denied', () => {
        const result = canAuthorize({ plan: plan({ status: 'needs_clarification', canExecute: false }), actorUserId: ACTOR, requestedStepIds: ['step-0'], confirm: true });
        expect(result.allowed).toBe(false);
    });
    it('canExecute=false even if status looks right -> denied (registry/validator wins over a stale flag)', () => {
        const result = canAuthorize({ plan: plan({ canExecute: false }), actorUserId: ACTOR, requestedStepIds: ['step-0'], confirm: true });
        expect(result.allowed).toBe(false);
        expect(result.issues[0].code).toBe('tool_not_executable');
    });
});

describe('canAuthorize — sección 19/74: actor identity is never trusted from the client', () => {
    it('plan built for a different actor -> not_authorized, regardless of who is asking', () => {
        const result = canAuthorize({ plan: plan({ objective: objective({ actor: 'someone-else' }) }), actorUserId: ACTOR, requestedStepIds: ['step-0'], confirm: true });
        expect(result.allowed).toBe(false);
        expect(result.issues[0].code).toBe('not_authorized');
    });
});

describe('canAuthorize — requestedStepIds validation', () => {
    it('empty stepIds -> denied (nothing to authorize)', () => {
        const result = canAuthorize({ plan: plan(), actorUserId: ACTOR, requestedStepIds: [], confirm: true });
        expect(result.allowed).toBe(false);
        expect(result.issues[0].code).toBe('tool_not_executable');
    });
    it('a stepId that does not exist in the plan -> plan_changed (sección 62: an invented/mismatched step is never silently ignored)', () => {
        const result = canAuthorize({ plan: plan(), actorUserId: ACTOR, requestedStepIds: ['not-a-real-step'], confirm: true });
        expect(result.allowed).toBe(false);
        expect(result.issues[0].code).toBe('plan_changed');
        expect(result.issues[0].stepId).toBe('not-a-real-step');
    });
    it('one real stepId plus one invented one -> the whole request is denied, never partially authorized', () => {
        const result = canAuthorize({ plan: plan(), actorUserId: ACTOR, requestedStepIds: ['step-0', 'ghost-step'], confirm: true });
        expect(result.allowed).toBe(false);
        expect(result.issues.some((i) => i.code === 'plan_changed' && i.stepId === 'ghost-step')).toBe(true);
    });
});

describe('canAuthorize — sección 3/10/49: unknown or not-yet-executable tools', () => {
    it('an invented toolId the registry has never heard of -> tool_not_executable, never authorized', () => {
        const result = canAuthorize({
            plan: plan({ steps: [step({ toolId: 'delete_everything' })] }),
            actorUserId: ACTOR, requestedStepIds: ['step-0'], confirm: true,
        });
        expect(result.allowed).toBe(false);
        expect(result.issues[0].code).toBe('tool_not_executable');
    });
});

describe('canAuthorize — sección 7/8/37: real confirmation, never assumed', () => {
    it('a step requiring explicit confirmation without confirm=true -> not_authorized', () => {
        const result = canAuthorize({ plan: plan(), actorUserId: ACTOR, requestedStepIds: ['step-0'], confirm: false });
        expect(result.allowed).toBe(false);
        expect(result.issues[0].code).toBe('not_authorized');
    });
    it('a step requiring strong_explicit confirmation without strongConfirm=true -> not_authorized even if confirm=true', () => {
        const result = canAuthorize({
            plan: plan({ steps: [step({ toolId: 'strong_tool', confirmationRequirement: 'strong_explicit' })] }),
            actorUserId: ACTOR, requestedStepIds: ['step-0'], confirm: true,
        });
        expect(result.allowed).toBe(false);
        expect(result.issues[0].code).toBe('not_authorized');
    });
    it('strong_explicit satisfied by strongConfirm=true -> allowed', () => {
        const result = canAuthorize({
            plan: plan({ steps: [step({ toolId: 'strong_tool', confirmationRequirement: 'strong_explicit' })] }),
            actorUserId: ACTOR, requestedStepIds: ['step-0'], confirm: true, strongConfirm: true,
        });
        expect(result.allowed).toBe(true);
    });
});

describe('canAuthorize — multi-step: one bad step never silently authorizes the good one', () => {
    it('two real steps, one with an unauthorized confirmation gap -> the whole authorization is denied', () => {
        const goodStep = step({ stepId: 'step-0' });
        const badStep = step({ stepId: 'step-1', toolId: 'create_commitment', confirmationRequirement: 'explicit' });
        const result = canAuthorize({
            plan: plan({ steps: [goodStep, badStep] }),
            actorUserId: ACTOR, requestedStepIds: ['step-0', 'step-1'], confirm: false,
        });
        expect(result.allowed).toBe(false);
        expect(result.issues.length).toBeGreaterThanOrEqual(2);
    });
});
