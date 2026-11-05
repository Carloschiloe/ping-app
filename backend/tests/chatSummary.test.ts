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
