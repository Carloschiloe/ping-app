// M-4 — AUTHORIZATION + SAFE EXECUTION. A valid AgentPlan (M-3) is NEVER
// authorization (sección 1 del ticket) — everything here exists to bind a
// specific actor to a specific, frozen plan snapshot before any tool may
// run, and to make every execution attempt idempotent, verifiable, and
// auditable. Core owns permission/confirmation validity/tool identity/
// canonical arguments/execution eligibility/idempotency/post-condition
// truth — never the LLM, never the client.
import type { AgentPlanStep, ConfirmationPolicy, AgentObjectiveType } from './agentPlan';

// ─── Authorization (sección 4/6) ────────────────────────────────────────────
export type AgentAuthorizationStatus = 'pending' | 'authorized' | 'consumed' | 'expired' | 'revoked';

export interface AgentAuthorization {
    id: string;
    actorUserId: string;
    planDigest: string;
    objectiveType: AgentObjectiveType;
    frozenSteps: AgentPlanStep[];
    authorizedStepIds: string[];
    confirmationLevel: ConfirmationPolicy;
    status: AgentAuthorizationStatus;
    issuedAt: string;
    expiresAt: string;
    consumedAt: string | null;
    revokedAt: string | null;
    traceId: string | null;
}

// ─── Execution (sección 12/13) ──────────────────────────────────────────────
export type AgentExecutionStepStatus =
    | 'pending'
    | 'running'
    | 'succeeded'
    | 'failed_retryable'
    | 'failed_terminal'
    | 'skipped_condition'
    | 'blocked'
    | 'cancelled';

export interface AgentExecutionStepRecord {
    id: string;
    authorizationId: string;
    actorUserId: string;
    stepId: string;
    toolId: string;
    toolVersion: number;
    idempotencyKey: string;
    status: AgentExecutionStepStatus;
    resultRef: Record<string, unknown> | null;
    failureCode: AgentExecutionFailureCode | null;
    retryCount: number;
    startedAt: string | null;
    completedAt: string | null;
    traceId: string | null;
}

// ─── Failure taxonomy (sección 50) — known classes only. ───────────────────
export type AgentExecutionFailureCode =
    | 'authorization_missing'
    | 'authorization_expired'
    | 'authorization_revoked'
    | 'authorization_mismatch'
    | 'plan_changed'
    | 'tool_not_executable'
    | 'not_authorized'
    | 'invalid_lifecycle'
    | 'entity_changed'
    | 'condition_not_met'
    | 'idempotent_replay'
    | 'verification_failed'
    | 'transient_failure'
    | 'policy_blocked';

// ─── Result contract (sección 27) — never hallucinated prose-only. ─────────
export type AgentExecutionOverallStatus = 'done' | 'partially_done' | 'waiting' | 'blocked' | 'needs_reauthorization' | 'failed';

export interface AgentExecutionEntityRef {
    entityType: string;
    entityId: string;
}

export interface AgentExecutionStepResult {
    stepId: string;
    toolId: string;
    status: AgentExecutionStepStatus;
    failureCode?: AgentExecutionFailureCode;
    createdEntityRefs: AgentExecutionEntityRef[];
    updatedEntityRefs: AgentExecutionEntityRef[];
    messageSent: boolean;
    verified: boolean;
    idempotentReplay: boolean;
    // M-4 STAGING PUBLICATION (sección 7) — presente sólo cuando
    // status==='skipped_condition': la descripción congelada de la
    // condición pendiente (ej. "esperar respuesta de Alejandra"), para que
    // "condición aún no cumplida" sea distinguible de "paso descartado
    // permanentemente" sin depender de una consulta directa a frozen_steps.
    waitingOn?: string;
}

export interface AgentExecutionResult {
    authorizationId: string;
    status: AgentExecutionOverallStatus;
    executedSteps: AgentExecutionStepResult[];
    failedSteps: AgentExecutionStepResult[];
    waitingSteps: AgentExecutionStepResult[];
    createdEntityRefs: AgentExecutionEntityRef[];
    updatedEntityRefs: AgentExecutionEntityRef[];
    messagesSent: number;
    requiresFurtherAuthorization: boolean;
    humanReadableSummary: string;
}

// ─── Tool executor contract (sección 14) ───────────────────────────────────
export interface ToolExecutionContext {
    actorUserId: string;
    traceId?: string;
    idempotencyKey: string;
}

export interface ToolExecutionOutcome {
    status: 'succeeded' | 'failed_retryable' | 'failed_terminal' | 'blocked';
    failureCode?: AgentExecutionFailureCode;
    resultRef?: Record<string, unknown>;
    createdEntityRefs?: AgentExecutionEntityRef[];
    updatedEntityRefs?: AgentExecutionEntityRef[];
    messageSent?: boolean;
    verified: boolean;
}

export interface ToolExecutor {
    toolId: string;
    version: number;
    // Sección 17/18: revalida el estado canónico ACTUAL antes de mutar --
    // nunca asume que el mundo sigue como en el momento de planificación.
    execute(context: ToolExecutionContext, args: Record<string, unknown>): Promise<ToolExecutionOutcome>;
}
