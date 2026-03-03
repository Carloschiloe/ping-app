import { Request, Response } from 'express';
import { supabaseAdmin } from '../lib/supabaseAdmin';

export const search = async (req: Request, res: Response): Promise<void> => {
    try {
        const userId = req.user?.id;
        const { q } = req.query;

        if (!userId) {
            res.status(401).json({ error: 'Unauthorized' });
            return;
        }

        if (!q || typeof q !== 'string') {
            res.status(400).json({ error: 'Search query "q" is required' });
            return;
        }

        // 1. Get user's conversation IDs
        const { data: participations } = await supabaseAdmin
            .from('conversation_participants')
            .select('conversation_id')
            .eq('user_id', userId);

        const convIds = (participations || []).map(p => p.conversation_id);

        // 2. Search messages in those conversations
        const { data: messages, error: msgError } = await supabaseAdmin
            .from('messages')
            .select(`
                *,
                sender:profiles!messages_sender_id_fkey(full_name, avatar_url, email)
            `)
            .in('conversation_id', convIds)
            .ilike('text', `%${q}%`)
            .order('created_at', { ascending: false })
            .limit(30);

        if (msgError) throw msgError;

        // Search commitments
        const { data: commitments, error: commError } = await supabaseAdmin
            .from('commitments')
            .select('*')
            .eq('owner_user_id', userId)
            .ilike('title', `%${q}%`)
            .limit(20);

        if (commError) throw commError;

        res.status(200).json({
            messages: messages || [],
            commitments: commitments || []
        });
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
};
