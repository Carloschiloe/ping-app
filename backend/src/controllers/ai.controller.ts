import { NextFunction, Request, Response } from 'express';
import { supabaseAdmin } from '../lib/supabaseAdmin';
import { summarizeConversation } from '../services/synthesis.service';
import { assertConversationParticipant } from '../utils/authz';

export const summarize = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
        const userId = req.user!.id;
        const { conversationId } = req.body;
        // Enough to cover a busy day of the chat without reading it all.
        const limit = Math.min(Math.max(Number(req.body.limit) || 150, 1), 200);

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
            res.status(200).json({ summary: 'No hay mensajes para resumir.', sections: null, messageCount: 0 });
            return;
        }

        // 2. Call AI Service (reverse to keep chronological order for the AI)
        const result = await summarizeConversation([...messages].reverse());

        res.status(200).json({ summary: result.text, sections: result.sections, messageCount: messages.length });
    } catch (error: any) {
        next(error);
    }
};
