import { resolveAgentTimezone } from '../utils/timezone';

export const AUTOMATION_DEFAULT_TIMEZONE = 'America/Santiago';

export function resolveAutomationTimezone(candidate?: unknown): string {
    if (typeof candidate !== 'string' || candidate.trim() === '') {
        return AUTOMATION_DEFAULT_TIMEZONE;
    }
    const trimmed = candidate.trim();
    return resolveAgentTimezone(trimmed) === 'UTC' && trimmed.toUpperCase() !== 'UTC'
        ? AUTOMATION_DEFAULT_TIMEZONE
        : trimmed;
}

export function localDateKey(now: Date, timezone: string): string {
    const parts = new Intl.DateTimeFormat('en-CA', {
        timeZone: timezone,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
    }).formatToParts(now);
    const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
    return `${values.year}-${values.month}-${values.day}`;
}

export function localHourAndMinute(now: Date, timezone: string): { hour: number; minute: number } {
    const parts = new Intl.DateTimeFormat('en-US', {
        timeZone: timezone,
        hour: '2-digit',
        minute: '2-digit',
        hourCycle: 'h23',
    }).formatToParts(now);
    const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
    return { hour: Number(values.hour), minute: Number(values.minute) };
}

export function isMorningRoutineWindow(now: Date, timezone: string): boolean {
    const { hour, minute } = localHourAndMinute(now, timezone);
    return hour === 8 && minute < 5;
}

export function localDayName(now: Date, timezone: string): string {
    return new Intl.DateTimeFormat('es-CL', {
        timeZone: timezone,
        weekday: 'long',
        day: 'numeric',
        month: 'long',
    }).format(now);
}
