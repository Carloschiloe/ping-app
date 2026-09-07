// M-4 — complete_commitment executor (sección 47). Scenario D of the ticket
// exactly: "if valid at plan time, but already completed before execute: no
// second transition; return entity_changed/invalid_lifecycle honestly."
import { supabaseAdmin } from '../../lib/supabaseAdmin';
import { resolveCommitment } from '../commitment.service';
import { COMMITMENT_TRANSITION_TABLE } from '../../utils/commitmentTransitions';
import { normalizeCommitmentStatus } from '../../utils/commitmentStatus';
import { AppError } from '../../utils/AppError';
import type { ToolExecutor, ToolExecutionContext, ToolExecutionOutcome } from '../../types/agentExecution';

export const completeCommitmentExecutor: ToolExecutor = {
    toolId: 'complete_commitment',
    version: 1,

    async execute(context: ToolExecutionContext, args: Record<string, unknown>): Promise<ToolExecutionOutcome> {
        const commitmentId = String(args.commitmentId);
        const resolutionResult = String(args.resolutionResult);

        const { data: current, error } = await supabaseAdmin
            .from('commitments')
            .select('id, owner_user_id, assigned_to_user_id, status')
            .eq('id', commitmentId)
            .maybeSingle();
        if (error) throw new AppError(error.message, 500);
        if (!current) return { status: 'failed_terminal', failureCode: 'entity_changed', verified: false };

        const isOwnerOrAssignee = current.owner_user_id === context.actorUserId || current.assigned_to_user_id === context.actorUserId;
        if (!isOwnerOrAssignee) return { status: 'failed_terminal', failureCode: 'not_authorized', verified: false };

        const status = normalizeCommitmentStatus(current.status);
        if (!COMMITMENT_TRANSITION_TABLE.resolve.validFromStatuses.includes(status)) {
            // Cubre exactamente el escenario D: ya estaba resuelto/cancelado/
            // rechazado antes de esta ejecución -- nunca una segunda
            // transición silenciosa.
            return { status: 'failed_terminal', failureCode: 'invalid_lifecycle', verified: false };
        }

        try {
            const updated = await resolveCommitment(context.actorUserId, commitmentId, resolutionResult);

            const verified = updated.status === 'resolved';
            return {
                status: verified ? 'succeeded' : 'failed_terminal',
                failureCode: verified ? undefined : 'verification_failed',
                verified,
                resultRef: { commitmentId, status: updated.status },
                updatedEntityRefs: [{ entityType: 'commitment', entityId: commitmentId }],
            };
        } catch (err) {
            if (err instanceof AppError || (err as any)?.code) {
                const pgCode = (err as any)?.code;
                const code = pgCode === '42501' ? 'not_authorized' : pgCode === '40001' ? 'entity_changed' : 'transient_failure';
                return { status: code === 'transient_failure' ? 'failed_retryable' : 'failed_terminal', failureCode: code, verified: false };
            }
            throw err;
        }
    },
};
