export type PendingSyncState = 'pending' | 'syncing' | 'result_unknown' | 'rejected';

export type SyncResult =
    | { state: 'confirmed' }
    | { state: 'result_unknown'; error: string }
    | { state: 'rejected'; error: string };

export type OfflineAttachment = {
    attachmentId?: string;
    localUri?: string;
    uploadState?: 'pending_local' | 'unavailable';
    bucket?: 'chat-media';
    objectPath?: string;
    mimeType: string;
    fileName: string;
    durationMs?: number;
};

export const OFFLINE_QUEUE_KEY = '@ping_offline_messages';
export const OFFLINE_QUEUE_MAX_ITEMS = 50;
export const OFFLINE_QUEUE_RETENTION_MS = 7 * 24 * 60 * 60 * 1000;
export const OFFLINE_QUEUE_MAX_SERIALIZED_BYTES = 256 * 1024;
const MAX_OFFLINE_TEXT_LENGTH = 10_000;

type PersistablePendingMessage = {
    id?: string;
    conversationId?: string | null;
    text?: string;
    replyToId?: string | null;
    mentionedUserId?: string | null;
    retryCount?: number;
    createdAt?: string;
    clientMessageId?: string;
    state?: PendingSyncState;
    lastError?: string | null;
    nextAttemptAt?: string | null;
    meta?: Record<string, unknown> | null;
    attachment?: OfflineAttachment | null;
};

const sanitizeOfflineLocation = (value: unknown): Record<string, unknown> | undefined => {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
    const input = value as Record<string, unknown>;
    const latitude = input.latitude;
    const longitude = input.longitude;
    if (
        typeof latitude !== 'number' || !Number.isFinite(latitude) || latitude < -90 || latitude > 90
        || typeof longitude !== 'number' || !Number.isFinite(longitude) || longitude < -180 || longitude > 180
    ) return undefined;

    const safe: Record<string, unknown> = { latitude, longitude };
    for (const key of ['label', 'address'] as const) {
        if (typeof input[key] === 'string' && input[key].length <= 300) {
            safe[key] = input[key];
        }
    }
    return safe;
};

const sanitizeOfflineMeta = (value: unknown): Record<string, unknown> | undefined => {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
    const input = value as Record<string, unknown>;
    const safe: Record<string, unknown> = {};
    if (typeof input.clientTimeZone === 'string' && input.clientTimeZone.length <= 100) {
        safe.clientTimeZone = input.clientTimeZone;
    }
    if (typeof input.forwarded === 'boolean') {
        safe.forwarded = input.forwarded;
    }
    if (input.messageType === 'location_share') {
        const location = sanitizeOfflineLocation(input.location);
        if (location) {
            safe.messageType = 'location_share';
            safe.location = location;
        }
    }
    return Object.keys(safe).length > 0 ? safe : undefined;
};

const looksLikeTransientCredential = (value: string) =>
    /\bBearer\s+[A-Za-z0-9._~-]+/i.test(value)
    || /[?&](token|signature|x-amz-signature|x-amz-credential)=/i.test(value);

const isSafeLocalAttachmentUri = (value: unknown): value is string =>
    typeof value === 'string'
    && value.length <= 2_000
    && /^(file|content):\/\//i.test(value)
    && !/[?&](token|signature|x-amz-signature|x-amz-credential)=/i.test(value);

const safeAttachmentDuration = (value: unknown) =>
    Number.isInteger(value)
        && Number(value) > 0
        && Number(value) <= 14_400_000
        ? Number(value)
        : undefined;

export function sanitizePendingQueue(
    input: unknown,
    now = Date.now(),
): Required<Pick<PersistablePendingMessage,
    'id' | 'conversationId' | 'text' | 'retryCount' | 'createdAt'
    | 'clientMessageId' | 'state'>>[] & PersistablePendingMessage[] {
    if (!Array.isArray(input)) return [];

    const minimumCreatedAt = now - OFFLINE_QUEUE_RETENTION_MS;
    return input
        .filter((item): item is PersistablePendingMessage =>
            Boolean(item && typeof item === 'object'))
        .map((item) => {
            const createdAt = typeof item.createdAt === 'string'
                ? item.createdAt
                : new Date(now).toISOString();
            const clientMessageId = typeof item.clientMessageId === 'string'
                ? item.clientMessageId
                : createClientMessageId();
            const text = typeof item.text === 'string'
                ? item.text.slice(0, MAX_OFFLINE_TEXT_LENGTH)
                : '';
            const hasAttachment = Boolean(item.attachment);
            const hasSafeAttachmentMetadata = Boolean(
                item.attachment
                && typeof item.attachment.mimeType === 'string'
                && typeof item.attachment.fileName === 'string'
            );
            const attachment = item.attachment
                && hasSafeAttachmentMetadata
                && typeof item.attachment.attachmentId === 'string'
                ? {
                    attachmentId: item.attachment.attachmentId,
                    mimeType: item.attachment.mimeType.slice(0, 100),
                    fileName: item.attachment.fileName.slice(0, 200),
                    durationMs: safeAttachmentDuration(item.attachment.durationMs),
                }
                : item.attachment
                    && hasSafeAttachmentMetadata
                    && isSafeLocalAttachmentUri(item.attachment.localUri)
                    ? {
                        localUri: item.attachment.localUri,
                        uploadState: 'pending_local' as const,
                        mimeType: item.attachment.mimeType.slice(0, 100),
                        fileName: item.attachment.fileName.slice(0, 200),
                        durationMs: safeAttachmentDuration(item.attachment.durationMs),
                    }
                    : item.attachment
                        && hasSafeAttachmentMetadata
                        && item.attachment.bucket === 'chat-media'
                        && typeof item.attachment.objectPath === 'string'
                        && item.attachment.objectPath.startsWith('conversations/')
                        && !item.attachment.objectPath.includes('..')
                        ? {
                            bucket: 'chat-media' as const,
                            objectPath: item.attachment.objectPath.slice(0, 500),
                            mimeType: item.attachment.mimeType.slice(0, 100),
                            fileName: item.attachment.fileName.slice(0, 200),
                        }
                        : hasAttachment
                            ? {
                                uploadState: 'unavailable' as const,
                                mimeType: hasSafeAttachmentMetadata
                                    ? item.attachment!.mimeType.slice(0, 100)
                                    : 'application/octet-stream',
                                fileName: hasSafeAttachmentMetadata
                                    ? item.attachment!.fileName.slice(0, 200)
                                    : 'Adjunto no disponible',
                            }
                            : null;
            const attachmentUnavailable = hasAttachment
                && attachment?.uploadState === 'unavailable';
            return {
                id: typeof item.id === 'string' ? item.id : `offline-${clientMessageId}`,
                conversationId: typeof item.conversationId === 'string'
                    ? item.conversationId
                    : null,
                text,
                replyToId: typeof item.replyToId === 'string' ? item.replyToId : null,
                mentionedUserId: typeof item.mentionedUserId === 'string'
                    ? item.mentionedUserId
                    : null,
                retryCount: Number.isInteger(item.retryCount) && Number(item.retryCount) >= 0
                    ? Number(item.retryCount)
                    : 0,
                createdAt,
                clientMessageId,
                state: attachmentUnavailable
                    ? 'rejected'
                    : ['pending', 'syncing', 'result_unknown', 'rejected'].includes(item.state || '')
                        ? item.state as PendingSyncState
                        : 'pending',
                lastError: attachmentUnavailable
                    ? 'El adjunto no quedó disponible para reintentar el envío.'
                    : typeof item.lastError === 'string'
                        ? item.lastError.slice(0, 300)
                        : null,
                nextAttemptAt: typeof item.nextAttemptAt === 'string'
                    ? item.nextAttemptAt
                    : null,
                meta: sanitizeOfflineMeta(item.meta),
                attachment,
            };
        })
        .filter((item): item is NonNullable<typeof item> => {
            if (!item) return false;
            return Date.parse(item.createdAt) >= minimumCreatedAt
                && !looksLikeTransientCredential(item.text);
        })
        .slice(-OFFLINE_QUEUE_MAX_ITEMS);
}

export function serializePendingQueue(input: unknown, now = Date.now()) {
    const sanitized = sanitizePendingQueue(input, now);
    let serialized = JSON.stringify(sanitized);
    while (
        sanitized.length > 0
        && new TextEncoder().encode(serialized).length > OFFLINE_QUEUE_MAX_SERIALIZED_BYTES
    ) {
        sanitized.shift();
        serialized = JSON.stringify(sanitized);
    }
    return serialized;
}

export function createClientMessageId() {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (char) => {
        const random = Math.floor(Math.random() * 16);
        const value = char === 'x' ? random : (random & 0x3) | 0x8;
        return value.toString(16);
    });
}

export function isNetworkFailure(message: string) {
    return /network request failed|network request timed out|failed to fetch|network error|timed out|timeout|aborted|connection/i.test(message);
}

export function classifySendFailure(status: number | null, message: string): SyncResult {
    if (status !== null && status >= 400 && status < 500 && ![408, 429].includes(status)) {
        return { state: 'rejected', error: message };
    }
    return {
        state: 'result_unknown',
        error: message || 'No se pudo confirmar el resultado del envío',
    };
}
