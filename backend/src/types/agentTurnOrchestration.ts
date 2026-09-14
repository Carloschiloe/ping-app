import type { AgentTurnResult } from './agentTurn';
import type { AgentTurnAdmission, AgentTurnAdmissionRequest } from './agentTurnAdmission';
import type { AgentTurnAtomicApplication } from './agentTurnCommit';
import type { NormalizedSemanticTurnV2 } from './agentTurnCommit';
import type { AgentTurnDispositionDecision, AgentTurnDispositionInput, DispositionDialogueSnapshot } from './agentTurnDisposition';

export interface SemanticCheckpointStore {
    load(input: Pick<AgentTurnAdmission, 'turnId' | 'actorUserId' | 'dialogueScopeKey' | 'turnSequence'>): Promise<NormalizedSemanticTurnV2 | null>;
    save(input: { admission: AgentTurnAdmission; semanticTurn: NormalizedSemanticTurnV2 }): Promise<NormalizedSemanticTurnV2>;
}

export interface DialogueCheckpointStore {
    load(input: Pick<AgentTurnAdmissionRequest, 'actorUserId' | 'dialogueScopeKey'>): Promise<DispositionDialogueSnapshot | null>;
}

export interface CoreResolver {
    resolve(input: { semanticTurn: NormalizedSemanticTurnV2; dialogue: DispositionDialogueSnapshot | null }): Promise<Pick<AgentTurnDispositionInput, 'pendingSlotResolution' | 'suspendedResumeCandidate'>>;
}

export interface TurnPreparation {
    prepare(input: { disposition: AgentTurnDispositionDecision; semanticTurn: NormalizedSemanticTurnV2; dialogue: DispositionDialogueSnapshot | null }): Promise<{ result: AgentTurnResult; nextDialogue: { lifecycle: string; activeDialogue: Record<string, unknown> | null; suspendedDialogue: Record<string, unknown> | null; expiresAt: string } }>;
}

export interface AgentTurnOrchestrationDependencies {
    admission: { claimForProcessing(admission: AgentTurnAdmission): Promise<{ kind: 'claimed' | 'in_flight' | 'completed_replay'; admission: AgentTurnAdmission }> };
    semantic: SemanticCheckpointStore;
    dialogue: DialogueCheckpointStore;
    resolver: CoreResolver;
    disposition: { decide(input: AgentTurnDispositionInput): AgentTurnDispositionDecision };
    preparation: TurnPreparation;
    commit: { applyTurn(input: { turnId: string; actorUserId: string; dialogueScopeKey: string; turnSequence: number; expectedDialogueVersion: number; lifecycle: string; activeDialogue: Record<string, unknown> | null; suspendedDialogue: Record<string, unknown> | null; expiresAt: string; result: AgentTurnResult }): Promise<AgentTurnAtomicApplication> };
}
