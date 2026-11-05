import { normalizeCommitmentStatus } from './commitmentStatus';
import { isCommitmentOverdue } from './commitmentDisplay';

// How each commitment of a chat ended up, for its history screen.

export type Outcome = 'pending' | 'overdue' | 'done' | 'declined';

export function outcomeOf(item: any, now: Date = new Date()): Outcome {
    const status = normalizeCommitmentStatus(item.status);
    if (status === 'resolved') return 'done';
    if (status === 'rejected' || status === 'cancelled') return 'declined';
    return isCommitmentOverdue(item, now) ? 'overdue' : 'pending';
}

export function summarize(items: any[], now: Date = new Date()) {
    const counts: Record<Outcome, number> = { pending: 0, overdue: 0, done: 0, declined: 0 };
    items.forEach((item) => { counts[outcomeOf(item, now)] += 1; });
    // Kept = done out of everything that was already due.
    const decided = counts.done + counts.overdue;
    const keptPercent = decided > 0 ? Math.round((counts.done / decided) * 100) : null;
    return { counts, keptPercent };
}
