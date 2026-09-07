// M-4 — Authorization Policy Engine (sección 48). Deterministic
// `canAuthorize(plan, actorUserId, requestedStepIds, confirm)` — the single
// gate a plan must pass before Core will ever persist an AgentAuthorization.
// Never invoked by the LLM; never trusts client-supplied risk/confirmation
// claims (sección 1/20 del ticket M-3, still true here: registry wins).
import { getToolContract } from './toolRegistry.service';
import type { AgentPlan } from '../types/agentPlan';
import type { AgentExecutionFailureCode } from '../types/agentExecution';

export interface AuthorizationPolicyIssue {
    code: AgentExecutionFailureCode;
    message: string;
    stepId?: string;
}

export interface AuthorizationPolicyResult {
    allowed: boolean;
    issues: AuthorizationPolicyIssue[];
}

export interface CanAuthorizeInput {
    plan: AgentPlan;
    actorUserId: string;
    requestedStepIds: string[];
    confirm: boolean;
    strongConfirm?: boolean;
}

export function canAuthorize(input: CanAuthorizeInput): AuthorizationPolicyResult {
    const { plan, actorUserId, requestedStepIds, confirm } = input;
    const issues: AuthorizationPolicyIssue[] = [];

    // Sección 1: un plan válido nunca es, por sí mismo, autorización.
    if (plan.status !== 'ready_for_authorization' || !plan.canExecute) {
        issues.push({ code: 'tool_not_executable', message: 'Plan is not in a state that can be authorized (must be ready_for_authorization).' });
        return { allowed: false, issues };
    }

    // El actor que autoriza debe ser el mismo actor para el que el plan fue
    // construido -- nunca se autoriza un plan calculado para otra persona
    // (sección 19/74: nunca confía en identidad implícita del cliente).
    if (plan.objective.actor !== actorUserId) {
        issues.push({ code: 'not_authorized', message: 'Plan was not built for this actor.' });
        return { allowed: false, issues };
    }

    if (requestedStepIds.length === 0) {
        issues.push({ code: 'tool_not_executable', message: 'No steps were requested for authorization.' });
        return { allowed: false, issues };
    }

    const knownStepIds = new Set(plan.steps.map((s) => s.stepId));
    for (const stepId of requestedStepIds) {
        if (!knownStepIds.has(stepId)) {
            issues.push({ code: 'plan_changed', message: `Requested step "${stepId}" does not exist in this plan.`, stepId });
        }
    }
    if (issues.length > 0) return { allowed: false, issues };

    const requestedSteps = plan.steps.filter((s) => requestedStepIds.includes(s.stepId));

    for (const step of requestedSteps) {
        const contract = getToolContract(step.toolId);
        // Sección 3/10: nunca ejecutable un tool desconocido o no habilitado
        // explícitamente -- M-3 sólo deja WRITE tools como 'planned_future';
        // sólo M-4, tool por tool, los pasa a 'available_now' (sección 49,
        // "no global switch" -- nombre real ya definido en types/agentPlan.ts,
        // el ticket M-4 lo llama "executable_now" en prosa pero es el MISMO
        // concepto que M-3 ya modeló, nunca un segundo enum paralelo).
        if (!contract || contract.availability !== 'available_now') {
            issues.push({ code: 'tool_not_executable', message: `Tool "${step.toolId}" is not currently executable.`, stepId: step.stepId });
            continue;
        }

        // Sección 7/8/37 — confirmación real, nunca asumida:
        if (contract.confirmationPolicy === 'explicit' && !confirm) {
            issues.push({ code: 'not_authorized', message: `Step "${step.stepId}" requires explicit confirmation.`, stepId: step.stepId });
        }
        if (contract.confirmationPolicy === 'strong_explicit' && !input.strongConfirm) {
            issues.push({ code: 'not_authorized', message: `Step "${step.stepId}" requires strong explicit confirmation.`, stepId: step.stepId });
        }
    }

    return { allowed: issues.length === 0, issues };
}
