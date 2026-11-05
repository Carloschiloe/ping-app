import { describe, expect, it } from 'vitest';
import { doneSentence } from '../src/services/assistant/assistantService';

describe('Ping says what it did, the way a person would', () => {
    it('turns the action into a past-tense sentence', () => {
        expect(doneSentence('Crear «Llamar al dentista» el jueves 5 de noviembre a las 18:00'))
            .toBe('Listo, creé «Llamar al dentista» el jueves 5 de noviembre a las 18:00.');
        expect(doneSentence('Mover «Pagar luz» para el lunes 9 a las 10:00')).toBe('Listo, moví «Pagar luz» para el lunes 9 a las 10:00.');
        expect(doneSentence('Proponer otra fecha para «Reunión»: el viernes')).toBe('Listo, propuse otra fecha para «Reunión»: el viernes.');
        expect(doneSentence('Enviar a Ana: «Voy en camino»')).toBe('Listo, le envié a Ana: «Voy en camino».');
    });

    it('keeps an unknown summary as it is', () => {
        expect(doneSentence('Algo distinto.')).toBe('Listo, algo distinto.');
    });
});
