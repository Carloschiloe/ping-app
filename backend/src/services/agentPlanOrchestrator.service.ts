// M-3 — Agent Plan Orchestrator. Composes objective interpretation ->
// planning -> structural validation into one final, immutable `AgentPlan`.
// Deliberately does NOT reuse agentContextBuilder.service.ts/buildAgentContext
// (the read-only Q&A pipeline) — that pipeline's heuristics are tuned for
// answering questions about existing evidence, not for resolving identity/
// entities for a WRITE-shaped request, and coupling to it would mean this
// planner's correctness depends on incidental Q&A behavior it doesn't
// control. Instead this composes the same LOW-LEVEL canonical primitives
// the Q&A pipeline itself is built from (resolvePerson, retrieveCommitments,
// retrieveCommitmentProposals, parseDateFromText, COMMITMENT_TRANSITION_TABLE)
// directly — one interpretation LLM call at most (never a second), same
// cost discipline as runAgent (sección 1 del ticket M-1F, "nunca una
// tercera [llamada] agregada aquí").
import { randomUUID } from 'crypto';
import { LlmObjectiveInterpreter, proposeSemanticContentCandidate, type AgentObjectiveInterpreter, type AgentObjectiveModel } from './agentObjectiveInterpreter.service';
import { planObjective, requiredConfirmationsFor, toClarificationQuestions, type AgentPlannerInput } from './agentPlanner.service';
import { validateAgentPlan } from './agentPlanValidator.service';
import { computePlanDigest } from './agentPlanDigest.service';
import { tracePlan } from '../utils/planTrace';
import type { AgentObjective, AgentPlan, AgentPlanFailureMode, AgentPlanStep } from '../types/agentPlan';
import type { AgentInputEnvelope, ContextReferent } from '../types/agentInput';
import { LOW_CONFIDENCE_ACTION_THRESHOLD } from './agentVoice.service';

export interface AgentPlanOrchestratorInput {
    actorUserId: string;
    input: string;
    conversationId?: string;
    channel?: string;
    locale?: string;
    timezone?: string;
    now?: Date;
    traceId?: string;
    inputEnvelope?: AgentInputEnvelope;
    contextReferents?: ContextReferent[];
}

export interface RunAgentPlanningOptions {
    objectiveInterpreter?: AgentObjectiveInterpreter;
    resolvedObjective?: AgentObjective;
    // Injectable for tests only — proposeSemanticContentCandidate defaults
    // to the real OpenAI provider when omitted. See the enrichment bridge
    // below for what this can and cannot influence.
    semanticContentModel?: AgentObjectiveModel;
}

function riskSummaryFor(steps: AgentPlanStep[]): AgentPlan['riskSummary'] {
    const counts: Record<'low' | 'medium' | 'high', number> = { low: 0, medium: 0, high: 0 };
    for (const step of steps) counts[step.riskLevel] += 1;
    const highest: 'low' | 'medium' | 'high' = counts.high > 0 ? 'high' : counts.medium > 0 ? 'medium' : 'low';
    return { highestRiskLevel: highest, riskLevelCounts: counts };
}

// Sección 27: derivado del AgentPlan canónico, nunca prosa independiente.
function humanReadableSummaryFor(steps: AgentPlanStep[], failureMessage?: string, clarificationQuestions?: string[]): string {
    if (clarificationQuestions && clarificationQuestions.length > 0) {
        return `Necesito una aclaración antes de continuar: ${clarificationQuestions.join(' ')}`;
    }
    if (failureMessage) return failureMessage;
    if (steps.length === 0) return 'No hay ninguna acción que planear para esta solicitud.';
    const lines = steps.map((step, i) => `${i + 1}. ${step.operation}${step.condition.type === 'wait_for_response' ? ' (' + step.condition.description + ')' : ''}`);
    return `Haré esto:\n${lines.join('\n')}`;
}

export async function runAgentPlanning(input: AgentPlanOrchestratorInput, options: RunAgentPlanningOptions = {}): Promise<AgentPlan> {
    const planId = `plan-${randomUUID()}`;
    const now = input.now ?? new Date();
    if (
        input.inputEnvelope?.modality === 'voice'
        && input.inputEnvelope.provenance.confidence !== null
        && input.inputEnvelope.provenance.confidence < LOW_CONFIDENCE_ACTION_THRESHOLD
    ) {
        const objective = {
            objectiveType: 'unsupported' as const,
            targetEntities: { personHints: [], entityHints: [] },
            constraints: {},
            desiredOutcome: input.input,
            timeConstraints: { rawHint: null },
            actor: input.actorUserId,
            sourceUtterance: input.input,
            confidence: input.inputEnvelope.provenance.confidence,
            ambiguities: [{ field: 'transcript', kind: 'blocking' as const, reason: 'La transcripción tiene baja confianza y debe revisarse.' }],
            source: 'deterministic' as const,
        };
        const plan: AgentPlan = {
            planId,
            objective,
            status: 'needs_clarification',
            steps: [],
            requiredConfirmations: [],
            unresolvedInputs: [{ field: 'transcript', question: 'Revisa la transcripción antes de planificar esta acción.' }],
            riskSummary: riskSummaryFor([]),
            canExecute: false,
            createdAt: now.toISOString(),
            validation: { valid: true, issues: [] },
            humanReadableSummary: 'Necesito que revises la transcripción antes de continuar.',
            traceId: input.traceId,
        };
        tracePlan(input.traceId, 'VOICE_LOW_CONFIDENCE_BLOCKED', { status: plan.status, canExecute: false });
        return plan;
    }
    const objectiveInterpreter = options.objectiveInterpreter ?? new LlmObjectiveInterpreter();

    const objective = options.resolvedObjective ?? await objectiveInterpreter.interpret(input.input, {
        actorUserId: input.actorUserId,
        conversationId: input.conversationId,
    });
    tracePlan(input.traceId, 'OBJECTIVE_INTERPRETED', {
        objectiveType: objective.objectiveType, source: objective.source, fallbackReason: objective.fallbackReason,
    });

    // M-6 semantic enrichment BRIDGE (sección: "deterministic first" — the
    // canonical objective/planning pipeline always runs first and normally;
    // this only fires for the narrow residual gap it leaves behind). By the
    // time we get here, `objective` came from EITHER a deterministic
    // fast-path caller (agentTurn.service.ts, via resolvedObjective) OR
    // LlmObjectiveInterpreter above — which itself already tried a full LLM
    // call and, on success, already populated communicateContentCandidate
    // via verbatimMessageHint (mapPayloadToObjective), so this is a true
    // no-op in that case. It only actually calls out when the objective is
    // a communicate_* intent that's otherwise fully resolved (recipient
    // hints known) but has no content candidate — because the utterance has
    // neither a colon nor a quoted span AND no LLM call already ran (the
    // deterministic fast path never calls a model at all). This is a HINT
    // stage only: proposeSemanticContentCandidate's return type is a single
    // `MessageContentCandidate | null` — it cannot carry/alter actor,
    // recipient/person id, conversation id, authorization, tool, or any
    // write state, and the canonical objective/planning pipeline resumes
    // completely unchanged afterward — Core (planObjective ->
    // validateCommunicateContent) still independently locates/validates the
    // candidate exactly as it would any other, so a translated/paraphrased/
    // absent/ambiguous hint is rejected exactly like before. On any
    // provider failure (not configured, timeout, network, invalid JSON,
    // schema-invalid) proposeSemanticContentCandidate fails safely to null
    // — never fabricates a payload — and planObjective below falls through
    // to its existing blocking `messageContent` ambiguity, same as always.
    if (
        (objective.objectiveType === 'communicate_message' || objective.objectiveType === 'communicate_and_wait')
        && objective.targetEntities.personHints.length > 0
        && !objective.communicateContentCandidate
    ) {
        objective.communicateContentCandidate = await proposeSemanticContentCandidate(objective.sourceUtterance, {
            actorUserId: input.actorUserId,
            conversationId: input.conversationId,
        }, { model: options.semanticContentModel });
    }

    const plannerInput: AgentPlannerInput = {
        objective,
        actorUserId: input.actorUserId,
        conversationId: input.conversationId,
        now,
        timezone: input.timezone,
        traceId: input.traceId,
        contextReferents: input.contextReferents,
    };

    const draft = await planObjective(plannerInput);

    let status: AgentPlan['status'];
    let canExecute = false;
    let failureMode: AgentPlanFailureMode | undefined;
    let steps: AgentPlanStep[] = [];
    let validationIssues: AgentPlan['validation'] = { valid: true, issues: [] };

    if (draft.blockingAmbiguities.length > 0) {
        status = 'needs_clarification';
    } else if (draft.failureMode) {
        status = 'draft';
        failureMode = draft.failureMode;
        validationIssues = { valid: false, issues: [{ code: draft.failureMode, message: draft.failureMessage ?? 'Plan could not be built.' }] };
    } else {
        const { validation, correctedSteps } = validateAgentPlan(draft.steps);
        validationIssues = validation;
        if (!validation.valid) {
            status = 'draft';
            failureMode = validation.issues[0]?.code;
        } else {
            status = 'ready_for_authorization';
            canExecute = true;
            steps = correctedSteps;
        }
    }

    const clarificationQuestions = toClarificationQuestions(draft.blockingAmbiguities);
    const humanReadableSummary = humanReadableSummaryFor(
        steps,
        status === 'draft' ? validationIssues.issues[0]?.message : undefined,
        status === 'needs_clarification' ? clarificationQuestions.map((q) => q.question) : undefined,
    );

    const plan: AgentPlan = {
        planId,
        objective,
        status,
        steps,
        requiredConfirmations: requiredConfirmationsFor(steps),
        unresolvedInputs: status === 'needs_clarification' ? clarificationQuestions : [],
        riskSummary: riskSummaryFor(steps),
        canExecute,
        createdAt: now.toISOString(),
        validation: validationIssues,
        failureMode,
        humanReadableSummary,
        traceId: input.traceId,
    };
    // M-4 (sección 5) — sólo tiene sentido autorizar un plan estructuralmente
    // válido; nunca se calcula (ni se expone) un digest para draft/needs_clarification.
    if (status === 'ready_for_authorization') {
        plan.planDigest = computePlanDigest(plan);
    }

    tracePlan(input.traceId, 'PLAN_RESULT', {
        status: plan.status, stepCount: plan.steps.length, toolIds: plan.steps.map((s) => s.toolId),
        riskLevel: plan.riskSummary.highestRiskLevel, failureMode: plan.failureMode,
        canExecute: plan.canExecute, planDigest: plan.planDigest,
    });

    return plan;
}
