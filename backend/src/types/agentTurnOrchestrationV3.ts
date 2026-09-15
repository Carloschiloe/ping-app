import type { AgentTurnAdmission, AgentTurnProcessingDisposition } from './agentTurnAdmission';
import type { AgentTurnAtomicApplication, NormalizedSemanticTurnV3 } from './agentTurnCommit';
import type { AgentTurnResult } from './agentTurn';
import type { AgentTurnDispositionDecision, DispositionDialogueSnapshot, PendingSlotResolution } from './agentTurnDisposition';
import type { PersonResolutionResult, RetrievalCommitment, RetrievalPerson } from './retrieval';
import type { TemporalCoreResult } from '../services/temporalCore.service';
import type { V3ReadPreparationResult } from '../services/agentV3ReadPreparation.service';
import type { V3WritePreparationResult } from '../services/agentV3WritePreparation.service';

export type V3TurnIdentity = Pick<AgentTurnAdmission, 'turnId' | 'actorUserId' | 'dialogueScopeKey' | 'turnSequence'>;

export type V3SemanticCheckpoint = {
    status: 'found';
    semanticTurn: NormalizedSemanticTurnV3;
    turnSequence: number;
    fingerprint: string;
} | { status: 'not_found' } | { status: 'unsupported_version'; version: number } | { status: 'identity_mismatch' } | { status: 'invalid' };

export interface V3SemanticCheckpointStore {
    load(input: V3TurnIdentity): Promise<V3SemanticCheckpoint>;
    save(input: V3TurnIdentity & { semanticTurn: NormalizedSemanticTurnV3 }): Promise<NormalizedSemanticTurnV3>;
}

export interface V3CoreResolution {
    person: PersonResolutionResult | null;
    temporal: TemporalCoreResult;
    pendingSlotResolution?: PendingSlotResolution;
    targetEntity?: RetrievalCommitment | null;
    responsiblePerson?: RetrievalPerson | null;
}

export interface V3CoreResolver {
    resolve(input: { semanticTurn: NormalizedSemanticTurnV3; dialogue: DispositionDialogueSnapshot | null }): Promise<V3CoreResolution>;
}

export interface V3DispositionBoundary {
    decide(input: { semanticTurn: NormalizedSemanticTurnV3; dialogue: DispositionDialogueSnapshot | null; resolution: V3CoreResolution }): AgentTurnDispositionDecision;
}

export interface V3PreparationBoundary {
    prepareRead(input: { identity: V3TurnIdentity; semanticTurn: NormalizedSemanticTurnV3; disposition: AgentTurnDispositionDecision; resolution: V3CoreResolution }): Promise<V3ReadPreparationResult>;
    prepareWrite(input: { identity: V3TurnIdentity; semanticTurn: NormalizedSemanticTurnV3; disposition: AgentTurnDispositionDecision; resolution: V3CoreResolution }): Promise<V3WritePreparationResult>;
}

export interface V3DialogueCheckpointStore {
    load(input: Pick<V3TurnIdentity, 'actorUserId' | 'dialogueScopeKey'>): Promise<{ snapshot: DispositionDialogueSnapshot | null; expiresAt: string | null }>;
}

export interface V3AtomicTurnApplication {
    apply(input: V3TurnIdentity & { expectedDialogueVersion: number; lifecycle: string; activeDialogue: Record<string, unknown> | null; suspendedDialogue: Record<string, unknown> | null; expiresAt: string; result: AgentTurnResult }): Promise<AgentTurnAtomicApplication>;
}

export type V3OrchestrationOutcome =
    | { kind: 'committed'; result: AgentTurnResult; application: AgentTurnAtomicApplication; replayed: boolean }
    | { kind: 'completed_replay'; result: AgentTurnResult; admission: AgentTurnAdmission }
    | { kind: 'processing_duplicate'; admission: AgentTurnAdmission }
    | { kind: 'retryable_failure'; admission: AgentTurnAdmission; phase: 'semantic' | 'resolution' | 'preparation' | 'application' | 'unknown' }
    | { kind: 'terminal_failure'; admission: AgentTurnAdmission; phase: 'admission' | 'semantic' | 'resolution' | 'preparation' | 'application' }
    | { kind: 'cas_conflict'; admission: AgentTurnAdmission; conflict: 'dialogue_version' | 'turn_sequence' | 'identity' }
    | { kind: 'uncertain_application'; admission: AgentTurnAdmission; reconciliationRequired: true };

export function claimCanProcess(result: AgentTurnProcessingDisposition): result is Extract<AgentTurnProcessingDisposition, { kind: 'claimed' }> {
    return result.kind === 'claimed';
}

export function claimOutcome(result: AgentTurnProcessingDisposition): Extract<V3OrchestrationOutcome, { kind: 'completed_replay' | 'processing_duplicate' | 'terminal_failure' }> | { kind: 'claimed'; admission: AgentTurnAdmission } {
    if (result.kind === 'claimed') return result;
    if (result.kind === 'completed_replay') return { kind: 'completed_replay', admission: result.admission, result: result.admission.resultRef as unknown as AgentTurnResult };
    if (result.kind === 'in_flight') return { kind: 'processing_duplicate', admission: result.admission };
    return { kind: 'terminal_failure', admission: result.admission, phase: 'admission' };
}
