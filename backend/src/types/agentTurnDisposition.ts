export type AgentTurnDisposition =
    | 'answer_pending'
    | 'reclarify'
    | 'new_objective'
    | 'suspend_pending'
    | 'resume_pending'
    | 'abandon_pending'
    | 'ordinary_read'
    | 'ordinary_write';

export type SemanticTurnKind = 'read' | 'write' | 'lifecycle' | 'slot_answer' | 'unknown';
export type LifecycleCommand = 'abandon' | 'resume';

export interface NormalizedDispositionObjective {
    objectiveType: string;
    domain: 'read' | 'write';
    complete: boolean;
    slots: Record<string, string | number | boolean | null>;
    personEntityId?: string;
}

export interface NormalizedDispositionSemanticTurn {
    kind: SemanticTurnKind;
    objective: NormalizedDispositionObjective | null;
    lifecycleCommand: LifecycleCommand | null;
    lifecycleTarget: 'active' | 'suspended' | 'ambiguous' | null;
    explicitLifecycleCommand: boolean;
    structurallyUnambiguousResume: boolean;
}

export interface DispositionDialogueSnapshot {
    lifecycle: string;
    activeDialogue: Record<string, unknown> | null;
    suspendedDialogue: Record<string, unknown> | null;
    version: number;
    lastAppliedTurnId: string | null;
    lastAppliedTurnSequence: number;
}

export type PendingSlotResolution =
    | { status: 'resolved'; slot: string; value: string | number | boolean; updatedDialogue: Record<string, unknown> }
    | { status: 'zero_match' | 'ambiguous' | 'invalid' };

export interface AgentTurnDispositionInput {
    semanticTurn: NormalizedDispositionSemanticTurn;
    dialogue: DispositionDialogueSnapshot | null;
    pendingSlotResolution?: PendingSlotResolution;
    suspendedResumeCandidate?: { structurallyValid: boolean; dialogue: Record<string, unknown> | null };
}

export interface ProposedDialogueTransition {
    kind: 'none' | 'replace_active' | 'suspend_active' | 'resume_suspended' | 'update_active' | 'abandon_active' | 'reclarify';
    activeDialogue: Record<string, unknown> | null;
    suspendedDialogue: Record<string, unknown> | null;
}

export interface AgentTurnDispositionDecision {
    disposition: AgentTurnDisposition;
    reason: string;
    transition: ProposedDialogueTransition;
    requiresAuthorization: false;
    requiresExecution: false;
}
