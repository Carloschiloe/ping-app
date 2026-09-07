// M-4 — create_commitment executor (sección 44). Standing product rule
// (sección 8) preserved exactly: never bypasses the proposal lifecycle — a
// shared action (responsiblePersonId set) ALWAYS goes through
// createSharedProposal (creates a pending proposal, never an already-
// accepted commitment), a personal one goes through createConfirmedCommitment
// (which itself creates a proposal first, then confirms it — see
// commitmentProposal.service.ts, unchanged by M-4).
import { createConfirmedCommitment, createSharedProposal } from '../commitmentProposal.service';
import { assertConversationParticipantReference } from '../../utils/authz';
import { AppError } from '../../utils/AppError';
import type { ToolExecutor, ToolExecutionContext, ToolExecutionOutcome } from '../../types/agentExecution';

// PostgREST/supabase-js never round-trips a timestamptz as the same literal
// ISO string it was written with (offset/precision formatting differ) --
// verification must compare the real instant, never the raw string
// (hallazgo real: exact string equality made every single execution fail
// verification_failed even on a fully correct write).
function sameInstant(a: string, b: string): boolean {
    return new Date(a).getTime() === new Date(b).getTime();
}

export const createCommitmentExecutor: ToolExecutor = {
    toolId: 'create_commitment',
    version: 1,

    async execute(context: ToolExecutionContext, args: Record<string, unknown>): Promise<ToolExecutionOutcome> {
        const title = String(args.title);
        const dueAt = String(args.dueAt);
        const responsiblePersonId = args.responsiblePersonId ? String(args.responsiblePersonId) : null;
        const conversationId = args.conversationId ? String(args.conversationId) : null;

        if (responsiblePersonId && !conversationId) {
            // Precondición estructural (sección 17): una proposal compartida
            // exige conversación real -- si esto falta a la hora de
            // ejecutar, es un fallo de contexto, nunca un intento silencioso.
            return { status: 'failed_terminal', failureCode: 'invalid_lifecycle', verified: false };
        }

        try {
            if (responsiblePersonId) {
                if (responsiblePersonId !== context.actorUserId) {
                    await assertConversationParticipantReference(responsiblePersonId, conversationId!);
                }
                const proposal = await createSharedProposal(context.actorUserId, {
                    title, due_at: dueAt, assigned_to_user_id: responsiblePersonId, conversation_id: conversationId,
                });
                const verified = proposal.title === title && sameInstant(proposal.due_at, dueAt);
                if (!verified) return { status: 'failed_terminal', failureCode: 'verification_failed', verified: false, resultRef: { proposalId: proposal.id } };
                return {
                    status: 'succeeded', verified: true,
                    resultRef: { proposalId: proposal.id, status: proposal.status },
                    createdEntityRefs: [{ entityType: 'commitment_proposal', entityId: proposal.id }],
                };
            }

            const commitment = await createConfirmedCommitment(context.actorUserId, { title, due_at: dueAt });
            const verified = commitment.title === title && sameInstant(commitment.due_at, dueAt);
            if (!verified) return { status: 'failed_terminal', failureCode: 'verification_failed', verified: false, resultRef: { commitmentId: commitment.id } };
            return {
                status: 'succeeded', verified: true,
                resultRef: { commitmentId: commitment.id, status: commitment.status },
                createdEntityRefs: [{ entityType: 'commitment', entityId: commitment.id }],
            };
        } catch (err) {
            if (err instanceof AppError) {
                const code = err.statusCode === 403 ? 'not_authorized' : err.statusCode === 400 ? 'invalid_lifecycle' : 'transient_failure';
                return { status: code === 'transient_failure' ? 'failed_retryable' : 'failed_terminal', failureCode: code, verified: false };
            }
            throw err;
        }
    },
};
