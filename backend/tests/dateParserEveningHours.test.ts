import { describe, expect, it } from 'vitest';
import { extractExplicitTimeHint, parseDateFromText } from '../src/services/date-parser.service';

const chileTime = (date: Date) =>
    new Intl.DateTimeFormat('es-CL', { timeZone: 'America/Santiago', hour: '2-digit', minute: '2-digit', hour12: false }).format(date);

// "a las 20:00" used to be read as 2 in the morning: the hour pattern took
// the "2" and stopped before the "0".
describe('Evening hours from 20 to 23', () => {
    const sentAt = new Date('2026-11-03T15:10:00Z');

    it('keep their real hour', () => {
        expect(chileTime(parseDateFromText('hoy a las 20:00', sentAt, 'America/Santiago')!.date)).toBe('20:00');
        expect(chileTime(parseDateFromText('mañana a las 21:30', sentAt, 'America/Santiago')!.date)).toBe('21:30');
        expect(chileTime(parseDateFromText('el lunes a las 22', sentAt, 'America/Santiago')!.date)).toBe('22:00');
        expect(chileTime(parseDateFromText('hoy a las 9', sentAt, 'America/Santiago')!.date)).toBe('09:00');
    });

    it('are kept whole when the time words are cut out of a sentence', () => {
        expect(extractExplicitTimeHint('Reunión hoy a las 20:00 de mantención')).toBe('a las 20:00');
        expect(extractExplicitTimeHint('nos vemos a las 23 hrs')).toBe('a las 23 hrs');
    });
});
