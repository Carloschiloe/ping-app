// M-4 — reschedule_commitment executor (sección 46). Re-checks the REAL
// current owner/assignee authority and lifecycle status immediately before
// mutating (TOCTOU, sección 17/18/62 scenario C: "another actor changes
// date/status before execution — must detect stale canonical state and
// block, never execute a stale action").
//
// PING — RESCHEDULE WRITE / VERIFICATION / UI CONSISTENCY FIX (root cause,
// proven against real staging before writing this): this executor always
// called counterProposeCommitment, which -- by design (see
// commitment.service.ts's own comment: "V2: escribe proposed_due_at,
// nunca due_at directamente") -- writes ONLY proposed_due_at and moves the
// commitment to 'counter_proposal', waiting for a DIFFERENT party to
// accept. For a self-owned/self-assigned commitment (owner_user_id ===
// assigned_to_user_id, no counterparty_contact_id -- the actor IS the only
// possible approver), that wait can never resolve on its own: due_at is
// never touched, yet the executor's own verification only ever checked
// proposed_due_at + status==='counter_proposal', both of which WERE
// correctly written -- so "verificado" was truthful relative to the wrong
// semantic contract. Confirmed via the real physical staging record
// (commitment a5f2728f-34e0-4f8f-a11b-c94f1ab148d3: owner_user_id ===
// assigned_to_user_id === waiting_on_user_id, all the same actor;
// due_at stayed 21:30Z, proposed_due_at became 22:30Z, status became
// 'counter_proposal'). Mobile's OWN manual "Reprogramar fecha" button
// already does the right thing for exactly this case (PATCH
// /commitments/:id -> commitmentApplication.service.ts#updateCommitment ->
// editCommitment -> edit_commitment_with_evidence, a DIRECT due_at edit,
// never counter_propose) -- the Agent path was the only one using the
// wrong transition. Fix: reuse that SAME editCommitment path (never a new
// transition/RPC) when there is no real counterparty who needs to
// consent; counter_propose remains correct and untouched for a genuinely
// shared commitment (a real assignee different from the actor, or an
// external contact) -- there, someone else legitimately needs to approve
// the new date before due_at can move.
import { supabaseAdmin } from '../../lib/supabaseAdmin';
import { counterProposeCommitment, editCommitment } from '../commitment.service';
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
            .select('id, owner_user_id, assigned_to_user_id, counterparty_contact_id, status, archived_at')
            .eq('id', commitmentId)
            .maybeSingle();
        if (error) throw new AppError(error.message, 500);
        if (!current) return { status: 'failed_terminal', failureCode: 'entity_changed', verified: false };

        const isOwnerOrAssignee = current.owner_user_id === context.actorUserId || current.assigned_to_user_id === context.actorUserId;
        if (!isOwnerOrAssignee) return { status: 'failed_terminal', failureCode: 'not_authorized', verified: false };

        // PING — ARCHIVED COMMITMENT TOCTOU GAP FIX: `status` and
        // `archived_at` are independent columns -- archiving never touches
        // `status`, so an archived commitment can retain a live status
        // like 'accepted' and would otherwise still pass the
        // validFromStatuses check below, for BOTH the self-owned direct
        // edit path and the real-counterparty counter-propose path.
        // Checked here as a fast, honest TOCTOU re-check; the canonical
        // write boundary itself (edit_commitment_with_evidence /
        // apply_commitment_transition_with_evidence RPCs, both used below)
        // independently enforces the same invariant under its row lock, so
        // this is defense-in-depth, never the sole guard.
        if (current.archived_at) {
            return { status: 'failed_terminal', failureCode: 'invalid_lifecycle', verified: false };
        }

        // PING — RESCHEDULE WRITE / VERIFICATION / UI CONSISTENCY FIX: a
        // real counterparty is someone OTHER than the actor who must
        // consent to the new date -- an assignee who is a different user,
        // or an external contact. Self-assigned (assigned_to_user_id ===
        // actorUserId or null) with no counterparty_contact_id means the
        // actor is the only possible approver, so there is nothing to
        // "propose" -- the new date is confirmed immediately.
        const hasRealCounterparty =
            (!!current.assigned_to_user_id && current.assigned_to_user_id !== context.actorUserId)
            || !!current.counterparty_contact_id;

        const status = normalizeCommitmentStatus(current.status);
        // editCommitment itself has no lifecycle-status guard (sección:
        // "Lifecycle and descriptive edits cannot be mixed") -- reuse
        // counter_propose's own validFromStatuses here for BOTH paths
        // (direct edit and real counter-propose): identical set today
        // (['proposed','accepted','counter_proposal']), and it is the
        // transition whose semantics ("owner/assignee may change the
        // date") actually govern this action either way -- never a
        // duplicated, divergent status list per path.
        if (!COMMITMENT_TRANSITION_TABLE.counter_propose.validFromStatuses.includes(status)) {
            return { status: 'failed_terminal', failureCode: 'invalid_lifecycle', verified: false };
        }

        try {
            if (!hasRealCounterparty) {
                const updated = await editCommitment(context.actorUserId, commitmentId, { due_at: newDueAt });
                // Verificación desde fuente canónica: el RPC
                // edit_commitment_with_evidence devuelve la fila real tras
                // el UPDATE -- se exige que due_at (el campo que el
                // usuario/UI realmente entienden como "la fecha") coincida
                // exactamente con lo autorizado, nunca proposed_due_at.
                const verified = sameInstant(updated.due_at, newDueAt);
                return {
                    status: verified ? 'succeeded' : 'failed_terminal',
                    failureCode: verified ? undefined : 'verification_failed',
                    verified,
                    resultRef: { commitmentId, dueAt: updated.due_at, status: updated.status },
                    updatedEntityRefs: [{ entityType: 'commitment', entityId: commitmentId }],
                };
            }

            const updated = await counterProposeCommitment(context.actorUserId, commitmentId, newDueAt);

            // Verificación desde fuente canónica (sección 29/46): el RPC
            // devuelve la fila real tras el UPDATE -- se exige que
            // proposed_due_at coincida exactamente con lo autorizado. Este
            // camino sí es una propuesta pendiente (hay una contraparte
            // real que debe aceptarla) -- due_at deliberadamente NO
            // cambia todavía.
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
