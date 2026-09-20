// M-9 — cancel_commitment executor. Seventh WRITE tool, mirrors
// completeCommitmentExecutor.ts's own TOCTOU-guard + post-write-verification
// discipline exactly, with one deliberate difference: cancel is OWNER-ONLY
// (verified directly against commitmentTransitions.ts#computeCancel before
// writing this file: "Only the owner can cancel this commitment", 403,
// enforced by the same canonical RPC this executor calls through
// commitment.service.ts#cancelCommitment) -- an assignee who CAN
// reschedule/complete a commitment CANNOT cancel it. This file's own
// pre-execution authorization check reflects that asymmetry precisely,
// never reuses the owner-OR-assignee check the sibling executors use.
import { supabaseAdmin } from '../../lib/supabaseAdmin';
import { cancelCommitment } from '../commitment.service';
import { COMMITMENT_TRANSITION_TABLE } from '../../utils/commitmentTransitions';
import { normalizeCommitmentStatus } from '../../utils/commitmentStatus';
import { AppError } from '../../utils/AppError';
import type { ToolExecutor, ToolExecutionContext, ToolExecutionOutcome } from '../../types/agentExecution';

export const cancelCommitmentExecutor: ToolExecutor = {
    toolId: 'cancel_commitment',
    version: 1,

    async execute(context: ToolExecutionContext, args: Record<string, unknown>): Promise<ToolExecutionOutcome> {
        const commitmentId = String(args.commitmentId);

        const { data: current, error } = await supabaseAdmin
            .from('commitments')
            .select('id, owner_user_id, status, archived_at')
            .eq('id', commitmentId)
            .maybeSingle();
        if (error) throw new AppError(error.message, 500);
        if (!current) return { status: 'failed_terminal', failureCode: 'entity_changed', verified: false };

        // OWNER-ONLY, deliberately never owner-or-assignee -- see this
        // file's own header comment and the planner's own matching check
        // (agentPlanner.service.ts's cancel_existing_commitment branch),
        // which already rejects a non-owner at plan time; this is the same
        // TOCTOU re-check discipline every sibling executor already applies
        // for its own authorization property (ownership could change
        // between plan and execute).
        if (current.owner_user_id !== context.actorUserId) {
            return { status: 'failed_terminal', failureCode: 'not_authorized', verified: false };
        }

        // Same archived-commitment TOCTOU guard every commitment-mutating
        // executor already applies (archiving writes ONLY archived_at,
        // never status, so an archived commitment can retain a live status
        // like 'accepted' and would otherwise still pass the
        // validFromStatuses check below).
        if (current.archived_at) {
            return { status: 'failed_terminal', failureCode: 'invalid_lifecycle', verified: false };
        }

        const status = normalizeCommitmentStatus(current.status);
        if (!COMMITMENT_TRANSITION_TABLE.cancel.validFromStatuses.includes(status)) {
            return { status: 'failed_terminal', failureCode: 'invalid_lifecycle', verified: false };
        }

        try {
            const updated = await cancelCommitment(context.actorUserId, commitmentId);

            // Post-write verification: re-read the canonical RPC's own
            // return value (never merely "the call didn't throw") and
            // confirm the exact authorized transition actually persisted --
            // same discipline as every other write tool in this codebase.
            const verified = updated.id === commitmentId && updated.status === 'cancelled';
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
                // Same error-code mapping every sibling executor already
                // uses -- never a new vocabulary. 42501: RLS/permission
                // denial at the DB layer (defense-in-depth alongside this
                // executor's own owner-only pre-check above). 40001:
                // concurrent-transition serialization conflict (row lock
                // contention). P0001: the RPC's own domain guard (e.g. a
                // race against a concurrent archive between this executor's
                // pre-check and the write).
                const code = pgCode === '42501' ? 'not_authorized' : pgCode === '40001' ? 'entity_changed' : pgCode === 'P0001' ? 'invalid_lifecycle' : 'transient_failure';
                return { status: code === 'transient_failure' ? 'failed_retryable' : 'failed_terminal', failureCode: code, verified: false };
            }
            throw err;
        }
    },
};
