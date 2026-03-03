import { Request, Response } from 'express';
import { supabaseAdmin } from '../lib/supabaseAdmin';
import * as aiService from '../services/ai.service';

export const askPing = async (req: Request, res: Response): Promise<void> => {
    try {
        const userId = req.user!.id;
        const { query } = req.body;

        if (!query || typeof query !== 'string') {
            res.status(400).json({ error: 'Query is required' });
            return;
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
        const answer = await aiService.askPing(query, nowIso, {
            commitments: commitments || []
        });

        res.status(200).json({ answer });
    } catch (error: any) {
        console.error('[AI Controller] Error:', error);
        res.status(500).json({ error: error.message });
    }
};
