import { apiClient } from '../api/client';
import { supabase } from './supabase';

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
    bucket: 'chat-media';
    objectPath: string;
    mimeType: string;
    fileName: string;
};

export async function resolvePrivateFileUrl(
    resourceType: PrivateFileResourceType,
    resourceId: string
): Promise<PrivateFileReadAccess> {
    return apiClient.post('/files/read-url', { resourceType, resourceId });
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
    return resolvePrivateFileUrl('profile', userId);
}

export async function uploadPrivateMessageAttachment(
    conversationId: string,
    uri: string,
    mimeType: string,
    fileName: string
): Promise<PrivateMessageAttachment> {
    const access: PrivateFileUploadAccess = await apiClient.post(
        '/files/message-attachment/upload-url',
        { conversationId, mimeType }
    );
    await uploadToSignedPrivatePath(uri, mimeType, access);
    return {
        bucket: access.bucket,
        objectPath: access.objectPath,
        mimeType,
        fileName,
    };
}
