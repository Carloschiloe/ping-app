import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { outcomeOf } from './commitmentOutcome';

// What the chat summary shows as agreements: the chat's real commitments,
// with their real date and state, never the model's reading of the text.
// Cancelled ones are left out; everything else matches the chat's strip.

export type SummaryCommitment = {
    id: string;
    title: string;
    when: string | null;
    who: string | null;
    state: 'overdue' | 'pending' | 'expired' | 'done';
};

const OPEN_LIMIT = 6;
const DONE_LIMIT = 3;

const firstName = (name?: string | null) => (name || '').trim().split(' ')[0] || null;

export function whenLabel(dueAt: string | null | undefined): string | null {
    if (!dueAt) return null;
    const date = new Date(dueAt);
    if (Number.isNaN(date.getTime())) return null;
    return format(date, "EEEE d 'de' MMMM, HH:mm", { locale: es });
}

function toLine(item: any, state: SummaryCommitment['state'], myId?: string | null): SummaryCommitment {
    const assignee = item.assigned_to_user_id;
    const who = assignee && assignee === myId ? 'Tú' : firstName(item.assignee?.full_name);
    return { id: item.id, title: item.title || 'Compromiso', when: whenLabel(item.due_at), who, state };
}

const dueTime = (item: any) => new Date(item.due_at).getTime();
const createdTime = (item: any) => new Date(item.created_at || 0).getTime();
const doneTime = (item: any) => new Date(item.resolved_at || item.updated_at || item.due_at || 0).getTime();

export function summaryCommitments(items: any[], myId?: string | null, now: Date = new Date()) {
    const overdue: any[] = [];
    const upcoming: any[] = [];
    const unanswered: any[] = [];
    const undated: any[] = [];
    const done: any[] = [];
    items.forEach((item) => {
        const outcome = outcomeOf(item, now);
        if (outcome === 'overdue') overdue.push(item);
        else if (outcome === 'expired') unanswered.push(item);
        else if (outcome === 'pending') (item.due_at ? upcoming : undated).push(item);
        else if (outcome === 'done') done.push(item);
    });
    // Late first, then what comes next, then what nobody answered (newest
    // first), then what has no date yet (newest first).
    overdue.sort((a, b) => dueTime(a) - dueTime(b));
    upcoming.sort((a, b) => dueTime(a) - dueTime(b));
    unanswered.sort((a, b) => dueTime(b) - dueTime(a));
    undated.sort((a, b) => createdTime(b) - createdTime(a));
    done.sort((a, b) => doneTime(b) - doneTime(a));

    const open = [
        ...overdue.map((i) => toLine(i, 'overdue', myId)),
        ...upcoming.map((i) => toLine(i, 'pending', myId)),
        ...unanswered.map((i) => toLine(i, 'expired', myId)),
        ...undated.map((i) => toLine(i, 'pending', myId)),
    ];
    return {
        open: open.slice(0, OPEN_LIMIT),
        openTotal: open.length,
        recentlyDone: done.slice(0, DONE_LIMIT).map((i) => toLine(i, 'done', myId)),
    };
}
