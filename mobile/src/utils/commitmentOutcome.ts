import { normalizeCommitmentStatus } from './commitmentStatus';
import { isCommitmentOverdue, isProposalDatePassed } from './commitmentDisplay';

// How each commitment of a chat ended up, for its history screen.

// 'expired': nobody answered and its date already went by. It is neither
// late work nor done, so it never counts against what was kept.
export type Outcome = 'pending' | 'expired' | 'overdue' | 'done' | 'declined';

export function outcomeOf(item: any, now: Date = new Date()): Outcome {
    const status = normalizeCommitmentStatus(item.status);
    if (status === 'resolved') return 'done';
    if (status === 'rejected' || status === 'cancelled') return 'declined';
    const unanswered = item._isAgreementProposal === true || status === 'proposed';
    if (unanswered) return isProposalDatePassed(item.due_at, now) ? 'expired' : 'pending';
    return isCommitmentOverdue(item, now) ? 'overdue' : 'pending';
}

export function summarize(items: any[], now: Date = new Date()) {
    const counts: Record<Outcome, number> = { pending: 0, expired: 0, overdue: 0, done: 0, declined: 0 };
    items.forEach((item) => { counts[outcomeOf(item, now)] += 1; });
    // Kept = done out of everything that was already due.
    const decided = counts.done + counts.overdue;
    const keptPercent = decided > 0 ? Math.round((counts.done / decided) * 100) : null;
    return { counts, keptPercent };
}
