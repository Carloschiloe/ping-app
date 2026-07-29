import { describe, expect, it } from 'vitest';
import { normalizeFullNameInput, normalizePhoneInput } from '../src/utils/profileValidation';

describe('validación de perfil', () => {
    it('normaliza y acepta un nombre visible válido', () => {
        expect(normalizeFullNameInput('  Carlos   Pérez  ')).toBe('Carlos Pérez');
    });

    it('rechaza perfiles anónimos o nombres técnicamente inválidos', () => {
        expect(() => normalizeFullNameInput('')).toThrow('al menos 2');
        expect(() => normalizeFullNameInput('A')).toThrow('al menos 2');
        expect(() => normalizeFullNameInput('Nombre\u0000oculto')).toThrow('no permitidos');
        expect(() => normalizeFullNameInput(123)).toThrow('debe ser texto');
    });

    it('mantiene teléfono opcional y exige formato internacional cuando existe', () => {
        expect(normalizePhoneInput(null)).toBeNull();
        expect(normalizePhoneInput('+56 9 1234 5678')).toBe('+56912345678');
        expect(() => normalizePhoneInput('912345678')).toThrow('formato internacional');
    });
});
