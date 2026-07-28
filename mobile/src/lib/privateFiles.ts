import { apiClient } from '../api/client';

export type PrivateFileResourceType = 'message' | 'profile' | 'conversation';
export type PrivateFileUploadPurpose =
    | 'message_attachment'
    | 'profile_avatar'
    | 'conversation_avatar';

export type PrivateFileReadAccess = {
    signedUrl: string;
    expiresIn: number;
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
