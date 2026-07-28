import { NextFunction, Request, Response } from 'express';
import { supabaseAdmin } from '../lib/supabaseAdmin';
import { transcribeAudio } from '../services/transcription.service';
import { askPing as askPingService, summarizeConversation } from '../services/synthesis.service';
import { analyzeAndSuggestTask } from '../services/message.service';
import path from 'path';
import os from 'os';
import { assertConversationParticipant } from '../utils/authz';
import { downloadTrustedStorageFile, removeTemporaryFile } from '../utils/trustedMedia';

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
            let tempFile: string | undefined;
            try {
                tempFile = path.join(os.tmpdir(), `ping_ask_audio_${Date.now()}_${userId}.m4a`);
                await downloadTrustedStorageFile(audioUrl, tempFile);
                const transcript = await transcribeAudio(tempFile);
                if (transcript) {
                    processingText = transcript;
                }
            } catch (err) {
                console.warn('[AI Ask Audio] Rejected or failed');
                processingText = '(Audio no procesado)';
            } finally {
                await removeTemporaryFile(tempFile);
            }
        }

        // 1. Fetch user context (Commitments)
        const { data: commitments, error: commError } = await supabaseAdmin
            .from('commitments')
            .select('*')
            .eq('owner_user_id', userId)
            .order('due_at', { ascending: true });

        if (commError) throw commError;

        // --- Persistence: Store User Query ---
        await supabaseAdmin.from('ai_messages').insert({
            user_id: userId,
            text: processingText,
            is_ai: false
        });

        // 2. Call AI Service
        const nowIso = new Date().toISOString();
        const answer = await askPingService(processingText, nowIso, {
            commitments: commitments || []
        });

        // --- Persistence: Store AI Answer ---
        await supabaseAdmin.from('ai_messages').insert({
            user_id: userId,
            text: answer,
            is_ai: true
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

export const getHistory = async (req: Request, res: Response): Promise<void> => {
    try {
        const userId = req.user!.id;
        const { data, error } = await supabaseAdmin
            .from('ai_messages')
            .select('*')
            .eq('user_id', userId)
            .order('created_at', { ascending: true });

        if (error) throw error;
        res.json({ messages: data || [] });
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
};

export const clearHistory = async (req: Request, res: Response): Promise<void> => {
    try {
        const userId = req.user!.id;
        const { error } = await supabaseAdmin
            .from('ai_messages')
            .delete()
            .eq('user_id', userId);

        if (error) throw error;
        res.json({ success: true });
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
};

export const summarize = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
        const userId = req.user!.id;
        const { conversationId, limit = 50 } = req.body;

        if (!conversationId) {
            res.status(400).json({ error: 'Conversation ID is required' });
            return;
        }

        await assertConversationParticipant(userId, conversationId);

        // 1. Fetch last N messages with sender info
        const { data: messages, error: msgError } = await supabaseAdmin
            .from('messages')
            .select('*, profiles!sender_id(full_name, email)')
            .eq('conversation_id', conversationId)
            .order('created_at', { ascending: false })
            .limit(limit);

        if (msgError) throw msgError;

        if (!messages || messages.length === 0) {
            res.status(200).json({ summary: 'No hay mensajes para resumir.' });
            return;
        }

        // 2. Call AI Service (reverse to keep chronological order for the AI)
        const summary = await summarizeConversation([...messages].reverse());

        res.status(200).json({ summary });
    } catch (error: any) {
        next(error);
    }
};

export const analyzeMessage = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
        const userId = req.user!.id;
        const { id } = req.params;

        const { data: message, error: msgError } = await supabaseAdmin
            .from('messages')
            .select('*')
            .eq('id', id)
            .single();

        if (msgError || !message) {
            res.status(404).json({ error: 'Message not found' });
            return;
        }

        await assertConversationParticipant(userId, message.conversation_id);

        let processingText = message.content || '';
        let imageUrl: string | undefined;

        if (processingText.startsWith('[imagen]')) {
            const parts = processingText.split(' ');
            imageUrl = parts[0].slice(8);
            processingText = parts.slice(1).join(' ');
        } else if (processingText.startsWith('[audio]')) {
            processingText = message.metadata?.transcript || '';
        }

        const suggestedTask = await analyzeAndSuggestTask(
            message.id,
            processingText,
            imageUrl,
            undefined, // We don't have explicit mentionedUserId here easily without more queries, but AI can handle it
            message.conversation_id
        );

        res.status(200).json({ suggestedTask });
    } catch (error: any) {
        next(error);
    }
};
