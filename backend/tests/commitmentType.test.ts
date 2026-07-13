import { describe, it, expect } from 'vitest';
import { isTitleMeeting } from '../src/utils/commitmentType';

describe('isTitleMeeting', () => {
    it('reconoce "reunión" como reunión', () => {
        expect(isTitleMeeting('Reunión con el equipo')).toBe(true);
    });

    it('reconoce "llamada" como reunión', () => {
        expect(isTitleMeeting('Llamada con cliente')).toBe(true);
    });

    it('reconoce "zoom" como reunión', () => {
        expect(isTitleMeeting('Zoom de seguimiento')).toBe(true);
    });

    it('no reconoce una tarea simple como reunión', () => {
        expect(isTitleMeeting('Comprar pan')).toBe(false);
    });

    it('trata un título vacío o ausente como tarea, no como reunión', () => {
        expect(isTitleMeeting('')).toBe(false);
        expect(isTitleMeeting(undefined)).toBe(false);
        expect(isTitleMeeting(null)).toBe(false);
    });
});
