import { describe, expect, it } from 'vitest';
import { computePlanDigest } from '../src/services/agentPlanDigest.service';
import type { AgentPlan, AgentPlanStep } from '../src/types/agentPlan';

const CARLOS = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

function step(overrides: Partial<AgentPlanStep> = {}): AgentPlanStep {
    return {
        stepId: `step-${Math.random().toString(36).slice(2, 8)}`, // deliberadamente aleatorio en cada test -- el digest NUNCA debe depender del stepId real (sección "canonicalStep")
        toolId: 'send_message', toolVersion: 1, operation: 'Enviar mensaje',
        arguments: { conversationId: 'c1', recipientPersonId: 'p1', content: 'hola' },
        dependsOn: [], condition: { type: 'always', description: 'x' },
        expectedEffect: 'x', authorizationRequirement: 'conversation_membership',
        confirmationRequirement: 'explicit', sideEffectClass: 'state_change', riskLevel: 'medium',
        preconditions: [], postconditions: [], rollbackCapability: 'reversible_by_owner',
        provenance: { resolvedFrom: 'entity_resolution', canonicalSourceRefs: [] }, status: 'pending',
        ...overrides,
    };
}

function plan(steps: AgentPlanStep[], overrides: Partial<AgentPlan> = {}): AgentPlan {
    return {
        planId: 'plan-x', status: 'ready_for_authorization', steps,
        objective: {
            objectiveType: 'communicate_message', targetEntities: { personHints: [], entityHints: [] },
            constraints: {}, desiredOutcome: 'hola', timeConstraints: { rawHint: null }, actor: CARLOS,
            sourceUtterance: 'Dile a Alejandra hola', confidence: 0.8, ambiguities: [], source: 'deterministic',
        },
        requiredConfirmations: ['explicit'], unresolvedInputs: [], riskSummary: { highestRiskLevel: 'medium', riskLevelCounts: { low: 0, medium: 1, high: 0 } },
        canExecute: true, createdAt: new Date().toISOString(), validation: { valid: true, issues: [] },
        humanReadableSummary: 'x',
        ...overrides,
    };
}

describe('computePlanDigest: determinismo real (sección 5/43 del ticket M-4)', () => {
    it('dos planes con contenido material idéntico pero stepIds distintos producen el MISMO digest', () => {
        const p1 = plan([step({ stepId: 'step-aaaaaaaa' })]);
        const p2 = plan([step({ stepId: 'step-bbbbbbbb' })]);
        expect(computePlanDigest(p1)).toBe(computePlanDigest(p2));
    });

    it('el mismo plan calculado dos veces (re-plan real) produce el mismo digest', () => {
        const p = plan([step()]);
        expect(computePlanDigest(p)).toBe(computePlanDigest(JSON.parse(JSON.stringify(p))));
    });

    it('orden de inserción de propiedades distinto en `arguments` no cambia el digest (canonicalización real)', () => {
        const p1 = plan([step({ arguments: { conversationId: 'c1', recipientPersonId: 'p1', content: 'hola' } })]);
        const p2 = plan([step({ arguments: { content: 'hola', recipientPersonId: 'p1', conversationId: 'c1' } })]);
        expect(computePlanDigest(p1)).toBe(computePlanDigest(p2));
    });
});

describe('computePlanDigest: sensibilidad real a cada campo material (sección 41/62 -- cualquier mutación invalida)', () => {
    const base = plan([step()]);
    const baseDigest = computePlanDigest(base);

    it('cambiar el actor cambia el digest', () => {
        const mutated = plan([step()], { objective: { ...base.objective, actor: 'other-actor' } });
        expect(computePlanDigest(mutated)).not.toBe(baseDigest);
    });

    it('cambiar el toolId de un paso cambia el digest (adversarial C del ticket)', () => {
        const mutated = plan([step({ toolId: 'create_commitment' })]);
        expect(computePlanDigest(mutated)).not.toBe(baseDigest);
    });

    it('cambiar el contenido del mensaje (arguments.content) cambia el digest', () => {
        const mutated = plan([step({ arguments: { ...base.steps[0].arguments, content: 'otro mensaje' } })]);
        expect(computePlanDigest(mutated)).not.toBe(baseDigest);
    });

    it('cambiar el destinatario (arguments.recipientPersonId) cambia el digest', () => {
        const mutated = plan([step({ arguments: { ...base.steps[0].arguments, recipientPersonId: 'other-person' } })]);
        expect(computePlanDigest(mutated)).not.toBe(baseDigest);
    });

    it('cambiar una fecha en los argumentos cambia el digest', () => {
        const withDate = plan([step({ toolId: 'reschedule_commitment', arguments: { commitmentId: 'c1', newDueAt: '2026-09-10T12:00:00.000Z' } })]);
        const mutated = plan([step({ toolId: 'reschedule_commitment', arguments: { commitmentId: 'c1', newDueAt: '2026-09-11T12:00:00.000Z' } })]);
        expect(computePlanDigest(withDate)).not.toBe(computePlanDigest(mutated));
    });

    it('cambiar sideEffectClass/confirmationRequirement cambia el digest (nunca se puede degradar silenciosamente el riesgo)', () => {
        const mutated = plan([step({ confirmationRequirement: 'implicit' })]);
        expect(computePlanDigest(mutated)).not.toBe(baseDigest);
    });

    it('agregar un paso extra cambia el digest', () => {
        const mutated = plan([step(), step({ toolId: 'create_commitment', arguments: { title: 'x', dueAt: '2026-09-10T12:00:00.000Z', responsiblePersonId: null, conversationId: null } })]);
        expect(computePlanDigest(mutated)).not.toBe(baseDigest);
    });

    it('cambiar dependsOn (grafo de dependencias) cambia el digest', () => {
        const s1 = step({ stepId: 's1' });
        const s2a = step({ stepId: 's2', dependsOn: [] });
        const s2b = step({ stepId: 's2', dependsOn: ['s1'] });
        expect(computePlanDigest(plan([s1, s2a]))).not.toBe(computePlanDigest(plan([s1, s2b])));
    });

    it('cambiar el tipo de condición (always vs wait_for_response) cambia el digest', () => {
        const mutated = plan([step({ condition: { type: 'wait_for_response', dependsOnStepId: undefined, description: 'esperar' } })]);
        expect(computePlanDigest(mutated)).not.toBe(baseDigest);
    });
});

describe('computePlanDigest: nunca depende de campos no materiales', () => {
    it('humanReadableSummary/createdAt/planId/traceId distintos NO cambian el digest', () => {
        const p1 = plan([step({ stepId: 'sX' })], { planId: 'plan-1', createdAt: '2026-01-01T00:00:00.000Z', humanReadableSummary: 'A', traceId: 'trace-1' });
        const p2 = plan([step({ stepId: 'sY' })], { planId: 'plan-2', createdAt: '2026-02-02T00:00:00.000Z', humanReadableSummary: 'B', traceId: 'trace-2' });
        expect(computePlanDigest(p1)).toBe(computePlanDigest(p2));
    });
});
