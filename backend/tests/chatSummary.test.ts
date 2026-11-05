import { describe, expect, it } from 'vitest';
import { parseChatSummary, summaryText } from '../src/services/synthesis.service';

describe('Chat summary comes back in parts, without markdown', () => {
    it('keeps agreements, pending per person and the latest point', () => {
        const parsed = parseChatSummary(JSON.stringify({
            overview: 'Coordinan la **mantención** de la planta.',
            agreements: ['Reunión el jueves 5 a las 10:00'],
            pending: [{ person: 'Carlos', items: ['Confirmar asistencia'] }, { person: 'Ana', items: [] }],
            latest: 'Quedaron de confirmar mañana.',
        }));
        expect(parsed).toEqual({
            overview: 'Coordinan la mantención de la planta.',
            agreements: ['Reunión el jueves 5 a las 10:00'],
            pending: [{ person: 'Carlos', items: ['Confirmar asistencia'] }],
            latest: 'Quedaron de confirmar mañana.',
        });
        expect(summaryText(parsed!)).toContain('Carlos tiene pendiente: Confirmar asistencia.');
        expect(summaryText(parsed!)).not.toContain('**');
    });

    it('gives nothing back for an answer that is not a summary', () => {
        expect(parseChatSummary('no es json')).toBeNull();
        expect(parseChatSummary('{}')).toBeNull();
    });
});

describe('Chat summary uses real dates', () => {
    it('stamps each message with its own day in Chile time', async () => {
        const { messageStamp } = await import('../src/services/synthesis.service');
        expect(messageStamp('2026-03-13T18:00:00Z')).toBe('2026-03-13 viernes 15:00');
    });

    it('writes the agreed day itself, never hoy or mañana', async () => {
        const { parseChatSummary, formatWhen } = await import('../src/services/synthesis.service');
        const now = new Date('2026-11-05T12:00:00Z');
        expect(formatWhen('2026-03-13', '15:00', now)).toBe('viernes, 13 de marzo a las 15:00');
        expect(formatWhen('2025-12-01', null, now)).toBe('lunes, 1 de diciembre de 2025');
        expect(formatWhen('mañana', '15:00', now)).toBe('');
        const parsed = parseChatSummary(JSON.stringify({
            overview: 'Mantención.',
            agreements: [
                { what: 'Revisar documentos', date: null, time: null },
                { what: 'Reunión de producción a las 15:00', date: '2026-03-13', time: '15:00' },
                { what: 'Reunión de mantención', date: '2026-11-03', time: '20:00' },
            ],
            pending: [], latest: '',
        }), now);
        expect(parsed?.agreements).toEqual([
            'Reunión de mantención: martes, 3 de noviembre a las 20:00',
            'Reunión de producción: viernes, 13 de marzo a las 15:00',
            'Revisar documentos',
        ]);
    });
});
