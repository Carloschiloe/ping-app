import { describe, expect, it } from 'vitest';
import { validateAgentPlan } from '../src/services/agentPlanValidator.service';
import type { AgentPlanStep } from '../src/types/agentPlan';

const PROPOSAL_ID = '22222222-2222-4222-8222-222222222222';
const COMMITMENT_ID = '33333333-3333-4333-8333-333333333333';
const PERSON_ID = '44444444-4444-4444-8444-444444444444';
const CONVERSATION_ID = '55555555-5555-4555-8555-555555555555';

function baseStep(overrides: Partial<AgentPlanStep> = {}): AgentPlanStep {
    return {
        stepId: 'step-1',
        toolId: 'respond_to_proposal',
        toolVersion: 1,
        operation: 'Aceptar propuesta',
        arguments: { proposalId: PROPOSAL_ID, decision: 'approve' },
        dependsOn: [],
        condition: { type: 'always', description: 'Sin precondiciones.' },
        expectedEffect: 'test',
        authorizationRequirement: 'none', // deliberadamente incorrecto para probar "registry wins"
        confirmationRequirement: 'none',  // deliberadamente incorrecto
        sideEffectClass: 'none',          // deliberadamente incorrecto -- adversarial test E/F
        riskLevel: 'low',
        preconditions: [],
        postconditions: [],
        rollbackCapability: 'reversible_by_owner',
        provenance: { resolvedFrom: 'entity_resolution', canonicalSourceRefs: [] },
        status: 'pending',
        ...overrides,
    };
}

// ADVERSARIAL PLANNER TESTS (sección 41 del ticket M-3)
describe('adversarial A: unknown tool -> rejected', () => {
    it('un toolId inventado nunca pasa validación', () => {
        const { validation } = validateAgentPlan([baseStep({ toolId: 'delete_everything', arguments: {} })]);
        expect(validation.valid).toBe(false);
        expect(validation.issues[0].code).toBe('unsupported_capability');
    });
});

describe('adversarial E/F: "tool claims no side effect / no confirmation" but registry says otherwise -> registry wins', () => {
    it('respond_to_proposal declarado con sideEffectClass "none"/confirmationRequirement "none" se corrige a los valores reales del registry', () => {
        const { validation, correctedSteps } = validateAgentPlan([baseStep()]);
        expect(validation.valid).toBe(true);
        expect(correctedSteps[0].sideEffectClass).toBe('state_change');
        expect(correctedSteps[0].confirmationRequirement).toBe('explicit');
        expect(correctedSteps[0].authorizationRequirement).toBe('proposal_response_actor');
    });
});

describe('adversarial G: cyclic dependencies -> reject', () => {
    it('dos pasos que dependen uno del otro forman un ciclo y son rechazados', () => {
        const stepA = baseStep({ stepId: 'a', dependsOn: ['b'] });
        const stepB = baseStep({ stepId: 'b', dependsOn: ['a'] });
        const { validation } = validateAgentPlan([stepA, stepB]);
        expect(validation.valid).toBe(false);
        expect(validation.issues.some((i) => i.message.includes('cycle'))).toBe(true);
    });
    it('un self-dependsOn (a depende de a) también es un ciclo', () => {
        const step = baseStep({ stepId: 'a', dependsOn: ['a'] });
        const { validation } = validateAgentPlan([step]);
        expect(validation.valid).toBe(false);
    });
});

describe('adversarial H: missing required argument -> invalid', () => {
    it('respond_to_proposal sin "decision" es rechazado', () => {
        const { validation } = validateAgentPlan([baseStep({ arguments: { proposalId: PROPOSAL_ID } })]);
        expect(validation.valid).toBe(false);
        expect(validation.issues[0].code).toBe('missing_context');
    });
    it('create_commitment con dueAt no-ISO es rechazado', () => {
        const { validation } = validateAgentPlan([baseStep({
            toolId: 'create_commitment', operation: 'Crear', condition: { type: 'always', description: 'x' },
            arguments: { title: 'Entrenar', dueAt: 'mañana', responsiblePersonId: null, conversationId: null },
        })]);
        expect(validation.valid).toBe(false);
    });
});

describe('sección 48: payload prototype-pollution-shaped -> policy_blocked, distinto de un argumento simplemente faltante', () => {
    it('una clave extra desconocida en los argumentos se clasifica como policy_blocked', () => {
        const { validation } = validateAgentPlan([baseStep({ arguments: { proposalId: PROPOSAL_ID, decision: 'approve', injected: true } })]);
        expect(validation.valid).toBe(false);
        expect(validation.issues[0].code).toBe('policy_blocked');
    });
});

describe('sección 47: scale/security limits', () => {
    it('rechaza un plan con más pasos que el límite (maxSteps)', () => {
        const steps = Array.from({ length: 20 }, (_, i) => baseStep({ stepId: `s${i}`, arguments: { proposalId: PROPOSAL_ID, decision: 'approve' } }));
        const { validation } = validateAgentPlan(steps);
        expect(validation.valid).toBe(false);
        expect(validation.issues[0].code).toBe('policy_blocked');
    });
    it('rechaza un plan con más pasos paralelos independientes que el límite', () => {
        const steps = Array.from({ length: 6 }, (_, i) => baseStep({ stepId: `s${i}`, dependsOn: [], arguments: { proposalId: PROPOSAL_ID, decision: 'approve' } }));
        const { validation } = validateAgentPlan(steps);
        expect(validation.valid).toBe(false);
    });
    it('rechaza una cadena de dependencias más profunda que el límite', () => {
        const steps: AgentPlanStep[] = [];
        for (let i = 0; i < 8; i++) {
            steps.push(baseStep({ stepId: `s${i}`, dependsOn: i === 0 ? [] : [`s${i - 1}`], arguments: { proposalId: PROPOSAL_ID, decision: 'approve' } }));
        }
        const { validation } = validateAgentPlan(steps);
        expect(validation.valid).toBe(false);
    });
    it('rechaza un dependsOn que apunta a un stepId inexistente', () => {
        const { validation } = validateAgentPlan([baseStep({ dependsOn: ['no-existe'] })]);
        expect(validation.valid).toBe(false);
    });
});

describe('sección 23: non-contradictory — dos pasos no pueden aplicar operaciones distintas sobre la misma entidad', () => {
    it('reschedule_commitment y complete_commitment sobre el mismo commitmentId en un plan es inválido', () => {
        const stepA = baseStep({
            stepId: 'a', toolId: 'reschedule_commitment', dependsOn: [],
            arguments: { commitmentId: COMMITMENT_ID, newDueAt: '2026-09-10T12:00:00.000Z' },
        });
        const stepB = baseStep({
            stepId: 'b', toolId: 'complete_commitment', dependsOn: [],
            arguments: { commitmentId: COMMITMENT_ID, resolutionResult: 'listo' },
        });
        const { validation } = validateAgentPlan([stepA, stepB]);
        expect(validation.valid).toBe(false);
        expect(validation.issues.some((i) => i.message.includes('contradictory'))).toBe(true);
    });
});

describe('un plan bien formado con múltiples pasos independientes (no contradictorios) pasa validación', () => {
    it('dos send_message a personas distintas en la misma conversación es válido', () => {
        const stepA = baseStep({
            stepId: 'a', toolId: 'send_message', dependsOn: [],
            arguments: { conversationId: CONVERSATION_ID, recipientPersonId: PERSON_ID, content: 'hola' },
        });
        const stepB = baseStep({
            stepId: 'b', toolId: 'send_message', dependsOn: [],
            arguments: { conversationId: CONVERSATION_ID, recipientPersonId: '66666666-6666-4666-8666-666666666666', content: 'hola' },
        });
        const { validation } = validateAgentPlan([stepA, stepB]);
        expect(validation.valid).toBe(true);
    });
    it('un plan vacío es válido por vacuidad (nunca hay nada que rechazar)', () => {
        const { validation } = validateAgentPlan([]);
        expect(validation.valid).toBe(true);
    });
});
