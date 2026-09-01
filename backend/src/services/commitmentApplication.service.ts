import { AppError } from '../utils/AppError';
import { normalizeCommitmentStatus } from '../utils/commitmentStatus';
import * as commitmentLifecycle from './commitment.service';
import * as commitmentProposals from './commitmentProposal.service';

// This module is the only application-facing Commitment write boundary.
// Controllers and compatibility routes delegate here; persistence details
// remain in the proposal/lifecycle services and their guarded database RPCs.

export const createProposal = commitmentProposals.createProposal;
export const createSharedProposal = commitmentProposals.createSharedProposal;
export const respondToSharedProposal = commitmentProposals.respondToSharedProposal;
export const getAgreementProposals = commitmentProposals.getAgreementProposals;
export const confirmProposal = commitmentProposals.confirmProposal;
export const rejectProposal = commitmentProposals.rejectProposal;

// POST /commitments compatibility contract: the request itself is the
// explicit human confirmation. A Proposal is always persisted before a
// Commitment can be confirmed, preserving source_message_id and proposal_id.
export const createConfirmedCommitment = commitmentProposals.createConfirmedCommitment;

export const acceptCommitment = commitmentLifecycle.acceptCommitment;
export const rejectCommitment = commitmentLifecycle.rejectCommitment;
export const counterProposeCommitment = commitmentLifecycle.counterProposeCommitment;
export const markActionCompleted = commitmentLifecycle.markActionCompleted;
export const resolveCommitment = commitmentLifecycle.resolveCommitment;
export const cancelCommitment = commitmentLifecycle.cancelCommitment;
export const reopenCommitment = commitmentLifecycle.reopenCommitment;
export const reassignCommitment = commitmentLifecycle.reassignCommitment;
export const scheduleFollowUp = commitmentLifecycle.scheduleFollowUp;
export const archiveCommitment = commitmentLifecycle.archiveCommitment;

// Legacy /postpone adapter. It names an old route but executes the canonical
// counter-proposal transition and evidence RPC.
export const postponeCommitment = commitmentLifecycle.counterProposeCommitment;

export const getCommitments = commitmentLifecycle.getCommitments;
export const pingCommitment = commitmentLifecycle.pingCommitment;
export const checkConflict = commitmentLifecycle.checkConflict;

const EDIT_FIELDS = [
    'title',
    'description',
    'due_at',
    'type',
    'priority',
    'expected_result',
] as const;

const REASSIGN_FIELDS = [
    'assigned_to_user_id',
    'counterparty_contact_id',
] as const;

type EditField = typeof EDIT_FIELDS[number];

function pickFields(input: Record<string, any>, fields: readonly string[]) {
    const result: Record<string, any> = {};
    for (const field of fields) {
        if (Object.prototype.hasOwnProperty.call(input, field)) {
            result[field] = input[field];
        }
    }
    return result;
}

async function applyLegacyLifecycleStatus(
    userId: string,
    commitmentId: string,
    input: Record<string, any>
) {
    const current = await commitmentLifecycle.getCommitmentWriteView(userId, commitmentId);
    const requested = normalizeCommitmentStatus(input.status);
    const currentStatus = normalizeCommitmentStatus(current.status);

    if (requested === currentStatus) return current;

    switch (requested) {
        case 'accepted':
            return commitmentLifecycle.acceptCommitment(userId, commitmentId);
        case 'rejected':
            return commitmentLifecycle.rejectCommitment(
                userId,
                commitmentId,
                input.rejection_reason ?? null
            );
        case 'counter_proposal':
            if (!input.proposed_due_at) {
                throw new AppError(
                    'Use POST /commitments/:id/counter-propose with proposedDueAt',
                    400
                );
            }
            return commitmentLifecycle.counterProposeCommitment(
                userId,
                commitmentId,
                input.proposed_due_at
            );
        case 'cancelled':
            return commitmentLifecycle.cancelCommitment(
                userId,
                commitmentId,
                input.rejection_reason ?? null
            );
        case 'proposed':
            if (!['rejected', 'resolved', 'cancelled'].includes(currentStatus)) {
                throw new AppError('Use an explicit Commitment transition endpoint', 400);
            }
            return commitmentLifecycle.reopenCommitment(userId, commitmentId);
        case 'resolved':
            throw new AppError(
                'Use POST /commitments/:id/resolve with a resolution result',
                400
            );
    }
}

// PATCH /commitments/:id remains available for current clients, but it is an
// adapter rather than a writer. Field edits use edit_commitment_with_evidence;
// legacy lifecycle values are translated to explicit transition operations.
// Lifecycle and descriptive edits cannot be mixed in one ambiguous request.
export async function updateCommitment(
    userId: string,
    commitmentId: string,
    input: Record<string, any>
) {
    const edit = pickFields(input, EDIT_FIELDS) as Partial<Record<EditField, any>>;
    const reassign = pickFields(input, REASSIGN_FIELDS);
    const hasStatus = Object.prototype.hasOwnProperty.call(input, 'status')
        && input.status !== null
        && input.status !== undefined;
    const hasEdit = Object.keys(edit).length > 0;
    const hasReassign = Object.keys(reassign).length > 0;

    if (hasStatus) {
        if (hasEdit || hasReassign) {
            throw new AppError(
                'Lifecycle status cannot be combined with field edits; use an explicit transition endpoint',
                400
            );
        }
        return applyLegacyLifecycleStatus(userId, commitmentId, input);
    }

    if (input.proposed_due_at !== undefined || input.rejection_reason !== undefined) {
        throw new AppError(
            'Lifecycle fields require an explicit Commitment transition endpoint',
            400
        );
    }
    if (input.meta !== undefined) {
        throw new AppError('Commitment metadata is not editable through PATCH', 400);
    }
    if (!hasEdit && !hasReassign) {
        throw new AppError('Commitment edit cannot be empty', 400);
    }

    // Existing mobile may submit descriptive edits and responsibility in the
    // same PATCH. Preserve that contract while routing responsibility through
    // the explicit reassign transition. Each resulting domain operation is
    // independently atomic with its own Event and Audit evidence.
    let result: any = null;
    if (hasReassign) {
        result = await commitmentLifecycle.reassignCommitment(
            userId,
            commitmentId,
            reassign.assigned_to_user_id ?? null,
            reassign.counterparty_contact_id ?? null
        );
    }
    if (hasEdit) {
        result = await commitmentLifecycle.editCommitment(userId, commitmentId, edit);
    }
    return result;
}

// DELETE compatibility endpoint delegates to recoverable archive.
export const deleteCommitment = archiveCommitment;
