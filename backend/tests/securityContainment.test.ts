import { afterEach, describe, expect, it, vi } from 'vitest';
import { createOAuthState, verifyOAuthState } from '../src/utils/oauthState';
import { serializeForInlineScript } from '../src/utils/inlineScript';
import { validateTrustedStorageUrl } from '../src/utils/trustedMedia';
import {
    requireFeature,
    requirePrivateFileFeature,
} from '../src/middleware/featureGate';

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

describe('environment containment', () => {
    it('rechaza un proyecto Supabase distinto del esperado', async () => {
        process.env.SUPABASE_URL = 'https://production-ref.supabase.co';
        process.env.SUPABASE_ANON_KEY = 'anon';
        process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-role';
        process.env.ENCRYPTION_KEY = '01234567890123456789012345678901';
        process.env.PING_EXPECTED_SUPABASE_PROJECT_REF = 'staging-ref';
        const { validateEnvironment } = await import('../src/config/env');

        expect(() => validateEnvironment()).toThrow(
            'SUPABASE_URL does not match PING_EXPECTED_SUPABASE_PROJECT_REF'
        );
    });

    it('acepta el project ref exacto configurado para el entorno', async () => {
        process.env.SUPABASE_URL = 'https://staging-ref.supabase.co';
        process.env.SUPABASE_ANON_KEY = 'anon';
        process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-role';
        process.env.ENCRYPTION_KEY = '01234567890123456789012345678901';
        process.env.PING_EXPECTED_SUPABASE_PROJECT_REF = 'staging-ref';
        const { validateEnvironment } = await import('../src/config/env');

        expect(() => validateEnvironment()).not.toThrow();
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

describe('feature gates', () => {
    function createMiddlewareContext() {
        const status = vi.fn().mockReturnThis();
        const json = vi.fn();
        const next = vi.fn();
        return { status, json, next };
    }

    it('mantiene cerrados todos los gates cuando no hay habilitación explícita', () => {
        const nonMvp = createMiddlewareContext();
        const reads = createMiddlewareContext();
        const uploads = createMiddlewareContext();
        delete process.env.ENABLE_NON_MVP_CAPABILITIES;
        delete process.env.ENABLE_TEST_CAPABILITY;
        delete process.env.ENABLE_PRIVATE_FILE_READS;
        delete process.env.ENABLE_PRIVATE_FILE_UPLOADS;

        requireFeature('ENABLE_TEST_CAPABILITY')(
            {} as any,
            { status: nonMvp.status, json: nonMvp.json } as any,
            nonMvp.next
        );
        requirePrivateFileFeature('ENABLE_PRIVATE_FILE_READS')(
            {} as any,
            { status: reads.status, json: reads.json } as any,
            reads.next
        );
        requirePrivateFileFeature('ENABLE_PRIVATE_FILE_UPLOADS')(
            {} as any,
            { status: uploads.status, json: uploads.json } as any,
            uploads.next
        );

        for (const context of [nonMvp, reads, uploads]) {
            expect(context.status).toHaveBeenCalledWith(503);
            expect(context.next).not.toHaveBeenCalled();
        }
    });

    it('habilita lectura privada con el master no-MVP cerrado', () => {
        const { status, json, next } = createMiddlewareContext();
        process.env.ENABLE_NON_MVP_CAPABILITIES = 'false';
        process.env.ENABLE_PRIVATE_FILE_READS = 'true';

        requirePrivateFileFeature('ENABLE_PRIVATE_FILE_READS')(
            {} as any,
            { status, json } as any,
            next
        );

        expect(next).toHaveBeenCalledTimes(1);
        expect(status).not.toHaveBeenCalled();
    });

    it.each([
        'ENABLE_CALENDAR_INTEGRATION',
        'ENABLE_CALLS',
        'ENABLE_OPERATION_MODULE',
    ])('mantiene %s bloqueado sin el master no-MVP', (envName) => {
        const { status, json, next } = createMiddlewareContext();
        process.env.ENABLE_NON_MVP_CAPABILITIES = 'false';
        process.env[envName] = 'true';

        requireFeature(envName)({} as any, { status, json } as any, next);

        expect(status).toHaveBeenCalledWith(503);
        expect(next).not.toHaveBeenCalled();
    });

    it('mantiene las subidas privadas bloqueadas aunque otros gates estén abiertos', () => {
        const { status, json, next } = createMiddlewareContext();
        process.env.ENABLE_NON_MVP_CAPABILITIES = 'true';
        process.env.ENABLE_PRIVATE_FILE_READS = 'true';
        process.env.ENABLE_PRIVATE_FILE_UPLOADS = 'false';

        requirePrivateFileFeature('ENABLE_PRIVATE_FILE_UPLOADS')(
            {} as any,
            { status, json } as any,
            next
        );

        expect(status).toHaveBeenCalledWith(503);
        expect(next).not.toHaveBeenCalled();
    });

    it('habilita sólo avatar y adjuntos sin abrir el gate genérico', () => {
        const avatar = createMiddlewareContext();
        const message = createMiddlewareContext();
        const generic = createMiddlewareContext();
        process.env.ENABLE_NON_MVP_CAPABILITIES = 'false';
        process.env.ENABLE_PRIVATE_FILE_UPLOADS = 'false';
        process.env.ENABLE_PRIVATE_AVATAR_UPLOADS = 'true';
        process.env.ENABLE_PRIVATE_MESSAGE_UPLOADS = 'true';

        requirePrivateFileFeature('ENABLE_PRIVATE_AVATAR_UPLOADS')(
            {} as any,
            { status: avatar.status, json: avatar.json } as any,
            avatar.next
        );
        requirePrivateFileFeature('ENABLE_PRIVATE_MESSAGE_UPLOADS')(
            {} as any,
            { status: message.status, json: message.json } as any,
            message.next
        );
        requirePrivateFileFeature('ENABLE_PRIVATE_FILE_UPLOADS')(
            {} as any,
            { status: generic.status, json: generic.json } as any,
            generic.next
        );

        expect(avatar.next).toHaveBeenCalledTimes(1);
        expect(message.next).toHaveBeenCalledTimes(1);
        expect(generic.status).toHaveBeenCalledWith(503);
        expect(generic.next).not.toHaveBeenCalled();
    });

    it('exige master e indicador individual para capacidades no-MVP', () => {
        const blocked = createMiddlewareContext();
        const enabled = createMiddlewareContext();
        process.env.ENABLE_TEST_CAPABILITY = 'true';
        process.env.ENABLE_NON_MVP_CAPABILITIES = 'false';

        requireFeature('ENABLE_TEST_CAPABILITY')(
            {} as any,
            { status: blocked.status, json: blocked.json } as any,
            blocked.next
        );
        expect(blocked.status).toHaveBeenCalledWith(503);
        expect(blocked.next).not.toHaveBeenCalled();

        process.env.ENABLE_NON_MVP_CAPABILITIES = 'true';
        requireFeature('ENABLE_TEST_CAPABILITY')(
            {} as any,
            { status: enabled.status, json: enabled.json } as any,
            enabled.next
        );
        expect(enabled.next).toHaveBeenCalledTimes(1);
    });

    it('puede habilitar llamadas en staging sin abrir Calendar ni Operation', () => {
        const calls = createMiddlewareContext();
        const calendar = createMiddlewareContext();
        const operation = createMiddlewareContext();
        process.env.ENABLE_NON_MVP_CAPABILITIES = 'true';
        process.env.ENABLE_CALLS = 'true';
        process.env.ENABLE_CALENDAR_INTEGRATION = 'false';
        process.env.ENABLE_OPERATION_MODULE = 'false';

        requireFeature('ENABLE_CALLS')(
            {} as any,
            { status: calls.status, json: calls.json } as any,
            calls.next
        );
        requireFeature('ENABLE_CALENDAR_INTEGRATION')(
            {} as any,
            { status: calendar.status, json: calendar.json } as any,
            calendar.next
        );
        requireFeature('ENABLE_OPERATION_MODULE')(
            {} as any,
            { status: operation.status, json: operation.json } as any,
            operation.next
        );

        expect(calls.next).toHaveBeenCalledTimes(1);
        expect(calendar.status).toHaveBeenCalledWith(503);
        expect(operation.status).toHaveBeenCalledWith(503);
    });
});
