export type PendingSyncState = 'pending' | 'syncing' | 'result_unknown' | 'rejected';

export type SyncResult =
    | { state: 'confirmed' }
    | { state: 'result_unknown'; error: string }
    | { state: 'rejected'; error: string };

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
