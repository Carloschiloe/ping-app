// M-4 — Tool Executor Registry (sección 14/15). Maps a toolId to its ONE
// real executor implementation. No executor exists for an unknown or
// not-yet-enabled tool — the execution service must never fall back to a
// generic execute(toolId, args) path (sección 3).
import { sendMessageExecutor } from './toolExecutors/sendMessageExecutor';
import { createCommitmentExecutor } from './toolExecutors/createCommitmentExecutor';
import { respondToProposalExecutor } from './toolExecutors/respondToProposalExecutor';
import { rescheduleCommitmentExecutor } from './toolExecutors/rescheduleCommitmentExecutor';
import { completeCommitmentExecutor } from './toolExecutors/completeCommitmentExecutor';
import type { ToolExecutor } from '../types/agentExecution';

const TOOL_EXECUTORS: Record<string, ToolExecutor> = {
    send_message: sendMessageExecutor,
    create_commitment: createCommitmentExecutor,
    respond_to_proposal: respondToProposalExecutor,
    reschedule_commitment: rescheduleCommitmentExecutor,
    complete_commitment: completeCommitmentExecutor,
};

export function getToolExecutor(toolId: string): ToolExecutor | null {
    return TOOL_EXECUTORS[toolId] ?? null;
}
