import { Request, Response } from 'express';
import { supabaseAdmin } from '../lib/supabaseAdmin';

// GET /users?q=email — search users by email (excludes self)
export const search = async (req: Request, res: Response): Promise<void> => {
    try {
        const userId = req.user!.id;
        const query = (req.query.q as string) || '';

        if (query.length < 2) {
            res.json({ users: [] });
            return;
        }

        const { data, error } = await supabaseAdmin
            .from('profiles')
            .select('id, email, phone')
            .ilike('email', `%${query}%`)
            .neq('id', userId)
            .limit(20);

        if (error) throw error;
        res.json({ users: data || [] });
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
};

// POST /users/sync-contacts — find which phone numbers from device are registered in Ping
export const syncContacts = async (req: Request, res: Response): Promise<void> => {
    try {
        const userId = req.user!.id;
        const { phones } = req.body as { phones: string[] };

        if (!phones || !Array.isArray(phones) || phones.length === 0) {
            res.json({ users: [] });
            return;
        }

        // Limit to 500 contacts max per request
        const limited = phones.slice(0, 500);

        const { data, error } = await supabaseAdmin
            .from('profiles')
            .select('id, email, phone')
            .in('phone', limited)
            .neq('id', userId);

        if (error) throw error;
        res.json({ users: data || [] });
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
};

