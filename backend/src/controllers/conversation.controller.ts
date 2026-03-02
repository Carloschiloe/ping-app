import { Request, Response } from 'express';
import { supabaseAdmin } from '../lib/supabaseAdmin';
import { processUserMessage } from '../services/message.service';

// POST /conversations — create or find existing 1-on-1 conversation
export const createOrFind = async (req: Request, res: Response): Promise<void> => {
    try {
        const userId = req.user!.id;
        const { otherUserId } = req.body;

        if (!otherUserId) {
            res.status(400).json({ error: 'otherUserId is required' });
            return;
        }

        // Find conversations where BOTH users are participants (no RPC needed)
        const { data: myConvs } = await supabaseAdmin
            .from('conversation_participants')
            .select('conversation_id')
            .eq('user_id', userId);

        const myConvIds = (myConvs || []).map(p => p.conversation_id);

        if (myConvIds.length > 0) {
            const { data: shared } = await supabaseAdmin
                .from('conversation_participants')
                .select('conversation_id')
                .eq('user_id', otherUserId)
                .in('conversation_id', myConvIds)
                .limit(1);

            if (shared && shared.length > 0) {
                res.json({ conversationId: shared[0].conversation_id });
                return;
            }
        }

        // Create new conversation
        const { data: conv, error: convError } = await supabaseAdmin
            .from('conversations')
            .insert({})
            .select()
            .single();

        if (convError) throw convError;

        const { error: partError } = await supabaseAdmin
            .from('conversation_participants')
            .insert([
                { conversation_id: conv.id, user_id: userId },
                { conversation_id: conv.id, user_id: otherUserId },
            ]);

        if (partError) throw partError;

        res.status(201).json({ conversationId: conv.id });
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
};

// POST /conversations/self — get or create self-chat (Mis Recordatorios)
export const createSelf = async (req: Request, res: Response): Promise<void> => {
    try {
        const userId = req.user!.id;

        // Find a self-conversation (only this user as participant, no one else)
        const { data: myConvs } = await supabaseAdmin
            .from('conversation_participants')
            .select('conversation_id')
            .eq('user_id', userId);

        const myConvIds = (myConvs || []).map(p => p.conversation_id);

        if (myConvIds.length > 0) {
            // A self-conversation has exactly 1 participant
            for (const convId of myConvIds) {
                const { count } = await supabaseAdmin
                    .from('conversation_participants')
                    .select('*', { count: 'exact', head: true })
                    .eq('conversation_id', convId);
                if (count === 1) {
                    res.json({ conversationId: convId });
                    return;
                }
            }
        }

        // Create new self conversation
        const { data: conv, error: convError } = await supabaseAdmin
            .from('conversations')
            .insert({})
            .select()
            .single();

        if (convError) throw convError;

        const { error: partError } = await supabaseAdmin
            .from('conversation_participants')
            .insert([{ conversation_id: conv.id, user_id: userId }]);

        if (partError) throw partError;

        res.status(201).json({ conversationId: conv.id });
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
};


// GET /conversations — list all conversations for the current user
export const list = async (req: Request, res: Response): Promise<void> => {
    try {
        const userId = req.user!.id;

        // Get all conversation IDs for this user
        const { data: participations, error: pErr } = await supabaseAdmin
            .from('conversation_participants')
            .select('conversation_id')
            .eq('user_id', userId);

        if (pErr) throw pErr;

        const conversationIds = participations?.map(p => p.conversation_id) || [];

        if (conversationIds.length === 0) {
            res.json({ conversations: [] });
            return;
        }

        // Fetch conversation metadata (is_group, name, avatar)
        const { data: conversationsData, error: cErr } = await supabaseAdmin
            .from('conversations')
            .select('id, is_group, name, avatar_url, admin_id')
            .in('id', conversationIds);

        if (cErr) throw cErr;

        // Get all participants in these conversations (to find "the other person" or all members)
        const { data: allParticipants, error: apErr } = await supabaseAdmin
            .from('conversation_participants')
            .select('conversation_id, user_id, profiles(id, email)')
            .in('conversation_id', conversationIds)
            .neq('user_id', userId);

        if (apErr) throw apErr;

        // Get last message for each conversation
        const { data: lastMessages, error: lmErr } = await supabaseAdmin
            .from('messages')
            .select('conversation_id, text, created_at, meta')
            .in('conversation_id', conversationIds)
            .order('created_at', { ascending: false });

        if (lmErr) throw lmErr;

        // Build response
        const lastMsgMap: Record<string, any> = {};
        lastMessages?.forEach(m => {
            if (!lastMsgMap[m.conversation_id]) {
                lastMsgMap[m.conversation_id] = m;
            }
        });

        const participantMap: Record<string, any[]> = {};
        allParticipants?.forEach(p => {
            if (!participantMap[p.conversation_id]) participantMap[p.conversation_id] = [];
            participantMap[p.conversation_id].push(p.profiles);
        });

        const convMap: Record<string, any> = {};
        conversationsData?.forEach(c => {
            convMap[c.id] = c;
        });

        const conversations = conversationIds.map(id => {
            const conv = convMap[id];
            const isGroup = conv?.is_group || false;
            let otherUser = null;
            let groupMetadata = null;

            if (isGroup) {
                groupMetadata = {
                    name: conv.name,
                    avatar_url: conv.avatar_url,
                    admin_id: conv.admin_id,
                    participants: participantMap[id] || []
                };
            } else {
                // For 1-on-1 chats, just grab the first other participant
                otherUser = participantMap[id]?.[0] || null;
            }

            return {
                id,
                isGroup,
                otherUser,
                groupMetadata,
                lastMessage: lastMsgMap[id] || null,
            };
        }).sort((a, b) => {
            const timeA = a.lastMessage?.created_at || '';
            const timeB = b.lastMessage?.created_at || '';
            return timeB.localeCompare(timeA);
        });

        res.json({ conversations });
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
};

// GET /conversations/:id/messages
export const getMessages = async (req: Request, res: Response): Promise<void> => {
    try {
        const userId = req.user!.id;
        const { id: conversationId } = req.params;

        // Verify participation
        const { data: part } = await supabaseAdmin
            .from('conversation_participants')
            .select('user_id')
            .eq('conversation_id', conversationId)
            .eq('user_id', userId)
            .single();

        if (!part) {
            res.status(403).json({ error: 'Not a participant in this conversation' });
            return;
        }

        const { data: messages, error } = await supabaseAdmin
            .from('messages')
            .select('*, profiles!sender_id(id, email)')
            .eq('conversation_id', conversationId)
            .order('created_at', { ascending: false })
            .limit(50);

        if (error) throw error;
        res.json({ messages: messages || [] });
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
};

// POST /conversations/:id/messages
export const sendMessage = async (req: Request, res: Response): Promise<void> => {
    try {
        const userId = req.user!.id;
        const { id: conversationId } = req.params;
        const { text } = req.body;

        if (!text) {
            res.status(400).json({ error: 'text is required' });
            return;
        }

        // Verify participation
        const { data: part } = await supabaseAdmin
            .from('conversation_participants')
            .select('user_id')
            .eq('conversation_id', conversationId)
            .eq('user_id', userId)
            .single();

        if (!part) {
            res.status(403).json({ error: 'Not a participant' });
            return;
        }

        const result = await processUserMessage(userId, text, conversationId as string);
        res.status(201).json(result);
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
};
