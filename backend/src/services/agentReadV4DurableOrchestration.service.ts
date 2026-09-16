import { AppError } from '../utils/AppError';
import type { AgentTurnAdmission } from '../types/agentTurnAdmission';
import type { AgentTurnResult } from '../types/agentTurn';
import type { CanonicalSemanticProducer, CanonicalSemanticProducerInput } from './canonicalSemanticProducer.service';
import type { NormalizedSemanticTurnV4 } from '../types/agentTurnCommit';
import type { AgentReadV4OrchestrationInput, AgentReadV4OrchestrationResult, AgentReadV4OrchestrationService } from './agentReadV4Orchestration.service';
import type { AgentReadV4ResultAdapterInput } from './agentReadResultAdapter.service';
import { AgentTurnAdmissionService } from './agentTurnAdmission.service';
import { AgentTurnCommitService } from './agentTurnCommit.service';
import { AgentDialogueCheckpointService } from './agentDialogueCheckpoint.service';
import { agentReadV4OrchestrationService } from './agentReadV4Orchestration.service';
import { adaptAgentReadV4Result } from './agentReadResultAdapter.service';
import { canonicalSemanticProducer } from './canonicalSemanticProducer.service';

type SemanticStore = Pick<AgentTurnCommitService, 'loadSemanticCheckpointV4' | 'saveSemanticCheckpointV4'>;
type DialogueStore = Pick<AgentDialogueCheckpointService, 'loadDialogueCheckpoint'>;
type ReadOrchestrator = Pick<AgentReadV4OrchestrationService, 'execute'>;
type DurableCommit = Pick<AgentTurnCommitService, 'applyTurn' | 'reconcileApplication'>;
type DurableAdmission = Pick<AgentTurnAdmissionService, 'claimForProcessing'>;

export type AgentReadV4DurableDependencies = {
    admission: DurableAdmission;
    semantic: SemanticStore;
    dialogue: DialogueStore;
    read: ReadOrchestrator;
    adapt: (input: AgentReadV4ResultAdapterInput) => AgentTurnResult;
    commit: DurableCommit;
};

export type AgentReadV4DurableInput = {
    admission: AgentTurnAdmission;
    semanticInput: CanonicalSemanticProducerInput;
    queryKey: string;
    person: AgentReadV4OrchestrationInput['person'];
    targetEntity?: AgentReadV4OrchestrationInput['targetEntity'];
    temporal: AgentReadV4OrchestrationInput['temporal'];
    authorizedScope: AgentReadV4OrchestrationInput['authorizedScope'];
};

export type AgentReadV4DurableOutput = {
    result: AgentTurnResult;
    committed: boolean;
    replayed: boolean;
};

function resultFromReplay(value: Record<string, unknown> | null): AgentTurnResult {
    if (!value || typeof value.kind !== 'string') throw new AppError('Completed Agent turn has no valid replay', 500);
    return value as unknown as AgentTurnResult;
}

export class AgentReadV4DurableOrchestrationService {
    public constructor(
        private readonly deps: AgentReadV4DurableDependencies = {
            admission: new AgentTurnAdmissionService(),
            semantic: new AgentTurnCommitService(),
            dialogue: new AgentDialogueCheckpointService(),
            read: agentReadV4OrchestrationService,
            adapt: adaptAgentReadV4Result,
            commit: new AgentTurnCommitService(),
        },
        private readonly producer: Pick<CanonicalSemanticProducer, 'produceV4'> = canonicalSemanticProducer,
    ) {}

    public async execute(input: AgentReadV4DurableInput): Promise<AgentReadV4DurableOutput> {
        const claimed = await this.deps.admission.claimForProcessing(input.admission);
        if (claimed.kind === 'completed_replay') {
            return { result: resultFromReplay(claimed.admission.resultRef), committed: false, replayed: true };
        }
        if (claimed.kind === 'in_flight') throw new AppError('Agent turn is already processing', 409);
        if (claimed.kind === 'terminal_failure') throw new AppError('Agent turn has a terminal failure', 409);

        const admitted = claimed.admission;
        const dialogueLoaded = await this.deps.dialogue.loadDialogueCheckpoint({
            actorUserId: admitted.actorUserId, dialogueScopeKey: admitted.dialogueScopeKey,
        });
        const dialogue = dialogueLoaded.status === 'found' ? dialogueLoaded.snapshot : null;
        const semanticLoaded = await this.deps.semantic.loadSemanticCheckpointV4({
            turnId: admitted.turnId, actorUserId: admitted.actorUserId,
            dialogueScopeKey: admitted.dialogueScopeKey, turnSequence: admitted.turnSequence,
        });
        let semantic: NormalizedSemanticTurnV4;
        if (semanticLoaded.status === 'found') {
            semantic = semanticLoaded.semanticTurn;
        } else if (semanticLoaded.status === 'not_found') {
            semantic = await this.producer.produceV4(input.semanticInput);
            semantic = await this.deps.semantic.saveSemanticCheckpointV4({
                turnId: admitted.turnId, actorUserId: admitted.actorUserId,
                dialogueScopeKey: admitted.dialogueScopeKey, turnSequence: admitted.turnSequence, semanticTurn: semantic,
            });
        } else {
            throw new AppError(`Semantic V4 checkpoint cannot be used: ${semanticLoaded.status}`, 409);
        }

        const readInput: AgentReadV4OrchestrationInput = {
            actorUserId: admitted.actorUserId, queryKey: input.queryKey, semanticTurn: semantic,
            person: input.person, targetEntity: input.targetEntity,
            temporal: input.temporal, authorizedScope: input.authorizedScope,
        };
        const read = await this.deps.read.execute(readInput);
        if (read.status !== 'executed') throw new AppError(`READ V4 did not execute: ${read.status}`, 409);
        const result = this.deps.adapt({ actorUserId: admitted.actorUserId, query: read.query, result: read.result });
        const nextDialogue = {
            lifecycle: dialogue?.lifecycle ?? 'idle', activeDialogue: dialogue?.activeDialogue ?? null,
            suspendedDialogue: dialogue?.suspendedDialogue ?? null,
            expiresAt: dialogueLoaded.status === 'found' ? dialogueLoaded.expiresAt : admitted.expiresAt,
        };
        try {
            const applied = await this.deps.commit.applyTurn({
                turnId: admitted.turnId, actorUserId: admitted.actorUserId,
                dialogueScopeKey: admitted.dialogueScopeKey, turnSequence: admitted.turnSequence,
                expectedDialogueVersion: dialogue?.version ?? 0, ...nextDialogue, result,
            });
            return { result: applied.replay as unknown as AgentTurnResult, committed: true, replayed: applied.replayed };
        } catch (error) {
            try {
                const recovery = await this.deps.commit.reconcileApplication({
                    turnId: admitted.turnId, actorUserId: admitted.actorUserId,
                    dialogueScopeKey: admitted.dialogueScopeKey, turnSequence: admitted.turnSequence,
                });
                if (recovery.status === 'committed') {
                    return { result: resultFromReplay(recovery.resultRef), committed: true, replayed: true };
                }
            } catch {
                // Preserve the original commit error; no unverified result is returned.
            }
            throw error;
        }
    }
}

export const agentReadV4DurableOrchestrationService = new AgentReadV4DurableOrchestrationService();

