import type { NormalizedSemanticTurnV4 } from '../types/agentTurnCommit';
import type { CanonicalReadScope } from '../types/agentReadQuery';
import type { ReadExecutionResult } from '../types/agentReadExecution';
import type { ReadTargetResolutionResult } from '../types/agentReadTargetResolution';
import type { RetrievalCommitment, PersonResolutionResult } from '../types/retrieval';
import type { TemporalCoreResult } from './temporalCore.service';
import { AgentReadTargetResolutionService } from './agentReadTargetResolution.service';
import { AgentReadQueryPlanner } from './agentReadQueryPlanner.service';
import { executeReadExecution } from './agentReadExecution.service';

export type AgentReadV4OrchestrationInput = {
    actorUserId: string;
    queryKey: string;
    semanticTurn: NormalizedSemanticTurnV4;
    person: PersonResolutionResult | null;
    targetEntity?: RetrievalCommitment | null;
    temporal: TemporalCoreResult;
    authorizedScope: CanonicalReadScope;
};

export type AgentReadV4OrchestrationResult =
    | { status: 'executed'; query: NonNullable<Extract<ReturnType<AgentReadQueryPlanner['plan']>, { status: 'planned' }>['query']>; result: ReadExecutionResult }
    | { status: 'clarification_required'; reason: 'target_resolution' | 'temporal_context'; targetResolution?: ReadTargetResolutionResult; temporal?: TemporalCoreResult }
    | { status: 'unsupported' | 'invalid'; reason: string };

export class AgentReadV4OrchestrationService {
    public constructor(
        private readonly resolver = new AgentReadTargetResolutionService(),
        private readonly planner = new AgentReadQueryPlanner(),
    ) {}

    public async execute(input: AgentReadV4OrchestrationInput): Promise<AgentReadV4OrchestrationResult> {
        const targetResolution = await this.resolver.resolve({
            actorUserId: input.actorUserId,
            semanticTurn: input.semanticTurn,
            person: input.person,
            targetEntity: input.targetEntity,
            authorizedScope: input.authorizedScope,
        });
        const planned = this.planner.plan({
            semanticTurn: input.semanticTurn,
            targetResolution,
            temporal: input.temporal,
            authorizedScope: input.authorizedScope,
        });
        if (planned.status !== 'planned') return planned;
        const result = await executeReadExecution({ queryKey: input.queryKey, query: planned.query, actorUserId: input.actorUserId });
        return { status: 'executed', query: planned.query, result };
    }
}

export const agentReadV4OrchestrationService = new AgentReadV4OrchestrationService();
