// M-5 — OpenAiTranscriptionProvider: whisper-1 sólo expone una señal de
// confianza real en response_format='verbose_json' (avg_logprob/
// no_speech_prob por segmento) -- sin esto, `AgentInputEnvelope.provenance.
// confidence` siempre sería null y el gate de baja confianza de
// agentPlanOrchestrator.service.ts (sección 6: "low-confidence transcript
// must lead to clarification") nunca podría activarse en producción. Mockea
// el SDK de OpenAI (nunca red real) -- ver agentVoiceCapture.test.ts para el
// mismo principio aplicado al resto del pipeline.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const createMock = vi.hoisted(() => vi.fn());

vi.mock('openai', () => ({
    default: class MockOpenAI {
        audio = { transcriptions: { create: createMock } };
    },
}));

// fs.createReadStream se mockea también (nunca sólo el SDK de OpenAI):
// el mock de `create` nunca lee/cierra el stream real que le pasa el
// proveedor, así que un archivo real en disco deja un open() asíncrono sin
// consumir en vuelo -- hallazgo real durante el testing de este mismo
// archivo (ENOENT no manejado, intermitente, al borrar el temp file antes
// de que ese open() completara). Un stub in-memory elimina el I/O real por
// completo, nunca sólo "retrasa" la carrera.
vi.mock('fs', async (importOriginal) => ({
    ...await importOriginal<typeof import('fs')>(),
    default: { ...(await importOriginal<typeof import('fs')>()).default, createReadStream: vi.fn(() => ({})) },
}));

const originalApiKey = process.env.OPENAI_API_KEY;
const audioPath = '/fake/audio.wav'; // nunca tocado por fs real (createReadStream está mockeado arriba)

describe('OpenAiTranscriptionProvider — confidence derivada de avg_logprob/no_speech_prob', () => {
    beforeEach(() => {
        vi.resetModules();
        createMock.mockReset();
        process.env.OPENAI_API_KEY = 'test-only-key';
    });

    afterEach(() => {
        if (originalApiKey === undefined) delete process.env.OPENAI_API_KEY;
        else process.env.OPENAI_API_KEY = originalApiKey;
    });

    it('pide response_format verbose_json y devuelve confidence/segments derivados', async () => {
        createMock.mockResolvedValue({
            text: 'Qué tengo hoy',
            language: 'spanish',
            segments: [
                { start: 0, end: 1.5, text: 'Qué tengo', avg_logprob: -0.05, no_speech_prob: 0.01 },
                { start: 1.5, end: 3, text: 'hoy', avg_logprob: -0.05, no_speech_prob: 0.01 },
            ],
        });
        const { OpenAiTranscriptionProvider } = await import('../src/services/transcription.service');
        const provider = new OpenAiTranscriptionProvider();
        const result = await provider.transcribe({ filePath: audioPath, mimeType: 'audio/wav' });

        expect(createMock).toHaveBeenCalledWith(expect.objectContaining({ response_format: 'verbose_json' }));
        expect(result.status).toBe('final');
        expect(result.text).toBe('Qué tengo hoy');
        expect(result.confidence).not.toBeNull();
        expect(result.confidence!).toBeGreaterThan(0.9); // avg_logprob≈-0.05, no_speech_prob bajo -> alta confianza
        expect(result.segments).toHaveLength(2);
        expect(result.segments![0]).toMatchObject({ startMs: 0, endMs: 1500, text: 'Qué tengo' });
    });

    it('no_speech_prob alto castiga la confianza aunque avg_logprob sea bueno', async () => {
        createMock.mockResolvedValue({
            text: 'ruido',
            segments: [{ start: 0, end: 1, text: 'ruido', avg_logprob: -0.05, no_speech_prob: 0.9 }],
        });
        const { OpenAiTranscriptionProvider } = await import('../src/services/transcription.service');
        const result = await new OpenAiTranscriptionProvider().transcribe({ filePath: audioPath, mimeType: 'audio/wav' });
        expect(result.confidence!).toBeLessThan(0.2);
    });

    it('sin segmentos (proveedor no los devuelve) -> confidence null, nunca inventa un número', async () => {
        createMock.mockResolvedValue({ text: 'hola', segments: [] });
        const { OpenAiTranscriptionProvider } = await import('../src/services/transcription.service');
        const result = await new OpenAiTranscriptionProvider().transcribe({ filePath: audioPath, mimeType: 'audio/wav' });
        expect(result.confidence).toBeNull();
        expect(result.segments).toBeNull();
    });

    it('texto vacío -> TranscriptionProviderError empty_transcript', async () => {
        createMock.mockResolvedValue({ text: '   ', segments: [] });
        const { OpenAiTranscriptionProvider, TranscriptionProviderError } = await import('../src/services/transcription.service');
        await expect(new OpenAiTranscriptionProvider().transcribe({ filePath: audioPath, mimeType: 'audio/wav' }))
            .rejects.toBeInstanceOf(TranscriptionProviderError);
    });

    it('error 429 del proveedor -> TranscriptionProviderError provider_rate_limited, retryable', async () => {
        createMock.mockRejectedValue({ status: 429 });
        const { OpenAiTranscriptionProvider, TranscriptionProviderError } = await import('../src/services/transcription.service');
        await expect(new OpenAiTranscriptionProvider().transcribe({ filePath: audioPath, mimeType: 'audio/wav' }))
            .rejects.toMatchObject({ code: 'provider_rate_limited', retryable: true });
    });
});
