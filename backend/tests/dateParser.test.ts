import { describe, it, expect } from 'vitest';
import { parseDateFromText } from '../src/services/date-parser.service';

describe('parseDateFromText', () => {
    it('reconoce una fecha relativa en español ("mañana a las 3pm")', () => {
        const result = parseDateFromText('mañana a las 3pm');
        expect(result).not.toBeNull();
        expect(result?.date).toBeInstanceOf(Date);
    });

    it('reconoce un día de la semana con hora explícita ("el viernes a las 15:00")', () => {
        const result = parseDateFromText('el viernes a las 15:00');
        expect(result).not.toBeNull();
        expect(result?.date.getHours()).toBe(15);
    });

    it('devuelve null cuando el texto no contiene ninguna fecha', () => {
        const result = parseDateFromText('comprar pan y leche');
        expect(result).toBeNull();
    });
});
