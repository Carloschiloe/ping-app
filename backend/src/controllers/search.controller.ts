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

        // Search messages
        const { data: messages, error: msgError } = await supabaseAdmin
            .from('messages')
            .select('*')
            .eq('user_id', userId)
            .ilike('text', `%${q}%`)
            .limit(20);

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
