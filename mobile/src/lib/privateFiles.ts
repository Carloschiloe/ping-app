import { apiClient } from '../api/client';
import { supabase } from './supabase';
import { createClientMessageId } from '../utils/synchronization';

export type PrivateFileResourceType = 'message' | 'profile' | 'conversation';
export type PrivateFileUploadPurpose =
    | 'message_attachment'
    | 'profile_avatar'
    | 'conversation_avatar';

export type PrivateFileReadAccess = {
    signedUrl: string;
    expiresIn: number;
};

export type PrivateFileUploadAccess = {
    bucket: 'chat-media';
    objectPath: string;
    signedUrl: string;
    token: string;
};

export type PrivateMessageAttachment = {
    attachmentId: string;
    mimeType: string;
    fileName: string;
    durationMs?: number;
};

type MessageAttachmentUploadIntent = {
    attachmentId: string;
    upload: PrivateFileUploadAccess;
    expiresAt: string;
};

type PrivateFileReadCacheEntry = {
    access: PrivateFileReadAccess;
    expiresAt: number;
};

const privateFileReadCache = new Map<string, PrivateFileReadCacheEntry>();
const PRIVATE_FILE_REFRESH_BUFFER_SECONDS = 10;

export function getPrivateFileRefreshDelay(expiresIn: number): number {
    return Math.max(5_000, (Math.max(0, expiresIn) - PRIVATE_FILE_REFRESH_BUFFER_SECONDS) * 1_000);
}

export function clearPrivateFileReadCache() {
    privateFileReadCache.clear();
}

export async function resolvePrivateFileUrl(
    resourceType: PrivateFileResourceType,
    resourceId: string,
    options: { forceRefresh?: boolean } = {}
): Promise<PrivateFileReadAccess> {
    const cacheKey = `${resourceType}:${resourceId}`;
    const cached = privateFileReadCache.get(cacheKey);
    if (
        !options.forceRefresh
        && cached
        && cached.expiresAt > Date.now() + PRIVATE_FILE_REFRESH_BUFFER_SECONDS * 1_000
    ) {
        return cached.access;
    }

    const access: PrivateFileReadAccess = await apiClient.post(
        '/files/read-url',
        { resourceType, resourceId }
    );
    privateFileReadCache.set(cacheKey, {
        access,
        expiresAt: Date.now() + access.expiresIn * 1_000,
    });
    return access;
}

export async function resolveAttachmentUrl(
    attachmentId: string,
    options: { forceRefresh?: boolean } = {}
): Promise<PrivateFileReadAccess> {
    const cacheKey = `attachment:${attachmentId}`;
    const cached = privateFileReadCache.get(cacheKey);
    if (
        !options.forceRefresh
        && cached
        && cached.expiresAt > Date.now() + PRIVATE_FILE_REFRESH_BUFFER_SECONDS * 1_000
    ) {
        return cached.access;
    }

    const access: PrivateFileReadAccess = await apiClient.post(
        `/attachments/${attachmentId}/read-url`,
        {}
    );
    privateFileReadCache.set(cacheKey, {
        access,
        expiresAt: Date.now() + access.expiresIn * 1_000,
    });
    return access;
}

// Deliberately closed in mobile. Preparing the backend contract does not
// authorize uploads or allow a deployment flag to activate them accidentally.
export async function requestPrivateFileUploadUrl(
    purpose: PrivateFileUploadPurpose,
    ownerResourceId: string,
    mimeType: string
): Promise<null> {
    void purpose;
    void ownerResourceId;
    void mimeType;
    console.warn('[Upload] Private media uploads remain disabled in mobile');
    return null;
}

async function uploadToSignedPrivatePath(
    uri: string,
    mimeType: string,
    access: PrivateFileUploadAccess
) {
    const localResponse = await fetch(uri);
    if (!localResponse.ok) throw new Error('No se pudo leer el archivo seleccionado.');
    const body = await localResponse.arrayBuffer();
    if (body.byteLength === 0) throw new Error('El archivo seleccionado está vacío.');

    const { error } = await supabase.storage
        .from(access.bucket)
        .uploadToSignedUrl(access.objectPath, access.token, body, {
            contentType: mimeType,
        });

    if (error) throw new Error('No se pudo subir el archivo de forma segura.');
}

export async function uploadPrivateProfileAvatar(
    userId: string,
    uri: string,
    mimeType: 'image/jpeg' | 'image/png' | 'image/webp'
) {
    const access: PrivateFileUploadAccess = await apiClient.post(
        '/files/profile-avatar/upload-url',
        { mimeType }
    );
    await uploadToSignedPrivatePath(uri, mimeType, access);
    await apiClient.post('/files/profile-avatar/complete', {
        bucket: access.bucket,
        objectPath: access.objectPath,
    });
    return resolvePrivateFileUrl('profile', userId, { forceRefresh: true });
}

export async function uploadPrivateMessageAttachment(
    conversationId: string,
    uri: string,
    mimeType: string,
    fileName: string,
    durationMs?: number,
): Promise<PrivateMessageAttachment> {
    const intent: MessageAttachmentUploadIntent = await apiClient.post(
        '/attachments/upload-intents',
        {
            conversationId,
            mimeType,
            originalFilename: fileName,
            clientUploadId: createClientMessageId(),
            durationMs,
        }
    );
    await uploadToSignedPrivatePath(uri, mimeType, intent.upload);
    await apiClient.post(`/attachments/${intent.attachmentId}/complete`, {});
    return {
        attachmentId: intent.attachmentId,
        mimeType,
        fileName,
        durationMs,
    };
}
