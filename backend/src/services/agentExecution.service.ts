// M-4 — Execution service. The ONLY place that turns an authorized,
// frozen plan into real side effects. Never a generic execute(toolId,args)
// (sección 3) — every step dispatches through getToolExecutor (known
// executor only) using the FROZEN arguments from the authorization row,
// never re-derived, never re-read from a live re-plan (sección 39/41).
import { supabaseAdmin } from '../lib/supabaseAdmin';
import { AppError } from '../utils/AppError';
import { getToolExecutor } from './toolExecutorRegistry.service';
import { getAuthorizationById } from './agentAuthorization.service';
import { traceExecution } from '../utils/executionTrace';
import type { AgentPlanStep } from '../types/agentPlan';
import type {
    AgentAuthorization, AgentExecutionResult, AgentExecutionStepResult,
    AgentExecutionEntityRef, AgentExecutionFailureCode,
} from '../types/agentExecution';

export interface ExecuteAuthorizationInput {
    authorizationId: string;
    actorUserId: string;
    traceId?: string;
}

function pgErrorToStatus(code: string | undefined): number {
    if (code === 'P0002') return 404;
    if (code === '42501') return 403;
    if (code === 'P0001') return 410;
    return 500;
}

async function claimAuthorization(authorizationId: string, actorUserId: string): Promise<AgentAuthorization> {
    const { data, error } = await supabaseAdmin.rpc('claim_agent_authorization_for_execution', {
        p_authorization_id: authorizationId,
        p_actor_user_id: actorUserId,
    });
    if (error) throw new AppError(error.message, pgErrorToStatus(error.code));
    return {
        id: data.id, actorUserId: data.actor_user_id, planDigest: data.plan_digest,
        objectiveType: data.objective_type, frozenSteps: data.frozen_steps,
        authorizedStepIds: data.authorized_step_ids, confirmationLevel: data.confirmation_level,
        status: data.status, issuedAt: data.issued_at, expiresAt: data.expires_at,
        consumedAt: data.consumed_at, revokedAt: data.revoked_at, traceId: data.trace_id,
    };
}

async function claimExecutionStep(params: {
    authorizationId: string; actorUserId: string; stepId: string; toolId: string; toolVersion: number; traceId?: string;
}): Promise<{ execution: any; isNewAttempt: boolean }> {
    const { data, error } = await supabaseAdmin.rpc('claim_agent_execution_step', {
        p_authorization_id: params.authorizationId,
        p_actor_user_id: params.actorUserId,
        p_step_id: params.stepId,
        p_tool_id: params.toolId,
        p_tool_version: params.toolVersion,
        p_trace_id: params.traceId ?? null,
    });
    if (error) throw new AppError(error.message, 500);
    const row = Array.isArray(data) ? data[0] : data;
    return { execution: row.execution, isNewAttempt: row.is_new_attempt };
}

async function completeExecutionStep(executionId: string, status: string, resultRef?: Record<string, unknown>, failureCode?: string): Promise<any> {
    const { data, error } = await supabaseAdmin.rpc('complete_agent_execution_step', {
        p_execution_id: executionId,
        p_status: status,
        p_result_ref: resultRef ?? null,
        p_failure_code: failureCode ?? null,
    });
    if (error) throw new AppError(error.message, 500);
    return data;
}

function refsFromResultRef(resultRef: Record<string, unknown> | null | undefined, key: 'createdEntityRefs' | 'updatedEntityRefs'): AgentExecutionEntityRef[] {
    const refs = resultRef?.[key];
    return Array.isArray(refs) ? refs as AgentExecutionEntityRef[] : [];
}

// Sección 23/26: un paso cuya condición no es 'always' (ej. wait_for_response)
// o cuyas dependencias aún no se cumplieron NUNCA se ejecuta -- se marca
// 'skipped_condition' de forma explícita y auditable, requiriendo una
// autorización FRESCA más adelante cuando la condición real se resuelva
// (nunca "pre-autorizado silenciosamente para lo que sea que pase").
function isStepReadyNow(step: AgentPlanStep, succeededStepIds: Set<string>): boolean {
    if (step.condition.type !== 'always') return false;
    return step.dependsOn.every((id) => succeededStepIds.has(id));
}

export async function executeAuthorization(input: ExecuteAuthorizationInput): Promise<AgentExecutionResult> {
    const authorization = await claimAuthorization(input.authorizationId, input.actorUserId);
    traceExecution(input.traceId, 'AUTHORIZATION_CLAIMED', { authorizationId: authorization.id, status: authorization.status });

    const authorizedSteps = authorization.frozenSteps.filter((s) => authorization.authorizedStepIds.includes(s.stepId));
    const succeededStepIds = new Set<string>();
    const stepResults: AgentExecutionStepResult[] = [];

    // Orden determinístico: procesa en el orden en que aparecen en el plan
    // congelado (ya topológicamente coherente desde el validador de M-3);
    // una segunda pasada nunca es necesaria porque las únicas dependencias
    // reales hoy son wait_for_response (sección 23), que nunca se ejecutan
    // en esta misma llamada de todos modos.
    for (const step of authorizedSteps) {
        if (!isStepReadyNow(step, succeededStepIds)) {
            const { execution } = await claimExecutionStep({
                authorizationId: authorization.id, actorUserId: input.actorUserId,
                stepId: step.stepId, toolId: step.toolId, toolVersion: step.toolVersion, traceId: input.traceId,
            });
            let finalRow = execution;
            if (execution.status === 'running') {
                // Sección 7 (M-4 staging publication): 'condition_not_met'
                // marca explícitamente POR QUÉ este paso nunca se ejecutó --
                // nunca NULL -- así "condición aún no cumplida" es
                // auditable/distinguible de cualquier otro estado terminal
                // sin ambigüedad, incluso mirando sólo esta fila.
                finalRow = await completeExecutionStep(execution.id, 'skipped_condition', undefined, 'condition_not_met');
            }
            stepResults.push({
                stepId: step.stepId, toolId: step.toolId, status: finalRow.status,
                failureCode: finalRow.status === 'skipped_condition' ? 'condition_not_met' : undefined,
                waitingOn: finalRow.status === 'skipped_condition' ? step.condition.description : undefined,
                createdEntityRefs: [], updatedEntityRefs: [], messageSent: false, verified: false, idempotentReplay: false,
            });
            traceExecution(input.traceId, 'STEP_WAITING', { stepId: step.stepId, toolId: step.toolId, conditionType: step.condition.type });
            continue;
        }

        const { execution, isNewAttempt } = await claimExecutionStep({
            authorizationId: authorization.id, actorUserId: input.actorUserId,
            stepId: step.stepId, toolId: step.toolId, toolVersion: step.toolVersion, traceId: input.traceId,
        });

        if (!isNewAttempt) {
            // Replay idempotente real, o una request concurrente distinta
            // ya está ejecutando este paso ahora mismo (sección 53 J) --
            // NUNCA se re-invoca el executor en ninguno de los dos casos.
            const idempotentReplay = execution.status === 'succeeded';
            if (execution.status === 'succeeded') succeededStepIds.add(step.stepId);
            traceExecution(input.traceId, 'STEP_REPLAY_OR_CONCURRENT', { stepId: step.stepId, status: execution.status, idempotentReplay });
            stepResults.push({
                stepId: step.stepId, toolId: step.toolId,
                status: execution.status === 'running' ? 'blocked' : execution.status,
                failureCode: execution.failure_code ?? undefined,
                createdEntityRefs: refsFromResultRef(execution.result_ref, 'createdEntityRefs'),
                updatedEntityRefs: refsFromResultRef(execution.result_ref, 'updatedEntityRefs'),
                messageSent: !!execution.result_ref?.messageId, verified: execution.status === 'succeeded', idempotentReplay,
            });
            continue;
        }

        const executor = getToolExecutor(step.toolId);
        if (!executor) {
            const failed = await completeExecutionStep(execution.id, 'failed_terminal', undefined, 'tool_not_executable');
            stepResults.push({ stepId: step.stepId, toolId: step.toolId, status: 'failed_terminal', failureCode: 'tool_not_executable', createdEntityRefs: [], updatedEntityRefs: [], messageSent: false, verified: false, idempotentReplay: false });
            traceExecution(input.traceId, 'STEP_TOOL_MISSING', { stepId: step.stepId, toolId: step.toolId });
            continue;
        }

        traceExecution(input.traceId, 'STEP_EXECUTING', { stepId: step.stepId, toolId: step.toolId });
        let outcome;
        try {
            outcome = await executor.execute(
                { actorUserId: input.actorUserId, traceId: input.traceId, idempotencyKey: execution.idempotency_key },
                step.arguments,
            );
        } catch (err) {
            outcome = { status: 'failed_retryable' as const, failureCode: 'transient_failure' as AgentExecutionFailureCode, verified: false };
            traceExecution(input.traceId, 'STEP_EXECUTOR_THREW', { stepId: step.stepId, toolId: step.toolId, message: err instanceof Error ? err.message : 'unknown' });
        }

        const completed = await completeExecutionStep(execution.id, outcome.status, {
            ...(outcome.resultRef ?? {}),
            createdEntityRefs: outcome.createdEntityRefs ?? [],
            updatedEntityRefs: outcome.updatedEntityRefs ?? [],
            messageId: outcome.messageSent ? (outcome.resultRef as any)?.messageId : undefined,
            // Sección 8 (M-4 staging publication) — "HOW was success verified?"
            // must be durably answerable from the audit row itself, never
            // only from the ephemeral HTTP response or a console trace line.
            verified: outcome.verified,
        }, outcome.failureCode);

        if (outcome.status === 'succeeded') succeededStepIds.add(step.stepId);
        traceExecution(input.traceId, 'STEP_COMPLETED', { stepId: step.stepId, toolId: step.toolId, status: outcome.status, failureCode: outcome.failureCode, verified: outcome.verified });

        stepResults.push({
            stepId: step.stepId, toolId: step.toolId, status: completed.status, failureCode: outcome.failureCode,
            createdEntityRefs: outcome.createdEntityRefs ?? [], updatedEntityRefs: outcome.updatedEntityRefs ?? [],
            messageSent: !!outcome.messageSent, verified: outcome.verified, idempotentReplay: false,
        });
    }

    return buildResult(authorization.id, stepResults);
}

function buildResult(authorizationId: string, stepResults: AgentExecutionStepResult[]): AgentExecutionResult {
    const executedSteps = stepResults.filter((s) => s.status === 'succeeded');
    const failedSteps = stepResults.filter((s) => s.status === 'failed_retryable' || s.status === 'failed_terminal' || s.status === 'blocked');
    const waitingSteps = stepResults.filter((s) => s.status === 'skipped_condition');

    // Sección 7 (M-4 staging publication) — orden de prioridad deliberado:
    // "sin fallos reales pero con un paso condicional pendiente" debe leerse
    // como WAITING (una pausa intencional, nada salió mal), nunca como
    // partially_done (que lee como "algo debería haber pasado y no pasó")
    // -- incluso cuando OTRO paso del mismo plan sí se ejecutó con éxito
    // (ej. el send_message de "pregúntale y si acepta, agéndalo"). Sólo un
    // fallo REAL (failedSteps>0) degrada la lectura a partially_done/failed.
    let status: AgentExecutionResult['status'];
    if (failedSteps.length === 0 && waitingSteps.length === 0) status = 'done';
    else if (failedSteps.length === 0 && waitingSteps.length > 0) status = 'waiting';
    else if (executedSteps.length > 0) status = 'partially_done';
    else status = 'failed';

    const createdEntityRefs = stepResults.flatMap((s) => s.createdEntityRefs);
    const updatedEntityRefs = stepResults.flatMap((s) => s.updatedEntityRefs);
    const messagesSent = stepResults.filter((s) => s.messageSent).length;

    // Sección 69/70: prosa determinística derivada del registro real de
    // ejecución -- nunca "Hecho" salvo verificación real, nunca prosa
    // independientemente alucinada.
    const lines: string[] = [];
    for (const s of executedSteps) lines.push(`✓ ${s.toolId} completado y verificado.`);
    for (const s of waitingSteps) lines.push(`⏳ ${s.toolId} queda pendiente${s.waitingOn ? `: ${s.waitingOn}` : ' de una condición futura'} (requiere nueva autorización cuando se resuelva).`);
    for (const s of failedSteps) lines.push(`✗ ${s.toolId} no se ejecutó (${s.failureCode ?? 'motivo desconocido'}).`);
    const humanReadableSummary = lines.length > 0 ? lines.join('\n') : 'No se ejecutó ningún paso.';

    return {
        authorizationId, status, executedSteps, failedSteps, waitingSteps,
        createdEntityRefs, updatedEntityRefs, messagesSent,
        requiresFurtherAuthorization: waitingSteps.length > 0,
        humanReadableSummary,
    };
}

export { getAuthorizationById };
