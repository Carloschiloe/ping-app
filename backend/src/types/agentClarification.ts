import type { NormalizedSemanticTurnV3 } from './agentTurnCommit';
import type { TemporalCoreResult } from '../services/temporalCore.service';

/**
 * Core-owned missing-information state.  This is deliberately not a user
 * question: presentation is a later projection and must not alter these
 * facts.
 */
export type AgentClarificationReason =
    | 'person_resolution'
    | 'temporal_context'
    | 'retrieval_scope'
    | 'objective'
    | 'title'
    | 'temporal'
    | 'target_entity'
    | 'responsible_person'
    | 'planner';

export type AgentClarificationInputMode = 'choose_option' | 'provide_value' | 'provide_context';
export type AgentClarificationCondition = 'missing' | 'ambiguous' | 'zero_match' | 'invalid';

export interface AgentClarificationOption {
    id: string;
    label: string;
}

export interface AgentClarificationContinuation {
    objectiveType: string | null;
    domain: NormalizedSemanticTurnV3['domain'];
    slots: NormalizedSemanticTurnV3['slots'];
    entityHints: string[];
    ambiguityFields: string[];
    candidateSlotType: string | null;
    pendingField: string;
}

export interface AgentStructuredClarification {
    field: string;
    reason: AgentClarificationReason;
    condition: AgentClarificationCondition;
    inputMode: AgentClarificationInputMode;
    options: AgentClarificationOption[];
    continuation: AgentClarificationContinuation;
    temporal?: TemporalCoreResult;
}
