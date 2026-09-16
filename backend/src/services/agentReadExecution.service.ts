import type { ReadExecutionRequest, ReadExecutionResult } from '../types/agentReadExecution';
import { executeExactCommitmentCount } from './agentExactCommitmentCount.service';

export type AgentReadExecutionInput = ReadExecutionRequest & {
    actorUserId: string;
};

/**
 * Core-owned READ execution boundary. It dispatches an already canonical
 * query; it never interprets language or reconstructs query constraints.
 */
export async function executeReadExecution(input: AgentReadExecutionInput): Promise<ReadExecutionResult> {
    if (input.query.domain === 'commitment' && input.query.cardinality === 'count') {
        return executeExactCommitmentCount(input);
    }

    return {
        status: 'unsupported',
        queryKey: input.queryKey,
        reason: 'read_execution_capability_not_available',
    };
}
