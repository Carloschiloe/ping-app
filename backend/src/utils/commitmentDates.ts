import type { RetrievalCommitment } from '../types/retrieval';

/**
 * Returns the date that represents the current temporal meaning of an item
 * for read queries. A shared proposal's latest counterproposal supersedes its
 * original due date while it is still pending. Canonical commitments keep
 * `dueAt` authoritative until their counterproposal is accepted, because the
 * transition layer intentionally persists the proposed date separately.
 */
export function effectiveCommitmentDueAt(commitment: Pick<RetrievalCommitment, 'entityType' | 'dueAt' | 'proposedDueAt'>): string | null {
    return commitment.entityType === 'commitment_proposal'
        ? commitment.proposedDueAt ?? commitment.dueAt
        : commitment.dueAt;
}
