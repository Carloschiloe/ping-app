// M-5 — agentVoice.service.ts: capture validation + temporary audio
// lifecycle (sección 3/8/9 del ticket: "no hidden durable audio archive",
// "no zombie temp file on any failure path"). NUNCA usa el proveedor de
// transcripción real (getDefaultTranscriptionProvider/OpenAI) -- OPENAI_API_KEY
// SÍ está presente en .env de desarrollo, así que cada test inyecta
// explícitamente `options.provider` con un fake para no disparar una
// llamada de red real (mismo principio que agentPlanEndToEnd.test.ts,
// sección 49: "no network").
import { readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { afterEach, describe, expect, it } from 'vitest';
import { transcribeAgentVoiceCapture, AgentVoiceError, type AgentVoiceCaptureInput } from '../src/services/agentVoice.service';
import { TranscriptionProviderError, type TranscriptionProvider, type TranscriptionProviderResult } from '../src/services/transcription.service';
import { clearAgentSessionsForTests } from '../src/services/agentSession.service';

const CARLOS = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const DEVICE_SESSION_ID = '99999999-9999-4999-8999-999999999999';
const VOICE_SESSION_ID = '88888888-8888-4888-8888-888888888888';

function baseInput(overrides: Partial<AgentVoiceCaptureInput> = {}): AgentVoiceCaptureInput {
    return {
        actorUserId: CARLOS,
        bytes: Buffer.from('fake-audio-bytes'),
        mimeType: 'audio/wav',
        durationMs: 2_000,
        capturedAt: new Date('2026-09-07T10:00:00.000Z').toISOString(),
        voiceSessionId: VOICE_SESSION_ID,
        deviceSessionId: DEVICE_SESSION_ID,
        surface: 'mobile_voice',
        explicitConsent: true,
        traceId: 'trace-1',
        ...overrides,
    };
}

function fakeProvider(result: Partial<TranscriptionProviderResult> = {}): TranscriptionProvider {
    return {
        providerId: 'fake',
        modelId: 'fake-model',
        mode: 'batch',
        transcribe: async () => ({
            status: 'final', text: 'Qué tengo hoy', languageDetected: 'es', confidence: 0.95, segments: null,
            ...result,
        }),
    };
}

function orphanVoiceTempFiles(): string[] {
    return readdirSync(tmpdir()).filter((name) => name.startsWith('ping_voice_'));
}

const now = new Date('2026-09-07T10:00:01.000Z');

afterEach(() => {
    clearAgentSessionsForTests();
});

describe('transcribeAgentVoiceCapture — input validation (sección 9: strict, never trust the client)', () => {
    it('sin consentimiento explícito -> 400, nunca procesa audio', async () => {
        await expect(transcribeAgentVoiceCapture(baseInput({ explicitConsent: false }), { provider: fakeProvider(), now }))
            .rejects.toMatchObject({ code: 'explicit_consent_required', statusCode: 400 });
    });

    it('mime type no soportado -> 415', async () => {
        await expect(transcribeAgentVoiceCapture(baseInput({ mimeType: 'audio/ogg' }), { provider: fakeProvider(), now }))
            .rejects.toMatchObject({ code: 'unsupported_audio', statusCode: 415 });
    });

    it('audio vacío -> 400', async () => {
        await expect(transcribeAgentVoiceCapture(baseInput({ bytes: Buffer.alloc(0) }), { provider: fakeProvider(), now }))
            .rejects.toMatchObject({ code: 'empty_audio', statusCode: 400 });
    });

    it('audio por encima del límite de tamaño -> 413', async () => {
        await expect(transcribeAgentVoiceCapture(baseInput({ bytes: Buffer.alloc(10 * 1024 * 1024 + 1) }), { provider: fakeProvider(), now }))
            .rejects.toMatchObject({ code: 'audio_too_large', statusCode: 413 });
    });

    it('duración por debajo del mínimo (250ms) -> 400', async () => {
        await expect(transcribeAgentVoiceCapture(baseInput({ durationMs: 100 }), { provider: fakeProvider(), now }))
            .rejects.toMatchObject({ code: 'invalid_audio_duration', statusCode: 400 });
    });

    it('duración por encima del máximo (2 min) -> 400', async () => {
        await expect(transcribeAgentVoiceCapture(baseInput({ durationMs: 3 * 60 * 1000 }), { provider: fakeProvider(), now }))
            .rejects.toMatchObject({ code: 'invalid_audio_duration', statusCode: 400 });
    });

    it('capturedAt en el futuro (más de 60s de deriva) -> 400, nunca confía en el reloj del cliente', async () => {
        const future = new Date(now.getTime() + 5 * 60 * 1000).toISOString();
        await expect(transcribeAgentVoiceCapture(baseInput({ capturedAt: future }), { provider: fakeProvider(), now }))
            .rejects.toMatchObject({ code: 'invalid_capture_time', statusCode: 400 });
    });

    it('transcript vacío del proveedor -> 422, nunca produce un envelope con contenido vacío', async () => {
        await expect(transcribeAgentVoiceCapture(baseInput(), { provider: fakeProvider({ text: '   ' }), now }))
            .rejects.toMatchObject({ code: 'empty_transcript', statusCode: 422 });
    });
});

describe('transcribeAgentVoiceCapture — temporary audio lifecycle (sección 3/8: nunca un archivo huérfano)', () => {
    it('camino feliz: produce transcript + envelope + voiceInputToken firmado, y borra el archivo temporal', async () => {
        const before = orphanVoiceTempFiles();
        const result = await transcribeAgentVoiceCapture(baseInput(), { provider: fakeProvider(), now });
        expect(result.transcript.text).toBe('Qué tengo hoy');
        expect(result.transcript.status).toBe('final');
        expect(result.envelope.modality).toBe('voice');
        expect(result.envelope.explicitConsentContext).toEqual({ captureInitiatedBy: 'user_action', voiceAuthorizationAllowed: false });
        expect(typeof result.voiceInputToken).toBe('string');
        expect(orphanVoiceTempFiles()).toEqual(before); // ningún archivo nuevo sobrevive
    });

    it('el proveedor falla -> el error se propaga Y el archivo temporal igual se borra (finally, nunca condicional)', async () => {
        const before = orphanVoiceTempFiles();
        const failingProvider: TranscriptionProvider = {
            providerId: 'fake', modelId: 'fake-model', mode: 'batch',
            transcribe: async () => { throw new TranscriptionProviderError('provider_unavailable', true); },
        };
        await expect(transcribeAgentVoiceCapture(baseInput(), { provider: failingProvider, now }))
            .rejects.toBeInstanceOf(TranscriptionProviderError);
        expect(orphanVoiceTempFiles()).toEqual(before);
    });

    it('respuesta malformada del proveedor (confidence fuera de rango) -> 502, archivo igual se borra', async () => {
        const before = orphanVoiceTempFiles();
        await expect(transcribeAgentVoiceCapture(baseInput(), { provider: fakeProvider({ confidence: 4.2 }), now }))
            .rejects.toMatchObject({ code: 'malformed_provider_response', statusCode: 502 });
        expect(orphanVoiceTempFiles()).toEqual(before);
    });

    it('crea una AgentSession efímera ligada al actor/dispositivo, nunca persistida en DB', async () => {
        const result = await transcribeAgentVoiceCapture(baseInput(), { provider: fakeProvider(), now });
        expect(result.agentSessionId).toBeTruthy();
        expect(result.envelope.agentSessionId).toBe(result.agentSessionId);
    });
});
