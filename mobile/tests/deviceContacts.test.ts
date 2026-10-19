import { describe, expect, it } from 'vitest';
import { mapDeviceContacts, normalizePhone } from '../src/utils/deviceContacts';

describe('deviceContacts — normalización privada para matching', () => {
    it('normaliza teléfonos chilenos locales e internacionales y rechaza valores ambiguos', () => {
        expect(normalizePhone('9 8765 4321')).toBe('+56987654321');
        expect(normalizePhone('+56 9 8765 4321')).toBe('+56987654321');
        expect(normalizePhone('123')).toBeNull();
    });

    it('proyecta solo nombre, primer teléfono válido y primer email válido', () => {
        expect(mapDeviceContacts([
            {
                id: '1',
                fullName: '  Ana Pérez ',
                phones: [{ number: '123' }, { number: '987654321' }],
                emails: [{ email: 'invalid' }, { email: ' ANA@EXAMPLE.COM ' }],
            },
            { id: '2', fullName: 'Sin datos', phones: [], emails: [] },
        ])).toEqual([
            {
                id: '1',
                name: 'Ana Pérez',
                phone: '+56987654321',
                email: 'ana@example.com',
            },
        ]);
    });
});
