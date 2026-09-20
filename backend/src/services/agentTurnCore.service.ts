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
import { runAgentPlanning, resolveDeterministicRouting } from './agentPlanOrchestrator.service';
import { buildAgentContext } from './agentContextBuilder.service';
import { synthesizeAgentResponse, realizeAgentClarification } from './agentResponseSynthesizer.service';
import { detectAgentLanguage } from '../utils/agentLanguage';
import { toPublicAgentResponse } from '../types/agent';
import { toPublicAgentPlanResponse } from '../types/agentPlan';
import { AUTHORIZATION_TTL_MS } from './agentAuthorization.service';
import { LlmObjectiveInterpreter, extractTimeHint } from './agentObjectiveInterpreter.service';
import { resolveTimeZone } from './date-parser.service';
import type { AgentPlan, AgentPlanStep, AgentObjective } from '../types/agentPlan';
import type {
    AgentTurnInput,
    AgentTurnResult,
    AgentPlanPresentation,
    AgentPlanStepPresentation,
} from '../types/agentTurn';
import { resolveAgentRequestInput } from './agentInputEnvelope.service';
import { generateTraceId } from '../utils/overdueTrace';
import { tracePlan } from '../utils/planTrace';
import { traceAgentDevice, hashForTrace, getAgentDeviceDebugMetadata } from '../utils/agentDeviceTrace';
// M-7B — first controlled live wiring of dialogue state, scoped to
// create_commitment slot continuation only (tmp/PING-M7-DIALOGUE-STATE-ADR.md,
// tmp/PING-M7-JARVIS-ARCHITECTURE-GAP-AUDIT.md). Core still owns objective
// normalization/planning/authorization/execution/verification unchanged --
// this only decides WHICH objective enters the existing, unmodified
// runAgentPlanning pipeline.
import { AgentDialogueStateService, buildDialogueScopeKey } from './agentDialogueState.service';
import {
    classifyContinuation,
    reconcileContinuationObjective,
    isContinuationEligibleObjectiveType,
    isDialogueTrackedObjectiveType,
    isPendingClarificationAnswerable,
    tryAnswerPendingClarification,
    classifyPlanCorrection,
    buildPlanDateCorrection,
} from './agentDialogueContinuation.service';

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
    // M-7B — dialogue scope key for this turn, per ADR Q4: conversationId
    // when present, else 'agent:' + surface. Computed once, used by both
    // write-action branches below.
    const dialogueScopeKey = buildDialogueScopeKey({ conversationId, surface: envelope.surface });

    // [PING_DEVICE_TRACE] TEMPORARY (M-7B PHYSICAL FAILURE #4) -- see
    // utils/agentDeviceTrace.ts for full rationale/removal plan. No-op
    // outside staging.
    traceAgentDevice(traceId, 'AGENT_DEVICE_TRACE_START', {
        actorHash: hashForTrace(input.actorUserId),
        surface: envelope.surface,
        hasConversationId: !!conversationId,
        conversationIdHash: conversationId ? hashForTrace(conversationId) : null,
        channel,
    });
    traceAgentDevice(traceId, 'AGENT_DIALOGUE_SCOPE', { dialogueScopeKey });

    // PING — M-7B PHYSICAL FAILURE #2 FIX: dialogue-first routing (ADR Q10,
    // "hybrid insertion, structured not textual"). Before ANY isolated-turn
    // classification (deterministic routing, buildAgentContext's read
    // pipeline, or the LLM write-action path below) commits to treating this
    // turn as a standalone utterance, check whether an open dialogue
    // objective for this scope is waiting on a specific answer. Physical
    // proof this was missing: "Pedro González" answering "¿A cuál Pedro te
    // refieres?" was classified as an independent person_query and produced
    // a source-backed read response instead of completing the open
    // "llamar a Pedro" reminder. This is the ONE place that decision is
    // made -- runAgentTurn is the sole owner of "does this new turn first
    // belong to an active dialogue", never scattered into the response
    // synthesizer, planner, or executor, none of which see dialogue state at
    // all. tryAnswerPendingClarification never trusts the raw text as
    // identity by itself -- it runs the SAME live resolvePerson() Core
    // already uses everywhere else; escape detection reuses the existing
    // deterministic intent classifier (see looksLikeExplicitEscape), never a
    // new regex family for names.
    const dialogueService = new AgentDialogueStateService();
    const existingDialogueState = dialogueService.getSnapshot(input.actorUserId, dialogueScopeKey);
    traceAgentDevice(traceId, 'AGENT_DIALOGUE_STATE_BEFORE', {
        stateFound: !!existingDialogueState,
        lifecycle: existingDialogueState?.lifecycle ?? null,
        openObjectiveType: existingDialogueState?.openObjective?.objectiveType ?? null,
        pendingClarificationField: existingDialogueState?.pendingClarification?.field ?? null,
        version: existingDialogueState?.version ?? null,
        lastTurnSequence: existingDialogueState?.lastTurnSequence ?? null,
    });
    const pendingAnswerable = isPendingClarificationAnswerable(existingDialogueState);
    traceAgentDevice(traceId, 'AGENT_PENDING_CLARIFICATION_CHECK', { pendingAnswerable });
    if (pendingAnswerable) {
        const pendingResult = await tryAnswerPendingClarification(
            existingDialogueState!, content, input.actorUserId, conversationId,
        );
        tracePlan(traceId, 'PENDING_CLARIFICATION_ANSWER_ATTEMPTED', {
            outcome: pendingResult.outcome, dialogueScopeKey,
        });
        traceAgentDevice(traceId, 'AGENT_PENDING_CLARIFICATION_RESULT', {
            outcome: pendingResult.outcome,
            candidateCount: pendingResult.outcome === 'multi_match' ? pendingResult.candidates.length
                : pendingResult.outcome === 'multi_match_entity' ? pendingResult.candidates.length : null,
        });

        if (pendingResult.outcome === 'resolved' || pendingResult.outcome === 'resolved_entity') {
            // TASK 7 -- the planner (never this module) decides whether the
            // now-completed objective is fully specified or still needs
            // another clarification (e.g. a missing date). Reuses the exact
            // same runWriteActionTurn/runAgentPlanning pipeline every other
            // write turn already goes through -- no second execution path.
            traceAgentDevice(traceId, 'AGENT_ROUTING_DECISION', { path: 'pending_clarification_resolved', dialogueScopeKey });
            return finalizeAgentTurn(await runWriteActionTurn({
                actorUserId: input.actorUserId, content, conversationId, channel, locale, timezone,
                now, traceId, envelope, referents, dialogueScopeKey, newTurnObjective: pendingResult.reconciledObjective,
            }), traceId);
        }
        // GENERALIZATION (M-7): the targetEntity re-ask is built directly
        // rather than through realizeAgentClarification, which owns ONLY the
        // read-domain ClarificationReason enum (person_ambiguous/
        // time_ambiguous/topic_too_broad) -- targetEntity is a write-domain
        // planner field (see agentPlanner.service.ts's own `field:
        // 'targetEntity'` ambiguities), a distinct concept sharing no enum
        // with the read-side reasons. Wording mirrors the planner's own
        // existing phrasing ("Hay más de un resultado para...") for
        // consistency, never a newly-invented tone.
        if (pendingResult.outcome === 'zero_match' || pendingResult.outcome === 'multi_match'
            || pendingResult.outcome === 'multi_match_entity') {
            // TASK 5 -- never an arbitrary selection. Re-ask, using the exact
            // same natural-language realization the rest of M-7B PHYSICAL
            // FAILURE #1's fix already established, never a raw reason code.
            traceAgentDevice(traceId, 'AGENT_ROUTING_DECISION', { path: `pending_clarification_${pendingResult.outcome}`, dialogueScopeKey });
            const language = detectAgentLanguage(content, locale);
            const isEntityField = existingDialogueState!.pendingClarification?.field === 'targetEntity';
            let answer: string;
            let options: { id: string; label: string }[] | undefined;
            if (isEntityField) {
                const entityCandidates = pendingResult.outcome === 'multi_match_entity' ? pendingResult.candidates : [];
                options = entityCandidates.map((c) => ({ id: c.id, label: `${c.title} (${c.dueAt ?? 'sin fecha'})` }));
                answer = entityCandidates.length > 0
                    ? (language === 'es'
                        ? `Hay más de un resultado. ¿Cuál compromiso? ${entityCandidates.map((c) => c.title).join(', ')}.`
                        : `There's more than one match. Which commitment? ${entityCandidates.map((c) => c.title).join(', ')}.`)
                    : (language === 'es'
                        ? 'No encontré ningún compromiso o propuesta que coincida. ¿Puedes darme más detalle?'
                        : 'I didn\'t find a matching commitment or proposal. Could you give me more detail?');
            } else {
                const clarification = pendingResult.outcome === 'multi_match'
                    ? { reason: 'person_ambiguous' as const, candidates: pendingResult.candidates }
                    : { reason: 'person_ambiguous' as const, candidates: [] };
                const realized = realizeAgentClarification(clarification, language);
                answer = realized.answer;
                options = realized.followUp.options;
            }
            const field = isEntityField ? 'targetEntity' : 'person_ambiguous';
            const turnId = `${traceId}:${Date.now()}`;
            const nextTurnSequence = (existingDialogueState!.lastTurnSequence ?? 0) + 1;
            dialogueService.setPendingClarification({
                actorUserId: input.actorUserId, dialogueScopeKey,
                clarification: { field, question: answer, options },
                turnId, turnSequence: nextTurnSequence,
            });
            traceAgentDevice(traceId, 'AGENT_RESPONSE_KIND', { kind: 'clarification', field });
            traceAgentDevice(traceId, 'AGENT_DEVICE_TRACE_END', {});
            return finalizeAgentTurn({
                kind: 'clarification',
                questions: [{ field, question: answer, options }],
            }, traceId);
        }
        if (pendingResult.newObjective) {
            // An explicit complete objective supersedes the pending dialogue
            // before entering the ordinary planner path. Reset preserves the
            // scope's monotonic bookkeeping while removing stale slots and
            // referents; the new objective is then planned as a fresh turn.
            dialogueService.reset({ actorUserId: input.actorUserId, dialogueScopeKey });
            traceAgentDevice(traceId, 'AGENT_ROUTING_DECISION', { path: 'explicit_new_objective_escape', dialogueScopeKey });
            return finalizeAgentTurn(await runWriteActionTurn({
                actorUserId: input.actorUserId, content, conversationId, channel, locale, timezone,
                now, traceId, envelope, referents, dialogueScopeKey, newTurnObjective: pendingResult.newObjective,
            }), traceId);
        }
        traceAgentDevice(traceId, 'AGENT_ROUTING_DECISION', { path: 'pending_clarification_escaped', dialogueScopeKey });
        // A read/request escape also abandons the pending dialogue so a later
        // turn cannot inherit stale clarification slots.
        dialogueService.reset({ actorUserId: input.actorUserId, dialogueScopeKey });
    }

    // GENERALIZATION (M-7), third mechanism: plan-shown, pre-authorization
    // date correction (benchmark scenario 4). Only reachable when
    // pendingAnswerable was false above -- which is always true while
    // lifecycle === 'plan_pending_authorization', since that state carries
    // no pendingClarification by construction (markReadyForAuthorization
    // never sets one). See agentDialogueContinuation.service.ts's own header
    // comment on this mechanism for the full safety rationale: no bespoke
    // plan/digest invalidation is needed here, because applyCorrection
    // (called inside buildPlanDateCorrection) already clears the stale
    // currentPlanDigestRef and transitions back to `collecting`, and
    // authorizePlan's existing re-plan-from-scratch + digest-comparison
    // already makes the OLD, now-superseded plan harmless the instant the
    // user would try to confirm it.
    const correctionClassification = await classifyPlanCorrection(
        existingDialogueState, content, input.actorUserId, conversationId,
    );
    tracePlan(traceId, 'PLAN_CORRECTION_CLASSIFIED', {
        isCorrection: correctionClassification.isCorrection, reason: correctionClassification.reason, dialogueScopeKey,
    });
    if (correctionClassification.isCorrection) {
        const newTimeHint = extractTimeHint(content.trim());
        // extractTimeHint's own vocabulary is what classifyPlanCorrection
        // already required to be present -- re-deriving it here (rather than
        // threading it through the classification result) keeps
        // PlanCorrectionClassification a pure yes/no + reason, exactly like
        // ContinuationClassification/isPendingClarificationAnswerable's own
        // shape, never a grab-bag of derived data a caller might trust
        // without re-checking.
        if (newTimeHint) {
            const turnId = `${traceId}:${Date.now()}`;
            const { correctedObjective, turnSequence } = buildPlanDateCorrection(
                dialogueService, existingDialogueState!, dialogueScopeKey, input.actorUserId, newTimeHint, turnId,
                now, resolveTimeZone(timezone),
            );
            // buildPlanDateCorrection's own applyCorrection call already
            // consumed `turnSequence` (it is now existingDialogueState's new
            // lastTurnSequence) -- this second bookkeeping write is a genuinely
            // later step within the same turn and must use the next sequence,
            // exactly mirroring the person_ambiguous re-ask path's own
            // turnSequence/turnSequence + 1 pattern above.
            dialogueService.openObjective({
                actorUserId: input.actorUserId, dialogueScopeKey, objective: correctedObjective, turnId, turnSequence: turnSequence + 1,
            });
            traceAgentDevice(traceId, 'AGENT_ROUTING_DECISION', { path: 'plan_date_correction', dialogueScopeKey });
            return finalizeAgentTurn(await runWriteActionTurn({
                actorUserId: input.actorUserId, content, conversationId, channel, locale, timezone,
                now, traceId, envelope, referents, dialogueScopeKey, newTurnObjective: correctedObjective,
            }), traceId);
        }
    }

    // A deterministic action can enter the planner directly. Reusing the
    // resolved objective avoids both an unnecessary read-context retrieval
    // and a second provider/model interpretation. Unknown action language
    // still falls through to the general context + objective pipeline.
    // resolveDeterministicRouting is the ONE canonical owner of this
    // decision (sección: "no duplicated routing logic") — agentTurn.service.ts
    // never independently re-implements deterministic-vs-LLM classification;
    // it only asks the canonical function and, when the input qualifies,
    // hands the already-resolved objective straight into runAgentPlanning
    // (the sole final plan-status owner) exactly as agentAuthorization.service.ts's
    // re-plan and agentPlan.controller.ts's initial plan now also do.
    const routing = await resolveDeterministicRouting(content, { actorUserId: input.actorUserId, conversationId });
    if (routing.isWriteActionRequest && routing.resolvedObjective) {
        traceAgentDevice(traceId, 'AGENT_ROUTING_DECISION', { path: 'deterministic_write', dialogueScopeKey });
        return finalizeAgentTurn(await runWriteActionTurn({
            actorUserId: input.actorUserId, content, conversationId, channel, locale, timezone,
            now, traceId, envelope, referents, dialogueScopeKey, newTurnObjective: routing.resolvedObjective,
        }), traceId);
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
    traceAgentDevice(traceId, 'AGENT_CONTEXT_RESULT', {
        path: 'read_pipeline',
        intentType: context.intent.type,
        needsClarification: context.needsClarification,
        clarificationReason: context.clarification?.reason ?? null,
        isWriteActionRequest,
        resolvedPersonCandidateCount: context.clarification?.candidates?.length ?? null,
        sourceRefCount: context.commitments.length + context.events.length + context.messages.length
            + context.transcriptions.length + context.attachments.length,
    });

    // 1) Ambiguity in the READ pipeline (unresolved person/time/topic) always
    // wins first — there is nothing a plan or a response could safely say
    // yet.
    //
    // PING — M-7B PHYSICAL FAILURE #1 FIX: this branch used to put the raw
    // internal machine reason (e.g. "person_ambiguous") directly into
    // `question` -- the exact string a user would see on-screen. Core's
    // ambiguity reason must stay machine-readable (kept on `field`, for
    // diagnostics/programmatic use only, never rendered as prose) while
    // `question` is now always natural-language text produced by the SAME
    // realizeAgentClarification templates the read-only synthesis path
    // (buildClarificationResponse) already used correctly -- one canonical
    // wording source, not two diverging ones.
    if (context.needsClarification) {
        const clarification = context.clarification;
        const language = detectAgentLanguage(content, locale);
        const { answer, followUp } = realizeAgentClarification(clarification, language);

        // PING — M-7B PHYSICAL FAILURE #2 FIX (TASK 2) -- proven by tracing
        // this exact path: this branch used to return WITHOUT ever writing
        // to AgentDialogueStateService, so a person_ambiguous clarification
        // blocking a genuine write-intent utterance ("Tengo que llamar a
        // Pedro") left no dialogue state for a later turn to find at all --
        // the compound root cause of the physical failure, not merely a
        // routing-order problem. When this clarification is blocking an
        // objective the user was actually trying to create, capture that
        // objective via LlmObjectiveInterpreter and persist it so the next
        // turn's dialogue-first check has something real to resolve against.
        // The old extra isWriteActionRequest gate was unsafe: this advisory
        // signal can be false even when the clarification blocks an eligible
        // create objective. A genuinely read-only query still persists
        // nothing because its objective is absent or ineligible.
        traceAgentDevice(traceId, 'AGENT_ROUTING_DECISION', {
            path: 'read_pipeline_person_ambiguous', dialogueScopeKey, isWriteActionRequest,
        });
        if (clarification?.reason === 'person_ambiguous') {
            const candidateObjective = await new LlmObjectiveInterpreter().interpret(content, {
                actorUserId: input.actorUserId, conversationId,
            });
            const eligible = !!candidateObjective && isContinuationEligibleObjectiveType(candidateObjective.objectiveType);
            traceAgentDevice(traceId, 'AGENT_DIALOGUE_STATE_WRITE_ATTEMPT', {
                objectiveType: candidateObjective?.objectiveType ?? null, eligible, dialogueScopeKey,
            });
            if (eligible) {
                const turnId = `${traceId}:${Date.now()}`;
                const turnSequence = (existingDialogueState?.lastTurnSequence ?? 0) + 1;
                dialogueService.openObjective({
                    actorUserId: input.actorUserId, dialogueScopeKey, objective: candidateObjective, turnId, turnSequence,
                });
                dialogueService.setPendingClarification({
                    actorUserId: input.actorUserId, dialogueScopeKey,
                    clarification: { field: 'person_ambiguous', question: answer, options: followUp.options },
                    turnId, turnSequence: turnSequence + 1,
                });
                const writtenState = dialogueService.getSnapshot(input.actorUserId, dialogueScopeKey);
                traceAgentDevice(traceId, 'AGENT_DIALOGUE_STATE_WRITE_RESULT', {
                    stateFound: !!writtenState,
                    lifecycle: writtenState?.lifecycle ?? null,
                    openObjectiveType: writtenState?.openObjective?.objectiveType ?? null,
                    pendingClarificationField: writtenState?.pendingClarification?.field ?? null,
                    version: writtenState?.version ?? null,
                    lastTurnSequence: writtenState?.lastTurnSequence ?? null,
                });
            }
        }

        traceAgentDevice(traceId, 'AGENT_RESPONSE_KIND', { kind: 'clarification', field: clarification?.reason ?? 'topic_too_broad' });
        traceAgentDevice(traceId, 'AGENT_DEVICE_TRACE_END', {});
        return finalizeAgentTurn({
            kind: 'clarification',
            questions: [{
                field: clarification?.reason ?? 'topic_too_broad',
                question: answer,
                options: followUp.options,
            }],
        }, traceId);
    }

    // 2) Core routing decision: write-shaped requests go to the M-3 planning
    // pipeline (never executes — /turn is a dry-run, same as /agent/plan).
    // Read-only requests reuse the context already built above.
    if (isWriteActionRequest) {
        // M-7B — the deterministic fast path above didn't resolve an
        // objective (or this turn didn't take it), so this is the primary
        // LLM interpretation path. Interpreted HERE (rather than left to
        // runAgentPlanning's own internal interpretation) so dialogue-state
        // continuation can be classified against a real objective before
        // planning -- runAgentPlanning is then called with this exact
        // objective as `resolvedObjective`, so interpretation still happens
        // exactly once per turn, same cost discipline as before.
        traceAgentDevice(traceId, 'AGENT_ROUTING_DECISION', { path: 'llm_write', dialogueScopeKey });
        const newTurnObjective = await new LlmObjectiveInterpreter().interpret(content, {
            actorUserId: input.actorUserId, conversationId,
        });
        return finalizeAgentTurn(await runWriteActionTurn({
            actorUserId: input.actorUserId, content, conversationId, channel, locale, timezone,
            now, traceId, envelope, referents, dialogueScopeKey, newTurnObjective,
        }), traceId);

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
        traceAgentDevice(traceId, 'AGENT_ROUTING_DECISION', { path: 'read_unsupported', dialogueScopeKey });
        traceAgentDevice(traceId, 'AGENT_RESPONSE_KIND', { kind: 'unsupported' });
        traceAgentDevice(traceId, 'AGENT_DEVICE_TRACE_END', {});
        return finalizeAgentTurn({
            kind: 'unsupported',
            reason: readOnlyGaps[0].reason,
            supportedExamples: SUPPORTED_EXAMPLES,
        }, traceId);
    }

    traceAgentDevice(traceId, 'AGENT_ROUTING_DECISION', { path: 'read_response', dialogueScopeKey });
    const response = await synthesizeAgentResponse(
        { input: content, context, locale, channel, traceId },
        {},
    );
    traceAgentDevice(traceId, 'AGENT_RESPONSE_KIND', {
        kind: 'response', sourceRefCount: response.citations?.length ?? 0,
    });
    traceAgentDevice(traceId, 'AGENT_DEVICE_TRACE_END', {});
    return finalizeAgentTurn({ kind: 'response', response: toPublicAgentResponse(response) }, traceId);
}

function finalizeAgentTurn(result: AgentTurnResult, traceId: string): AgentTurnResult {
    const debug = getAgentDeviceDebugMetadata(traceId);
    if (!debug) return result;
    if (!debug.responseKind) debug.responseKind = result.kind;
    traceAgentDevice(traceId, 'AGENT_RESPONSE_KIND', { kind: debug.responseKind });
    traceAgentDevice(traceId, 'AGENT_DEVICE_TRACE_END', {});
    return { ...result, debug };
}

// M-7B — the single entry point for every write-shaped turn, from either
// the deterministic-fast-path or LLM-interpretation call site above. Owns:
// (1) looking up any open dialogue state for this scope, (2) Core-validated
// continuation classification (never trusting an LLM claim alone -- see
// classifyContinuation), (3) the reconciled-objective merge when a genuine
// continuation is found, (4) delegating to the EXACT SAME, UNMODIFIED
// runAgentPlanning pipeline every other write turn already uses, and (5)
// updating dialogue state from the real plan result afterward. This is not
// a second execution path -- plan/authorization/execution remain owned
// exactly where they already were; this function only decides which
// objective those existing systems receive.
async function runWriteActionTurn(params: {
    actorUserId: string;
    content: string;
    conversationId?: string;
    channel: string;
    locale?: string;
    timezone?: string;
    now: Date;
    traceId: string;
    envelope: ReturnType<typeof resolveAgentRequestInput>['envelope'];
    referents: ReturnType<typeof resolveAgentRequestInput>['referents'];
    dialogueScopeKey: string;
    newTurnObjective: AgentObjective;
}): Promise<AgentTurnResult> {
    const { actorUserId, dialogueScopeKey, newTurnObjective } = params;
    const dialogueService = new AgentDialogueStateService();
    const existingDialogueState = dialogueService.getSnapshot(actorUserId, dialogueScopeKey);
    const turnId = `${params.traceId}:${Date.now()}`;
    // ADR Q12 -- monotonic per-scope sequence. lastTurnSequence + 1 is
    // always strictly newer than whatever this read observed, so this
    // turn's own write can never be rejected as stale against itself; a
    // genuinely newer concurrent turn (per the CAS guard inside
    // AgentDialogueStateService) would still win over this one if it
    // commits first.
    const turnSequence = (existingDialogueState?.lastTurnSequence ?? 0) + 1;

    const classification = classifyContinuation(existingDialogueState, newTurnObjective);
    tracePlan(params.traceId, 'DIALOGUE_CONTINUATION_CLASSIFIED', {
        isContinuation: classification.isContinuation, reason: classification.reason, dialogueScopeKey,
    });

    let objectiveForPlanning = newTurnObjective;
    if (classification.isContinuation && existingDialogueState?.openObjective) {
        const reconciled = reconcileContinuationObjective(existingDialogueState.openObjective, newTurnObjective);
        objectiveForPlanning = reconciled.objective;
        tracePlan(params.traceId, 'DIALOGUE_CONTINUATION_MERGED', {
            filledField: reconciled.filledField, dialogueScopeKey,
        });
    }

    const plan = await runAgentPlanning({
        actorUserId,
        input: params.content,
        conversationId: params.conversationId,
        channel: params.channel,
        locale: params.locale,
        timezone: params.timezone,
        now: params.now,
        traceId: params.traceId,
        inputEnvelope: params.envelope,
        contextReferents: params.referents,
    }, { resolvedObjective: objectiveForPlanning });

    // M-7B dialogue-state bookkeeping, strictly AFTER the real plan result
    // is known -- dialogue state never predicts or overrides what the
    // canonical planner decided.
    //
    // GENERALIZATION (M-7): this gate was originally
    // isContinuationEligibleObjectiveType itself (create-only), which
    // silently meant reschedule/complete/respond's planner-derived
    // targetEntity ambiguities were NEVER persisted here, no matter how the
    // answer-resolution side (agentDialogueContinuation.service.ts) was
    // built -- the write side of the mechanism gates on the SAME union
    // isPendingClarificationAnswerable's read side already checks, so a
    // targetEntity clarification for an eligible objective type is tracked
    // exactly like a person_ambiguous one, both through this one bookkeeping
    // block.
    if (!isDialogueTrackedObjectiveType(objectiveForPlanning.objectiveType)) {
        // Objective type out of scope for dialogue tracking in this phase
        // (per the task's bounded-rollout instruction) -- dialogue state for
        // this scope is left untouched. A genuinely open, eligible dialogue
        // elsewhere for this same scope key would only exist if a different
        // objective type were previously open, which classifyContinuation
        // already refuses to merge into.
    } else if (plan.status === 'needs_clarification') {
        dialogueService.openObjective({
            actorUserId, dialogueScopeKey, objective: objectiveForPlanning,
            ambiguities: plan.objective.ambiguities, turnId, turnSequence,
        });
        if (plan.unresolvedInputs[0]) {
            dialogueService.setPendingClarification({
                actorUserId, dialogueScopeKey, clarification: plan.unresolvedInputs[0], turnId, turnSequence: turnSequence + 1,
            });
        }
    } else if (plan.status === 'ready_for_authorization' && plan.planDigest) {
        // The objective is now fully specified -- ensure dialogue state
        // reflects it (opening it fresh if this turn completed it in one
        // shot, e.g. a single-turn request that happened to also have an
        // eligible objectiveType) then record the plan-digest REFERENCE
        // only, per ADR Q13 -- never a copy of the plan itself. No
        // authorization has occurred yet; PlanCard confirmation is still
        // required exactly as for any other plan.
        dialogueService.openObjective({
            actorUserId, dialogueScopeKey, objective: objectiveForPlanning, turnId, turnSequence,
        });
        dialogueService.markReadyForAuthorization({
            actorUserId, dialogueScopeKey, planDigest: plan.planDigest, turnId, turnSequence: turnSequence + 1,
        });
    } else if (classification.isContinuation) {
        // A continuation attempt that still resolved to 'draft'/unsupported
        // (e.g. the merged objective was structurally invalid) closes the
        // dialogue rather than leaving a stale open objective behind.
        dialogueService.reset({ actorUserId, dialogueScopeKey });
    }

    return routePlanningResult(plan, { locale: params.locale, timezone: params.timezone, now: params.now, traceId: params.traceId });
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
        case 'remember_fact': {
            const factContent = typeof args.factContent === 'string' ? args.factContent : '';
            return {
                stepId: step.stepId, toolId,
                headline: 'Recordar esto',
                effectDescription: `Ping recordará: "${factContent}"`,
                contentPreview: factContent,
                confirmationLabel: 'Recordar', cancelLabel: 'Cancelar',
                ...shared,
            };
        }
        case 'cancel_commitment': {
            const title = extractQuoted(step.operation) ?? 'el compromiso';
            return {
                stepId: step.stepId, toolId,
                headline: `Cancelar "${title}"`,
                effectDescription: `Cancelarás "${title}".`,
                targetLabel: title,
                confirmationLabel: 'Cancelar compromiso', cancelLabel: 'No cancelar',
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
