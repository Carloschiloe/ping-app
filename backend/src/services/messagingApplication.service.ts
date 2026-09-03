import { supabaseAdmin } from '../lib/supabaseAdmin';
import { AppError } from '../utils/AppError';
import { toLegacyMessageShape } from '../utils/messageCompat';

export const MESSAGE_API_SELECT = '*, attachments!attachments_message_id_fkey(id, kind, mime_type, size_bytes, duration_ms, original_filename, lifecycle_status, created_at), profiles!sender_id(id, email, full_name, avatar_url), reply_to:reply_to_id(id, content, deleted_at, profiles!sender_id(email, full_name, avatar_url)), message_reactions(*, profiles:user_id(id, email, full_name, avatar_url)), message_receipts(*)';

type PersistUserMessageInput = {
    actorUserId: string;
    conversationId: string;
    content: string;
    replyToId?: string;
    clientMessageId?: string;
    metadata?: Record<string, unknown>;
    attachmentId?: string;
};

export async function persistUserMessage(input: PersistUserMessageInput) {
    const { data: insertedData, error: insertError } = await supabaseAdmin.rpc(
        'persist_message_with_attachment',
        {
            p_actor_user_id: input.actorUserId,
            p_conversation_id: input.conversationId,
            p_content: input.content,
            p_reply_to_id: input.replyToId || null,
            p_client_message_id: input.clientMessageId || null,
            p_metadata: input.metadata || {},
            p_attachment_id: input.attachmentId || null,
        },
    );

    if (insertError) {
        const status = insertError.code === '42501'
            ? 403
            : insertError.code === 'P0002'
                ? 404
                : ['22023', '23514'].includes(insertError.code)
                    ? 400
                    : ['23505', '55000'].includes(insertError.code)
                        ? 409
                        : 500;
        throw new AppError(status === 500 ? 'Unable to persist message' : insertError.message, status);
    }

    const inserted = Array.isArray(insertedData) ? insertedData[0] : insertedData;
    const insertedId = inserted?.message_id ?? inserted?.id;
    if (!insertedId) throw new AppError('Unable to persist message', 500);

    const { data: message, error: fetchError } = await supabaseAdmin
        .from('messages')
        .select(MESSAGE_API_SELECT)
        .eq('id', insertedId)
        .single();
    if (fetchError) throw fetchError;

    return {
        message: toLegacyMessageShape(message, input.actorUserId),
        idempotentReplay: Boolean(inserted?.idempotent_replay),
    };
}

export async function persistSystemMessage(input: {
    conversationId: string;
    content: string;
    senderUserId?: string;
    metadata?: Record<string, unknown>;
    systemEventType: string;
}) {
    const { data: inserted, error } = await supabaseAdmin
        .from('messages')
        .insert({
            conversation_id: input.conversationId,
            sender_id: input.senderUserId || null,
            content: input.content,
            metadata: { isSystem: true, ...(input.metadata || {}) },
            system_event_type: input.systemEventType,
            status: 'sent',
        })
        .select('id')
        .single();
    if (error) throw error;

    const { data, error: fetchError } = await supabaseAdmin
        .from('messages')
        .select(MESSAGE_API_SELECT)
        .eq('id', inserted.id)
        .single();
    if (fetchError) throw fetchError;
    return toLegacyMessageShape(data, input.senderUserId);
}

export async function markReceipt(
    actorUserId: string,
    messageId: string,
    state: 'delivered' | 'read',
) {
    const { data, error } = await supabaseAdmin.rpc('mark_message_receipt', {
        p_message_id: messageId,
        p_state: state,
        p_actor_user_id: actorUserId,
    });
    if (error) {
        const status = error.code === '42501' ? 403 : error.code === 'P0002' ? 404 : 500;
        throw new AppError(status === 500 ? 'Unable to update message receipt' : error.message, status);
    }
    return data;
}

export async function markConversationRead(actorUserId: string, conversationId: string) {
    const { data, error } = await supabaseAdmin.rpc('mark_conversation_read', {
        p_conversation_id: conversationId,
        p_actor_user_id: actorUserId,
    });
    if (error) {
        const status = error.code === '42501' ? 403 : 500;
        throw new AppError(status === 500 ? 'Unable to mark conversation as read' : error.message, status);
    }
    return Number(data || 0);
}

export async function markConversationUnread(actorUserId: string, conversationId: string) {
    const { data, error } = await supabaseAdmin.rpc('mark_conversation_unread', {
        p_conversation_id: conversationId,
        p_actor_user_id: actorUserId,
    });
    if (error) {
        const status = error.code === '42501' ? 403 : 500;
        throw new AppError(status === 500 ? 'Unable to mark conversation as unread' : error.message, status);
    }
    return Boolean(data);
}

export async function tombstoneMessage(actorUserId: string, messageId: string) {
    const { error } = await supabaseAdmin.rpc('tombstone_message', {
        p_message_id: messageId,
        p_actor_user_id: actorUserId,
        p_reason: 'user_deleted',
    });
    if (error) {
        const status = error.code === '42501' ? 403 : error.code === 'P0002' ? 404 : 500;
        throw new AppError(status === 500 ? 'Unable to delete message' : error.message, status);
    }

    const { data, error: fetchError } = await supabaseAdmin
        .from('messages')
        .select(MESSAGE_API_SELECT)
        .eq('id', messageId)
        .single();
    if (fetchError) throw fetchError;
    return toLegacyMessageShape(data, actorUserId);
}
