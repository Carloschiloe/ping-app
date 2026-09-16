import type { AgentClarificationCondition, AgentClarificationOption, AgentClarificationReason, AgentStructuredClarification } from '../types/agentClarification';
import type { NormalizedSemanticTurnV3 } from '../types/agentTurnCommit';
import type { TemporalCoreResult } from './temporalCore.service';
import type { PersonResolutionResult } from '../types/retrieval';
import type { ClarificationQuestion } from '../types/agentPlan';

function continuationFor(turn: NormalizedSemanticTurnV3, field: string): AgentStructuredClarification['continuation'] {
    return {
        objectiveType: turn.objectiveType,
        domain: turn.domain,
        slots: { ...turn.slots },
        entityHints: [...turn.entityHints],
        ambiguityFields: [...turn.ambiguityFields],
        candidateSlotType: turn.candidateSlotType,
        pendingField: field,
    };
}

export function structuredClarification(input: {
    semanticTurn: NormalizedSemanticTurnV3;
    field: string;
    reason: AgentClarificationReason;
    condition?: AgentClarificationCondition;
    inputMode?: AgentStructuredClarification['inputMode'];
    options?: AgentClarificationOption[];
    temporal?: TemporalCoreResult;
}): AgentStructuredClarification {
    return {
        field: input.field,
        reason: input.reason,
        condition: input.condition ?? (input.options?.length ? 'ambiguous' : 'missing'),
        inputMode: input.inputMode ?? (input.options?.length ? 'choose_option' : 'provide_value'),
        options: input.options ? input.options.map(option => ({ ...option })) : [],
        continuation: continuationFor(input.semanticTurn, input.field),
        ...(input.temporal ? { temporal: input.temporal } : {}),
    };
}

export function personClarification(input: { semanticTurn: NormalizedSemanticTurnV3; person: PersonResolutionResult }): AgentStructuredClarification {
    const options = input.person.candidates.map(candidate => ({ id: candidate.id, label: candidate.displayName }));
    return structuredClarification({ semanticTurn: input.semanticTurn, field: 'person', reason: 'person_resolution', condition: input.person.ambiguous ? 'ambiguous' : 'zero_match', inputMode: options.length ? 'choose_option' : 'provide_value', options });
}

export function temporalClarification(input: { semanticTurn: NormalizedSemanticTurnV3; temporal: TemporalCoreResult }): AgentStructuredClarification {
    const condition = input.temporal.status === 'ambiguous' ? 'ambiguous' : input.temporal.status === 'invalid' || input.temporal.status === 'nonexistent_local_time' ? 'invalid' : 'missing';
    return structuredClarification({ semanticTurn: input.semanticTurn, field: 'temporal', reason: 'temporal_context', condition, inputMode: 'provide_value', temporal: input.temporal });
}

type PlannerClarificationReason = Extract<AgentClarificationReason, 'title' | 'temporal' | 'responsible_person' | 'target_entity' | 'planner'>;

export function plannerClarification(input: { semanticTurn: NormalizedSemanticTurnV3; question: ClarificationQuestion }): AgentStructuredClarification & { reason: PlannerClarificationReason } {
    const options = input.question.options?.map(option => ({ id: option.id, label: option.label })) ?? [];
    return structuredClarification({
        semanticTurn: input.semanticTurn,
        field: input.question.field,
        reason: reasonForPlannerField(input.question.field),
        inputMode: options.length ? 'choose_option' : 'provide_value',
        options,
    }) as AgentStructuredClarification & { reason: PlannerClarificationReason };
}

function reasonForPlannerField(field: string): PlannerClarificationReason {
    if (field === 'title') return 'title';
    if (field === 'dueAt' || field === 'newDueAt') return 'temporal';
    if (field === 'responsible') return 'responsible_person';
    if (field === 'target' || field === 'commitment') return 'target_entity';
    return 'planner';
}
