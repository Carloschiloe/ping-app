import { NextFunction, Request, Response } from 'express';
import { supabaseAdmin } from '../lib/supabaseAdmin';
import { summarizeConversation } from '../services/synthesis.service';
import { assertConversationParticipant } from '../utils/authz';

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
            .is('deleted_at', null)
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
