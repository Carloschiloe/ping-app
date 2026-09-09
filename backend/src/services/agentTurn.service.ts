// M-6 — Agent Turn Orchestrator. Single unified entry point.
// Core decides deterministically: read-only -> response, action -> plan.
// Mobile MUST NOT contain semantic heuristics — the `kind` discriminator on
// AgentTurnResult is the only thing mobile ever branches on.
//
// Routing signal: `context.interpretation.isWriteActionRequest` (computed
// once, inside the single buildAgentContext call below) — the same signal
// the read-only /agent/respond pipeline already uses to flag "this Agent
// can't do that" (write_action_not_supported). Extended in
// agentInputInterpreter.service.ts to cover the verb families the M-3
// planner independently supports (reschedule/complete/accept/reject/
// communicate/personal-reminder), so routing here never depends on a
// narrower vocabulary than what the planner can actually do.
//
// Cost discipline (sección 24 del ticket M-6): buildAgentContext runs
// EXACTLY ONCE per turn, regardless of kind. The read-only ("response")
// branch reuses that same context via synthesizeAgentResponse directly
// (never calls runAgent, which would rebuild context a second time). The
// write-action ("plan") branch delegates entirely to runAgentPlanning,
// which resolves its own objective/entities against live canonical data —
// this is the ONE place a second retrieval round is unavoidable, because
// planning needs write-shaped entity resolution buildAgentContext's
// read-only heuristics were never tuned for (see the header comment of
// agentPlanOrchestrator.service.ts).
import { runAgentPlanning } from './agentPlanOrchestrator.service';
import { buildAgentContext } from './agentContextBuilder.service';
import { synthesizeAgentResponse } from './agentResponseSynthesizer.service';
import { toPublicAgentResponse } from '../types/agent';
import { toPublicAgentPlanResponse } from '../types/agentPlan';
import { AUTHORIZATION_TTL_MS } from './agentAuthorization.service';
import type { AgentPlan, AgentPlanStep } from '../types/agentPlan';
import type {
    AgentTurnInput,
    AgentTurnResult,
    AgentPlanPresentation,
    AgentPlanStepPresentation,
} from '../types/agentTurn';
import { resolveAgentRequestInput } from './agentInputEnvelope.service';
import { generateTraceId } from '../utils/overdueTrace';
import { tracePlan } from '../utils/planTrace';
import { DeterministicInputInterpreter } from './agentInputInterpreter.service';
import { DeterministicObjectiveInterpreter } from './agentObjectiveInterpreter.service';

export interface RunAgentTurnOptions {
    now?: Date;
}

// Sección 20/34 del ticket — ejemplos honestos de lo que SÍ existe hoy,
// nunca una lista inventada. Mismo contrato conceptual en ambas ramas que
// pueden producir kind='unsupported' (capability gap de lectura, o un
// AgentPlan que nunca llegó a ready_for_authorization).
const SUPPORTED_EXAMPLES = [
    '¿Qué tengo hoy?',
    '¿Qué estoy esperando de Alejandra?',
    'Dile a Alejandra que llegaré tarde.',
    'Agenda entrenar mañana a las 8.',
    'Mueve Entrenar al viernes.',
    'Completa Entrenar.',
];

export async function runAgentTurn(
    input: AgentTurnInput,
    options: RunAgentTurnOptions = {}
): Promise<AgentTurnResult> {
    const now = options.now ?? new Date();
    const traceId = input.traceId ?? generateTraceId();

    // Resolve input envelope (handles voiceInputToken binding, context signals, etc.)
    const resolved = resolveAgentRequestInput({
        actorUserId: input.actorUserId,
        body: {
            input: input.input,
            voiceInputToken: input.voiceInputToken,
            conversationId: input.conversationId,
            channel: input.channel,
            locale: input.locale,
            timezone: input.timezone,
        },
        traceId,
    });
    const envelope = resolved.envelope;
    const referents = resolved.referents;
    const content = envelope.content ?? '';
    const conversationId = envelope.conversationId ?? undefined;
    const locale = envelope.locale ?? undefined;
    const timezone = envelope.timeZone ?? undefined;

    const surfaceToChannel = (surface: string): string => {
        if (surface.startsWith('mobile')) return 'mobile';
        if (surface === 'web') return 'web';
        if (surface === 'voice') return 'voice';
        if (surface === 'desktop') return 'desktop';
        if (surface === 'tablet') return 'tablet';
        if (surface === 'car') return 'car';
        if (surface === 'device') return 'device';
        return 'mobile';
    };
    const channel = surfaceToChannel(envelope.surface);

    // A deterministic action can enter the planner directly. Reusing the
    // resolved objective avoids both an unnecessary read-context retrieval
    // and a second provider/model interpretation. Unknown action language
    // still falls through to the general context + objective pipeline.
    const deterministicRouting = await new DeterministicInputInterpreter().interpret(content);
    const deterministicObjective = deterministicRouting.isWriteActionRequest
        ? await new DeterministicObjectiveInterpreter().interpret(content, {
            actorUserId: input.actorUserId,
            conversationId,
        })
        : null;
    if (deterministicRouting.isWriteActionRequest && deterministicObjective && deterministicObjective.objectiveType !== 'unsupported') {
        const plan = await runAgentPlanning({
            actorUserId: input.actorUserId,
            input: content,
            conversationId,
            channel,
            locale,
            timezone,
            now,
            traceId,
            inputEnvelope: envelope,
            contextReferents: referents,
        }, { resolvedObjective: deterministicObjective });
        return routePlanningResult(plan, { locale, timezone, now, traceId });
    }

    // Single buildAgentContext call — both the routing decision AND (when
    // the turn resolves to a response) the synthesis input come from this
    // one context. Never rebuilt.
    const context = await buildAgentContext({
        actorUserId: input.actorUserId,
        input: content,
        conversationId,
        channel,
        locale,
        timezone,
        now: now.toISOString(),
        traceId,
    }, {});

    // `isWriteActionRequest` itself lives on the internal `Interpretation`
    // type, never propagated onto the public `AgentContext` — the
    // externally-visible signal it produces is exactly this capability gap
    // (agentContextBuilder.service.ts always adds it when the interpreter
    // flagged a write action, sección 20/M-1G.1).
    const isWriteActionRequest = context.capabilityGaps.some((g) => g.type === 'write_action_not_supported');

    tracePlan(traceId, 'TURN_CONTEXT_BUILT', {
        intentType: context.intent.type,
        intentConfidence: context.intent.confidence,
        wantsOverdueFocus: context.wantsOverdueFocus,
        isWriteActionRequest,
        explicitPersonMention: context.explicitPersonMention,
    });

    // 1) Ambiguity in the READ pipeline (unresolved person/time/topic) always
    // wins first — there is nothing a plan or a response could safely say
    // yet.
    if (context.needsClarification) {
        const clarification = context.clarification;
        return {
            kind: 'clarification',
            questions: clarification ? [{
                field: clarification.reason,
                question: clarification.reason,
                options: clarification.candidates?.map((cand) => ({ id: cand.id, label: cand.displayName })),
            }] : [],
        };
    }

    // 2) Core routing decision: write-shaped requests go to the M-3 planning
    // pipeline (never executes — /turn is a dry-run, same as /agent/plan).
    // Read-only requests reuse the context already built above.
    if (isWriteActionRequest) {
        const plan = await runAgentPlanning({
            actorUserId: input.actorUserId,
            input: content,
            conversationId,
            channel,
            locale,
            timezone,
            now,
            traceId,
            inputEnvelope: envelope,
            contextReferents: referents,
        });

        return routePlanningResult(plan, { locale, timezone, now, traceId });

        // status === 'draft': structurally blocked or genuinely unsupported —
        // never a plan a client could confirm, and nothing left to ask
        // (needs_clarification already handled above) — the honest kind is
        // 'unsupported', with the SAME failure message already computed by
        // the planner (never independently re-worded here).
    }

    // 3) Read-only request. Any capability gap OTHER than
    // 'write_action_not_supported' (which only applies to the branch above)
    // is a genuine "can't do that" — e.g. transcription/attachment search
    // without a conversation scope.
    const readOnlyGaps = context.capabilityGaps.filter((g) => g.type !== 'write_action_not_supported');
    if (readOnlyGaps.length > 0) {
        return {
            kind: 'unsupported',
            reason: readOnlyGaps[0].reason,
            supportedExamples: SUPPORTED_EXAMPLES,
        };
    }

    const response = await synthesizeAgentResponse(
        { input: content, context, locale, channel, traceId },
        {},
    );
    return { kind: 'response', response: toPublicAgentResponse(response) };
}

function routePlanningResult(
    plan: AgentPlan,
    context: { locale?: string; timezone?: string; now: Date; traceId: string },
): AgentTurnResult {
    tracePlan(context.traceId, 'TURN_PLAN_RESULT', { status: plan.status, failureMode: plan.failureMode });
    if (plan.status === 'needs_clarification') {
        return { kind: 'clarification', questions: plan.unresolvedInputs };
    }
    if (plan.status === 'ready_for_authorization') {
        return {
            kind: 'plan',
            plan: toPublicAgentPlanResponse(plan),
            presentation: buildPlanPresentation(plan, context),
        };
    }
    return {
        kind: 'unsupported',
        reason: plan.humanReadableSummary,
        supportedExamples: SUPPORTED_EXAMPLES,
    };
}

// ─── Plan Presentation Projection (Core-owned) ─────────────────────────────
// Derives human-readable confirmation copy strictly from the FROZEN plan
// (steps' operation/expectedEffect/arguments) — never an independent LLM
// call, never mobile-side guessing. `arguments` is validated against a
// `.strict()` zod schema per tool (toolRegistry.service.ts) and therefore
// NEVER carries a display name (only IDs) — `operation`/`expectedEffect`
// are the Core-generated, deterministic strings that already embed the
// resolved canonical name/title (see agentPlanner.service.ts), so those are
// the (frozen, non-LLM) source for any human-readable label this file needs
// that isn't already a plain scalar on `arguments`.
export function buildPlanPresentation(
    plan: AgentPlan,
    context: { locale?: string; timezone?: string; now?: Date } = {},
): AgentPlanPresentation {
    if (plan.status !== 'ready_for_authorization' || !plan.planDigest) {
        throw new Error('Only a ready_for_authorization plan can be presented for confirmation.');
    }
    const steps = plan.steps;
    const stepPresentations = steps.map((step) => buildStepPresentation(step, context));
    const primary = stepPresentations[0];

    return {
        headline: buildHeadline(stepPresentations),
        summary: buildSummary(steps),
        effectDescription: buildEffectDescription(steps),
        targetLabel: primary?.targetLabel,
        dateLabel: primary?.dateLabel,
        riskLabel: buildRiskLabel(plan.riskSummary.highestRiskLevel),
        confirmationLabel: primary?.confirmationLabel ?? 'Confirmar',
        cancelLabel: primary?.cancelLabel ?? 'Cancelar',
        stepPresentations,
        requiresExplicitConfirmation: stepPresentations.some((s) => s.requiresExplicitConfirmation),
        expiresAt: new Date(new Date(plan.createdAt).getTime() + AUTHORIZATION_TTL_MS).toISOString(),
        planId: plan.planId,
        planDigest: plan.planDigest ?? '',
        objectiveType: plan.objective.objectiveType,
    };
}

function extractQuoted(text: string): string | undefined {
    return text.match(/"([^"]+)"/)?.[1];
}

function extractRecipientFromOperation(operation: string): string | undefined {
    return operation.match(/^Enviar mensaje a (.+)$/)?.[1];
}

function extractProposalRecipient(operation: string): string | undefined {
    return operation.match(/^Proponer compromiso "[^"]+" a (.+)$/)?.[1];
}

export function buildStepPresentation(
    step: AgentPlanStep,
    context: { locale?: string; timezone?: string; now?: Date } = {},
): AgentPlanStepPresentation {
    const toolId = step.toolId;
    const args = step.arguments as Record<string, unknown>;
    const shared = {
        requiresExplicitConfirmation: step.confirmationRequirement !== 'none' && step.confirmationRequirement !== 'implicit',
        phase: step.condition.type === 'always' ? 'immediate' as const : 'conditional' as const,
        conditionLabel: step.condition.type === 'always' ? undefined : step.condition.description,
    };

    switch (toolId) {
        case 'send_message': {
            const recipient = extractRecipientFromOperation(step.operation);
            const message = typeof args.content === 'string' ? args.content : '';
            return {
                stepId: step.stepId, toolId,
                headline: recipient ? `Enviar mensaje a ${recipient}` : 'Enviar mensaje',
                effectDescription: `Se enviará: "${message}"`,
                targetLabel: recipient,
                contentPreview: message,
                confirmationLabel: 'Enviar', cancelLabel: 'Cancelar',
                ...shared,
            };
        }
        case 'create_commitment': {
            const title = typeof args.title === 'string' ? args.title : 'un compromiso';
            const dueAt = typeof args.dueAt === 'string' ? formatDueAt(args.dueAt, context) : 'sin fecha';
            // Product rule (sección 8/37, unchanged since M-3): a commitment
            // assigned to someone other than the actor is NEVER an
            // already-confirmed commitment — it is always a proposal
            // pending acceptance (createCommitmentExecutor.ts derives the
            // exact same fork from this exact same field at execution
            // time). This presentation must never claim a stronger outcome
            // than what execution will actually do.
            const isProposal = typeof args.responsiblePersonId === 'string';
            const recipient = isProposal ? extractProposalRecipient(step.operation) : undefined;
            return {
                stepId: step.stepId, toolId,
                headline: isProposal
                    ? `Proponer "${title}"${recipient ? ` a ${recipient}` : ''}`
                    : `Crear "${title}"`,
                effectDescription: isProposal
                    ? `Se propondrá el compromiso "${title}"${recipient ? ` a ${recipient}` : ''} para ${dueAt}, pendiente de aceptación.`
                    : `Se creará el compromiso "${title}" para ${dueAt}.`,
                targetLabel: title,
                recipientLabel: recipient,
                dateLabel: dueAt,
                confirmationLabel: isProposal ? 'Proponer' : 'Crear', cancelLabel: 'Cancelar',
                ...shared,
            };
        }
        case 'respond_to_proposal': {
            const title = extractQuoted(step.operation) ?? 'la propuesta';
            const decision = args.decision;
            const verb = decision === 'approve' ? 'Aceptar' : decision === 'reject' ? 'Rechazar' : 'Contraproponer';
            const effect = decision === 'approve'
                ? `Aceptarás la propuesta "${title}".`
                : decision === 'reject'
                    ? `Rechazarás la propuesta "${title}".`
                    : `Enviarás una nueva fecha propuesta para "${title}".`;
            return {
                stepId: step.stepId, toolId,
                headline: `${verb} "${title}"`,
                effectDescription: effect,
                targetLabel: title,
                confirmationLabel: verb, cancelLabel: 'Cancelar',
                ...shared,
            };
        }
        case 'reschedule_commitment': {
            const title = extractQuoted(step.operation) ?? 'el compromiso';
            const newDueAt = typeof args.newDueAt === 'string' ? formatDueAt(args.newDueAt, context) : 'la nueva fecha';
            return {
                stepId: step.stepId, toolId,
                headline: `Mover "${title}"`,
                effectDescription: `Se moverá "${title}" a ${newDueAt}.`,
                targetLabel: title,
                dateLabel: newDueAt,
                confirmationLabel: 'Mover', cancelLabel: 'Cancelar',
                ...shared,
            };
        }
        case 'complete_commitment': {
            const title = extractQuoted(step.operation) ?? 'el compromiso';
            return {
                stepId: step.stepId, toolId,
                headline: `Completar "${title}"`,
                effectDescription: `Marcarás "${title}" como completado.`,
                targetLabel: title,
                confirmationLabel: 'Completar', cancelLabel: 'Cancelar',
                ...shared,
            };
        }
        default: {
            return {
                stepId: step.stepId, toolId,
                headline: step.operation,
                effectDescription: step.expectedEffect,
                confirmationLabel: 'Confirmar', cancelLabel: 'Cancelar',
                requiresExplicitConfirmation: step.confirmationRequirement !== 'none',
                phase: step.condition.type === 'always' ? 'immediate' : 'conditional',
                conditionLabel: step.condition.type === 'always' ? undefined : step.condition.description,
            };
        }
    }
}

function buildHeadline(stepPresentations: AgentPlanStepPresentation[]): string {
    const primary = stepPresentations[0];
    if (!primary) return 'Sin acciones planificadas';
    switch (primary.toolId) {
        case 'send_message':
            return primary.targetLabel ? `Enviaré un mensaje a ${primary.targetLabel}` : 'Enviaré un mensaje';
        case 'create_commitment':
            return primary.confirmationLabel === 'Proponer'
                ? `Propondré "${primary.targetLabel}"`
                : `Crearé "${primary.targetLabel}"`;
        default:
            return primary.headline;
    }
}

function buildSummary(steps: AgentPlanStep[]): string {
    if (steps.length === 0) return 'No hay ninguna acción que planear.';
    if (steps.length === 1) return steps[0].expectedEffect;
    return steps
        .map((s, i) => `${i + 1}. ${s.operation}${s.condition.type === 'wait_for_response' ? ` (${s.condition.description})` : ''}`)
        .join('\n');
}

function buildEffectDescription(steps: AgentPlanStep[]): string {
    return steps.map((s) => s.expectedEffect).join('\n');
}

function formatDueAt(iso: string, context: { locale?: string; timezone?: string; now?: Date }): string {
    const date = new Date(iso);
    if (isNaN(date.getTime())) return iso;
    const now = context.now ?? new Date();
    const locale = context.locale || 'es-CL';
    const timezone = context.timezone || 'UTC';
    const localDayNumber = (value: Date) => {
        const parts = new Intl.DateTimeFormat('en-US', {
            timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit',
        }).formatToParts(value);
        const part = (type: Intl.DateTimeFormatPartTypes) => Number(parts.find((item) => item.type === type)?.value);
        return Date.UTC(part('year'), part('month') - 1, part('day'));
    };
    const dateDay = localDayNumber(date);
    const nowDay = localDayNumber(now);
    const diffDays = Math.round((dateDay - nowDay) / (24 * 60 * 60 * 1000));
    const timeStr = new Intl.DateTimeFormat(locale, {
        timeZone: timezone, hour: '2-digit', minute: '2-digit', hour12: false,
    }).format(date);
    if (diffDays === 0) return `hoy a las ${timeStr}`;
    if (diffDays === 1) return `mañana a las ${timeStr}`;
    if (diffDays === -1) return `ayer a las ${timeStr}`;
    return `${new Intl.DateTimeFormat(locale, { timeZone: timezone, weekday: 'short', day: 'numeric', month: 'short' }).format(date)} a las ${timeStr}`;
}

function buildRiskLabel(riskLevel: 'low' | 'medium' | 'high'): string {
    switch (riskLevel) {
        case 'low': return 'Acción reversible';
        case 'medium': return 'Requiere confirmación explícita';
        case 'high': return 'Acción de alto impacto — confirma con atención';
    }
}
