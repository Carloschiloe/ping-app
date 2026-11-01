// M11 — forget_fact executor: removes one fact the user asked Ping to
// remember. Owner-only by construction (the delete is scoped to the actor).
import { forgetUserFact } from '../memoryFacts.service';
import type { ToolExecutor, ToolExecutionContext, ToolExecutionOutcome } from '../../types/agentExecution';

export const forgetFactExecutor: ToolExecutor = {
    toolId: 'forget_fact',
    version: 1,

    async execute(context: ToolExecutionContext, args: Record<string, unknown>): Promise<ToolExecutionOutcome> {
        const memoryRecordId = String(args.memoryRecordId);
        const forgotten = await forgetUserFact(context.actorUserId, memoryRecordId);
        return forgotten
            ? { status: 'succeeded', verified: true, resultRef: { memoryRecordId, status: 'deleted' }, updatedEntityRefs: [{ entityType: 'memory_record', entityId: memoryRecordId }] }
            : { status: 'failed_terminal', failureCode: 'entity_changed', verified: false };
    },
};
