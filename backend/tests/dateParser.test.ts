import { describe, it, expect } from 'vitest';
import { parseDateFromText } from '../src/services/date-parser.service';

const THURSDAY_JULY_30_IN_CHILE = new Date('2026-07-30T15:12:00.000Z');
const TUESDAY_SEPTEMBER_1 = new Date('2026-09-01T18:33:53.000Z');

describe('parseDateFromText', () => {
    it('resuelve "próximo miércoles" al miércoles siguiente y conserva 13:00 en Chile', () => {
        const result = parseDateFromText(
            'El próximo miércoles hacer supermercado a las 13:00',
            THURSDAY_JULY_30_IN_CHILE
        );

        expect(result?.date.toISOString()).toBe('2026-08-05T17:00:00.000Z');
        const chileParts = new Intl.DateTimeFormat('es-CL', {
            timeZone: 'America/Santiago',
            weekday: 'long',
            hour: '2-digit',
            minute: '2-digit',
            hourCycle: 'h23',
        }).format(result!.date);
        expect(chileParts).toContain('miércoles');
        expect(chileParts).toContain('13:00');
    });

    it('entiende la variante sin tildes', () => {
        const result = parseDateFromText(
            'el proximo miercoles a las 13:00 hacer supermercado',
            THURSDAY_JULY_30_IN_CHILE
        );
        expect(result?.date.toISOString()).toBe('2026-08-05T17:00:00.000Z');
    });

    it('"próximo miércoles" dicho un miércoles siempre avanza siete días', () => {
        const wednesdayReference = new Date('2026-08-05T15:00:00.000Z');
        const result = parseDateFromText(
            'próximo miércoles a las 09:00 llamar a Ana',
            wednesdayReference
        );
        expect(result?.date.toISOString()).toBe('2026-08-12T13:00:00.000Z');
    });

    it('respeta automáticamente el horario de verano de Santiago', () => {
        const summerReference = new Date('2026-01-05T15:00:00.000Z');
        const result = parseDateFromText('mañana a las 13:00', summerReference);
        expect(result?.date.toISOString()).toBe('2026-01-06T16:00:00.000Z');
    });

    it('conserva las 16:00 de Santiago para "próximo domingo"', () => {
        const result = parseDateFromText(
            'Próximo Domingo salimos a las 16:00 a los Muermos',
            new Date('2026-07-30T18:37:00.000Z')
        );

        expect(result?.date.toISOString()).toBe('2026-08-02T20:00:00.000Z');
        const chileParts = new Intl.DateTimeFormat('es-CL', {
            timeZone: 'America/Santiago',
            weekday: 'long',
            hour: '2-digit',
            minute: '2-digit',
            hourCycle: 'h23',
        }).format(result!.date);
        expect(chileParts).toContain('domingo');
        expect(chileParts).toContain('16:00');
    });

    it('devuelve null cuando el texto no contiene ninguna fecha', () => {
        expect(parseDateFromText('comprar pan y leche', THURSDAY_JULY_30_IN_CHILE)).toBeNull();
    });

    it.each([
        ['hoy a las 16:00 juntarnos en el terreno', '2026-09-01T20:00:00.000Z', '16:00'],
        ['mañana a las 09:30 llamar a Ana', '2026-09-02T13:30:00.000Z', '09:30'],
        ['el viernes a las 12:00 juntarse con el equipo', '2026-09-04T16:00:00.000Z', '12:00'],
        ['el 10 de septiembre de 2026 a las 18:00 reunión', '2026-09-10T21:00:00.000Z', '18:00'],
    ])('conserva la hora local explícita: %s', (text, expectedIso, expectedTime) => {
        const result = parseDateFromText(text, TUESDAY_SEPTEMBER_1, 'America/Santiago');

        expect(result?.date.toISOString()).toBe(expectedIso);
        expect(new Intl.DateTimeFormat('es-CL', {
            timeZone: 'America/Santiago',
            hour: '2-digit',
            minute: '2-digit',
            hourCycle: 'h23',
        }).format(result!.date)).toBe(expectedTime);
    });

    it('usa la zona IANA del usuario en vez de fijar Chile', () => {
        const result = parseDateFromText(
            'hoy a las 16:00 reunión',
            TUESDAY_SEPTEMBER_1,
            'Europe/Madrid',
        );

        expect(result?.date.toISOString()).toBe('2026-09-01T14:00:00.000Z');
    });
});
