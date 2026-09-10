import { apiClient } from '../api/client';
import { supabase } from './supabase';
import { createClientMessageId } from '../utils/synchronization';
import { File } from 'expo-file-system';

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

// Canonical cross-platform local-URI reader (sección: "one canonical
// cross-platform upload adapter"). MUST be used for every locally-picked
// media asset, regardless of platform or picker source, because the URI
// scheme a picker returns is not uniform:
// - iOS (expo-image-picker/expo-document-picker) always returns a real
//   `file://` path.
// - Android can ALSO return a `file://` path, but for assets sourced from
//   an external ContentProvider (the system Photo Picker, Google Photos,
//   Files app, or any "browse the file system" flow) it returns a
//   `content://` (SAF) URI instead — expo-image-picker's own type docs
//   note this directly ("On Android, the ID is unavailable when the user
//   selects a photo by directly browsing file system").
// React Native's `fetch()`/XHR polyfill does not reliably read `content://`
// URIs (silently truncated/empty bodies, especially for larger payloads
// like video) — this is a long-documented Android-only gap, never
// encountered by anything that only ever reads from the app's OWN sandbox
// (e.g. the voice recorder's output, always a real file:// path it wrote
// itself). expo-file-system's native `File` class reads through the native
// module (Android's ContentResolver for `content://`, plain filesystem
// access for `file://`) instead of the JS fetch polyfill, so this single
// implementation is correct on both platforms and for both URI schemes —
// no `Platform.OS` branch needed anywhere that calls it.
// Safe local diagnostics only: URI scheme, mimeType, byte length, HTTP
// status/error code. Never logs tokens, signed URLs, or media bytes — see
// module invariants. Videos differ materially from images in size (a few
// MB vs. tens of MB for a couple of minutes of footage), so silently
// collapsing every read/upload failure into one generic message made the
// real cause (empty read vs. storage rejection vs. size-cap rejection)
// unprovable from the field. This does not fix a failure by itself; it
// makes whichever failure is actually occurring provable instead of guessed.
function logUploadDiagnostics(stage: string, uri: string, extra: Record<string, unknown>) {
    const scheme = uri.slice(0, uri.indexOf(':')) || 'unknown';
    console.warn(`[Upload][${stage}]`, { scheme, ...extra });
}

async function readLocalMediaBytes(uri: string, mimeType: string): Promise<ArrayBuffer> {
    try {
        return await new File(uri).arrayBuffer();
    } catch (error) {
        logUploadDiagnostics('local-read-failed', uri, {
            mimeType,
            message: error instanceof Error ? error.message : String(error),
        });
        throw new Error('No se pudo leer el archivo seleccionado.');
    }
}

async function uploadToSignedPrivatePath(
    uri: string,
    mimeType: string,
    access: PrivateFileUploadAccess
) {
    const body = await readLocalMediaBytes(uri, mimeType);
    if (body.byteLength === 0) throw new Error('El archivo seleccionado está vacío.');

    const { error } = await supabase.storage
        .from(access.bucket)
        .uploadToSignedUrl(access.objectPath, access.token, body, {
            contentType: mimeType,
        });

    if (error) {
        logUploadDiagnostics('storage-upload-failed', uri, {
            mimeType,
            byteLength: body.byteLength,
            message: error.message,
            name: (error as { name?: string }).name,
        });
        // The real Storage error is preserved as `cause` (for anything
        // upstream that wants structured detail — dev tooling, tests) and
        // already logged above with safe diagnostics. The thrown message
        // itself stays a safe, domain-facing string: it must never become
        // the permanent user-facing text, since a Storage API error can
        // describe internal shape not meant for end users.
        throw new Error('No se pudo subir el archivo de forma segura.', { cause: error });
    }
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
