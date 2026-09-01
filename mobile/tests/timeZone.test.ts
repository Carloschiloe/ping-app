import { describe, expect, it } from 'vitest';
import { formatSuggestionDueAt, normalizeDeviceTimeZone } from '../src/utils/timeZone';

describe('suggestion timezone round-trip', () => {
    it.each([
        ['2026-09-01T20:00:00.000Z', '16:00'],
        ['2026-09-02T13:30:00.000Z', '09:30'],
        ['2026-09-04T16:00:00.000Z', '12:00'],
        ['2026-09-10T21:00:00.000Z', '18:00'],
    ])('muestra en UI la hora local persistida de %s', (dueAt, expectedTime) => {
        expect(formatSuggestionDueAt(dueAt, 'America/Santiago')).toContain(expectedTime);
    });

    it('acepta otra zona IANA del dispositivo', () => {
        expect(formatSuggestionDueAt('2026-09-01T14:00:00.000Z', 'Europe/Madrid'))
            .toContain('16:00');
    });

    it('rechaza una zona inválida sin lanzar una excepción', () => {
        expect(normalizeDeviceTimeZone('Invalid/Zone')).toBeTruthy();
    });
});
