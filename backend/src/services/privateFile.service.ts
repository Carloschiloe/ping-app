import { randomUUID } from 'node:crypto';
import { supabaseAdmin } from '../lib/supabaseAdmin';
import {
    assertConversationAdmin,
    assertConversationParticipant,
    getSharedProfileIds,
} from '../utils/authz';
import { AppError } from '../utils/AppError';

export const PRIVATE_FILE_BUCKET = 'chat-media';
export const PRIVATE_FILE_READ_TTL_SECONDS = 60;

export const privateFileResourceTypes = ['message', 'profile', 'conversation'] as const;
export type PrivateFileResourceType = typeof privateFileResourceTypes[number];

export const privateFileUploadPurposes = [
    'message_attachment',
    'profile_avatar',
    'conversation_avatar',
] as const;
export type PrivateFileUploadPurpose = typeof privateFileUploadPurposes[number];

const allowedMimeTypes = new Set([
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

const MAX_AVATAR_BYTES = 5 * 1024 * 1024;
const MAX_MESSAGE_ATTACHMENT_BYTES = 20 * 1024 * 1024;

type StoredReference = {
    bucket: string;
    objectPath: string;
};

function assertStoredReference(bucket: unknown, objectPath: unknown): StoredReference {
    if (bucket !== PRIVATE_FILE_BUCKET || typeof objectPath !== 'string' || objectPath.length === 0) {
        throw new AppError('Private file reference is not available', 404);
    }

    if (
        objectPath.startsWith('/')
        || objectPath.includes('://')
        || objectPath.includes('?')
        || objectPath.includes('#')
        || objectPath.split('/').includes('..')
    ) {
        throw new AppError('Stored private file reference is invalid', 500);
    }

    return { bucket, objectPath };
}

async function getMessageReference(userId: string, resourceId: string): Promise<StoredReference> {
    const { data, error } = await supabaseAdmin
        .from('messages')
        .select('id, conversation_id, media_bucket, media_object_path')
        .eq('id', resourceId)
        .maybeSingle();

    if (error) throw new AppError(error.message, 500);
    if (!data) throw new AppError('Message not found', 404);

    await assertConversationParticipant(userId, data.conversation_id);
    return assertStoredReference(data.media_bucket, data.media_object_path);
}

async function getConversationReference(userId: string, resourceId: string): Promise<StoredReference> {
    await assertConversationParticipant(userId, resourceId);

    const { data, error } = await supabaseAdmin
        .from('conversations')
        .select('id, avatar_bucket, avatar_object_path')
        .eq('id', resourceId)
        .maybeSingle();

    if (error) throw new AppError(error.message, 500);
    if (!data) throw new AppError('Conversation not found', 404);
    return assertStoredReference(data.avatar_bucket, data.avatar_object_path);
}

async function getProfileReference(userId: string, resourceId: string): Promise<StoredReference> {
    if (resourceId !== userId) {
        const visibleProfileIds = await getSharedProfileIds(userId);
        if (!visibleProfileIds.includes(resourceId)) {
            throw new AppError('You do not have access to this profile', 403);
        }
    }

    const { data, error } = await supabaseAdmin
        .from('profiles')
        .select('id, avatar_bucket, avatar_object_path')
        .eq('id', resourceId)
        .maybeSingle();

    if (error) throw new AppError(error.message, 500);
    if (!data) throw new AppError('Profile not found', 404);
    return assertStoredReference(data.avatar_bucket, data.avatar_object_path);
}

export async function createPrivateFileReadUrl(
    userId: string,
    resourceType: PrivateFileResourceType,
    resourceId: string
) {
    const reference = resourceType === 'message'
        ? await getMessageReference(userId, resourceId)
        : resourceType === 'conversation'
            ? await getConversationReference(userId, resourceId)
            : await getProfileReference(userId, resourceId);

    const { data, error } = await supabaseAdmin.storage
        .from(reference.bucket)
        .createSignedUrl(reference.objectPath, PRIVATE_FILE_READ_TTL_SECONDS);

    if (error || !data?.signedUrl) {
        throw new AppError(error?.message || 'Unable to sign private file access', 502);
    }

    return {
        signedUrl: data.signedUrl,
        expiresIn: PRIVATE_FILE_READ_TTL_SECONDS,
    };
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

async function authorizeUpload(
    userId: string,
    purpose: PrivateFileUploadPurpose,
    ownerResourceId: string
): Promise<string> {
    if (purpose === 'message_attachment') {
        await assertConversationParticipant(userId, ownerResourceId);
        return `conversations/${ownerResourceId}/attachments/${userId}`;
    }

    if (purpose === 'conversation_avatar') {
        await assertConversationAdmin(userId, ownerResourceId);
        return `conversations/${ownerResourceId}/avatar`;
    }

    if (userId !== ownerResourceId) {
        throw new AppError('You can only upload an avatar for your own profile', 403);
    }
    return `profiles/${ownerResourceId}/avatar`;
}

function expectedUploadPrefix(
    userId: string,
    purpose: PrivateFileUploadPurpose,
    ownerResourceId: string
) {
    if (purpose === 'message_attachment') {
        return `conversations/${ownerResourceId}/attachments/${userId}/`;
    }
    if (purpose === 'conversation_avatar') {
        return `conversations/${ownerResourceId}/avatar/`;
    }
    return `profiles/${userId}/avatar/`;
}

export async function validatePrivateFileUploadReference(
    userId: string,
    purpose: PrivateFileUploadPurpose,
    ownerResourceId: string,
    bucket: string,
    objectPath: string
) {
    if (bucket !== PRIVATE_FILE_BUCKET) {
        throw new AppError('Invalid private file bucket', 400);
    }

    await authorizeUpload(userId, purpose, ownerResourceId);
    const prefix = expectedUploadPrefix(userId, purpose, ownerResourceId);
    if (!objectPath.startsWith(prefix) || objectPath.includes('..') || objectPath.includes('://')) {
        throw new AppError('Private file path is not authorized', 403);
    }

    const filename = objectPath.slice(prefix.length);
    if (!filename || filename.includes('/')) {
        throw new AppError('Private file path is invalid', 400);
    }

    const { data, error } = await supabaseAdmin.storage
        .from(PRIVATE_FILE_BUCKET)
        .list(prefix.slice(0, -1), { search: filename, limit: 2 });

    if (error) throw new AppError('Unable to verify private file upload', 502);
    const storedObject = (data || []).find((candidate: any) => candidate.name === filename);
    if (!storedObject) throw new AppError('Uploaded private file was not found', 400);

    const size = Number(storedObject.metadata?.size ?? 0);
    const maxBytes = purpose === 'profile_avatar'
        ? MAX_AVATAR_BYTES
        : MAX_MESSAGE_ATTACHMENT_BYTES;
    if (!Number.isFinite(size) || size <= 0 || size > maxBytes) {
        throw new AppError('Private file size is not allowed', 400);
    }

    const mimeType = String(storedObject.metadata?.mimetype || '');
    if (!allowedMimeTypes.has(mimeType)) {
        throw new AppError('Stored private file type is not allowed', 400);
    }
    if (purpose === 'profile_avatar' && !mimeType.startsWith('image/')) {
        throw new AppError('Profile avatars must be images', 400);
    }

    return { bucket, objectPath, mimeType, size };
}

export async function completePrivateProfileAvatar(
    userId: string,
    bucket: string,
    objectPath: string
) {
    await validatePrivateFileUploadReference(
        userId,
        'profile_avatar',
        userId,
        bucket,
        objectPath
    );

    const { data, error } = await supabaseAdmin
        .from('profiles')
        .update({
            avatar_bucket: bucket,
            avatar_object_path: objectPath,
            avatar_url: null,
            updated_at: new Date().toISOString(),
        })
        .eq('id', userId)
        .select('id, avatar_bucket, avatar_object_path')
        .single();

    if (error || !data) {
        throw new AppError(error?.message || 'Unable to save private profile avatar', 500);
    }
    return data;
}

export async function createPrivateFileUploadUrl(
    userId: string,
    purpose: PrivateFileUploadPurpose,
    ownerResourceId: string,
    mimeType: string
) {
    if (!allowedMimeTypes.has(mimeType)) {
        throw new AppError('File type is not allowed', 400);
    }

    const prefix = await authorizeUpload(userId, purpose, ownerResourceId);
    const objectPath = `${prefix}/${randomUUID()}.${extensionForMimeType(mimeType)}`;
    const { data, error } = await supabaseAdmin.storage
        .from(PRIVATE_FILE_BUCKET)
        .createSignedUploadUrl(objectPath, { upsert: false });

    if (error || !data?.signedUrl) {
        throw new AppError(error?.message || 'Unable to sign private file upload', 502);
    }

    return {
        bucket: PRIVATE_FILE_BUCKET,
        objectPath,
        signedUrl: data.signedUrl,
        token: data.token,
    };
}
