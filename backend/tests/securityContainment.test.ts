import { afterEach, describe, expect, it, vi } from 'vitest';
import { createOAuthState, verifyOAuthState } from '../src/utils/oauthState';
import { serializeForInlineScript } from '../src/utils/inlineScript';
import { validateTrustedStorageUrl } from '../src/utils/trustedMedia';
import { requireFeature } from '../src/middleware/featureGate';

const originalEnv = { ...process.env };

afterEach(() => {
    process.env = { ...originalEnv };
});

describe('OAuth state', () => {
    it('firma y valida un state dentro de su ventana de vigencia', () => {
        process.env.ENCRYPTION_KEY = '01234567890123456789012345678901';
        const state = createOAuthState('user-1', 1_000);
        expect(verifyOAuthState(state, 2_000).userId).toBe('user-1');
    });

    it('rechaza manipulación y expiración', () => {
        process.env.ENCRYPTION_KEY = '01234567890123456789012345678901';
        const state = createOAuthState('user-1', 1_000);
        expect(() => verifyOAuthState(`${state}x`, 2_000)).toThrow('Invalid OAuth state');
        expect(() => verifyOAuthState(state, 1_000 + 11 * 60 * 1_000)).toThrow('Expired or invalid OAuth state');
    });
});

describe('trusted media URL', () => {
    it('acepta únicamente objetos de Storage del origen Supabase configurado', () => {
        process.env.SUPABASE_URL = 'https://project.supabase.co';
        const accepted = validateTrustedStorageUrl(
            'https://project.supabase.co/storage/v1/object/public/chat-media/audio.m4a'
        );
        expect(accepted.hostname).toBe('project.supabase.co');
    });

    it('rechaza otros orígenes, credenciales embebidas y rutas ajenas a Storage', () => {
        process.env.SUPABASE_URL = 'https://project.supabase.co';
        expect(() => validateTrustedStorageUrl('http://127.0.0.1/admin')).toThrow('origin is not allowed');
        expect(() => validateTrustedStorageUrl('https://project.supabase.co.evil.test/storage/v1/object/x')).toThrow('origin is not allowed');
        expect(() => validateTrustedStorageUrl('https://user:pass@project.supabase.co/storage/v1/object/x')).toThrow('credentials are not allowed');
        expect(() => validateTrustedStorageUrl('https://project.supabase.co/rest/v1/profiles')).toThrow('not a Supabase Storage object');
    });
});

describe('automation containment gate', () => {
    it('no permite que RUN_CRON_JOBS reactive automatizaciones por sí solo', async () => {
        process.env.RUN_CRON_JOBS = 'true';
        process.env.ENABLE_AUTOMATIONS = 'false';
        const { getEnvConfig } = await import('../src/config/env');
        expect(getEnvConfig().runCronJobs).toBe(false);

        process.env.ENABLE_AUTOMATIONS = 'true';
        expect(getEnvConfig().runCronJobs).toBe(true);
    });
});

describe('inline script serialization', () => {
    it('neutraliza cierre de script y conserva un literal JavaScript válido', () => {
        const serialized = serializeForInlineScript('</script><script>alert(1)</script>');
        expect(serialized).not.toContain('</script>');
        expect(serialized).toContain('\\u003c');
        expect(JSON.parse(serialized)).toBe('</script><script>alert(1)</script>');
    });
});

describe('feature gate', () => {
    it('devuelve 503 por defecto y sólo continúa con habilitación explícita', () => {
        const status = vi.fn().mockReturnThis();
        const json = vi.fn();
        const next = vi.fn();
        const middleware = requireFeature('ENABLE_TEST_CAPABILITY');

        delete process.env.ENABLE_NON_MVP_CAPABILITIES;
        delete process.env.ENABLE_TEST_CAPABILITY;
        middleware({} as any, { status, json } as any, next);
        expect(status).toHaveBeenCalledWith(503);
        expect(next).not.toHaveBeenCalled();

        process.env.ENABLE_TEST_CAPABILITY = 'true';
        middleware({} as any, { status, json } as any, next);
        expect(next).not.toHaveBeenCalled();

        process.env.ENABLE_NON_MVP_CAPABILITIES = 'true';
        middleware({} as any, { status, json } as any, next);
        expect(next).toHaveBeenCalledTimes(1);
    });
});
