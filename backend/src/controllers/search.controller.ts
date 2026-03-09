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

        // 3. Search commitments
        const { data: commitments, error: commError } = await supabaseAdmin
            .from('commitments')
            .select('*, message:message_id(id, conversation_id)')
            .eq('owner_user_id', userId)
            .ilike('title', `%${q}%`)
            .limit(20);

        if (commError) throw commError;

        // 4. Search Profiles (Contacts)
        const { data: profiles, error: profError } = await supabaseAdmin
            .from('profiles')
            .select('id, full_name, email, avatar_url')
            .neq('id', userId)
            .or(`full_name.ilike.%${q}%,email.ilike.%${q}%`)
            .limit(20);

        if (profError) throw profError;

        // 5. Search Conversations (Group Names)
        const { data: conversations, error: convError } = await supabaseAdmin
            .from('conversations')
            .select('id, name, avatar_url, is_group')
            .in('id', convIds)
            .eq('is_group', true)
            .ilike('name', `%${q}%`)
            .limit(20);

        if (convError) throw convError;

        res.status(200).json({
            messages: messages || [],
            commitments: commitments || [],
            profiles: profiles || [],
            conversations: conversations || []
        });
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
};
