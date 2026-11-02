import { format, isToday, isTomorrow, isYesterday, isSameYear, differenceInCalendarDays } from 'date-fns';
import { es } from 'date-fns/locale';

// The day badge on the left of every row: when it is due, readable without
// looking at the section title above it.
export function dayBadge(iso?: string | null, now: Date = new Date()): { day: string; detail: string | null } {
    if (!iso) return { day: 'sin', detail: 'fecha' };
    const date = new Date(iso);
    const time = format(date, 'HH:mm');
    if (isToday(date)) return { day: 'hoy', detail: time };
    if (isYesterday(date)) return { day: 'ayer', detail: time };
    if (isTomorrow(date)) return { day: 'mañana', detail: time };
    const days = differenceInCalendarDays(date, now);
    if (days > 0 && days < 7) return { day: format(date, 'EEE d', { locale: es }), detail: time };
    return {
        day: format(date, 'd MMM', { locale: es }).replace('.', ''),
        detail: isSameYear(date, now) ? time : format(date, 'yyyy'),
    };
}
