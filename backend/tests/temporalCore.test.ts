import { describe, expect, it } from 'vitest';
import { resolveTemporal } from '../src/services/temporalCore.service';

const ref = '2026-03-07T12:00:00.000Z';

describe('M-7 Temporal Core', () => {
    it('resolves a civil date without fabricating a time', () => {
        const result = resolveTemporal({ temporalFact: { kind: 'absolute_date', precision: 'date', year: 2026, month: 2, day: 28 } });
        expect(result).toEqual({ status: 'resolved', value: { kind: 'civil_date', year: 2026, month: 2, day: 28 } });
    });
    it('rejects impossible calendar values', () => {
        expect(resolveTemporal({ temporalFact: { kind: 'absolute_date', precision: 'date', year: 2026, month: 2, day: 29 } })).toEqual({ status: 'invalid', reason: 'invalid_calendar' });
    });
    it('resolves a unique absolute datetime in IANA time', () => {
        const result = resolveTemporal({ temporalFact: { kind: 'absolute_datetime', precision: 'minute', year: 2026, month: 1, day: 15, hour: 9, minute: 30, meridiem: '24h' }, timezone: 'America/New_York' });
        expect(result).toMatchObject({ status: 'resolved', value: { kind: 'civil_datetime', instant: '2026-01-15T14:30:00.000Z', timezone: 'America/New_York' } });
    });
    it('returns a typed DST gap', () => {
        expect(resolveTemporal({ temporalFact: { kind: 'absolute_datetime', precision: 'minute', year: 2026, month: 3, day: 8, hour: 2, minute: 30, meridiem: '24h' }, timezone: 'America/New_York' })).toMatchObject({ status: 'nonexistent_local_time', timezone: 'America/New_York' });
    });
    it('returns both candidates for a DST fold', () => {
        const result = resolveTemporal({ temporalFact: { kind: 'absolute_datetime', precision: 'minute', year: 2026, month: 11, day: 1, hour: 1, minute: 30, meridiem: '24h' }, timezone: 'America/New_York' });
        expect(result.status).toBe('ambiguous');
        expect(result).toMatchObject({ reason: 'dst_fold', candidates: ['2026-11-01T05:30:00.000Z', '2026-11-01T06:30:00.000Z'] });
    });
    it('returns clock ambiguity for unknown meridiem', () => {
        expect(resolveTemporal({ temporalFact: { kind: 'time_only', precision: 'minute', hour: 8, minute: 0, meridiem: 'unknown', ambiguity: 'clock' } })).toMatchObject({ status: 'ambiguous', reason: 'clock_meridiem' });
    });
    it('normalizes explicit 24h, AM, and PM time without inventing a date', () => {
        expect(resolveTemporal({ temporalFact: { kind: 'time_only', precision: 'minute', hour: 20, minute: 15, meridiem: '24h', ambiguity: 'none' } })).toMatchObject({ status: 'resolved', value: { kind: 'civil_time', hour: 20 } });
        expect(resolveTemporal({ temporalFact: { kind: 'time_only', precision: 'minute', hour: 8, minute: 15, meridiem: 'am', ambiguity: 'none' } })).toMatchObject({ status: 'resolved', value: { kind: 'civil_time', hour: 8 } });
        expect(resolveTemporal({ temporalFact: { kind: 'time_only', precision: 'minute', hour: 8, minute: 15, meridiem: 'pm', ambiguity: 'none' } })).toMatchObject({ status: 'resolved', value: { kind: 'civil_time', hour: 20 } });
    });
    it('requires a timezone for local datetime normalization and rejects invalid zones', () => {
        const fact = { kind: 'absolute_datetime', precision: 'minute', year: 2026, month: 1, day: 1, hour: 8, minute: 0, meridiem: '24h' } as const;
        expect(resolveTemporal({ temporalFact: fact })).toEqual({ status: 'insufficient', reason: 'timezone_required' });
        expect(resolveTemporal({ temporalFact: fact, timezone: 'Not/AZone' })).toEqual({ status: 'invalid', reason: 'invalid_timezone' });
    });
    it('uses local calendar arithmetic for relative dates across DST', () => {
        const result = resolveTemporal({ temporalFact: { kind: 'relative_date', precision: 'date', amount: 1, unit: 'days' }, timezone: 'America/New_York', turnReferenceInstant: '2026-03-08T06:30:00.000Z' });
        expect(result).toEqual({ status: 'resolved', value: { kind: 'civil_date', year: 2026, month: 3, day: 9 } });
    });
    it('uses elapsed arithmetic for target offsets', () => {
        expect(resolveTemporal({ temporalFact: { kind: 'relative_target_offset', precision: 'elapsed', amount: 2, unit: 'hours' }, timezone: 'America/New_York', turnReferenceInstant: ref })).toEqual({ status: 'resolved', value: { kind: 'elapsed_target', instant: '2026-03-07T14:00:00.000Z' } });
    });
    it('keeps durations as durations and does not require a reference instant', () => {
        expect(resolveTemporal({ temporalFact: { kind: 'relative_duration', precision: 'duration', amount: 2, unit: 'hours' } })).toEqual({ status: 'resolved', value: { kind: 'duration', amount: 2, unit: 'hours' } });
    });
    it('is deterministic for retries and handles calendar rollover', () => {
        const input = { temporalFact: { kind: 'relative_date', precision: 'date', amount: 1, unit: 'days' } as const, timezone: 'Europe/Madrid', turnReferenceInstant: '2026-12-31T23:30:00.000Z' };
        expect(resolveTemporal(input)).toEqual(resolveTemporal(input));
        expect(resolveTemporal(input)).toEqual({ status: 'resolved', value: { kind: 'civil_date', year: 2027, month: 1, day: 2 } });
    });
    it('supports this_or_next and next weekday relations', () => {
        const base = { timezone: 'America/Santiago', turnReferenceInstant: '2026-09-14T12:00:00.000Z' };
        expect(resolveTemporal({ ...base, temporalFact: { kind: 'weekday', precision: 'date', weekday: 5, relation: 'this_or_next' } })).toMatchObject({ status: 'resolved', value: { kind: 'civil_date', year: 2026, month: 9, day: 18 } });
        expect(resolveTemporal({ ...base, temporalFact: { kind: 'weekday', precision: 'date', weekday: 1, relation: 'next' } })).toMatchObject({ status: 'resolved', value: { kind: 'civil_date', year: 2026, month: 9, day: 21 } });
    });
    it('never consumes raw utterances or model services', () => {
        expect(resolveTemporal.length).toBe(1);
        expect(resolveTemporal({ temporalFact: { kind: 'relative_target_offset', precision: 'elapsed', amount: 24, unit: 'hours' }, turnReferenceInstant: ref })).toMatchObject({ status: 'resolved', value: { kind: 'elapsed_target' } });
    });
});
