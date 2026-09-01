import { Request, Response, NextFunction } from 'express';
import { supabaseAdmin } from '../lib/supabaseAdmin';
import { processUserMessage } from '../services/message.service';
import { NotificationService } from '../services/notification.service';
import { AppError } from '../utils/AppError';
import { assertCanReferenceProfiles, assertConversationParticipant } from '../utils/authz';
import {
    getOrCreateDirectConversationId,
    getOrCreateSelfConversationId,
} from '../services/conversation.service';
import {
    createConversationInvitation,
    verifyConversationInvitation,
} from '../utils/conversationInvitation';
import { toLegacyMessageListShape } from '../utils/messageCompat';
import { toLegacyIsGroup, toLegacyIsSelf, toLegacyArchived } from '../utils/conversationCompat';
import { verifyContactProofForRequester } from '../utils/contactDiscovery';
import { markConversationRead } from '../services/messagingApplication.service';

// POST /conversations — create or find existing 1-on-1 conversation
export const createOrFind = async (req: Request, res: Response): Promise<void> => {
    try {
        const userId = req.user!.id;
        const { otherUserId } = req.body;

        if (!otherUserId) {
            res.status(400).json({ error: 'otherUserId is required' });
            return;
        }
        if (otherUserId === userId) {
            const conversationId = await getOrCreateSelfConversationId(userId);
            res.json({ conversationId });
            return;
        }

        await assertCanReferenceProfiles(userId, [otherUserId]);

        const conversationId = await getOrCreateDirectConversationId(userId, otherUserId);
        res.status(201).json({ conversationId });
    } catch (error: any) {
        const statusCode = error instanceof AppError ? error.statusCode : 500;
        res.status(statusCode).json({ error: statusCode === 500 ? 'Unable to create conversation' : error.message });
    }
};

// POST /conversations/self — get or create self-chat (Mis Recordatorios)
export const createSelf = async (req: Request, res: Response): Promise<void> => {
    try {
        const userId = req.user!.id;
        const conversationId = await getOrCreateSelfConversationId(userId);
        res.json({ conversationId });
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
};


// GET /conversations — list all conversations for the current user
export const list = async (req: Request, res: Response): Promise<void> => {
    try {
        const userId = req.user!.id;

        // Get all conversation IDs and archived status for this user.
        // V2: archived_at (timestamptz) reemplaza archived (boolean); se
        // deriva el alias booleano "archived" para el mobile actual.
        const { data: participations, error: pErr } = await supabaseAdmin
            .from('conversation_participants')
            .select('conversation_id, archived_at')
            .eq('user_id', userId);

        if (pErr) throw pErr;

        const conversationIds = participations?.map(p => p.conversation_id) || [];
        const archivedMap: Record<string, boolean> = {};
        participations?.forEach(p => {
            archivedMap[p.conversation_id] = toLegacyArchived(p.archived_at);
        });

        if (conversationIds.length === 0) {
            res.json({ conversations: [] });
            return;
        }

        // Fetch conversation metadata.
        // V2: conversation_type reemplaza is_group; admin_id ya no existe
        // (se deriva de conversation_participants.role mas abajo); mode,
        // pinned_message_id y active_commitment_id pertenecen al modulo
        // Operacion (postergado) y todavia no existen en el esquema V2 —
        // se devuelven con defaults seguros de compatibilidad.
        const { data: conversationsData, error: cErr } = await supabaseAdmin
            .from('conversations')
            .select('id, conversation_type, name, avatar_url, deleted_at')
            .in('id', conversationIds)
            .is('deleted_at', null);

        if (cErr) throw cErr;
        const activeConversationIds = (conversationsData || []).map((conversation) => conversation.id);
        if (activeConversationIds.length === 0) {
            res.json({ conversations: [] });
            return;
        }

        // Get all participants in these conversations (incluye al propio
        // usuario para poder derivar quien es admin del grupo).
        const { data: allParticipants, error: apErr } = await supabaseAdmin
            .from('conversation_participants')
            .select('conversation_id, user_id, role, profiles(id, email, full_name, avatar_url, last_seen)')
            .in('conversation_id', activeConversationIds);

        if (apErr) throw apErr;

        // Get last message for each conversation.
        // V2: content/metadata reemplazan text/meta; sender_id unico (sin user_id).
        const { data: lastMessages, error: lmErr } = await supabaseAdmin
            .from('messages')
            .select('conversation_id, content, created_at, metadata, status, sender_id, deleted_at, message_receipts(*)')
            .in('conversation_id', activeConversationIds)
            .order('created_at', { ascending: false });

        if (lmErr) throw lmErr;

        // Unread es una propiedad del receipt del actor, no del status global.
        const { data: unreadCountsData, error: unreadErr } = await supabaseAdmin
            .from('message_receipts')
            .select('message_id, messages!inner(conversation_id, metadata, deleted_at)')
            .eq('user_id', userId)
            .is('read_at', null)
            .in('messages.conversation_id', activeConversationIds);

        if (unreadErr) throw unreadErr;

        const unreadCounts = (unreadCountsData || []).reduce((acc: Record<string, number>, receipt: any) => {
            const message = Array.isArray(receipt.messages) ? receipt.messages[0] : receipt.messages;
            if (message && !message.metadata?.isSystem && !message.deleted_at) {
                acc[message.conversation_id] = (acc[message.conversation_id] || 0) + 1;
            }
            return acc;
        }, {});

        // Build response
        const lastMsgMap: Record<string, any> = {};
        lastMessages?.forEach(m => {
            if (!lastMsgMap[m.conversation_id]) {
                lastMsgMap[m.conversation_id] = toLegacyMessageListShape([m], userId)[0];
            }
        });

        const participantMap: Record<string, any[]> = {};
        const otherParticipantMap: Record<string, any[]> = {};
        const adminIdMap: Record<string, string | null> = {};
        allParticipants?.forEach(p => {
            if (!participantMap[p.conversation_id]) participantMap[p.conversation_id] = [];
            participantMap[p.conversation_id].push(p.profiles);

            if (p.user_id !== userId) {
                if (!otherParticipantMap[p.conversation_id]) otherParticipantMap[p.conversation_id] = [];
                otherParticipantMap[p.conversation_id].push(p.profiles);
            }

            if (p.role === 'admin' && !adminIdMap[p.conversation_id]) {
                adminIdMap[p.conversation_id] = p.user_id;
            }
        });

        const convMap: Record<string, any> = {};
        conversationsData?.forEach(c => {
            convMap[c.id] = c;
        });

        const conversations = activeConversationIds.map(id => {
            const conv = convMap[id];
            const isGroup = toLegacyIsGroup(conv?.conversation_type);
            const isSelf = toLegacyIsSelf(
                conv?.conversation_type,
                participantMap[id]?.length || 0
            );
            let otherUser = null;
            let groupMetadata = null;

            if (isGroup) {
                groupMetadata = {
                    name: conv.name,
                    avatar_url: conv.avatar_url,
                    admin_id: adminIdMap[id] || null,
                    participants: otherParticipantMap[id] || []
                };
            } else {
                // For 1-on-1 chats, just grab the first other participant
                otherUser = otherParticipantMap[id]?.[0] || null;
            }

            return {
                id,
                isGroup,
                isSelf,
                // mode/pinnedMessageId/activeCommitmentId: modulo Operacion,
                // postergado — defaults seguros hasta esa fase de adaptacion.
                mode: 'chat',
                pinnedMessageId: null,
                activeCommitmentId: null,
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
        const conversationId = req.params.id as string;

        // Get current status.
        // V2: archived_at (timestamptz) reemplaza archived (boolean).
        const { data: part, error: getErr } = await supabaseAdmin
            .from('conversation_participants')
            .select('archived_at')
            .eq('conversation_id', conversationId)
            .eq('user_id', userId)
            .single();

        if (getErr || !part) {
            res.status(404).json({ error: 'Participation not found' });
            return;
        }

        const newStatus = !toLegacyArchived(part.archived_at);

        const { error: updateErr } = await supabaseAdmin
            .from('conversation_participants')
            .update({ archived_at: newStatus ? new Date().toISOString() : null })
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
        const conversationId = req.params.id as string;
        const scrollToMessageId = req.query.scrollToMessageId as string | undefined;
        const before = req.query.before as string | undefined;
        const limit = parseInt(req.query.limit as string) || 50;

        await assertConversationParticipant(userId, conversationId);

        const selectQuery = '*, attachments!attachments_message_id_fkey(id, kind, mime_type, size_bytes, duration_ms, original_filename, lifecycle_status, created_at), profiles!sender_id(id, email, full_name, avatar_url), message_reactions(*, profiles:user_id(id, email, full_name, avatar_url)), reply_to:reply_to_id(id, content, deleted_at, profiles!sender_id(email, full_name, avatar_url)), message_receipts(*)';
        let finalMessages: any[] = [];
        let hasMore = false;

        if (scrollToMessageId) {
            // Find the target message date
            const { data: targetMsg } = await supabaseAdmin
                .from('messages')
                .select('created_at')
                .eq('id', scrollToMessageId)
                .eq('conversation_id', conversationId)
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

        res.json({ messages: toLegacyMessageListShape(finalMessages, userId), hasMore });
    } catch (error: any) {
        const statusCode = error instanceof AppError ? error.statusCode : 500;
        res.status(statusCode).json({ error: statusCode === 500 ? 'Unable to load messages' : error.message });
    }
};

// POST /conversations/:id/messages
export const sendMessage = async (req: Request, res: Response): Promise<void> => {
    try {
        const userId = req.user!.id;
        const { id: conversationId } = req.params;
        const { text, reply_to_id, mentioned_user_id, client_message_id, meta, attachment, attachmentId } = req.body;
        console.info(`[API] SendMessage conversation=${conversationId} hasReply=${!!reply_to_id} hasMention=${!!mentioned_user_id}`);

        if (!text) {
            res.status(400).json({ error: 'text is required' });
            return;
        }

        const result = await processUserMessage(
            userId,
            text,
            conversationId as string,
            reply_to_id,
            mentioned_user_id,
            meta,
            client_message_id,
            attachment,
            attachmentId,
        );

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
        const statusCode = error instanceof AppError ? error.statusCode : 500;
        res.status(statusCode).json({ error: statusCode === 500 ? 'Unable to send message' : error.message });
    }
};

// POST /conversations/from-contact — starts a direct conversation only from a
// short-lived proof issued after matching an explicitly authorized device contact.
export const createFromContact = async (req: Request, res: Response): Promise<void> => {
    try {
        const requesterUserId = req.user!.id;
        const match = verifyContactProofForRequester(req.body.proof, requesterUserId);
        if (match.matchedUserId === requesterUserId) {
            res.status(400).json({ error: 'No puedes iniciar un chat contigo mediante contactos' });
            return;
        }

        const conversationId = await getOrCreateDirectConversationId(
            requesterUserId,
            match.matchedUserId
        );
        res.json({ conversationId });
    } catch (error: any) {
        const statusCode = error instanceof AppError ? error.statusCode : 500;
        res.status(statusCode).json({
            error: statusCode === 500 ? 'No se pudo iniciar la conversación' : error.message,
        });
    }
};

export const createInvitation = async (req: Request, res: Response): Promise<void> => {
    try {
        const inviterUserId = req.user!.id;
        const inviteeEmail = String(req.body.inviteeEmail).trim().toLowerCase();
        const { data: invitee, error } = await supabaseAdmin
            .from('profiles')
            .select('id')
            .eq('email', inviteeEmail)
            .limit(1)
            .maybeSingle();

        if (error) throw error;
        if (!invitee || invitee.id === inviterUserId) {
            res.status(400).json({
                error: invitee?.id === inviterUserId
                    ? 'No puedes invitarte a ti mismo'
                    : 'No existe una cuenta Ping con ese correo',
            });
            return;
        }

        res.json(createConversationInvitation(inviterUserId, invitee.id));
    } catch {
        res.status(500).json({ error: 'No se pudo crear la invitación' });
    }
};

export const acceptInvitation = async (req: Request, res: Response): Promise<void> => {
    try {
        const acceptingUserId = req.user!.id;
        const invitation = verifyConversationInvitation(req.body.token);
        if (invitation.inviteeUserId !== acceptingUserId) {
            res.status(403).json({ error: 'Esta invitación fue creada para otra cuenta' });
            return;
        }
        if (invitation.inviterUserId === acceptingUserId) {
            res.status(400).json({ error: 'No puedes aceptar tu propia invitación' });
            return;
        }

        const conversationId = await getOrCreateDirectConversationId(
            invitation.inviterUserId,
            acceptingUserId
        );
        res.json({ conversationId });
    } catch (error: any) {
        const statusCode = error instanceof AppError ? error.statusCode : 500;
        res.status(statusCode).json({
            error: statusCode === 500 ? 'No se pudo aceptar la invitación' : error.message,
        });
    }
};

// PATCH /conversations/:id/read
export const markAsRead = async (req: Request, res: Response): Promise<void> => {
    try {
        const userId = req.user!.id;
        const { id: conversationId } = req.params;

        const { data: profile } = await supabaseAdmin
            .from('profiles')
            .select('privacy_read_receipts')
            .eq('id', userId)
            .single();
        if (profile?.privacy_read_receipts === false) {
            res.json({ success: true, status: 'skipped', updated: 0 });
            return;
        }

        const updated = await markConversationRead(userId, conversationId as string);
        res.json({ success: true, updated });
    } catch (error: any) {
        const statusCode = error instanceof AppError ? error.statusCode : 500;
        res.status(statusCode).json({
            error: statusCode === 500 ? 'Unable to mark conversation as read' : error.message,
        });
    }
};

export const pingConversation = async (req: Request, res: Response): Promise<void> => {
    try {
        const userId = req.user!.id;
        const conversationId = req.params.id as string;

        await assertConversationParticipant(userId, conversationId);

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
        const userId = req.user!.id;
        const conversationId = req.params.id as string;
        await assertConversationParticipant(userId, conversationId);
        
        // Buscamos mensajes que empiecen con los prefijos de media conocidos
        const { data, error } = await supabaseAdmin
            .from('messages')
            .select('id, content, created_at, sender_id, metadata')
            .eq('conversation_id', conversationId)
            .is('deleted_at', null)
            .ilike('content', '%[%')
            .order('created_at', { ascending: false });

        if (error) throw new AppError(error.message, 500);

        // Filtro adicional para asegurar que tengan el formato correcto
        const mediaMessages = (data || []).filter(m => {
            const t = m.content || '';
            return t.startsWith('[imagen]') || t.startsWith('[audio]') || t.startsWith('[video]') || t.startsWith('[document=');
        });

        res.status(200).json({ messages: toLegacyMessageListShape(mediaMessages) });
    } catch (error) {
        next(error);
    }
};
