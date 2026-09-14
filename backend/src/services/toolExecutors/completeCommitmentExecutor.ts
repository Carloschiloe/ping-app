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
            .select('id, owner_user_id, assigned_to_user_id, status, archived_at')
            .eq('id', commitmentId)
            .maybeSingle();
        if (error) throw new AppError(error.message, 500);
        if (!current) return { status: 'failed_terminal', failureCode: 'entity_changed', verified: false };

        const isOwnerOrAssignee = current.owner_user_id === context.actorUserId || current.assigned_to_user_id === context.actorUserId;
        if (!isOwnerOrAssignee) return { status: 'failed_terminal', failureCode: 'not_authorized', verified: false };

        // PING — ARCHIVED COMMITMENT TOCTOU GAP FIX: `status` and
        // `archived_at` are independent columns -- archiving never touches
        // `status` (archive_commitment_with_evidence writes ONLY
        // archived_at), so an archived commitment can retain a live status
        // like 'accepted' and would otherwise still pass the
        // validFromStatuses check below. Checked here as a fast, honest
        // TOCTOU re-check (this executor's own re-fetch, same principle as
        // the entity/status re-checks around it); the canonical write
        // boundary itself (apply_commitment_transition_with_evidence RPC)
        // independently enforces the same invariant under its row lock, so
        // this is defense-in-depth, never the sole guard.
        if (current.archived_at) {
            return { status: 'failed_terminal', failureCode: 'invalid_lifecycle', verified: false };
        }

        const status = normalizeCommitmentStatus(current.status);
        if (!COMMITMENT_TRANSITION_TABLE.resolve.validFromStatuses.includes(status)) {
            // Cubre exactamente el escenario D: ya estaba resuelto/cancelado/
            // rechazado antes de esta ejecución -- nunca una segunda
            // transición silenciosa.
            return { status: 'failed_terminal', failureCode: 'invalid_lifecycle', verified: false };
        }

        try {
            const updated = await resolveCommitment(context.actorUserId, commitmentId, resolutionResult);

            // PING — CANONICAL POST-WRITE VERIFICATION COMPLETENESS: status
            // alone is insufficient -- commitment.service.ts#applyCommitmentTransition
            // requires resolutionResult (tool schema also enforces
            // z.string().trim().min(1)) and persists it VERBATIM after a
            // trim (patch.resolution_result = extra.resolutionResult.trim(),
            // no further normalization in commitmentTransitions.ts) -- so
            // the authorized value must exactly match what the canonical
            // RPC actually persisted, trimmed the same way, never assumed
            // equal merely because the RPC call succeeded.
            const verified = updated.id === commitmentId
                && updated.status === 'resolved'
                && updated.resolution_result === resolutionResult.trim();
            return {
                status: verified ? 'succeeded' : 'failed_terminal',
                failureCode: verified ? undefined : 'verification_failed',
                verified,
                resultRef: { commitmentId, status: updated.status, resolutionResult: updated.resolution_result },
                updatedEntityRefs: [{ entityType: 'commitment', entityId: commitmentId }],
            };
        } catch (err) {
            if (err instanceof AppError || (err as any)?.code) {
                const pgCode = (err as any)?.code;
                // PING — ARCHIVED COMMITMENT TOCTOU GAP FIX: P0001 is the
                // RPC's own "Commitment is archived" domain guard (raised
                // under the row lock, race-safe against a concurrent
                // archive between this executor's own pre-check above and
                // the write) -- same mapping respondToProposalExecutor.ts
                // already uses for its own P0001 domain errors, never a
                // new vocabulary.
                const code = pgCode === '42501' ? 'not_authorized' : pgCode === '40001' ? 'entity_changed' : pgCode === 'P0001' ? 'invalid_lifecycle' : 'transient_failure';
                return { status: code === 'transient_failure' ? 'failed_retryable' : 'failed_terminal', failureCode: code, verified: false };
            }
            throw err;
        }
    },
};
