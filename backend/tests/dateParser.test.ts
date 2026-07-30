import { describe, it, expect } from 'vitest';
import { parseDateFromText } from '../src/services/date-parser.service';

const THURSDAY_JULY_30_IN_CHILE = new Date('2026-07-30T15:12:00.000Z');

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
});
