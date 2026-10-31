// Wall-clock <-> instant conversion in the user's time zone. The model
// works in local wall-clock time ("2026-11-03T16:00"); Core stores instants.
import { timeZoneOffsetMs } from '../../utils/timezone';

const LOCAL_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;
const LOCAL_DATE_TIME = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/;

function isRealDate(year: number, month: number, day: number): boolean {
    const probe = new Date(Date.UTC(year, month - 1, day));
    return probe.getUTCFullYear() === year && probe.getUTCMonth() === month - 1 && probe.getUTCDate() === day;
}

function wallClockToInstant(year: number, month: number, day: number, hour: number, minute: number, timeZone: string): Date {
    const asUtc = Date.UTC(year, month - 1, day, hour, minute);
    // Two passes settle the offset across a DST boundary.
    let instant = asUtc - timeZoneOffsetMs(new Date(asUtc), timeZone);
    instant = asUtc - timeZoneOffsetMs(new Date(instant), timeZone);
    return new Date(instant);
}

/** "2026-11-03T16:00" in `timeZone` -> ISO instant, or null if not a real time. */
export function localDateTimeToIso(value: string, timeZone: string): string | null {
    const match = LOCAL_DATE_TIME.exec(value.trim());
    if (!match) return null;
    const [year, month, day, hour, minute] = match.slice(1).map(Number);
    if (!isRealDate(year, month, day) || hour > 23 || minute > 59) return null;
    return wallClockToInstant(year, month, day, hour, minute, timeZone).toISOString();
}

/** Inclusive local day range -> [start of `from`, start of the day after `to`). */
export function localDayRangeToIso(from: string | undefined, to: string | undefined, timeZone: string): { from?: string; to?: string } | null {
    const parse = (value: string) => {
        const match = LOCAL_DATE.exec(value.trim());
        if (!match) return null;
        const [year, month, day] = match.slice(1).map(Number);
        return isRealDate(year, month, day) ? { year, month, day } : null;
    };
    const range: { from?: string; to?: string } = {};
    if (from) {
        const day = parse(from);
        if (!day) return null;
        range.from = wallClockToInstant(day.year, day.month, day.day, 0, 0, timeZone).toISOString();
    }
    if (to) {
        const day = parse(to);
        if (!day) return null;
        const next = new Date(Date.UTC(day.year, day.month - 1, day.day + 1));
        range.to = wallClockToInstant(next.getUTCFullYear(), next.getUTCMonth() + 1, next.getUTCDate(), 0, 0, timeZone).toISOString();
    }
    if (range.from && range.to && range.from >= range.to) return null;
    return range;
}

const WEEKDAYS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];

/** ISO instant -> "martes 2026-11-03 16:00" in `timeZone`. */
export function formatLocal(iso: string, timeZone: string): string {
    const date = new Date(iso);
    const local = new Date(date.getTime() + timeZoneOffsetMs(date, timeZone));
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${WEEKDAYS[local.getUTCDay()]} ${local.getUTCFullYear()}-${pad(local.getUTCMonth() + 1)}-${pad(local.getUTCDate())} ${pad(local.getUTCHours())}:${pad(local.getUTCMinutes())}`;
}

const MONTHS = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

/** ISO instant -> "el martes 3 de noviembre a las 16:00" for confirmation summaries. */
export function describeLocal(iso: string, timeZone: string): string {
    const date = new Date(iso);
    const local = new Date(date.getTime() + timeZoneOffsetMs(date, timeZone));
    const pad = (n: number) => String(n).padStart(2, '0');
    return `el ${WEEKDAYS[local.getUTCDay()]} ${local.getUTCDate()} de ${MONTHS[local.getUTCMonth()]} a las ${pad(local.getUTCHours())}:${pad(local.getUTCMinutes())}`;
}
