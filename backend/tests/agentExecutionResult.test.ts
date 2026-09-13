import { describe, it, expect } from 'vitest';
import { buildResult, isStepReadyNow } from '../src/services/agentExecution.service';
import type { AgentExecutionStepResult } from '../src/types/agentExecution';
import type { AgentPlanStep } from '../src/types/agentPlan';

// M-4 P1 GAP CLOSED — buildResult (the deterministic status-priority logic
// that decides done/waiting/partially_done/failed from real per-step
// execution outcomes) and isStepReadyNow had ZERO direct test coverage
// (confirmed via repo-wide grep): agentTurn.test.ts only ever mocks/spies
// executeAuthorization, never exercises this pure logic for real. This is
// exactly the mechanism that prevents a failed/partial execution from ever
// being narrated as a full success (sección 69/70: "prosa determinística
// derivada del registro real de ejecución -- nunca 'Hecho' salvo
// verificación real").

function step(overrides: Partial<AgentExecutionStepResult> = {}): AgentExecutionStepResult {
    return {
        stepId: 'step-1', toolId: 'send_message', status: 'succeeded',
        createdEntityRefs: [], updatedEntityRefs: [], messageSent: false, verified: true, idempotentReplay: false,
        ...overrides,
    };
}

describe('buildResult — status priority (M-4 sección 7, "STAGING PUBLICATION")', () => {
    it('todos los pasos succeeded -> status="done", humanReadableSummary lista cada uno como completado y verificado', () => {
        const result = buildResult('auth-1', [step({ stepId: 's1', toolId: 'send_message' }), step({ stepId: 's2', toolId: 'create_commitment' })]);
        expect(result.status).toBe('done');
        expect(result.executedSteps).toHaveLength(2);
        expect(result.failedSteps).toHaveLength(0);
        expect(result.humanReadableSummary).toBe('✓ send_message completado y verificado.\n✓ create_commitment completado y verificado.');
    });

    it('un paso failed_terminal, sin ningún succeeded -> status="failed"', () => {
        const result = buildResult('auth-1', [step({ status: 'failed_terminal', failureCode: 'not_authorized', verified: false })]);
        expect(result.status).toBe('failed');
        expect(result.executedSteps).toHaveLength(0);
        expect(result.humanReadableSummary).toMatch(/✗ send_message no se ejecutó \(not_authorized\)\./);
    });

    it('un paso succeeded + un paso failed_terminal -> status="partially_done" (nunca "done" pese a que algo sí se ejecutó)', () => {
        const result = buildResult('auth-1', [
            step({ stepId: 's1', status: 'succeeded' }),
            step({ stepId: 's2', toolId: 'create_commitment', status: 'failed_terminal', failureCode: 'invalid_lifecycle', verified: false }),
        ]);
        expect(result.status).toBe('partially_done');
        expect(result.executedSteps).toHaveLength(1);
        expect(result.failedSteps).toHaveLength(1);
    });

    // Sección 7 (M-4 staging publication): "sin fallos reales pero con un
    // paso condicional pendiente" debe leerse como WAITING, NUNCA
    // partially_done -- incluso cuando otro paso del mismo plan sí se
    // ejecutó con éxito (ej. "pregúntale y si acepta, agéndalo").
    it('un paso succeeded + un paso skipped_condition (sin fallos reales) -> status="waiting", NUNCA "partially_done"', () => {
        const result = buildResult('auth-1', [
            step({ stepId: 's1', toolId: 'send_message', status: 'succeeded', messageSent: true }),
            step({ stepId: 's2', toolId: 'create_commitment', status: 'skipped_condition', verified: false, waitingOn: 'respuesta de Alejandra' }),
        ]);
        expect(result.status).toBe('waiting');
        expect(result.requiresFurtherAuthorization).toBe(true);
        expect(result.humanReadableSummary).toMatch(/⏳ create_commitment queda pendiente: respuesta de Alejandra/);
    });

    it('un paso skipped_condition Y un paso failed_terminal (fallo real presente) -> el fallo real degrada a "partially_done" incluso con un paso waiting, nunca se queda en "waiting"', () => {
        const result = buildResult('auth-1', [
            step({ stepId: 's1', status: 'succeeded' }),
            step({ stepId: 's2', status: 'skipped_condition', verified: false, waitingOn: 'algo' }),
            step({ stepId: 's3', toolId: 'reschedule_commitment', status: 'failed_terminal', failureCode: 'entity_changed', verified: false }),
        ]);
        expect(result.status).toBe('partially_done');
    });

    it('sólo skipped_condition, ningún succeeded, ningún failed -> status="waiting" (nunca "failed" por no haber ejecutado nada real)', () => {
        const result = buildResult('auth-1', [step({ status: 'skipped_condition', verified: false, waitingOn: 'algo' })]);
        expect(result.status).toBe('waiting');
    });

    it('un paso "blocked" cuenta como fallo real (mismo bucket que failed_retryable/failed_terminal), degrada a partially_done/failed según corresponda', () => {
        const result = buildResult('auth-1', [
            step({ stepId: 's1', status: 'succeeded' }),
            step({ stepId: 's2', status: 'blocked', verified: false }),
        ]);
        expect(result.status).toBe('partially_done');
        expect(result.failedSteps).toHaveLength(1);
    });

    // Caso borde sin ruta real conocida (una autorización siempre se deriva
    // de un plan ready_for_authorization con al menos un paso) -- documenta
    // el comportamiento real tal cual es: sin fallos Y sin waiting, la
    // condición de "done" se cumple vacuamente. humanReadableSummary sigue
    // siendo honesto por separado ("No se ejecutó ningún paso."), nunca
    // fabrica una línea "✓ completado" que no corresponde a ningún paso real.
    it('sin pasos en absoluto (caso borde, sin ruta de producción conocida): status="done" por vacuidad (0 fallos, 0 waiting), pero humanReadableSummary nunca inventa una línea de éxito', () => {
        const result = buildResult('auth-1', []);
        expect(result.status).toBe('done');
        expect(result.executedSteps).toHaveLength(0);
        expect(result.humanReadableSummary).toBe('No se ejecutó ningún paso.');
    });

    it('createdEntityRefs/updatedEntityRefs/messagesSent se agregan correctamente a través de todos los pasos', () => {
        const result = buildResult('auth-1', [
            step({ stepId: 's1', toolId: 'send_message', messageSent: true, createdEntityRefs: [{ entityType: 'message', entityId: 'msg-1' }] }),
            step({ stepId: 's2', toolId: 'create_commitment', createdEntityRefs: [{ entityType: 'commitment', entityId: 'cm-1' }] }),
        ]);
        expect(result.createdEntityRefs).toEqual([
            { entityType: 'message', entityId: 'msg-1' },
            { entityType: 'commitment', entityId: 'cm-1' },
        ]);
        expect(result.messagesSent).toBe(1);
    });

    it('NUNCA marca "completado y verificado" para un paso que no está en status=succeeded, incluso si verified=true por error de otro código (invariante: la prosa depende SÓLO del status, nunca de verified aislado)', () => {
        const result = buildResult('auth-1', [step({ status: 'failed_terminal', verified: true as any, failureCode: 'verification_failed' })]);
        expect(result.humanReadableSummary).not.toMatch(/completado y verificado/);
        expect(result.status).toBe('failed');
    });
});

describe('isStepReadyNow — dependency/condition gating (sección 23/26)', () => {
    function planStep(overrides: Partial<AgentPlanStep> = {}): AgentPlanStep {
        return {
            stepId: 'step-1', toolId: 'send_message', toolVersion: 1, arguments: {},
            condition: { type: 'always' }, dependsOn: [], sideEffectClass: 'irreversible',
            ...overrides,
        } as AgentPlanStep;
    }

    it('condition.type !== "always" nunca está listo, sin importar dependsOn', () => {
        const step2 = planStep({ condition: { type: 'wait_for_response' } as any, dependsOn: [] });
        expect(isStepReadyNow(step2, new Set())).toBe(false);
    });

    it('condition "always" sin dependsOn siempre está listo', () => {
        expect(isStepReadyNow(planStep({ dependsOn: [] }), new Set())).toBe(true);
    });

    it('condition "always" con dependsOn -- listo sólo cuando TODAS las dependencias ya tuvieron éxito', () => {
        const s = planStep({ dependsOn: ['step-a', 'step-b'] });
        expect(isStepReadyNow(s, new Set(['step-a']))).toBe(false);
        expect(isStepReadyNow(s, new Set(['step-a', 'step-b']))).toBe(true);
    });
});
