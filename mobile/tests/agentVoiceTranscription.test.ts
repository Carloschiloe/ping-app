// M-5 — Mobile transcribeAgentVoice: prueba exacta del fix de formato audio iOS real.
// Certifica que el body ya NO es expo-file-system File, sino ArrayBuffer leído localmente.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Stub expo-file-system (evita native module)
vi.mock('expo-file-system', () => ({
    File: class MockFile {
        constructor(public uri: string) {}
    },
}));

// Stub expo-localization
vi.mock('expo-localization', () => ({
    getLocales: vi.fn(() => [{ languageTag: 'es-CL', languageCode: 'es', regionCode: 'CL' }]),
}));

// Stub apiClient + ApiError + getAuthHeaders + API_URL + helpers (mismo patrón que agentPreview.test.ts)
vi.mock('../src/api/client', () => {
    class MockApiError extends Error {
        status: number | null;
        resultUnknown: boolean;
        constructor(message: string, status: number | null, resultUnknown: boolean) {
            super(message);
            this.name = 'ApiError';
            this.status = status;
            this.resultUnknown = resultUnknown;
        }
    }
    return {
        apiClient: { post: vi.fn(), get: vi.fn(), delete: vi.fn(), patch: vi.fn() },
        ApiError: MockApiError,
        getAuthHeaders: () => Promise.resolve({
            'Content-Type': 'application/json',
            'Authorization': 'Bearer test-token-123',
        }),
        API_URL: 'http://localhost:3000/api',
        getDeviceTimeZone: () => 'America/Santiago',
        getDeviceLocale: () => 'es-CL',
    };
});

import { transcribeAgentVoice } from '../src/api/query-modules/agent';
import { ApiError } from '../src/api/client';

const MOCK_LOCAL_URI = 'file:///var/mobile/Containers/Data/Application/.../recording.m4a';
const MOCK_AUTH_HEADER = 'Bearer test-token-123';

// Mock global fetch para interceptar AMBAS llamadas:
// 1) fetch(localUri) -> lectura archivo local
// 2) fetch(API_URL) -> request al backend
const originalFetch = global.fetch;

beforeEach(() => {
    vi.resetAllMocks();
    global.fetch = vi.fn();
});

afterEach(() => {
    global.fetch = originalFetch;
});

function mockLocalFetchOK(arrayBuffer: ArrayBuffer) {
    return vi.fn().mockResolvedValue({
        ok: true,
        arrayBuffer: () => Promise.resolve(arrayBuffer),
    });
}

function mockLocalFetchFail(status: number, statusText: string) {
    return vi.fn().mockResolvedValue({
        ok: false,
        status,
        statusText,
    });
}

function mockApiFetchOK(responseBody: unknown) {
    return vi.fn().mockResolvedValue({
        ok: true,
        text: () => Promise.resolve(JSON.stringify(responseBody)),
    });
}

function mockApiFetchFail(status: number, errorCode: string) {
    return vi.fn().mockResolvedValue({
        ok: false,
        status,
        text: () => Promise.resolve(JSON.stringify({ error: errorCode })),
    });
}

describe('transcribeAgentVoice — M-5 fix: upload nativo iOS/Android → ArrayBuffer + Content-Type explícito', () => {
    const validAudioBuffer = new ArrayBuffer(1024); // audio binario simulado
    const validResponse = {
        status: 'final',
        transcript: {
            transcriptId: 'tr-1',
            audioRef: 'ar-1',
            text: 'Qué tengo hoy',
            language: 'es',
            confidence: 0.95,
            provider: 'openai',
            observedAt: new Date().toISOString(),
            source: 'agent_voice',
        },
        voiceInputToken: 'vtok-1',
        tokenExpiresAt: new Date(Date.now() + 3600_000).toISOString(),
        agentSessionId: 'sess-1',
    };

    it('A) local recording URI returns ArrayBuffer (lectura local exitosa)', async () => {
        const localFetch = mockLocalFetchOK(validAudioBuffer);
        const apiFetch = mockApiFetchOK(validResponse);

        // Primer fetch = local file, segundo = API
        global.fetch = vi.fn()
            .mockImplementationOnce(localFetch)
            .mockImplementationOnce(apiFetch);

        const result = await transcribeAgentVoice({
            uri: MOCK_LOCAL_URI,
            mimeType: 'audio/m4a',
            durationMs: 2000,
            capturedAt: new Date().toISOString(),
            voiceSessionId: 'vs-1',
            deviceSessionId: 'ds-1',
        });

        expect(result.transcript.text).toBe('Qué tengo hoy');
        expect(localFetch).toHaveBeenCalledWith(MOCK_LOCAL_URI);
        expect(apiFetch).toHaveBeenCalled();
    });

    it('B) NO envía expo-file-system File como body (el bug original)', async () => {
        const localFetch = mockLocalFetchOK(validAudioBuffer);
        const apiFetch = mockApiFetchOK(validResponse);

        global.fetch = vi.fn()
            .mockImplementationOnce(localFetch)
            .mockImplementationOnce(apiFetch);

        await transcribeAgentVoice({
            uri: MOCK_LOCAL_URI,
            mimeType: 'audio/m4a',
            durationMs: 2000,
            capturedAt: new Date().toISOString(),
            voiceSessionId: 'vs-1',
            deviceSessionId: 'ds-1',
        });

        // Verificar que el SEGUNDO fetch (API) NO recibió un File object como body
        const apiCall = (global.fetch as any).mock.calls[1];
        const apiOptions = apiCall[1];
        expect(apiOptions.body).not.toBeInstanceOf(File);
        expect(apiOptions.body).toBeInstanceOf(ArrayBuffer);
        expect(apiOptions.body).toBe(validAudioBuffer);
    });

    it('C) request body enviado a /agent/voice/transcribe es el ArrayBuffer binario', async () => {
        const localFetch = mockLocalFetchOK(validAudioBuffer);
        const apiFetch = mockApiFetchOK(validResponse);

        global.fetch = vi.fn()
            .mockImplementationOnce(localFetch)
            .mockImplementationOnce(apiFetch);

        await transcribeAgentVoice({
            uri: MOCK_LOCAL_URI,
            mimeType: 'audio/m4a',
            durationMs: 2000,
            capturedAt: new Date().toISOString(),
            voiceSessionId: 'vs-1',
            deviceSessionId: 'ds-1',
        });

        const apiCall = (global.fetch as any).mock.calls[1];
        expect(apiCall[0]).toContain('/agent/voice/transcribe');
        expect(apiCall[1].method).toBe('POST');
        expect(apiCall[1].body).toBe(validAudioBuffer);
        expect(apiCall[1].body.byteLength).toBe(1024);
    });

    it('D) Content-Type explícito: audio/m4a (formato recorder oficial)', async () => {
        const localFetch = mockLocalFetchOK(validAudioBuffer);
        const apiFetch = mockApiFetchOK(validResponse);

        global.fetch = vi.fn()
            .mockImplementationOnce(localFetch)
            .mockImplementationOnce(apiFetch);

        await transcribeAgentVoice({
            uri: MOCK_LOCAL_URI,
            mimeType: 'audio/m4a',
            durationMs: 2000,
            capturedAt: new Date().toISOString(),
            voiceSessionId: 'vs-1',
            deviceSessionId: 'ds-1',
        });

        const apiCall = (global.fetch as any).mock.calls[1];
        expect(apiCall[1].headers['Content-Type']).toBe('audio/m4a');
    });

    it('E) Authorization headers / auth behavior intactos', async () => {
        const localFetch = mockLocalFetchOK(validAudioBuffer);
        const apiFetch = mockApiFetchOK(validResponse);

        global.fetch = vi.fn()
            .mockImplementationOnce(localFetch)
            .mockImplementationOnce(apiFetch);

        await transcribeAgentVoice({
            uri: MOCK_LOCAL_URI,
            mimeType: 'audio/m4a',
            durationMs: 2000,
            capturedAt: new Date().toISOString(),
            voiceSessionId: 'vs-1',
            deviceSessionId: 'ds-1',
        });

        const apiCall = (global.fetch as any).mock.calls[1];
        expect(apiCall[1].headers.Authorization).toBe(MOCK_AUTH_HEADER);
    });

    it('F) archivo local vacío → rechazado ANTES de intentar upload', async () => {
        const emptyBuffer = new ArrayBuffer(0);
        const localFetch = mockLocalFetchOK(emptyBuffer);
        const apiFetch = mockApiFetchOK(validResponse);

        global.fetch = vi.fn()
            .mockImplementationOnce(localFetch)
            .mockImplementationOnce(apiFetch);

        await expect(transcribeAgentVoice({
            uri: MOCK_LOCAL_URI,
            mimeType: 'audio/m4a',
            durationMs: 2000,
            capturedAt: new Date().toISOString(),
            voiceSessionId: 'vs-1',
            deviceSessionId: 'ds-1',
        })).rejects.toThrow('El archivo de audio está vacío.');

        // El segundo fetch (API) NUNCA debe haberse llamado
        expect(apiFetch).not.toHaveBeenCalled();
    });

    it('G) fallo lectura archivo local (fetch falla) → error estructurado, sin request API', async () => {
        const localFetch = mockLocalFetchFail(404, 'Not Found');
        const apiFetch = mockApiFetchOK(validResponse);

        global.fetch = vi.fn()
            .mockImplementationOnce(localFetch)
            .mockImplementationOnce(apiFetch);

        await expect(transcribeAgentVoice({
            uri: MOCK_LOCAL_URI,
            mimeType: 'audio/m4a',
            durationMs: 2000,
            capturedAt: new Date().toISOString(),
            voiceSessionId: 'vs-1',
            deviceSessionId: 'ds-1',
        })).rejects.toThrow('No se pudo leer el archivo de audio local.');

        expect(apiFetch).not.toHaveBeenCalled();
    });

    it('H) backend 415 unsupported_audio → mapping error preservado', async () => {
        const localFetch = mockLocalFetchOK(validAudioBuffer);
        const apiFetch = mockApiFetchFail(415, 'unsupported_audio');

        global.fetch = vi.fn()
            .mockImplementationOnce(localFetch)
            .mockImplementationOnce(apiFetch);

        let caughtError: unknown;
        try {
            await transcribeAgentVoice({
                uri: MOCK_LOCAL_URI,
                mimeType: 'audio/m4a',
                durationMs: 2000,
                capturedAt: new Date().toISOString(),
                voiceSessionId: 'vs-1',
                deviceSessionId: 'ds-1',
            });
        } catch (e) {
            caughtError = e;
        }

        expect(caughtError).toBeInstanceOf(ApiError);
        // En ApiError, el primer parámetro (code) se guarda como message - ver src/api/client.ts
        expect((caughtError as ApiError).message).toBe('unsupported_audio');
        expect((caughtError as ApiError).status).toBe(415);
    });

    it('I) doble fetch NO confundido: local fetch ≠ API fetch (no leak)', async () => {
        const localFetch = mockLocalFetchOK(validAudioBuffer);
        const apiFetch = mockApiFetchOK(validResponse);

        global.fetch = vi.fn()
            .mockImplementationOnce(localFetch)
            .mockImplementationOnce(apiFetch);

        await transcribeAgentVoice({
            uri: MOCK_LOCAL_URI,
            mimeType: 'audio/m4a',
            durationMs: 2000,
            capturedAt: new Date().toISOString(),
            voiceSessionId: 'vs-1',
            deviceSessionId: 'ds-1',
        });

        // Exactamente 2 llamadas: 1 local, 1 API
        expect(global.fetch).toHaveBeenCalledTimes(2);

        // Primera llamada: URI local, sin headers Authorization
        const localCall = (global.fetch as any).mock.calls[0];
        expect(localCall[0]).toBe(MOCK_LOCAL_URI);
        expect(localCall[1]).toBeUndefined(); // sin options = GET simple

        // Segunda llamada: URL API completa, con headers
        const apiCall = (global.fetch as any).mock.calls[1];
        expect(apiCall[0]).toContain('/agent/voice/transcribe');
        expect(apiCall[1].headers.Authorization).toBeDefined();
    });

    it('J) otros MIME válidos (audio/mp4, audio/aac, audio/mpeg, audio/wav) → Content-Type respetado', async () => {
        const localFetch = mockLocalFetchOK(validAudioBuffer);

        for (const mime of ['audio/mp4', 'audio/aac', 'audio/mpeg', 'audio/wav'] as const) {
            const apiFetch = mockApiFetchOK(validResponse);
            global.fetch = vi.fn()
                .mockImplementationOnce(localFetch)
                .mockImplementationOnce(apiFetch);

            await transcribeAgentVoice({
                uri: MOCK_LOCAL_URI,
                mimeType: mime,
                durationMs: 2000,
                capturedAt: new Date().toISOString(),
                voiceSessionId: 'vs-1',
                deviceSessionId: 'ds-1',
            });

            const apiCall = (global.fetch as any).mock.calls[1];
            expect(apiCall[1].headers['Content-Type']).toBe(mime);
        }
    });
});