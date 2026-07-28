export type PendingSyncState = 'pending' | 'syncing' | 'result_unknown' | 'rejected';

export type SyncResult =
    | { state: 'confirmed' }
    | { state: 'result_unknown'; error: string }
    | { state: 'rejected'; error: string };

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
};

const looksLikeTransientCredential = (value: string) =>
    /\bBearer\s+[A-Za-z0-9._~-]+/i.test(value)
    || /[?&](token|signature|x-amz-signature|x-amz-credential)=/i.test(value);

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
                state: ['pending', 'syncing', 'result_unknown', 'rejected'].includes(item.state || '')
                    ? item.state as PendingSyncState
                    : 'pending',
                lastError: typeof item.lastError === 'string'
                    ? item.lastError.slice(0, 300)
                    : null,
                nextAttemptAt: typeof item.nextAttemptAt === 'string'
                    ? item.nextAttemptAt
                    : null,
            };
        })
        .filter((item) =>
            Date.parse(item.createdAt) >= minimumCreatedAt
            && !looksLikeTransientCredential(item.text))
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

export function classifySendFailure(status: number | null, message: string): SyncResult {
    if (status !== null && status >= 400 && status < 500 && ![408, 429].includes(status)) {
        return { state: 'rejected', error: message };
    }
    return {
        state: 'result_unknown',
        error: message || 'No se pudo confirmar el resultado del envío',
    };
}
