export type CanonicalCommitmentStatus = 'proposed' | 'accepted' | 'rejected' | 'completed' | 'counter_proposal';

export function normalizeCommitmentStatus(status?: string | null): CanonicalCommitmentStatus {
    if (!status) return 'proposed';

    if (status === 'pending') return 'proposed';
    if (status === 'done') return 'completed';
    if (status === 'in_progress') return 'accepted';
    if (status === 'postponed') return 'counter_proposal';
    if (status === 'counter_proposal') return 'counter_proposal';
    if (status === 'accepted') return 'accepted';
    if (status === 'rejected') return 'rejected';
    if (status === 'completed') return 'completed';
    return 'proposed';
}
