import OpenAI from 'openai';
import fs from 'fs';

let openai: OpenAI | null = null;
export const TRANSCRIPTION_PROVIDER = 'openai';
export const TRANSCRIPTION_MODEL = 'whisper-1';
export const TRANSCRIPTION_PIPELINE_VERSION = 'c5b-v1';
export const TRANSCRIPTION_LANGUAGE_REQUESTED = 'es';

export interface TranscriptionProviderInput {
    filePath: string;
    mimeType: string;
    languageHint?: string;
}

export interface TranscriptionProviderResult {
    status: 'partial' | 'final';
    text: string;
    languageDetected: string | null;
    confidence: number | null;
    segments: Array<{
        startMs: number;
        endMs: number;
        text: string;
        confidence: number | null;
        speakerRef?: string;
    }> | null;
}

export interface TranscriptionProvider {
    readonly providerId: string;
    readonly modelId: string;
    readonly mode: 'batch' | 'streaming';
    transcribe(input: TranscriptionProviderInput): Promise<TranscriptionProviderResult>;
}

export class TranscriptionProviderError extends Error {
    constructor(
        public readonly code: string,
        public readonly retryable: boolean,
    ) {
        super(code);
        this.name = 'TranscriptionProviderError';
    }
}

// Proxy de confianza (Whisper no expone una probabilidad real): avg_logprob
// es un log-probabilidad promedio (<= 0) -- exp() lo mapea a (0, 1];
// no_speech_prob alto penaliza segmentos que probablemente sean silencio/
// ruido mal transcrito. Clamped defensivamente por si el proveedor cambia
// de forma inesperada.
function segmentConfidence(avgLogprob?: number, noSpeechProb?: number): number | null {
    if (typeof avgLogprob !== 'number' || !Number.isFinite(avgLogprob)) return null;
    const base = Math.exp(avgLogprob);
    const penalty = typeof noSpeechProb === 'number' && Number.isFinite(noSpeechProb) ? 1 - noSpeechProb : 1;
    return Math.max(0, Math.min(1, base * penalty));
}

function overallConfidence(segments: Array<{ startMs: number; endMs: number; confidence: number | null }>): number | null {
    const scored = segments.filter((segment): segment is typeof segment & { confidence: number } => segment.confidence !== null);
    if (scored.length === 0) return null;
    const totalWeight = scored.reduce((sum, segment) => sum + Math.max(1, segment.endMs - segment.startMs), 0);
    if (totalWeight <= 0) return scored.reduce((sum, segment) => sum + segment.confidence, 0) / scored.length;
    const weighted = scored.reduce((sum, segment) => sum + segment.confidence * Math.max(1, segment.endMs - segment.startMs), 0);
    return weighted / totalWeight;
}

function getOpenAiClient(): OpenAI | null {
    const apiKey = process.env.OPENAI_API_KEY?.trim();
    if (!apiKey) return null;
    if (!openai) openai = new OpenAI({ apiKey });
    return openai;
}

export function isTranscriptionConfigured(): boolean {
    return Boolean(process.env.OPENAI_API_KEY?.trim());
}

export class OpenAiTranscriptionProvider implements TranscriptionProvider {
    readonly providerId = TRANSCRIPTION_PROVIDER;
    readonly modelId = TRANSCRIPTION_MODEL;
    readonly mode = 'batch' as const;

    async transcribe(input: TranscriptionProviderInput): Promise<TranscriptionProviderResult> {
        const client = getOpenAiClient();
        if (!client) throw new TranscriptionProviderError('provider_unavailable', true);

        try {
            // verbose_json es lo único que expone confianza real (avg_logprob/
            // no_speech_prob por segmento) -- whisper-1 en formato default no
            // devuelve ninguna señal de confianza (M-5, sección 6: "low-
            // confidence... must lead to clarification", requiere un número).
            const response = await client.audio.transcriptions.create({
                file: fs.createReadStream(input.filePath),
                model: this.modelId,
                response_format: 'verbose_json',
                ...(input.languageHint ? { language: input.languageHint } : {}),
            });
            const verbose = response as unknown as {
                text?: string;
                language?: string;
                segments?: Array<{ start: number; end: number; text: string; avg_logprob?: number; no_speech_prob?: number }>;
            };
            const text = verbose.text?.trim();
            if (!text) throw new TranscriptionProviderError('empty_transcript', false);
            const segments = (verbose.segments || []).map((segment) => ({
                startMs: Math.round(segment.start * 1000),
                endMs: Math.round(segment.end * 1000),
                text: segment.text,
                confidence: segmentConfidence(segment.avg_logprob, segment.no_speech_prob),
            }));
            return {
                status: 'final',
                text,
                languageDetected: verbose.language ?? null,
                confidence: overallConfidence(segments),
                segments: segments.length > 0 ? segments : null,
            };
        } catch (error: any) {
            if (error instanceof TranscriptionProviderError) throw error;
            const status = Number(error?.status || error?.statusCode || 0);
            if (status === 408 || status === 409 || status === 429 || status >= 500 || status === 0) {
                throw new TranscriptionProviderError(
                    status === 429 ? 'provider_rate_limited' : status === 408 ? 'provider_timeout' : 'provider_unavailable',
                    true,
                );
            }
            throw new TranscriptionProviderError('invalid_audio', false);
        }
    }
}

const openAiTranscriptionProvider = new OpenAiTranscriptionProvider();

export function getDefaultTranscriptionProvider(): TranscriptionProvider {
    return openAiTranscriptionProvider;
}

export async function transcribeAudioDetailed(filePath: string): Promise<{
    text: string;
    languageDetected: string | null;
}> {
    const result = await openAiTranscriptionProvider.transcribe({
        filePath,
        mimeType: 'audio/unknown',
        languageHint: TRANSCRIPTION_LANGUAGE_REQUESTED,
    });
    return { text: result.text, languageDetected: result.languageDetected };
}

/**
 * Transcribes an audio file using OpenAI Whisper.
 */
export const transcribeAudio = async (filePath: string): Promise<string | null> => {
    try {
        return (await transcribeAudioDetailed(filePath)).text;
    } catch (error) {
        const code = error instanceof TranscriptionProviderError ? error.code : 'provider_error';
        console.warn('[Transcription Service] Failed', { code });
        return null;
    }
};
