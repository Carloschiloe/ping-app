import { describe, expect, it } from 'vitest';
import {
    getAuthCredentialsValidationError,
    getAuthErrorMessage,
    normalizeAuthEmail,
} from '../src/utils/authForm';

describe('formulario de autenticación', () => {
    it('normaliza el correo sin modificar la contraseña', () => {
        expect(normalizeAuthEmail('  Persona@Example.COM ')).toBe('persona@example.com');
    });

    it('valida correo, contraseña y mínimo de registro', () => {
        expect(getAuthCredentialsValidationError('correo-invalido', 'secreto', 'login'))
            .toContain('correo');
        expect(getAuthCredentialsValidationError('persona@example.com', '', 'login'))
            .toContain('contraseña');
        expect(getAuthCredentialsValidationError('persona@example.com', '12345', 'signup'))
            .toContain('6 caracteres');
        expect(getAuthCredentialsValidationError('persona@example.com', '123456', 'signup'))
            .toBeNull();
    });

    it('traduce errores conocidos sin exponer el mensaje técnico', () => {
        expect(getAuthErrorMessage({ code: 'email_not_confirmed' }, 'login'))
            .toContain('verifica tu correo');
        expect(getAuthErrorMessage({ code: 'invalid_credentials' }, 'login'))
            .toContain('no son correctos');
        expect(getAuthErrorMessage({
            code: 'unknown',
            message: 'private@example.com secret-value',
        }, 'signup')).not.toContain('private@example.com');
    });
});
