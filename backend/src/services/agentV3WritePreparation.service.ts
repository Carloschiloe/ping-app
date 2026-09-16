import { runAgentPlanning } from './agentPlanOrchestrator.service';
import type { AgentPlan } from '../types/agentPlan';
import type { AgentTurnDisposition } from '../types/agentTurnDisposition';
import type { NormalizedSemanticTurnV3 } from '../types/agentTurnCommit';
import type { RetrievalCommitment, RetrievalPerson } from '../types/retrieval';
import type { TemporalCoreResult } from './temporalCore.service';
import type { AgentStructuredClarification } from '../types/agentClarification';
import { plannerClarification, structuredClarification, temporalClarification } from './agentStructuredClarification.service';

export type V3WritePreparationInput = {
    actorUserId: string;
    semanticTurn: NormalizedSemanticTurnV3;
    disposition: AgentTurnDisposition;
    targetEntity?: RetrievalCommitment | null;
    responsiblePerson?: RetrievalPerson | null;
    temporal: TemporalCoreResult;
    conversationId?: string;
    timezone?: string;
    now?: Date;
    traceId?: string;
    locale?: string;
};

export type V3WritePreparationResult =
    | { status: 'prepared'; plan: AgentPlan }
    | { status: 'insufficient'; reason: 'objective' | 'title' | 'temporal' | 'target_entity' | 'responsible_person' | 'planner'; clarification: AgentStructuredClarification }
    | { status: 'unsupported'; reason: 'disposition' | 'semantic_shape' | 'objective_type' | 'communication_content' };

const PLANNABLE_OBJECTIVES = new Set([
    'create_commitment_or_proposal',
    'create_personal_commitment',
    'reschedule_existing_commitment',
    'complete_existing_commitment',
    'respond_to_existing_proposal',
]);

function slotString(turn: NormalizedSemanticTurnV3, key: string): string | null {
    const value = turn.slots[key];
    return typeof value === 'string' && value.trim() ? value.trim() : null;
}

export async function prepareV3Write(input: V3WritePreparationInput): Promise<V3WritePreparationResult> {
    if (input.disposition !== 'ordinary_write' && input.disposition !== 'new_objective' && input.disposition !== 'resume_pending') {
        return { status: 'unsupported', reason: 'disposition' };
    }
    if (input.semanticTurn.kind !== 'write_request' && input.semanticTurn.kind !== 'lifecycle_command') {
        return { status: 'unsupported', reason: 'semantic_shape' };
    }
    const objectiveType = input.semanticTurn.objectiveType;
    if (!objectiveType) return { status: 'insufficient', reason: 'objective', clarification: structuredClarification({ semanticTurn: input.semanticTurn, field: 'objective', reason: 'objective', inputMode: 'provide_context' }) };
    if (!PLANNABLE_OBJECTIVES.has(objectiveType)) {
        return { status: 'unsupported', reason: objectiveType === 'communicate_message' || objectiveType === 'communicate_and_wait' ? 'communication_content' : 'objective_type' };
    }

    const existingEntity = objectiveType === 'create_commitment_or_proposal' || objectiveType === 'create_personal_commitment'
        ? undefined : input.targetEntity;
    if (objectiveType !== 'create_commitment_or_proposal' && objectiveType !== 'create_personal_commitment' && !existingEntity) {
        return { status: 'insufficient', reason: 'target_entity', clarification: structuredClarification({ semanticTurn: input.semanticTurn, field: 'target_entity', reason: 'target_entity' }) };
    }
    const title = slotString(input.semanticTurn, 'title') ?? input.semanticTurn.entityHints[0] ?? null;
    if ((objectiveType === 'create_commitment_or_proposal' || objectiveType === 'create_personal_commitment') && !title) {
        return { status: 'insufficient', reason: 'title', clarification: structuredClarification({ semanticTurn: input.semanticTurn, field: 'title', reason: 'title' }) };
    }
    if ((objectiveType === 'create_commitment_or_proposal' || objectiveType === 'create_personal_commitment' || objectiveType === 'reschedule_existing_commitment') && input.temporal.status !== 'resolved') {
        return { status: 'insufficient', reason: 'temporal', clarification: temporalClarification({ semanticTurn: input.semanticTurn, temporal: input.temporal }) };
    }
    if (objectiveType === 'create_commitment_or_proposal' && !input.responsiblePerson) {
        return { status: 'insufficient', reason: 'responsible_person', clarification: structuredClarification({ semanticTurn: input.semanticTurn, field: 'responsible_person', reason: 'responsible_person' }) };
    }

    const decisionHint: 'approve' | 'reject' | 'counter_propose' | null = input.semanticTurn.slots.decision === 'reject'
        ? 'reject' : input.semanticTurn.slots.decision === 'counter_propose'
            ? 'counter_propose' : input.semanticTurn.slots.decision === 'approve' ? 'approve' : null;
    const objective = {
        objectiveType: objectiveType as any,
        targetEntities: { personHints: [], entityHints: title ? [title] : [] },
        constraints: { decisionHint, draftOnly: false, responsibleHint: null },
        desiredOutcome: slotString(input.semanticTurn, 'resolutionResult') ?? 'Completado desde Core.',
        timeConstraints: { rawHint: null },
        actor: input.actorUserId,
        sourceUtterance: '',
        confidence: input.semanticTurn.confidence,
        ambiguities: [],
        source: input.semanticTurn.source === 'llm' ? 'llm' as const : input.semanticTurn.source === 'fallback' ? 'llm_fallback' as const : 'deterministic' as const,
    };

    const plan = await runAgentPlanning({
        actorUserId: input.actorUserId, input: '', conversationId: input.conversationId,
        timezone: input.timezone, now: input.now, traceId: input.traceId, locale: input.locale,
        canonicalFacts: { canonicalOnly: true, targetEntity: existingEntity, responsiblePerson: input.responsiblePerson, temporal: input.temporal },
    }, { resolvedObjective: objective });
    if (plan.status === 'needs_clarification' && plan.unresolvedInputs[0]) {
        const clarification = plannerClarification({ semanticTurn: input.semanticTurn, question: plan.unresolvedInputs[0] });
        return { status: 'insufficient', reason: clarification.reason, clarification };
    }
    return { status: 'prepared', plan };
}
