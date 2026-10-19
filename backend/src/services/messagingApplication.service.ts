import { randomUUID } from 'node:crypto';
import { supabaseAdmin } from '../lib/supabaseAdmin';
import { AppError } from '../utils/AppError';
import { assertConversationParticipant } from '../utils/authz';
import { toLegacyMessageShape } from '../utils/messageCompat';
import { invalidateMemoryForDeletedSource } from './memory.service';

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

type ForwardMessageInput = {
    actorUserId: string;
    sourceConversationId: string;
    sourceMessageId: string;
    destinationConversationId: string;
    clientMessageId?: string;
};

type ForwardSourceAttachment = {
    id: string;
    bucket: string;
    object_path: string;
    lifecycle_status: string;
    message_id: string;
    context_conversation_id: string;
};

function messagingRpcError(error: any, fallback: string): AppError {
    const status = error?.code === '42501'
        ? 403
        : error?.code === 'P0002'
            ? 404
            : ['22023', '23514'].includes(error?.code)
                ? 400
                : ['23505', '55000'].includes(error?.code)
                    ? 409
                    : 500;
    return new AppError(status === 500 ? fallback : error?.message || fallback, status);
}

function assertForwardableObjectPath(attachment: ForwardSourceAttachment) {
    if (
        attachment.bucket !== 'chat-media'
        || !attachment.object_path
        || attachment.object_path.startsWith('/')
        || attachment.object_path.includes('://')
        || attachment.object_path.includes('?')
        || attachment.object_path.includes('#')
        || attachment.object_path.split('/').includes('..')
    ) {
        throw new AppError('Message attachment is unavailable for forwarding', 409);
    }
}

function publicForwardedMessage(row: Record<string, any>, actorUserId: string) {
    const legacy = toLegacyMessageShape(row, actorUserId) as Record<string, any>;
    // media_* are private Storage references. The forwarding endpoint returns
    // the created message, never an object path or a URL that could be signed.
    const {
        media_url: _mediaUrl,
        media_bucket: _mediaBucket,
        media_object_path: _mediaObjectPath,
        media_metadata: _mediaMetadata,
        ...publicMessage
    } = legacy;
    return publicMessage;
}

async function loadPublicMessage(messageId: string, actorUserId: string) {
    const { data, error } = await supabaseAdmin
        .from('messages')
        .select(MESSAGE_API_SELECT)
        .eq('id', messageId)
        .single();
    if (error) throw error;
    return publicForwardedMessage(data, actorUserId);
}

export async function forwardMessage(input: ForwardMessageInput) {
    if (input.sourceConversationId === input.destinationConversationId) {
        throw new AppError('Destination conversation must be different from the source', 400);
    }

    // These checks intentionally happen before loading any source message or
    // Storage reference. The RPC repeats them as the transaction boundary.
    await assertConversationParticipant(input.actorUserId, input.sourceConversationId);
    await assertConversationParticipant(input.actorUserId, input.destinationConversationId);

    const operationId = input.clientMessageId || randomUUID();

    // Avoid copying an object again on an idempotent retry. The RPC remains
    // authoritative for the race where two requests arrive concurrently.
    const { data: existing, error: existingError } = await supabaseAdmin
        .from('messages')
        .select('id, conversation_id, metadata')
        .eq('sender_id', input.actorUserId)
        .eq('client_message_id', operationId)
        .maybeSingle();
    if (existingError) throw new AppError(existingError.message, 500);
    if (existing) {
        if (existing.conversation_id !== input.destinationConversationId) {
            throw new AppError('clientMessageId belongs to another conversation', 409);
        }
        if (existing.metadata?.forwarded_from_message_id !== input.sourceMessageId) {
            throw new AppError('clientMessageId belongs to another message', 409);
        }
        return { message: await loadPublicMessage(existing.id, input.actorUserId), idempotentReplay: true };
    }

    const { data: source, error: sourceError } = await supabaseAdmin
        .from('messages')
        .select('id, conversation_id, deleted_at, attachments!attachments_message_id_fkey(id, bucket, object_path, lifecycle_status, message_id, context_conversation_id)')
        .eq('id', input.sourceMessageId)
        .eq('conversation_id', input.sourceConversationId)
        .maybeSingle();
    if (sourceError) throw new AppError(sourceError.message, 500);
    if (!source || source.deleted_at) throw new AppError('Message not found in this conversation', 404);

    const sourceAttachments = Array.isArray(source.attachments)
        ? source.attachments
        : source.attachments ? [source.attachments] : [];
    const sourceAttachment = sourceAttachments[0] as ForwardSourceAttachment | undefined;
    if (sourceAttachment) {
        if (
            sourceAttachment.lifecycle_status !== 'attached'
            || sourceAttachment.message_id !== source.id
            || sourceAttachment.context_conversation_id !== input.sourceConversationId
        ) {
            throw new AppError('Message attachment is unavailable for forwarding', 409);
        }
        assertForwardableObjectPath(sourceAttachment);
    }

    const extension = sourceAttachment?.object_path.match(/\.([a-z0-9]{1,10})$/i)?.[1];
    const destinationObjectPath = sourceAttachment
        ? `conversations/${input.destinationConversationId}/attachments/${input.actorUserId}/${randomUUID()}${extension ? `.${extension.toLowerCase()}` : ''}`
        : null;
    let copiedObject = false;
    let transactionCommitted = false;

    if (sourceAttachment && destinationObjectPath) {
        const { error: copyError } = await supabaseAdmin.storage
            .from(sourceAttachment.bucket)
            .copy(sourceAttachment.object_path, destinationObjectPath);
        if (copyError) {
            // A concurrent request may have won the idempotency race after the
            // initial lookup. Never expose Storage's path-bearing error.
            const { data: raced } = await supabaseAdmin
                .from('messages')
                .select('id, conversation_id, metadata')
                .eq('sender_id', input.actorUserId)
                .eq('client_message_id', operationId)
                .maybeSingle();
            if (
                raced?.conversation_id === input.destinationConversationId
                && raced.metadata?.forwarded_from_message_id === input.sourceMessageId
            ) {
                await supabaseAdmin.storage
                    .from(sourceAttachment.bucket)
                    .remove([destinationObjectPath]);
                return { message: await loadPublicMessage(raced.id, input.actorUserId), idempotentReplay: true };
            }
            throw new AppError('Unable to prepare message attachment', 502);
        }
        copiedObject = true;
    }

    try {
        const { data, error } = await supabaseAdmin.rpc('forward_message_with_attachment', {
            p_actor_user_id: input.actorUserId,
            p_source_conversation_id: input.sourceConversationId,
            p_source_message_id: input.sourceMessageId,
            p_destination_conversation_id: input.destinationConversationId,
            p_destination_object_path: destinationObjectPath,
            p_client_message_id: operationId,
        });
        if (error) throw messagingRpcError(error, 'Unable to forward message');

        const inserted = Array.isArray(data) ? data[0] : data;
        const insertedId = inserted?.message_id ?? inserted?.id;
        if (!insertedId) throw new AppError('Unable to forward message', 500);
        transactionCommitted = true;

        if (inserted?.idempotent_replay && copiedObject && destinationObjectPath) {
            const { error: cleanupError } = await supabaseAdmin.storage
                .from(sourceAttachment!.bucket)
                .remove([destinationObjectPath]);
            if (cleanupError) {
                // eslint-disable-next-line no-console
                console.error('[Messaging] Unable to clean up the duplicate forwarded attachment:', cleanupError.message);
            }
            copiedObject = false;
        }

        return {
            message: await loadPublicMessage(insertedId, input.actorUserId),
            idempotentReplay: Boolean(inserted?.idempotent_replay),
        };
    } catch (error) {
        if (!transactionCommitted && copiedObject && destinationObjectPath) {
            const { error: cleanupError } = await supabaseAdmin.storage
                .from(sourceAttachment!.bucket)
                .remove([destinationObjectPath]);
            if (cleanupError) {
                // eslint-disable-next-line no-console
                console.error('[Messaging] Unable to clean up forwarded attachment after transaction failure:', cleanupError.message);
            }
        }
        throw error;
    }
}

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

    // M-2 ABSOLUTE FINAL (Blocker B) — real revocation boundary: el mensaje
    // ya se tombstoneó de verdad; cualquier memoria que lo citaba como
    // evidencia (primaria o secundaria) se limpia real -- reverse lookup vía
    // memory_record_evidence, nunca lazy. Aislado en try/catch: el borrado
    // del mensaje ya se confirmó, nunca depende de esta limpieza.
    try {
        await invalidateMemoryForDeletedSource('message', messageId);
    } catch (err) {
        // eslint-disable-next-line no-console
        console.error('[PING_MEMORY_TRACE][event_dispatch_failed] tombstoneMessage ya se confirmó -- esta falla nunca la afecta:', err instanceof Error ? err.message : err);
    }

    const { data, error: fetchError } = await supabaseAdmin
        .from('messages')
        .select(MESSAGE_API_SELECT)
        .eq('id', messageId)
        .single();
    if (fetchError) throw fetchError;
    return toLegacyMessageShape(data, actorUserId);
}
