import { Request, Response, NextFunction } from 'express';
import { supabaseAdmin } from '../lib/supabaseAdmin';
import { processUserMessage } from '../services/message.service';
import { NotificationService } from '../services/notification.service';
import { AppError } from '../utils/AppError';

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

        // Get all conversation IDs and archived status for this user
        const { data: participations, error: pErr } = await supabaseAdmin
            .from('conversation_participants')
            .select('conversation_id, archived')
            .eq('user_id', userId);

        if (pErr) throw pErr;

        const conversationIds = participations?.map(p => p.conversation_id) || [];
        const archivedMap: Record<string, boolean> = {};
        participations?.forEach(p => {
            archivedMap[p.conversation_id] = p.archived;
        });

        if (conversationIds.length === 0) {
            res.json({ conversations: [] });
            return;
        }

        // Fetch conversation metadata (is_group, name, avatar)
        const { data: conversationsData, error: cErr } = await supabaseAdmin
            .from('conversations')
            .select('id, is_group, name, avatar_url, admin_id, mode, pinned_message_id')
            .in('id', conversationIds);

        if (cErr) throw cErr;

        // Get all participants in these conversations (to find "the other person" or all members)
        const { data: allParticipants, error: apErr } = await supabaseAdmin
            .from('conversation_participants')
            .select('conversation_id, user_id, profiles(id, email, full_name, avatar_url, last_seen)')
            .in('conversation_id', conversationIds)
            .neq('user_id', userId);

        if (apErr) throw apErr;

        // Get last message for each conversation
        const { data: lastMessages, error: lmErr } = await supabaseAdmin
            .from('messages')
            .select('conversation_id, text, created_at, meta, status, sender_id, user_id')
            .in('conversation_id', conversationIds)
            .order('created_at', { ascending: false });

        if (lmErr) throw lmErr;

        // NEW: Get unread count for each conversation
        const { data: unreadCountsData, error: unreadErr } = await supabaseAdmin
            .from('messages')
            .select('conversation_id, sender_id, user_id, meta')
            .in('conversation_id', conversationIds)
            .neq('status', 'read');

        if (unreadErr) throw unreadErr;

        const unreadCounts = unreadCountsData.reduce((acc: Record<string, number>, msg) => {
            const isMe = msg.sender_id === userId;
            const isSystem = msg.meta && msg.meta.isSystem;
            if (!isMe && !isSystem) {
                acc[msg.conversation_id] = (acc[msg.conversation_id] || 0) + 1;
            }
            return acc;
        }, {});

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
                mode: conv?.mode || 'chat',
                pinnedMessageId: conv?.pinned_message_id || null,
                otherUser,
                groupMetadata,
                lastMessage: lastMsgMap[id] || null,
                unreadCount: unreadCounts[id] || 0,
                archived: archivedMap[id] || false,
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

// PATCH /conversations/:id/archive - Toggle archive status
export const toggleArchive = async (req: Request, res: Response): Promise<void> => {
    try {
        const userId = req.user!.id;
        const { id: conversationId } = req.params;

        // Get current status
        const { data: part, error: getErr } = await supabaseAdmin
            .from('conversation_participants')
            .select('archived')
            .eq('conversation_id', conversationId)
            .eq('user_id', userId)
            .single();

        if (getErr || !part) {
            res.status(404).json({ error: 'Participation not found' });
            return;
        }

        const newStatus = !part.archived;

        const { error: updateErr } = await supabaseAdmin
            .from('conversation_participants')
            .update({ archived: newStatus })
            .eq('conversation_id', conversationId)
            .eq('user_id', userId);

        if (updateErr) throw updateErr;

        res.json({ success: true, archived: newStatus });
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
};

// GET /conversations/:id/messages
export const getMessages = async (req: Request, res: Response): Promise<void> => {
    try {
        const userId = req.user!.id;
        const { id: conversationId } = req.params;
        const scrollToMessageId = req.query.scrollToMessageId as string | undefined;
        const before = req.query.before as string | undefined;
        const limit = parseInt(req.query.limit as string) || 50;

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

        const selectQuery = '*, profiles!sender_id(id, email, full_name, avatar_url), message_reactions(*, profiles:user_id(id, email, full_name, avatar_url)), reply_to:reply_to_id(id, text, profiles!sender_id(email, full_name, avatar_url))';
        let finalMessages: any[] = [];
        let hasMore = false;

        if (scrollToMessageId) {
            // Find the target message date
            const { data: targetMsg } = await supabaseAdmin
                .from('messages')
                .select('created_at')
                .eq('id', scrollToMessageId)
                .single();

            if (targetMsg) {
                // Fetch 30 older messages (including the target)
                const { data: older } = await supabaseAdmin
                    .from('messages')
                    .select(selectQuery)
                    .eq('conversation_id', conversationId)
                    .lte('created_at', targetMsg.created_at)
                    .order('created_at', { ascending: false })
                    .limit(30);

                // Fetch 30 newer messages
                const { data: newer } = await supabaseAdmin
                    .from('messages')
                    .select(selectQuery)
                    .eq('conversation_id', conversationId)
                    .gt('created_at', targetMsg.created_at)
                    .order('created_at', { ascending: true }) // ASC to get the ones right after
                    .limit(30);

                // Combine: newer reversed (so newest is first, matching order desc) + older
                finalMessages = [...(newer || []).reverse(), ...(older || [])];
                hasMore = true; // For scrollTo, we assume there might be more in both directions but simple pagination usually only goes back
            }
        } else if (before) {
            // Fetch messages older than the 'before' timestamp
            const { data: messages, error } = await supabaseAdmin
                .from('messages')
                .select(selectQuery)
                .eq('conversation_id', conversationId)
                .lt('created_at', before)
                .order('created_at', { ascending: false })
                .limit(limit + 1);

            if (error) throw error;

            if (messages && messages.length > limit) {
                hasMore = true;
                finalMessages = messages.slice(0, limit);
            } else {
                finalMessages = messages || [];
            }
        } else {
            // Default load (last N messages)
            const { data: messages, error } = await supabaseAdmin
                .from('messages')
                .select(selectQuery)
                .eq('conversation_id', conversationId)
                .order('created_at', { ascending: false })
                .limit(limit + 1);

            if (error) throw error;

            if (messages && messages.length > limit) {
                hasMore = true;
                finalMessages = messages.slice(0, limit);
            } else {
                finalMessages = messages || [];
            }
        }

        res.json({ messages: finalMessages, hasMore });
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
};

// POST /conversations/:id/messages
export const sendMessage = async (req: Request, res: Response): Promise<void> => {
    try {
        const userId = req.user!.id;
        const { id: conversationId } = req.params;
        const { text, reply_to_id, mentioned_user_id } = req.body;
        console.log(`[API] SendMessage: text="${text.substring(0, 20)}...", reply_to_id=${reply_to_id}, mentioned_user_id=${mentioned_user_id}`);

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

        const result = await processUserMessage(userId, text, conversationId as string, reply_to_id, mentioned_user_id);

        // --- Phase 21: Push Notifications ---
        try {
            // 1. Get recipients (all participants except sender)
            const { data: recipients } = await supabaseAdmin
                .from('conversation_participants')
                .select('user_id, profiles!inner(expo_push_token)')
                .eq('conversation_id', conversationId)
                .neq('user_id', userId);

            const pushTokens = recipients
                ?.map((r: any) => r.profiles?.expo_push_token)
                .filter((token: string | null | undefined) => !!token);

            if (pushTokens && pushTokens.length > 0) {
                // 2. Get sender profile for the title
                const { data: senderProfile } = await supabaseAdmin
                    .from('profiles')
                    .select('full_name, email')
                    .eq('id', userId)
                    .single();

                const senderName = senderProfile?.full_name || senderProfile?.email?.split('@')[0] || 'Ping User';
                let pushBody = text;
                if (text.startsWith('[audio]')) pushBody = '🎤 Mensaje de voz';
                else if (text.startsWith('[imagen]')) pushBody = '📷 Imagen';
                else if (text.startsWith('[document=')) pushBody = '📁 Documento';

                // 3. Send via Expo
                await NotificationService.sendPushNotifications({
                    to: pushTokens,
                    title: senderName,
                    body: pushBody,
                    data: { conversationId },
                    sound: 'default'
                });
            }
        } catch (pushErr) {
            console.error('[Push Notification Error]', pushErr);
        }

        res.status(201).json(result);
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
};

// PATCH /conversations/:id/read
export const markAsRead = async (req: Request, res: Response): Promise<void> => {
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
            res.status(403).json({ error: 'Not a participant' });
            return;
        }

        // Mark all messages from OTHER users in this conversation as 'read'
        const { error: updateErr } = await supabaseAdmin
            .from('messages')
            .update({ status: 'read' })
            .eq('conversation_id', conversationId)
            .neq('sender_id', userId)
            .neq('status', 'read');

        if (updateErr) throw updateErr;

        res.json({ success: true });
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
};

export const pingConversation = async (req: Request, res: Response): Promise<void> => {
    try {
        const userId = req.user!.id;
        const { id: conversationId } = req.params;

        // 1. Get recipients (all participants except sender)
        const { data: recipients } = await supabaseAdmin
            .from('conversation_participants')
            .select('user_id, profiles!inner(full_name, expo_push_token)')
            .eq('conversation_id', conversationId)
            .neq('user_id', userId);

        if (!recipients || recipients.length === 0) {
            res.status(404).json({ error: 'No recipients found' });
            return;
        }

        // 2. Get sender name
        const { data: sender } = await supabaseAdmin
            .from('profiles')
            .select('full_name')
            .eq('id', userId)
            .single();

        const senderName = sender?.full_name || 'Alguien';

        // 3. Send notifications
        const tokens = recipients
            .map((r: any) => r.profiles?.expo_push_token)
            .filter((t: string | null) => !!t);

        if (tokens.length > 0) {
            await NotificationService.sendPushNotifications({
                to: tokens,
                title: '🚨 ¿Sigues ahí?',
                body: `${senderName} te está esperando.`,
                data: { conversationId },
                sound: 'default'
            });
        }

        res.json({ success: true });
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
};

export const getConversationMedia = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
        const { id: conversationId } = req.params;
        
        // Buscamos mensajes que empiecen con los prefijos de media conocidos
        const { data, error } = await supabaseAdmin
            .from('messages')
            .select('id, text, created_at, sender_id, meta')
            .eq('conversation_id', conversationId)
            .ilike('text', '%[%')
            .order('created_at', { ascending: false });

        if (error) throw new AppError(error.message, 500);

        console.warn(`[DEBUG-BACKEND] Media found for ${conversationId}: ${(data || []).length} items`);
        if (data && data.length > 0) {
            data.slice(0, 5).forEach((m, i) => {
                console.warn(`[DEBUG-BACKEND] Item ${i}: ID=${m.id.substring(0,8)} Text="${m.text?.substring(0, 100)}"`);
            });
        }

        // Filtro adicional para asegurar que tengan el formato correcto
        const mediaMessages = (data || []).filter(m => {
            const t = m.text || '';
            return t.startsWith('[imagen]') || t.startsWith('[audio]') || t.startsWith('[video]') || t.startsWith('[document=');
        });

        res.status(200).json({ messages: mediaMessages });
    } catch (error) {
        next(error);
    }
};
