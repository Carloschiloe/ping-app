import OpenAI from 'openai';
import fs from 'fs';

let openai: OpenAI | null = null;
function getOpenAiClient(): OpenAI | null {
    const apiKey = process.env.OPENAI_API_KEY?.trim();
    if (!apiKey) return null;
    if (!openai) openai = new OpenAI({ apiKey });
    return openai;
}

/**
 * Transcribes an audio file using OpenAI Whisper.
 */
export const transcribeAudio = async (filePath: string): Promise<string | null> => {
    const client = getOpenAiClient();
    if (!client) return null;

    try {
        const response = await client.audio.transcriptions.create({
            file: fs.createReadStream(filePath),
            model: 'whisper-1',
            language: 'es',
        });
        return response.text;
    } catch (err) {
        console.error('[Transcription Service] Failed:', err);
        return null;
    }
};
