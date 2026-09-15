import type { TemporalFactV3 } from '../types/agentTurnCommit';

export type TemporalCoreInput = {
    temporalFact: TemporalFactV3;
    timezone?: string;
    turnReferenceInstant?: string;
};

export type TemporalCoreValue =
    | { kind: 'civil_date'; year: number; month: number; day: number }
    | { kind: 'civil_datetime'; year: number; month: number; day: number; hour: number; minute: number; second: number; timezone: string; instant: string }
    | { kind: 'civil_time'; hour: number; minute: number; second: number; meridiem: '24h' | 'am' | 'pm' }
    | { kind: 'elapsed_target'; instant: string }
    | { kind: 'duration'; amount: number; unit: 'minutes' | 'hours' | 'days' | 'weeks' };

export type TemporalCoreResult =
    | { status: 'resolved'; value: TemporalCoreValue }
    | { status: 'ambiguous'; reason: 'clock_meridiem' | 'dst_fold'; civil: Record<string, unknown>; timezone?: string; candidates?: string[] }
    | { status: 'nonexistent_local_time'; civil: Record<string, unknown>; timezone: string }
    | { status: 'invalid'; reason: 'invalid_timezone' | 'invalid_reference_instant' | 'invalid_calendar' | 'invalid_fact' }
    | { status: 'insufficient'; reason: 'timezone_required' | 'reference_instant_required' }
    | { status: 'unsupported'; reason: 'weekday_relation' }
    | { status: 'not_applicable' };

type Civil = { year: number; month: number; day: number; hour: number; minute: number; second: number };

function validTimezone(timezone: string | undefined): timezone is string {
    if (!timezone?.trim()) return false;
    try { new Intl.DateTimeFormat('en-US', { timeZone: timezone }).format(0); return true; } catch { return false; }
}

function partsAt(instant: Date, timezone: string): Civil {
    const parts = new Intl.DateTimeFormat('en-CA', {
        timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit',
        hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
    }).formatToParts(instant);
    const values = Object.fromEntries(parts.filter((p) => p.type !== 'literal').map((p) => [p.type, Number(p.value)]));
    return { year: values.year, month: values.month, day: values.day, hour: values.hour, minute: values.minute, second: values.second };
}

function sameCivil(a: Civil, b: Civil): boolean {
    return a.year === b.year && a.month === b.month && a.day === b.day
        && a.hour === b.hour && a.minute === b.minute && a.second === b.second;
}

function validCalendar(civil: Civil): boolean {
    const date = new Date(Date.UTC(civil.year, civil.month - 1, civil.day, civil.hour, civil.minute, civil.second));
    return date.getUTCFullYear() === civil.year && date.getUTCMonth() === civil.month - 1
        && date.getUTCDate() === civil.day && date.getUTCHours() === civil.hour
        && date.getUTCMinutes() === civil.minute && date.getUTCSeconds() === civil.second;
}

function candidateInstants(civil: Civil, timezone: string): Date[] {
    const naive = Date.UTC(civil.year, civil.month - 1, civil.day, civil.hour, civil.minute, civil.second);
    const offsets = new Set<number>([0]);
    for (let delta = -48 * 60 * 60 * 1000; delta <= 48 * 60 * 60 * 1000; delta += 60 * 60 * 1000) {
        const probe = new Date(naive + delta);
        const observed = partsAt(probe, timezone);
        const localAsUtc = Date.UTC(observed.year, observed.month - 1, observed.day, observed.hour, observed.minute, observed.second);
        offsets.add(localAsUtc - probe.getTime());
    }
    const candidates: Date[] = [];
    for (const offset of offsets) {
        const candidate = new Date(naive - offset);
        if (sameCivil(partsAt(candidate, timezone), civil) && !candidates.some((item) => item.getTime() === candidate.getTime())) candidates.push(candidate);
    }
    return candidates.sort((a, b) => a.getTime() - b.getTime());
}

function requireTimezone(timezone: string | undefined): TemporalCoreResult | null {
    if (!timezone) return { status: 'insufficient', reason: 'timezone_required' };
    if (!validTimezone(timezone)) return { status: 'invalid', reason: 'invalid_timezone' };
    return null;
}

function resolveCivil(civil: Civil, timezone: string): TemporalCoreResult {
    if (!validCalendar(civil)) return { status: 'invalid', reason: 'invalid_calendar' };
    const candidates = candidateInstants(civil, timezone);
    const civilRecord = { year: civil.year, month: civil.month, day: civil.day, hour: civil.hour, minute: civil.minute, second: civil.second };
    if (candidates.length === 0) return { status: 'nonexistent_local_time', civil: civilRecord, timezone };
    if (candidates.length > 1) return { status: 'ambiguous', reason: 'dst_fold', civil: civilRecord, timezone, candidates: candidates.map((candidate) => candidate.toISOString()) };
    return { status: 'resolved', value: { kind: 'civil_datetime', ...civil, timezone, instant: candidates[0].toISOString() } };
}

function reference(input: TemporalCoreInput): Date | TemporalCoreResult {
    if (!input.turnReferenceInstant) return { status: 'insufficient', reason: 'reference_instant_required' };
    const date = new Date(input.turnReferenceInstant);
    return Number.isNaN(date.getTime()) ? { status: 'invalid', reason: 'invalid_reference_instant' } : date;
}

export function resolveTemporal(input: TemporalCoreInput): TemporalCoreResult {
    const fact = input.temporalFact;
    if (!fact || typeof fact !== 'object') return { status: 'invalid', reason: 'invalid_fact' };
    if (fact.kind === 'absolute_date') {
        const civil = { year: fact.year, month: fact.month, day: fact.day, hour: 0, minute: 0, second: 0 };
        return validCalendar(civil) ? { status: 'resolved', value: { kind: 'civil_date', year: fact.year, month: fact.month, day: fact.day } } : { status: 'invalid', reason: 'invalid_calendar' };
    }
    if (fact.kind === 'relative_duration') return { status: 'resolved', value: { kind: 'duration', amount: fact.amount, unit: fact.unit } };
    if (fact.kind === 'time_only') {
        if (fact.meridiem === 'unknown' || fact.ambiguity === 'clock') return { status: 'ambiguous', reason: 'clock_meridiem', civil: { hour: fact.hour, minute: fact.minute, second: fact.second ?? 0 } };
        if (fact.hour > 23 || fact.minute > 59 || (fact.second ?? 0) > 59) return { status: 'invalid', reason: 'invalid_calendar' };
        const hour = fact.meridiem === 'pm' && fact.hour < 12 ? fact.hour + 12 : fact.meridiem === 'am' && fact.hour === 12 ? 0 : fact.hour;
        return { status: 'resolved', value: { kind: 'civil_time', hour, minute: fact.minute, second: fact.second ?? 0, meridiem: fact.meridiem } };
    }
    const ref = reference(input);
    if (fact.kind === 'relative_target_offset') {
        if (!(ref instanceof Date)) return ref;
        const multiplier = { minutes: 60_000, hours: 3_600_000, days: 86_400_000, weeks: 604_800_000 }[fact.unit];
        return { status: 'resolved', value: { kind: 'elapsed_target', instant: new Date(ref.getTime() + fact.amount * multiplier).toISOString() } };
    }
    const timezoneResult = requireTimezone(input.timezone);
    if (timezoneResult) return timezoneResult;
    const timezone = input.timezone;
    if (!timezone) return { status: 'insufficient', reason: 'timezone_required' };
    if (fact.kind === 'absolute_datetime') return resolveCivil({ year: fact.year, month: fact.month, day: fact.day, hour: fact.hour, minute: fact.minute, second: fact.second ?? 0 }, timezone);
    if (!(ref instanceof Date)) return ref;
    const local = partsAt(ref, timezone);
    if (fact.kind === 'relative_date' || fact.kind === 'weekday') {
        const date = new Date(Date.UTC(local.year, local.month - 1, local.day));
        const days = fact.kind === 'relative_date' ? fact.amount * (fact.unit === 'weeks' ? 7 : 1) : (fact.relation === 'next' ? ((fact.weekday - date.getUTCDay() + 7) % 7 || 7) : (fact.weekday - date.getUTCDay() + 7) % 7);
        date.setUTCDate(date.getUTCDate() + days);
        return { status: 'resolved', value: { kind: 'civil_date', year: date.getUTCFullYear(), month: date.getUTCMonth() + 1, day: date.getUTCDate() } };
    }
    return { status: 'not_applicable' };
}
