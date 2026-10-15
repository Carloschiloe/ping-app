// Canonical edit_commitment executor. Descriptive changes go through the
// application boundary and its audited edit_commitment_with_evidence RPC;
// this executor never writes to commitments directly.
import { supabaseAdmin } from '../../lib/supabaseAdmin';
import { updateCommitment } from '../commitmentApplication.service';
import { AppError } from '../../utils/AppError';
import type { ToolExecutor, ToolExecutionContext, ToolExecutionOutcome } from '../../types/agentExecution';

export const editCommitmentExecutor: ToolExecutor = {
    toolId: 'edit_commitment',
    version: 1,

    async execute(context: ToolExecutionContext, args: Record<string, unknown>): Promise<ToolExecutionOutcome> {
        const commitmentId = String(args.commitmentId);
        const title = typeof args.title === 'string' ? args.title.trim() : '';
        if (!title) return { status: 'failed_terminal', failureCode: 'condition_not_met', verified: false };

        const { data: current, error } = await supabaseAdmin
            .from('commitments')
            .select('id, owner_user_id, archived_at, status')
            .eq('id', commitmentId)
            .maybeSingle();
        if (error) throw new AppError(error.message, 500);
        if (!current) return { status: 'failed_terminal', failureCode: 'entity_changed', verified: false };
        if (current.owner_user_id !== context.actorUserId) {
            return { status: 'failed_terminal', failureCode: 'not_authorized', verified: false };
        }
        if (current.archived_at) {
            return { status: 'failed_terminal', failureCode: 'invalid_lifecycle', verified: false };
        }

        try {
            const updated = await updateCommitment(context.actorUserId, commitmentId, { title });
            const verified = updated.id === commitmentId && updated.title === title;
            return {
                status: verified ? 'succeeded' : 'failed_terminal',
                failureCode: verified ? undefined : 'verification_failed',
                verified,
                resultRef: { commitmentId, title: updated.title, status: updated.status },
                updatedEntityRefs: [{ entityType: 'commitment', entityId: commitmentId }],
            };
        } catch (err) {
            if (err instanceof AppError || (err as any)?.code) {
                const pgCode = (err as any)?.code;
                const code = pgCode === '42501' ? 'not_authorized'
                    : pgCode === 'P0001' ? 'invalid_lifecycle'
                    : pgCode === 'P0002' ? 'entity_changed'
                            : 'transient_failure';
                return {
                    status: code === 'transient_failure' ? 'failed_retryable' : 'failed_terminal',
                    failureCode: code,
                    verified: false,
                };
            }
            throw err;
        }
    },
};
