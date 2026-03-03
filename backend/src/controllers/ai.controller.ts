import { Request, Response } from 'express';
import { supabaseAdmin } from '../lib/supabaseAdmin';
import * as aiService from '../services/ai.service';
import axios from 'axios';
import fs from 'fs';
import path from 'path';
import os from 'os';

async function downloadFile(url: string, targetPath: string) {
    const writer = fs.createWriteStream(targetPath);
    const response = await axios({
        url,
        method: 'GET',
        responseType: 'stream'
    });
    response.data.pipe(writer);
    return new Promise((resolve, reject) => {
        writer.on('finish', resolve);
        writer.on('error', reject);
    });
}

export const askPing = async (req: Request, res: Response): Promise<void> => {
    try {
        const userId = req.user!.id;
        const { query } = req.body;

        if (!query || typeof query !== 'string') {
            res.status(400).json({ error: 'Query is required' });
            return;
        }

        let processingText = query;

        // Detection of audio query
        if (query.startsWith('[audio]')) {
            const audioUrl = query.slice(7);
            try {
                const tempFile = path.join(os.tmpdir(), `ping_ask_audio_${Date.now()}.m4a`);
                await downloadFile(audioUrl, tempFile);
                const transcript = await aiService.transcribeAudio(tempFile);
                if (transcript) {
                    processingText = transcript;
                }
                fs.unlinkSync(tempFile);
            } catch (err) {
                console.error('[AI Ask Audio] Transcription failed:', err);
                // Fallback to error message or try to proceed with empty text
                processingText = '(Audio no procesado)';
            }
        }

        // 1. Fetch user context (Commitments)
        const { data: commitments, error: commError } = await supabaseAdmin
            .from('commitments')
            .select('*')
            .eq('owner_user_id', userId)
            .order('due_at', { ascending: true });

        if (commError) throw commError;

        // 2. Call AI Service
        const nowIso = new Date().toISOString();
        const answer = await aiService.askPing(processingText, nowIso, {
            commitments: commitments || []
        });

        res.status(200).json({
            answer,
            transcript: query.startsWith('[audio]') ? processingText : undefined
        });
    } catch (error: any) {
        console.error('[AI Controller] Error:', error);
        res.status(500).json({ error: error.message });
    }
};
