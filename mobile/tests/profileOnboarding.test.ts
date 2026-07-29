import { describe, expect, it } from 'vitest';
import {
    getDisplayNameValidationError,
    normalizeDisplayName,
    normalizeOptionalPhone,
} from '../src/utils/profile';

describe('onboarding de perfil', () => {
    it('normaliza un nombre comprensible sin inventar información', () => {
        expect(normalizeDisplayName('  María   José  ')).toBe('María José');
        expect(getDisplayNameValidationError('María José')).toBeNull();
    });

    it('rechaza nombres vacíos, mínimos insuficientes y caracteres de control', () => {
        expect(getDisplayNameValidationError(' ')).not.toBeNull();
        expect(getDisplayNameValidationError('A')).not.toBeNull();
        expect(getDisplayNameValidationError('Nombre\u0000oculto')).not.toBeNull();
    });

    it('mantiene el teléfono opcional y sólo lo normaliza si se entrega', () => {
        expect(normalizeOptionalPhone('')).toBeNull();
        expect(normalizeOptionalPhone('9 1234 5678')).toBe('+56912345678');
        expect(normalizeOptionalPhone('+34 600 123 123')).toBe('+34600123123');
    });
});
