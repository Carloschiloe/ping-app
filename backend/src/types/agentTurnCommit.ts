import type { AgentTurnResult } from './agentTurn';

export const AGENT_TURN_REPLAY_VERSION = 1 as const;
export const AGENT_TURN_REPLAY_V2 = 2 as const;
export const AGENT_TURN_REPLAY_MAX_BYTES = 128 * 1024;

// Normalized, bounded Core input. Provider responses, prompts and raw source
// utterances are deliberately absent; this is a checkpoint, not memory.
export interface NormalizedSemanticTurn {
    intentType: string;
    objectiveType: string | null;
    entityHints: string[];
    slots: Record<string, string | number | boolean | null>;
    ambiguityFields: string[];
    confidence: number;
    source: 'deterministic' | 'llm' | 'fallback';
}

export const AGENT_TURN_SEMANTIC_V2 = 2 as const;
export const AGENT_TURN_SEMANTIC_MAX_BYTES = 32 * 1024;
export type SemanticTurnV2Kind = 'read_request' | 'write_request' | 'slot_answer' | 'lifecycle_command' | 'unknown';
export type SemanticDomain = 'commitment' | 'messaging' | 'people' | 'historical_read' | 'generic' | 'unknown';
export type SemanticCompleteness = 'complete' | 'incomplete' | 'unknown';
export type PendingSlotAnswerShape = 'likely' | 'not_a_slot_answer' | 'unknown';
export type SemanticLifecycleCommand = 'none' | 'abandon' | 'resume';
export type SemanticLifecycleTarget = 'active' | 'suspended' | 'unspecified';
export type SemanticFact = 'yes' | 'no' | 'unknown';

// V2 is a provider-neutral semantic fact set. It intentionally contains no
// disposition, canonical identity, authorization, execution, or raw utterance.
export interface NormalizedSemanticTurnV2 {
    version: typeof AGENT_TURN_SEMANTIC_V2;
    kind: SemanticTurnV2Kind;
    domain: SemanticDomain;
    objectiveCompleteness: SemanticCompleteness;
    lifecycleCommand: SemanticLifecycleCommand;
    lifecycleTarget: SemanticLifecycleTarget;
    lifecycleEvidence: 'explicit' | 'implicit' | 'unknown';
    pendingSlotAnswer: PendingSlotAnswerShape;
    continuationLike: SemanticFact;
    candidateSlotType: string | null;
    independentObjective: SemanticFact;
    objectiveType: string | null;
    entityHints: string[];
    slots: Record<string, string | number | boolean | null>;
    ambiguityFields: string[];
    confidence: number;
    source: 'deterministic' | 'llm' | 'fallback';
}

export type TemporalFactV3 =
    | { kind: 'absolute_date'; precision: 'date'; year: number; month: number; day: number }
    | { kind: 'absolute_datetime'; precision: 'minute' | 'second'; year: number; month: number; day: number; hour: number; minute: number; second?: number; meridiem: '24h' | 'am' | 'pm' }
    | { kind: 'relative_date'; precision: 'date'; amount: number; unit: 'days' | 'weeks' }
    | { kind: 'relative_target_offset'; precision: 'elapsed'; amount: number; unit: 'minutes' | 'hours' | 'days' | 'weeks' }
    | { kind: 'relative_duration'; precision: 'duration'; amount: number; unit: 'minutes' | 'hours' | 'days' | 'weeks' }
    | { kind: 'weekday'; precision: 'date'; weekday: 0 | 1 | 2 | 3 | 4 | 5 | 6; relation: 'this_or_next' | 'next' }
    | { kind: 'time_only'; precision: 'minute' | 'second'; hour: number; minute: number; second?: number; meridiem: '24h' | 'am' | 'pm' | 'unknown'; ambiguity: 'none' | 'clock' };

export interface NormalizedSemanticTurnV3 extends Omit<NormalizedSemanticTurnV2, 'version'> {
    version: 3;
    temporalFact?: TemporalFactV3;
}

export type SemanticReadQueryShapeV4 = 'focused' | 'collection' | 'count';
export type SemanticReadTargetShapeV4 = 'none' | 'person' | 'commitment' | 'proposal' | 'message' | 'conversation' | 'attachment' | 'transcription' | 'topic';
export type SemanticReadTemporalRoleV4 = 'none' | 'filter_range' | 'occurrence_time' | 'target_date' | 'elapsed' | 'duration';
export type SemanticReadLifecycleTransitionV4 = 'action_completed' | 'resolved' | 'cancelled' | 'rejected' | 'reopened' | 'reassigned' | 'accepted';
export type SemanticReadProposalFocusV4 = 'waiting_for_others' | 'needs_my_response' | 'pending_response_from_person';
export type SemanticReadMessageRelationshipV4 = 'content' | 'conversation_context' | 'sender' | 'participant';

export type SemanticReadRelationshipV4 =
    | { kind: 'general_recall' }
    | { kind: 'current_state' }
    | { kind: 'lifecycle_transition'; transition: SemanticReadLifecycleTransitionV4 }
    | { kind: 'proposal_focus'; focus: SemanticReadProposalFocusV4 }
    | { kind: 'person_relationship' }
    | { kind: 'message_relationship'; relationship: SemanticReadMessageRelationshipV4 }
    | { kind: 'attachment_content' }
    | { kind: 'transcription_content' };

export interface SemanticReadMeaningV4 {
    queryShape: SemanticReadQueryShapeV4;
    explicitCollection: boolean;
    targetShape: SemanticReadTargetShapeV4;
    relationship: SemanticReadRelationshipV4;
    temporalRole: SemanticReadTemporalRoleV4;
}

export interface NormalizedSemanticTurnV4 extends Omit<NormalizedSemanticTurnV3, 'version'> {
    version: 4;
    readMeaning: SemanticReadMeaningV4 | null;
}

export interface AgentTurnReplayV1 {
    kind: 'response' | 'plan' | 'clarification' | 'unsupported';
    response?: Extract<AgentTurnResult, { kind: 'response' }>['response'];
    questions?: Extract<AgentTurnResult, { kind: 'clarification' }>['questions'];
    partialResponse?: Extract<AgentTurnResult, { kind: 'clarification' }>['partialResponse'];
    plan?: Extract<AgentTurnResult, { kind: 'plan' }>['plan'];
    presentation?: Extract<AgentTurnResult, { kind: 'plan' }>['presentation'];
    reason?: Extract<AgentTurnResult, { kind: 'unsupported' }>['reason'];
    supportedExamples?: Extract<AgentTurnResult, { kind: 'unsupported' }>['supportedExamples'];
}

export interface AgentTurnReplayV2 {
    kind: 'read';
    execution: Extract<AgentTurnResult, { kind: 'read' }>['execution'];
    scopeFingerprint: string;
    constraintsFingerprint: string;
}

export interface AgentTurnDialogueCheckpoint {
    actorUserId: string;
    dialogueScopeKey: string;
    lifecycle: string;
    activeDialogue: Record<string, unknown> | null;
    suspendedDialogue: Record<string, unknown> | null;
    version: number;
    lastAppliedTurnId: string | null;
    lastAppliedTurnSequence: number;
    expiresAt: string;
}

export interface AgentTurnAtomicApplication {
    checkpoint: AgentTurnDialogueCheckpoint;
    replay: AgentTurnReplayV1 | AgentTurnReplayV2;
    replayed: boolean;
}
