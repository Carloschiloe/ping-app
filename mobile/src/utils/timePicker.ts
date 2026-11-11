// The pieces of Vorian's clock that are plain arithmetic, kept apart from the
// screen so they can be checked on their own.

export type QuickPick = { label: string; at: Date };

const DAY_NAMES = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb'];
const DAY_LONG = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
const MONTHS = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

export const two = (value: number) => String(value).padStart(2, '0');

export function startOfDay(date: Date): Date {
    const d = new Date(date);
    d.setHours(0, 0, 0, 0);
    return d;
}

export function dayOffset(date: Date, now: Date): number {
    return Math.round((startOfDay(date).getTime() - startOfDay(now).getTime()) / 86_400_000);
}

/** The days shown in the strip: today and the next ones. */
export function dayStrip(now: Date, count = 21): { offset: number; top: string; day: number; date: Date }[] {
    return Array.from({ length: count }, (_, offset) => {
        const date = startOfDay(now);
        date.setDate(date.getDate() + offset);
        const top = offset === 0 ? 'hoy' : offset === 1 ? 'mañ' : DAY_NAMES[date.getDay()];
        return { offset, top, day: date.getDate(), date };
    });
}

/** One-tap choices that set the day and the time together. */
export function quickPicks(now: Date): QuickPick[] {
    const inMinutes = (minutes: number) => {
        const at = new Date(now.getTime() + minutes * 60_000);
        at.setSeconds(0, 0);
        return at;
    };
    const at = (offset: number, hour: number) => {
        const d = startOfDay(now);
        d.setDate(d.getDate() + offset);
        d.setHours(hour, 0, 0, 0);
        return d;
    };
    const picks: QuickPick[] = [
        { label: 'En 15 min', at: inMinutes(15) },
        { label: 'En 1 hora', at: inMinutes(60) },
    ];
    if (now.getHours() < 18) picks.push({ label: 'Esta tarde', at: at(0, 18) });
    picks.push({ label: 'Mañana 9:00', at: at(1, 9) });
    picks.push({ label: 'En una semana', at: at(7, 9) });
    return picks;
}

/** Common times for something that repeats every day, like the summary. */
export const TIME_PICKS: { hour: number; minute: number }[] = [
    { hour: 7, minute: 0 },
    { hour: 8, minute: 0 },
    { hour: 9, minute: 0 },
    { hour: 20, minute: 0 },
];

/** What will be saved, in words: "Mañana a las 09:30". */
export function describeChoice(date: Date, now: Date, withDay = true): string {
    const time = `${two(date.getHours())}:${two(date.getMinutes())}`;
    if (!withDay) return `Todos los días elegidos a las ${time}`;
    const offset = dayOffset(date, now);
    const day = offset === 0 ? 'Hoy'
        : offset === 1 ? 'Mañana'
        : `${DAY_LONG[date.getDay()][0].toUpperCase()}${DAY_LONG[date.getDay()].slice(1)} ${date.getDate()} de ${MONTHS[date.getMonth()]}`;
    return `${day} a las ${time}`;
}

/** The chosen day with the chosen hour and minute. */
export function compose(day: Date, hour: number, minute: number): Date {
    const d = startOfDay(day);
    d.setHours(hour, minute, 0, 0);
    return d;
}
