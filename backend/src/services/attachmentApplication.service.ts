import { randomUUID } from 'node:crypto';
import { supabaseAdmin } from '../lib/supabaseAdmin';
import { AppError } from '../utils/AppError';
import { assertConversationParticipant } from '../utils/authz';
import {
    PRIVATE_FILE_BUCKET,
    PRIVATE_FILE_READ_TTL_SECONDS,
    validatePrivateFileUploadReference,
} from './privateFile.service';

const MAX_MESSAGE_ATTACHMENT_BYTES = 20 * 1024 * 1024;

const messageAttachmentMimeTypes = new Set([
    'image/jpeg',
    'image/png',
    'image/webp',
    'video/mp4',
    'video/quicktime',
    'audio/aac',
    'audio/m4a',
    'audio/mpeg',
    'audio/mp4',
    'audio/wav',
    'application/pdf',
]);

export type MessageAttachmentKind = 'image' | 'video' | 'audio' | 'document';

type AttachmentRow = {
    id: string;
    kind: MessageAttachmentKind;
    created_by_user_id: string;
    context_conversation_id: string;
    message_id: string | null;
    bucket: string;
    object_path: string;
    mime_type: string;
    size_bytes: number | null;
    original_filename: string;
    lifecycle_status: 'pending' | 'uploaded' | 'attached' | 'tombstoned';
    expires_at: string;
    duration_ms: number | null;
    duration_source: 'client_recorder' | null;
};

function rpcRow<T>(data: T | T[] | null): T | null {
    return Array.isArray(data) ? data[0] ?? null : data;
}

function attachmentError(error: any, fallback: string): AppError {
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

function sanitizeFilename(value: string): string {
    const safe = value.replace(/[\\/\u0000-\u001f]/g, '_').trim().slice(0, 200);
    if (!safe) throw new AppError('originalFilename is required', 400);
    return safe;
}

function kindForMimeType(mimeType: string): MessageAttachmentKind {
    if (!messageAttachmentMimeTypes.has(mimeType)) {
        throw new AppError('File type is not allowed', 400);
    }
    if (mimeType.startsWith('image/')) return 'image';
    if (mimeType.startsWith('video/')) return 'video';
    if (mimeType.startsWith('audio/')) return 'audio';
    return 'document';
}

function extensionForMimeType(mimeType: string): string {
    const extensions: Record<string, string> = {
        'image/jpeg': 'jpg',
        'image/png': 'png',
        'image/webp': 'webp',
        'video/mp4': 'mp4',
        'video/quicktime': 'mov',
        'audio/aac': 'aac',
        'audio/m4a': 'm4a',
        'audio/mpeg': 'mp3',
        'audio/mp4': 'm4a',
        'audio/wav': 'wav',
        'application/pdf': 'pdf',
    };
    return extensions[mimeType];
}

async function assertActiveConversationParticipant(userId: string, conversationId: string) {
    await assertConversationParticipant(userId, conversationId);
    const { data, error } = await supabaseAdmin
        .from('conversations')
        .select('id, deleted_at')
        .eq('id', conversationId)
        .maybeSingle();
    if (error) throw new AppError(error.message, 500);
    if (!data || data.deleted_at) throw new AppError('Conversation is unavailable', 404);
}

async function getAttachmentForActor(userId: string, attachmentId: string): Promise<AttachmentRow> {
    const { data, error } = await supabaseAdmin
        .from('attachments')
        .select('id, kind, created_by_user_id, context_conversation_id, message_id, bucket, object_path, mime_type, size_bytes, original_filename, lifecycle_status, expires_at')
        .eq('id', attachmentId)
        .maybeSingle();
    if (error) throw new AppError(error.message, 500);
    if (!data) throw new AppError('Attachment not found', 404);
    if (data.created_by_user_id !== userId) throw new AppError('Attachment not found', 404);
    return data as AttachmentRow;
}

export async function createMessageAttachmentUploadIntent(input: {
    actorUserId: string;
    conversationId: string;
    mimeType: string;
    originalFilename: string;
    clientUploadId: string;
    durationMs?: number;
    metadata?: Record<string, unknown>;
}) {
    const kind = kindForMimeType(input.mimeType);
    const originalFilename = sanitizeFilename(input.originalFilename);
    const objectPath = `conversations/${input.conversationId}/attachments/${input.actorUserId}/${randomUUID()}.${extensionForMimeType(input.mimeType)}`;

    const metadata = input.durationMs === undefined
        ? input.metadata || {}
        : {
            ...(input.metadata || {}),
            audio: {
                durationMs: input.durationMs,
                durationSource: 'client_recorder',
            },
        };
    const { data, error } = await supabaseAdmin.rpc('create_message_attachment_intent', {
        p_actor_user_id: input.actorUserId,
        p_conversation_id: input.conversationId,
        p_kind: kind,
        p_mime_type: input.mimeType,
        p_original_filename: originalFilename,
        p_client_upload_id: input.clientUploadId,
        p_bucket: PRIVATE_FILE_BUCKET,
        p_object_path: objectPath,
        p_metadata: metadata,
    });
    if (error) throw attachmentError(error, 'Unable to create attachment upload intent');
    const attachment = rpcRow(data) as AttachmentRow | null;
    if (!attachment) throw new AppError('Unable to create attachment upload intent', 500);

    const { data: signed, error: signError } = await supabaseAdmin.storage
        .from(attachment.bucket)
        .createSignedUploadUrl(attachment.object_path, { upsert: false });
    if (signError || !signed?.signedUrl || !signed?.token) {
        throw new AppError(signError?.message || 'Unable to sign attachment upload', 502);
    }

    return {
        attachmentId: attachment.id,
        upload: {
            bucket: attachment.bucket,
            objectPath: attachment.object_path,
            signedUrl: signed.signedUrl,
            token: signed.token,
        },
        expiresAt: attachment.expires_at,
    };
}

export async function completeMessageAttachment(actorUserId: string, attachmentId: string) {
    const attachment = await getAttachmentForActor(actorUserId, attachmentId);
    await assertActiveConversationParticipant(actorUserId, attachment.context_conversation_id);

    if (!['pending', 'uploaded'].includes(attachment.lifecycle_status)) {
        throw new AppError('Attachment cannot be completed in its current lifecycle', 409);
    }

    const verified = await validatePrivateFileUploadReference(
        actorUserId,
        'message_attachment',
        attachment.context_conversation_id,
        attachment.bucket,
        attachment.object_path,
    );
    if (verified.size > MAX_MESSAGE_ATTACHMENT_BYTES) {
        throw new AppError('Private file size is not allowed', 400);
    }

    const { data, error } = await supabaseAdmin.rpc('complete_message_attachment', {
        p_attachment_id: attachmentId,
        p_actor_user_id: actorUserId,
        p_verified_mime_type: verified.mimeType,
        p_verified_size_bytes: verified.size,
    });
    if (error) throw attachmentError(error, 'Unable to complete attachment upload');
    const completed = rpcRow(data) as AttachmentRow | null;
    if (!completed) throw new AppError('Unable to complete attachment upload', 500);

    return {
        attachmentId: completed.id,
        lifecycleStatus: completed.lifecycle_status,
        mimeType: completed.mime_type,
        sizeBytes: completed.size_bytes,
        originalFilename: completed.original_filename,
        durationMs: completed.duration_ms,
    };
}

export async function createMessageAttachmentReadUrl(actorUserId: string, attachmentId: string) {
    const { data, error } = await supabaseAdmin.rpc('authorize_message_attachment_read', {
        p_attachment_id: attachmentId,
        p_actor_user_id: actorUserId,
    });
    if (error) throw attachmentError(error, 'Unable to authorize attachment read');
    const reference = rpcRow(data) as AttachmentRow | null;
    if (!reference) throw new AppError('Attachment is unavailable or unauthorized', 403);

    const { data: signed, error: signError } = await supabaseAdmin.storage
        .from(reference.bucket)
        .createSignedUrl(reference.object_path, PRIVATE_FILE_READ_TTL_SECONDS);
    if (signError || !signed?.signedUrl) {
        throw new AppError(signError?.message || 'Unable to sign attachment access', 502);
    }
    return {
        signedUrl: signed.signedUrl,
        expiresIn: PRIVATE_FILE_READ_TTL_SECONDS,
    };
}

export async function registerLegacyMessageAttachment(input: {
    actorUserId: string;
    conversationId: string;
    bucket: string;
    objectPath: string;
    mimeType: string;
    sizeBytes: number;
    originalFilename: string;
    clientUploadId: string;
    metadata?: Record<string, unknown>;
}) {
    const kind = kindForMimeType(input.mimeType);
    const { data, error } = await supabaseAdmin.rpc('register_legacy_message_attachment', {
        p_actor_user_id: input.actorUserId,
        p_conversation_id: input.conversationId,
        p_kind: kind,
        p_mime_type: input.mimeType,
        p_size_bytes: input.sizeBytes,
        p_original_filename: sanitizeFilename(input.originalFilename),
        p_client_upload_id: input.clientUploadId,
        p_bucket: input.bucket,
        p_object_path: input.objectPath,
        p_metadata: input.metadata || {},
    });
    if (error) throw attachmentError(error, 'Unable to register legacy attachment');
    const attachment = rpcRow(data) as AttachmentRow | null;
    if (!attachment) throw new AppError('Unable to register legacy attachment', 500);
    return attachment;
}

export async function listExpiredMessageAttachments(limit = 100) {
    const { data, error } = await supabaseAdmin.rpc('list_expired_message_attachments', {
        p_limit: Math.max(1, Math.min(limit, 1000)),
    });
    if (error) throw attachmentError(error, 'Unable to list expired attachments');
    return data || [];
}
