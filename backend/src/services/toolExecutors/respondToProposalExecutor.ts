// M-4 — respond_to_proposal executor (sección 45). Re-checks the actor's
// REAL, current participation state immediately before acting — never
// trusts the plan-time snapshot (TOCTOU, sección 17/18/62 scenario C/D):
// another participant may have already fully resolved the proposal, or the
// actor's own response may have changed, between planning and execution.
// The real RPC (respond_to_commitment_proposal) has no target-participant
// argument at all — an actor can structurally never respond on behalf of
// someone else (confirmed during the participant-visibility ticket).
import { getAgreementProposals, respondToSharedProposal } from '../commitmentProposal.service';
import { AppError } from '../../utils/AppError';
import type { ToolExecutor, ToolExecutionContext, ToolExecutionOutcome } from '../../types/agentExecution';

// Ver createCommitmentExecutor.ts/rescheduleCommitmentExecutor.ts: PostgREST
// nunca devuelve un timestamptz como el mismo literal ISO con el que se
// escribió -- comparar el instante real, nunca el string crudo.
function sameInstant(a: string, b: string): boolean {
    return new Date(a).getTime() === new Date(b).getTime();
}

export const respondToProposalExecutor: ToolExecutor = {
    toolId: 'respond_to_proposal',
    version: 1,

    async execute(context: ToolExecutionContext, args: Record<string, unknown>): Promise<ToolExecutionOutcome> {
        const proposalId = String(args.proposalId);
        const decision = args.decision as 'approve' | 'reject' | 'counter_propose';
        const proposedDueAt = args.proposedDueAt ? String(args.proposedDueAt) : null;

        const proposals = await getAgreementProposals(context.actorUserId);
        const current = proposals.find((p: any) => p.id === proposalId);
        if (!current) {
            // Ya no está pendiente para este actor (confirmada/rechazada/
            // inaccesible) -- estado canónico real cambió, nunca se ejecuta
            // sobre datos obsoletos.
            return { status: 'failed_terminal', failureCode: 'entity_changed', verified: false };
        }
        if (!current.actor_can_respond) {
            return { status: 'failed_terminal', failureCode: 'not_authorized', verified: false };
        }

        try {
            const result = await respondToSharedProposal(context.actorUserId, proposalId, decision, { proposedDueAt });

            // Verificación desde fuente canónica (sección 29/45): la propia
            // fila de respuesta del actor debe reflejar la decisión real.
            const refreshed = await getAgreementProposals(context.actorUserId);
            const after = refreshed.find((p: any) => p.id === proposalId);
            const verified = decision === 'approve'
                ? !!after && after.id === proposalId && after.actor_has_approved === true
                : decision === 'reject'
                    ? !after || (after.id === proposalId && (after.status === 'rejected' || (after as any).actor_role === 'none'))
                    // PING — CANONICAL POST-WRITE VERIFICATION COMPLETENESS:
                    // counter_propose previously accepted mere `!!after`
                    // (the proposal merely still existing, with NO check
                    // that its date actually changed) -- this MUST
                    // independently confirm: (1) same target proposal id,
                    // (2) it still corresponds to a real pending
                    // counter-proposal (status: 'counter_proposal', per
                    // toAgreementView), (3) the canonical persisted date
                    // (proposed_due_at, sourced from
                    // latest_counterproposal_due_at) represents the SAME
                    // INSTANT as the authorized proposedDueAt -- never the
                    // pre-write cache, the request payload, or mere
                    // existence, and (4) the actor who made this
                    // counter-proposal is the same actor who is executing
                    // it now (never someone else's stale counter-proposal
                    // read as if it were this authorized one).
                    : !!after
                        && after.id === proposalId
                        && after.status === 'counter_proposal'
                        && !!proposedDueAt
                        && !!after.proposed_due_at
                        && sameInstant(after.proposed_due_at, proposedDueAt)
                        && after.latest_counterproposal_by_user_id === context.actorUserId;

            return {
                status: verified ? 'succeeded' : 'failed_terminal',
                failureCode: verified ? undefined : 'verification_failed',
                verified,
                resultRef: { proposalId, decision, materializedCommitmentId: result?.commitment?.id ?? null },
                updatedEntityRefs: [{ entityType: 'commitment_proposal', entityId: proposalId }],
                createdEntityRefs: result?.commitment ? [{ entityType: 'commitment', entityId: result.commitment.id }] : [],
            };
        } catch (err) {
            if (err instanceof AppError || (err as any)?.code) {
                const pgCode = (err as any)?.code;
                const code = pgCode === '42501' ? 'not_authorized' : pgCode === 'P0001' ? 'invalid_lifecycle' : 'transient_failure';
                return { status: code === 'transient_failure' ? 'failed_retryable' : 'failed_terminal', failureCode: code, verified: false };
            }
            throw err;
        }
    },
};
