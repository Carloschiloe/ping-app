// M-4 — Authorization service. The ONLY place that turns a re-derived,
// digest-verified AgentPlan into a durable AgentAuthorization row. Never
// trusts a client-supplied plan (sección 74) — always re-runs the exact
// same deterministic M-3 pipeline (Option C, sección 10/58) and requires
// the freshly-computed digest to match what the client echoes back from a
// genuine prior /agent/plan call.
import { supabaseAdmin } from '../lib/supabaseAdmin';
import { AppError } from '../utils/AppError';
import { runAgentPlanning, type AgentPlanOrchestratorInput } from './agentPlanOrchestrator.service';
import { canAuthorize } from './agentAuthorizationPolicy.service';
import { traceAuth } from '../utils/executionTrace';
import type { AgentAuthorization, AgentAuthorizationStatus } from '../types/agentExecution';
import type { AgentPlanStep } from '../types/agentPlan';
import type { AgentInputEnvelope, ContextReferent } from '../types/agentInput';

// Sección 32 — TTL corto y real; los tests controlan el reloj pasando `now`
// explícitamente (mismo patrón ya usado en runAgentPlanning), nunca
// mockeando Date global.
export const AUTHORIZATION_TTL_MS = 5 * 60 * 1000;

export interface AuthorizePlanInput {
    actorUserId: string;
    input: string;
    conversationId?: string;
    channel?: string;
    locale?: string;
    timezone?: string;
    now?: Date;
    traceId?: string;
    // Lo que el cliente ecoa desde una respuesta REAL de /agent/plan --
    // nunca un plan JSON completo (sección 9/10).
    planDigest: string;
    requestedStepIds: string[];
    confirm: boolean;
    strongConfirm?: boolean;
    inputEnvelope?: AgentInputEnvelope;
    contextReferents?: ContextReferent[];
}

export type AuthorizePlanResult =
    | { ok: true; authorization: AgentAuthorization }
    | { ok: false; failureCode: string; message: string };

function rowToAuthorization(row: any): AgentAuthorization {
    return {
        id: row.id,
        actorUserId: row.actor_user_id,
        planDigest: row.plan_digest,
        objectiveType: row.objective_type,
        frozenSteps: row.frozen_steps,
        authorizedStepIds: row.authorized_step_ids,
        confirmationLevel: row.confirmation_level,
        status: row.status as AgentAuthorizationStatus,
        issuedAt: row.issued_at,
        expiresAt: row.expires_at,
        consumedAt: row.consumed_at,
        revokedAt: row.revoked_at,
        traceId: row.trace_id,
    };
}

export async function authorizePlan(input: AuthorizePlanInput): Promise<AuthorizePlanResult> {
    const now = input.now ?? new Date();
    const orchestratorInput: AgentPlanOrchestratorInput = {
        actorUserId: input.actorUserId,
        input: input.input,
        conversationId: input.conversationId,
        channel: input.channel,
        locale: input.locale,
        timezone: input.timezone,
        now,
        traceId: input.traceId,
        inputEnvelope: input.inputEnvelope,
        contextReferents: input.contextReferents,
    };

    // Re-planifica desde cero, con el estado canónico ACTUAL -- nunca se
    // reutiliza el plan que el cliente pudiera haber cacheado (sección 9/74).
    const freshPlan = await runAgentPlanning(orchestratorInput);

    traceAuth(input.traceId, 'REPLAN_FOR_AUTHORIZATION', {
        status: freshPlan.status, freshDigest: freshPlan.planDigest, claimedDigest: input.planDigest,
    });

    if (freshPlan.status !== 'ready_for_authorization' || !freshPlan.planDigest) {
        return { ok: false, failureCode: 'plan_changed', message: 'The request can no longer be planned the way it was described — nothing was authorized.' };
    }

    // El corazón del binding (sección 5/9/62 adversarial C): si CUALQUIER
    // argumento/tool/condición material cambió desde que el cliente vio el
    // plan (o si el cliente intentó fabricar/alterar el digest), esta
    // comparación falla. Nunca se "arregla" con un mensaje genérico -- es
    // exactamente el caso adversarial que el ticket exige cerrar.
    if (freshPlan.planDigest !== input.planDigest) {
        traceAuth(input.traceId, 'DIGEST_MISMATCH', { freshDigest: freshPlan.planDigest, claimedDigest: input.planDigest });
        return { ok: false, failureCode: 'plan_changed', message: 'The plan has changed since it was shown to you — please review it again before authorizing.' };
    }

    const policy = canAuthorize({
        plan: freshPlan,
        actorUserId: input.actorUserId,
        requestedStepIds: input.requestedStepIds,
        confirm: input.confirm,
        strongConfirm: input.strongConfirm,
    });
    if (!policy.allowed) {
        const primary = policy.issues[0];
        traceAuth(input.traceId, 'POLICY_DENIED', { issues: policy.issues.map((i) => i.code) });
        return { ok: false, failureCode: primary?.code ?? 'not_authorized', message: primary?.message ?? 'Authorization was denied.' };
    }

    const frozenSteps: AgentPlanStep[] = freshPlan.steps.filter((s) => input.requestedStepIds.includes(s.stepId));
    const confirmationLevel = frozenSteps.reduce<string>((max, step) => {
        const order = ['none', 'implicit', 'explicit', 'strong_explicit'];
        return order.indexOf(step.confirmationRequirement) > order.indexOf(max) ? step.confirmationRequirement : max;
    }, 'none');

    const expiresAt = new Date(now.getTime() + AUTHORIZATION_TTL_MS);

    const { data, error } = await supabaseAdmin
        .from('agent_authorizations')
        .insert({
            actor_user_id: input.actorUserId,
            plan_digest: freshPlan.planDigest,
            objective_type: freshPlan.objective.objectiveType,
            frozen_steps: frozenSteps,
            authorized_step_ids: input.requestedStepIds,
            confirmation_level: confirmationLevel,
            status: 'authorized',
            issued_at: now.toISOString(),
            expires_at: expiresAt.toISOString(),
            trace_id: input.traceId ?? null,
        })
        .select('*')
        .single();
    if (error) throw new AppError(error.message, 500);

    traceAuth(input.traceId, 'AUTHORIZED', { authorizationId: data.id, stepCount: frozenSteps.length, expiresAt: data.expires_at });

    return { ok: true, authorization: rowToAuthorization(data) };
}

export async function revokeAuthorization(authorizationId: string, actorUserId: string, traceId?: string): Promise<AgentAuthorization> {
    const { data, error } = await supabaseAdmin.rpc('revoke_agent_authorization', {
        p_authorization_id: authorizationId,
        p_actor_user_id: actorUserId,
    });
    if (error) {
        const status = error.code === '42501' ? 403 : error.code === 'P0002' ? 404 : error.code === 'P0001' ? 409 : 500;
        throw new AppError(error.message, status);
    }
    traceAuth(traceId, 'REVOKED', { authorizationId });
    return rowToAuthorization(data);
}

export async function getAuthorizationById(authorizationId: string, actorUserId: string): Promise<AgentAuthorization | null> {
    const { data, error } = await supabaseAdmin
        .from('agent_authorizations')
        .select('*')
        .eq('id', authorizationId)
        .eq('actor_user_id', actorUserId)
        .maybeSingle();
    if (error) throw new AppError(error.message, 500);
    if (!data) return null;
    return rowToAuthorization(data);
}
