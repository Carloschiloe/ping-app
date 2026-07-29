import { describe, expect, it } from 'vitest';
import {
    createRequestGate,
    DEFAULT_SIGNUP_COOLDOWN_SECONDS,
    getSafeAuthErrorDetails,
    getSignupCooldownMessage,
    parseSignupRetryAfterSeconds,
} from '../src/utils/authRegistration';

describe('registro y rate limit', () => {
    it('interpreta el tiempo restante informado por Supabase Auth', () => {
        expect(parseSignupRetryAfterSeconds({
            status: 429,
            message: 'For security purposes, you can only request this after 31 seconds.',
        })).toBe(31);
    });

    it('mantiene un cooldown conservador cuando Supabase responde 429 sin segundos', () => {
        expect(parseSignupRetryAfterSeconds({ status: 429, message: 'Too many requests' }))
            .toBe(DEFAULT_SIGNUP_COOLDOWN_SECONDS);
    });

    it('el cerrojo sincrónico rechaza doble toque hasta finalizar la solicitud', () => {
        const gate = createRequestGate();
        expect(gate.tryStart()).toBe(true);
        expect(gate.tryStart()).toBe(false);
        expect(gate.isInFlight()).toBe(true);
        gate.finish();
        expect(gate.tryStart()).toBe(true);
    });

    it('el log técnico no incluye mensaje, correo, contraseña ni token', () => {
        const details = getSafeAuthErrorDetails({
            name: 'AuthApiError',
            status: 429,
            code: 'over_request_rate_limit',
            message: 'private@example.com secret-password token-value after 31 seconds',
        });
        const serialized = JSON.stringify(details);
        expect(serialized).not.toContain('private@example.com');
        expect(serialized).not.toContain('secret-password');
        expect(serialized).not.toContain('token-value');
        expect(details.retryAfterSeconds).toBe(31);
    });

    it('distingue un registro bloqueado de un correo de verificación ya enviado', () => {
        const blocked = getSignupCooldownMessage(false, 31);
        const submitted = getSignupCooldownMessage(true, 60);

        expect(blocked).toContain('volver a intentarlo');
        expect(submitted).toContain('Correo de verificación enviado');
        expect(submitted).not.toContain('volver a intentarlo');
    });
});
