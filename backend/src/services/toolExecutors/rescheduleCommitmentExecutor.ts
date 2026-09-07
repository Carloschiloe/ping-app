// M-4 — reschedule_commitment executor (sección 46). Re-checks the REAL
// current owner/assignee authority and lifecycle status immediately before
// mutating (TOCTOU, sección 17/18/62 scenario C: "another actor changes
// date/status before execution — must detect stale canonical state and
// block, never execute a stale action").
import { supabaseAdmin } from '../../lib/supabaseAdmin';
import { counterProposeCommitment } from '../commitment.service';
import { COMMITMENT_TRANSITION_TABLE } from '../../utils/commitmentTransitions';
import { normalizeCommitmentStatus } from '../../utils/commitmentStatus';
import { AppError } from '../../utils/AppError';
import type { ToolExecutor, ToolExecutionContext, ToolExecutionOutcome } from '../../types/agentExecution';

// Ver createCommitmentExecutor.ts: PostgREST nunca devuelve un timestamptz
// como el mismo literal ISO con el que se escribió -- comparar el instante
// real, nunca el string crudo.
function sameInstant(a: string, b: string): boolean {
    return new Date(a).getTime() === new Date(b).getTime();
}

export const rescheduleCommitmentExecutor: ToolExecutor = {
    toolId: 'reschedule_commitment',
    version: 1,

    async execute(context: ToolExecutionContext, args: Record<string, unknown>): Promise<ToolExecutionOutcome> {
        const commitmentId = String(args.commitmentId);
        const newDueAt = String(args.newDueAt);

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
        if (!COMMITMENT_TRANSITION_TABLE.counter_propose.validFromStatuses.includes(status)) {
            return { status: 'failed_terminal', failureCode: 'invalid_lifecycle', verified: false };
        }

        try {
            const updated = await counterProposeCommitment(context.actorUserId, commitmentId, newDueAt);

            // Verificación desde fuente canónica (sección 29/46): el RPC
            // devuelve la fila real tras el UPDATE -- se exige que
            // proposed_due_at coincida exactamente con lo autorizado.
            const verified = sameInstant(updated.proposed_due_at, newDueAt) && updated.status === 'counter_proposal';
            return {
                status: verified ? 'succeeded' : 'failed_terminal',
                failureCode: verified ? undefined : 'verification_failed',
                verified,
                resultRef: { commitmentId, proposedDueAt: updated.proposed_due_at, status: updated.status },
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
