// PING — VIDEO UPLOAD INTENT 400: apiClient.post was discarding the real
// backend error body. The backend has two response shapes:
// - some controllers respond directly with { error: '...' }
// - requests that flow through validateRequest/AppError/globalErrorHandler
//   (Zod validation failures, most AppError throws — e.g. the
//   /attachments/upload-intents "Audio duration is invalid" rejection)
//   respond with { status, message, requestId, errors? }
// apiClient.post only ever read `errorJson.error`, so the second shape's
// real message was always discarded in favor of the generic
// "Error POST ... (400)" fallback — hiding the actual validation failure
// from both the user-facing alert and this session's own investigation.
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../src/lib/supabase', () => ({
    supabase: {
        auth: {
            getSession: vi.fn().mockResolvedValue({ data: { session: { access_token: 'test-token' } } }),
        },
    },
}));

// __DEV__ is a React Native global normally injected by Metro; client.ts
// reads it at module-load time (to decide whether EXPO_PUBLIC_API_URL is
// required). Stub it locally for this file only — via a dynamic import that
// runs after the stub is set — rather than a global vitest.config.ts
// `define`, so this test-only need doesn't change how every other module in
// the mobile suite is built.
vi.stubGlobal('__DEV__', true);
let apiClient: typeof import('../src/api/client').apiClient;
let ApiError: typeof import('../src/api/client').ApiError;

beforeAll(async () => {
    ({ apiClient, ApiError } = await import('../src/api/client'));
});

describe('apiClient.post — preserva el mensaje real del backend en errores', () => {
    beforeEach(() => {
        vi.stubGlobal('fetch', vi.fn());
    });

    it('preserva message de la forma { status, message, requestId } (globalErrorHandler / validateRequest / AppError)', async () => {
        vi.mocked(fetch).mockResolvedValue({
            ok: false,
            status: 400,
            text: () => Promise.resolve(JSON.stringify({
                status: 'error',
                message: 'Audio duration is invalid',
                requestId: 'req-123',
            })),
        } as Response);

        await expect(apiClient.post('/attachments/upload-intents', {})).rejects.toMatchObject({
            message: 'Audio duration is invalid',
            status: 400,
        });
    });

    it('preserva message de un ZodError formateado ({ message: "Validation failed", errors: [...] })', async () => {
        vi.mocked(fetch).mockResolvedValue({
            ok: false,
            status: 400,
            text: () => Promise.resolve(JSON.stringify({
                status: 'error',
                message: 'Validation failed',
                requestId: 'req-456',
                errors: [{ path: ['body', 'durationMs'], message: 'Expected integer, received float' }],
            })),
        } as Response);

        await expect(apiClient.post('/attachments/upload-intents', {})).rejects.toThrow('Validation failed');
    });

    it('sigue soportando la forma legacy { error: "..." } (controladores que no pasan por globalErrorHandler)', async () => {
        vi.mocked(fetch).mockResolvedValue({
            ok: false,
            status: 400,
            text: () => Promise.resolve(JSON.stringify({ error: 'Channel name is required' })),
        } as Response);

        await expect(apiClient.post('/agora/token', {})).rejects.toThrow('Channel name is required');
    });

    it('cae al mensaje genérico solo cuando el cuerpo no es JSON válido', async () => {
        vi.mocked(fetch).mockResolvedValue({
            ok: false,
            status: 500,
            text: () => Promise.resolve('<html>not json</html>'),
        } as Response);

        await expect(apiClient.post('/whatever', {})).rejects.toThrow(/Error POST .* \(500\)/);
    });

    it('preserva el status HTTP real junto al mensaje', async () => {
        vi.mocked(fetch).mockResolvedValue({
            ok: false,
            status: 400,
            text: () => Promise.resolve(JSON.stringify({ message: 'Audio duration is invalid' })),
        } as Response);

        try {
            await apiClient.post('/attachments/upload-intents', {});
            expect.unreachable();
        } catch (error) {
            expect(error).toBeInstanceOf(ApiError);
            expect((error as ApiError).status).toBe(400);
            expect((error as ApiError).message).toBe('Audio duration is invalid');
        }
    });
});
