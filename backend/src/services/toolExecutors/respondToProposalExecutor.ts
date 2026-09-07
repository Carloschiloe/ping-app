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
            const expectedApproved = decision === 'approve';
            const verified = decision === 'approve'
                ? !!after && after.actor_has_approved === true
                : decision === 'reject'
                    ? !after || after.status === 'rejected' || (after as any).actor_role === 'none'
                    : !!after; // counter_propose: la proposal sigue existiendo con nueva fecha propuesta

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
