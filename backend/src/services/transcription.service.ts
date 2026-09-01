import OpenAI from 'openai';
import fs from 'fs';

let openai: OpenAI | null = null;
export const TRANSCRIPTION_PROVIDER = 'openai';
export const TRANSCRIPTION_MODEL = 'whisper-1';
export const TRANSCRIPTION_PIPELINE_VERSION = 'c5b-v1';
export const TRANSCRIPTION_LANGUAGE_REQUESTED = 'es';

export class TranscriptionProviderError extends Error {
    constructor(
        public readonly code: string,
        public readonly retryable: boolean,
    ) {
        super(code);
        this.name = 'TranscriptionProviderError';
    }
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

export async function transcribeAudioDetailed(filePath: string): Promise<{
    text: string;
    languageDetected: string | null;
}> {
    const client = getOpenAiClient();
    if (!client) throw new TranscriptionProviderError('provider_unavailable', true);

    try {
        const response = await client.audio.transcriptions.create({
            file: fs.createReadStream(filePath),
            model: TRANSCRIPTION_MODEL,
            language: TRANSCRIPTION_LANGUAGE_REQUESTED,
        });
        const text = response.text?.trim();
        if (!text) throw new TranscriptionProviderError('empty_transcript', false);
        return { text, languageDetected: null };
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
