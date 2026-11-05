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
    it('counts hoy, mañana and weekdays from the day each message was sent', async () => {
        const { resolveAgreement } = await import('../src/services/synthesis.service');
        // 12 de marzo, 12:00 en Chile.
        expect(resolveAgreement({ what: 'Reunión de producción mañana a las 15:00', said: 'mañana a las 15:00' }, { created_at: '2026-03-12T15:00:00Z' }))
            .toEqual({ what: 'Reunión de producción', date: '2026-03-13', time: '15:00' });
        // Martes 3 de noviembre, 12:10 en Chile.
        expect(resolveAgreement({ what: 'Reunión hoy a las 20:00 de mantención', said: 'hoy a las 20:00' }, { created_at: '2026-11-03T15:10:00Z' }))
            .toEqual({ what: 'Reunión de mantención', date: '2026-11-03', time: '20:00' });
        expect(resolveAgreement({ what: 'Reunión este jueves; temas de mantención', said: 'este jueves a las 10:00' }, { created_at: '2026-11-03T19:52:00Z' }))
            .toEqual({ what: 'Reunión, temas de mantención', date: '2026-11-05', time: '10:00' });
        expect(resolveAgreement({ what: 'Revisar documentos', said: '' }, { text: 'Hay que revisar los documentos', created_at: '2026-11-03T19:52:00Z' }))
            .toEqual({ what: 'Revisar documentos', date: null, time: null });
    });

    it('writes a calendar date only once', async () => {
        const { resolveAgreement } = await import('../src/services/synthesis.service');
        expect(resolveAgreement({ what: 'Reunión el 30 de marzo', said: 'el 30 de marzo a las 08:00' }, { created_at: '2026-03-29T13:00:00Z' }).what)
            .toBe('Reunión');
        expect(resolveAgreement({ what: 'Reunión a las', said: 'el viernes a las 7' }, { created_at: '2026-03-18T13:00:00Z' }).what)
            .toBe('Reunión');
    });

    it('reads the day from the message itself when the model leaves the words out', async () => {
        const { resolveAgreement } = await import('../src/services/synthesis.service');
        expect(resolveAgreement({ what: 'Mantención de motores', said: '' }, { text: 'Mantención de motores mañana a las 9', created_at: '2026-11-03T15:10:00Z' }))
            .toEqual({ what: 'Mantención de motores', date: '2026-11-04', time: '09:00' });
    });

    it('writes the agreed day itself, newest first', async () => {
        const { parseChatSummary, formatWhen } = await import('../src/services/synthesis.service');
        const now = new Date('2026-11-05T12:00:00Z');
        expect(formatWhen('2026-03-13', '15:00', now)).toBe('viernes, 13 de marzo a las 15:00');
        expect(formatWhen('2025-12-01', null, now)).toBe('lunes, 1 de diciembre de 2025');
        expect(formatWhen('mañana', '15:00', now)).toBe('');
        const parsed = parseChatSummary(JSON.stringify({
            overview: 'Mantención.',
            agreements: [
                { what: 'Revisar documentos', date: null, time: null },
                { what: 'Reunión de producción', date: '2026-03-13', time: '15:00' },
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
