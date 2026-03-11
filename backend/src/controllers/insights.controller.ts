import { Request, Response } from 'express';
import { supabaseAdmin } from '../lib/supabaseAdmin';
import { differenceInHours } from 'date-fns';

export const getInsights = async (req: Request, res: Response): Promise<void> => {
    try {
        const userId = req.user?.id;
        if (!userId) {
            res.status(401).json({ error: 'Unauthorized' });
            return;
        }

        // 1. Get Pending Commitments for the next 48h
        const { data: commitments } = await supabaseAdmin
            .from('commitments')
            .select('*')
            .eq('owner_user_id', userId)
            .eq('status', 'pending')
            .order('due_date', { ascending: true });

        // 2. Detect "Ghosted" Chats (User sent last message > 24h ago and no reply)
        const { data: participations } = await supabaseAdmin
            .from('conversation_participants')
            .select('conversation_id')
            .eq('user_id', userId);

        const convIds = (participations || []).map(p => p.conversation_id);

        const { data: lastMessages } = await supabaseAdmin
            .from('conversations')
            .select(`
                id,
                name,
                is_group,
                last_message_at,
                last_message_text,
                last_message:messages!conversations_last_message_id_fkey(
                    sender_id,
                    created_at,
                    profiles:sender_id(full_name, avatar_url)
                )
            `)
            .in('id', convIds)
            .not('last_message_id', 'is', null);

        const ghostedChats = (lastMessages || []).filter((c: any) => {
            if (!c.last_message) return false;
            const isMe = c.last_message.sender_id === userId;
            const hoursSince = differenceInHours(new Date(), new Date(c.last_message_at));
            return isMe && hoursSince >= 24 && hoursSince < 168; // Between 1 day and 1 week
        }).map((c: any) => ({
            id: c.id,
            name: c.name || c.last_message.profiles?.full_name || 'Alguien',
            last_msg_at: c.last_message_at,
            hours: differenceInHours(new Date(), new Date(c.last_message_at))
        }));

        // 3. Generate a Rule-Based Briefing (Faster than GPT for every hit, but we can iterate)
        const briefing = {
            title: "Tu Resumen Inteligente",
            summary: commitments?.length
                ? `Hoy tienes ${commitments.length} tareas pendientes. ${ghostedChats.length > 0 ? `Además, hay ${ghostedChats.length} personas que aún no te responden.` : ''}`
                : "No tienes tareas críticas para hoy. ¡Es un buen momento para ponerte al día con tus mensajes!",
            priority: commitments?.[0] || null
        };

        res.status(200).json({
            briefing,
            commitments: commitments || [],
            ghostedChats
        });
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
};
