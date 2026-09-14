import { AppError } from '../utils/AppError';
import type { AgentTurnAdmission } from '../types/agentTurnAdmission';
import type { AgentTurnResult } from '../types/agentTurn';
import type { AgentTurnDispositionInput } from '../types/agentTurnDisposition';
import type { CanonicalSemanticProducer, CanonicalSemanticProducerInput } from './canonicalSemanticProducer.service';
import { mapSemanticTurnV2ToDisposition } from './agentTurnSemanticV2.service';
import type { AgentTurnOrchestrationDependencies } from '../types/agentTurnOrchestration';

export class AgentTurnOrchestrationService {
    public constructor(private readonly deps: AgentTurnOrchestrationDependencies, private readonly producer: Pick<CanonicalSemanticProducer, 'produce'>) {}

    public async execute(admittedTurn: AgentTurnAdmission, input: CanonicalSemanticProducerInput): Promise<{ result: AgentTurnResult; committed: boolean; replayed: boolean }> {
        const admission = await this.deps.admission.claimForProcessing(admittedTurn);
        if (admission.kind === 'completed_replay') {
            if (!admission.admission.resultRef) throw new AppError('Completed Agent turn has no replay', 500);
            return { result: admission.admission.resultRef as unknown as AgentTurnResult, committed: false, replayed: true };
        }
        if (admission.kind === 'in_flight') throw new AppError('Agent turn is already processing', 409);
        const admitted = admission.admission;
        let semantic = await this.deps.semantic.load(admitted);
        if (!semantic) {
            semantic = await this.producer.produce(input);
            semantic = await this.deps.semantic.save({ admission: admitted, semanticTurn: semantic });
        }
        const dialogue = await this.deps.dialogue.load(admitted);
        const resolution = await this.deps.resolver.resolve({ semanticTurn: semantic, dialogue });
        const dispositionInput: AgentTurnDispositionInput = { semanticTurn: mapSemanticTurnV2ToDisposition(semantic), dialogue, ...resolution };
        const decision = this.deps.disposition.decide(dispositionInput);
        const prepared = await this.deps.preparation.prepare({ disposition: decision, semanticTurn: semantic, dialogue });
        const applied = await this.deps.commit.applyTurn({
            turnId: admitted.turnId, actorUserId: admitted.actorUserId, dialogueScopeKey: admitted.dialogueScopeKey,
            turnSequence: admitted.turnSequence, expectedDialogueVersion: dialogue?.version ?? 0,
            lifecycle: prepared.nextDialogue.lifecycle, activeDialogue: prepared.nextDialogue.activeDialogue,
            suspendedDialogue: prepared.nextDialogue.suspendedDialogue, expiresAt: prepared.nextDialogue.expiresAt,
            result: prepared.result,
        });
        return { result: applied.replay as AgentTurnResult, committed: true, replayed: applied.replayed };
    }
}
