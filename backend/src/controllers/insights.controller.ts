import { Request, Response } from 'express';
import { supabaseAdmin } from '../lib/supabaseAdmin';
import { differenceInHours } from 'date-fns';
import * as aiService from '../services/ai.service';


export const getInsights = async (req: Request, res: Response): Promise<void> => {
    try {
        const userId = (req as any).user?.id;
        if (!userId) {
            res.status(401).json({ error: 'Unauthorized' });
            return;
        }

        // 1. Get Pending/Proposed/Accepted Commitments for the next 48h
        const { data: commitments } = await supabaseAdmin
            .from('commitments')
            .select('*')
            .eq('owner_user_id', userId)
            .in('status', ['pending', 'proposed', 'accepted', 'counter_proposal'])
            .order('due_at', { ascending: true });

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
                last_message_id
            `)
            .in('id', convIds)
            .not('last_message_id', 'is', null);

        // Fetch sender info and TEXT for last messages
        const lastMsgIds = (lastMessages || []).map(m => m.last_message_id);
        const { data: msgDetails } = await supabaseAdmin
            .from('messages')
            .select('id, sender_id, text, profiles:sender_id(full_name)')
            .in('id', lastMsgIds);

        const candidates = (lastMessages || []).filter((c: any) => {
            const msgInfo = (msgDetails || []).find(s => s.id === c.last_message_id);
            if (!msgInfo) return false;
            const isMe = msgInfo.sender_id === userId;
            const hoursSince = differenceInHours(new Date(), new Date(c.last_message_at));
            return isMe && hoursSince >= 24 && hoursSince <= 600;
        }).sort((a, b) => new Date(b.last_message_at).getTime() - new Date(a.last_message_at).getTime()).slice(0, 5);

        const ghostedChats = (await Promise.all(candidates.map(async (c: any) => {
            const msgInfo = (msgDetails || []).find(s => s.id === c.last_message_id);
            const textToTest = c.last_message_text || msgInfo?.text || '';

            const { isActionable: aiActionable, reason } = await aiService.analyzeActionability(textToTest);
            if (!aiActionable) return null;

            const profilesData = msgInfo?.profiles;
            const profile = Array.isArray(profilesData) ? profilesData[0] : profilesData;

            return {
                id: c.id,
                name: c.name || profile?.full_name || 'Alguien',
                last_msg_at: c.last_message_at,
                last_msg_text: textToTest,
                hours: differenceInHours(new Date(), new Date(c.last_message_at)),
                reason
            };
        }))).filter(Boolean);

        // 3. Generate an AI-powered Briefing
        const briefingData = await aiService.generateBriefing(userId, commitments || [], ghostedChats as any[]);

        res.status(200).json({
            briefing: briefingData,
            commitments: commitments || [],
            ghostedChats
        });
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
};
