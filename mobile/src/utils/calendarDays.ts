import {
    addDays, endOfMonth, endOfWeek, format, isBefore, startOfDay, startOfMonth, startOfWeek,
} from 'date-fns';

// Calendar helpers for the Hoy week strip and month view. A day carries a
// mark when something is due on it; "overdue" wins over "pending" so a late
// item is never hidden behind an ordinary one.
export type DayMark = 'pending' | 'overdue';

export const dayKey = (date: Date) => format(date, 'yyyy-MM-dd');

export function buildDayMarks(
    items: { due_at?: string | null }[],
    isOverdue: (item: any) => boolean,
): Record<string, DayMark> {
    const marks: Record<string, DayMark> = {};
    items.forEach((item) => {
        if (!item.due_at) return;
        const key = dayKey(new Date(item.due_at));
        if (isOverdue(item)) marks[key] = 'overdue';
        else if (!marks[key]) marks[key] = 'pending';
    });
    return marks;
}

// Weeks start on Monday, as in Chile.
export function weekDays(anchor: Date): Date[] {
    const start = startOfWeek(anchor, { weekStartsOn: 1 });
    return Array.from({ length: 7 }, (_, i) => addDays(start, i));
}

// Every day shown in a month grid: whole weeks, Monday to Sunday, so the
// first and last rows may hold days of the neighbouring months.
export function monthGrid(anchor: Date): Date[] {
    const first = startOfWeek(startOfMonth(anchor), { weekStartsOn: 1 });
    const last = endOfWeek(endOfMonth(anchor), { weekStartsOn: 1 });
    const days: Date[] = [];
    for (let d = first; !isBefore(startOfDay(last), startOfDay(d)); d = addDays(d, 1)) days.push(d);
    return days;
}
