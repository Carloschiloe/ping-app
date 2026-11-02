import { describe, expect, it } from 'vitest';
import { buildLocalCalendar } from '../src/services/commitment.service';

describe('commitment detection calendar', () => {
    it('lists the next days in the user time zone with their weekday names', () => {
        // 2026-11-02 19:52 UTC is Monday 16:52 in Santiago.
        const lines = buildLocalCalendar(new Date('2026-11-02T19:52:00Z'), 'America/Santiago', 4).split('\n');
        expect(lines).toEqual([
            'lunes 2026-11-02 (hoy)',
            'martes 2026-11-03 (mañana)',
            'miércoles 2026-11-04',
            'jueves 2026-11-05',
        ]);
    });

    it('uses the local day, not the UTC day, late at night', () => {
        // 2026-11-03 02:30 UTC is still Monday 23:30 in Santiago.
        expect(buildLocalCalendar(new Date('2026-11-03T02:30:00Z'), 'America/Santiago', 1)).toBe('lunes 2026-11-02 (hoy)');
    });
});
