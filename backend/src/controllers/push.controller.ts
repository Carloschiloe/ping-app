import { Request, Response } from 'express';
import { supabaseAdmin } from '../lib/supabaseAdmin';

export const saveToken = async (req: Request, res: Response): Promise<void> => {
    try {
        if (!req.user || !req.user.id) {
            res.status(401).json({ error: 'Unauthorized' });
            return;
        }

        const { token } = req.body;
        if (!token) {
            res.status(400).json({ error: 'Token is required' });
            return;
        }

        const { error } = await supabaseAdmin
            .from('profiles')
            .update({ expo_push_token: token })
            .eq('id', req.user.id);

        if (error) throw error;

        res.json({ success: true });
    } catch (err: any) {
        res.status(500).json({ error: err.message });
    }
};
