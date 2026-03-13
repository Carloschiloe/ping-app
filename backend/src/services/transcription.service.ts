import OpenAI from 'openai';
import fs from 'fs';

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

/**
 * Transcribes an audio file using OpenAI Whisper.
 */
export const transcribeAudio = async (filePath: string): Promise<string | null> => {
    if (!process.env.OPENAI_API_KEY) return null;

    try {
        const response = await openai.audio.transcriptions.create({
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
