import { useState, useEffect, useCallback, useRef } from 'react';
import NetInfo from '@react-native-community/netinfo';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
    OFFLINE_QUEUE_KEY,
    PendingSyncState,
    sanitizePendingQueue,
    serializePendingQueue,
    SyncResult,
} from '../utils/synchronization';

export interface PendingMessage {
    id: string; // temp local id
    conversationId: string | null;
    userId: string | null;
    text: string;
    mediaUri?: string | null;
    mediaType?: 'image' | 'audio' | 'video' | 'document';
    attachment?: {
        attachmentId?: string;
        bucket?: 'chat-media';
        objectPath?: string;
        mimeType: string;
        fileName: string;
        durationMs?: number;
    } | null;
    meta?: any;
    replyToId?: string | null;
    mentionedUserId?: string | null;
    retryCount: number;
    createdAt: string;
    clientMessageId: string;
    state: PendingSyncState;
    lastError?: string | null;
    nextAttemptAt?: string | null;
}

export const useOfflineSync = (onSyncNow?: (msg: PendingMessage) => Promise<SyncResult>) => {
    const [isConnected, setIsConnected] = useState<boolean | null>(true);
    const [queue, setQueue] = useState<PendingMessage[]>([]);
    const [isQueueHydrated, setIsQueueHydrated] = useState(false);
    const isSyncing = useRef(false);
    const queueHydratedRef = useRef(false);
    const pendingAddsBeforeHydration = useRef<PendingMessage[]>([]);

    // 1. Load queue from storage on mount
    useEffect(() => {
        const loadQueue = async () => {
            try {
                const stored = await AsyncStorage.getItem(OFFLINE_QUEUE_KEY);
                const storedQueue = stored
                    ? sanitizePendingQueue(JSON.parse(stored)) as PendingMessage[]
                    : [];
                const pendingAdds = pendingAddsBeforeHydration.current;
                pendingAddsBeforeHydration.current = [];
                queueHydratedRef.current = true;
                setQueue(sanitizePendingQueue([...storedQueue, ...pendingAdds]) as PendingMessage[]);
            } catch (e) {
                console.error('[OfflineSync] Failed to load queue', e);
                const pendingAdds = pendingAddsBeforeHydration.current;
                pendingAddsBeforeHydration.current = [];
                queueHydratedRef.current = true;
                setQueue((current) => sanitizePendingQueue([...current, ...pendingAdds]) as PendingMessage[]);
            } finally {
                setIsQueueHydrated(true);
            }
        };
        loadQueue();
    }, []);

    // 2. Persist queue changes
    useEffect(() => {
        if (!isQueueHydrated) return;
        const saveQueue = async () => {
            try {
                const serialized = serializePendingQueue(queue);
                if (serialized === '[]') {
                    await AsyncStorage.removeItem(OFFLINE_QUEUE_KEY);
                } else {
                    await AsyncStorage.setItem(OFFLINE_QUEUE_KEY, serialized);
                }
            } catch (e) {
                console.error('[OfflineSync] Failed to save queue', e);
            }
        };
        saveQueue();
    }, [queue, isQueueHydrated]);

    // 3. Listen to Network changes
    useEffect(() => {
        const unsubscribe = NetInfo.addEventListener(state => {
            setIsConnected(state.isConnected);
        });
        return () => unsubscribe();
    }, []);

    // 4. Sync Logic
    const syncQueue = useCallback(async () => {
        if (isSyncing.current || !isConnected || queue.length === 0 || !onSyncNow) return;
        
        isSyncing.current = true;
        
        const toDelete: string[] = [];

        for (const msg of queue) {
            if (msg.state === 'rejected') continue;
            if (msg.nextAttemptAt && new Date(msg.nextAttemptAt).getTime() > Date.now()) continue;
            try {
                setQueue((current) => current.map((item) =>
                    item.id === msg.id ? { ...item, state: 'syncing' } : item
                ));
                const result = await onSyncNow(msg);
                if (result.state === 'confirmed') {
                    toDelete.push(msg.id);
                } else {
                    setQueue((current) => current.map((item) => {
                        if (item.id !== msg.id) return item;
                        const retryCount = item.retryCount + 1;
                        return {
                            ...item,
                            state: result.state,
                            lastError: result.error,
                            retryCount,
                            nextAttemptAt: result.state === 'result_unknown'
                                ? new Date(Date.now() + Math.min(30000, 1000 * (2 ** retryCount))).toISOString()
                                : null,
                        };
                    }));
                }
            } catch {
                const retryAt = (retryCount: number) =>
                    new Date(Date.now() + Math.min(30000, 1000 * (2 ** retryCount))).toISOString();
                setQueue((current) => current.map((item) =>
                    item.id === msg.id
                        ? {
                            ...item,
                            state: 'result_unknown',
                            lastError: 'Resultado desconocido',
                            retryCount: item.retryCount + 1,
                            nextAttemptAt: retryAt(item.retryCount + 1),
                        }
                        : item
                ));
            }
        }

        if (toDelete.length > 0) {
            setQueue(prev => prev.filter(m => !toDelete.includes(m.id)));
        }
        isSyncing.current = false;
    }, [queue, isConnected, onSyncNow]);

    // Auto-sync when connected
    useEffect(() => {
        if (isConnected && queue.length > 0) {
            const nextAttempt = queue
                .filter((item) => item.state !== 'rejected')
                .map((item) => item.nextAttemptAt ? new Date(item.nextAttemptAt).getTime() : Date.now())
                .sort((a, b) => a - b)[0];
            if (nextAttempt === undefined) return;
            const timer = setTimeout(syncQueue, Math.max(0, nextAttempt - Date.now()));
            return () => clearTimeout(timer);
        }
    }, [isConnected, queue, syncQueue]);

    const addToQueue = useCallback((msg: Omit<PendingMessage, 'retryCount' | 'createdAt' | 'state'>) => {
        const newMsg: PendingMessage = {
            ...msg,
            retryCount: 0,
            createdAt: new Date().toISOString(),
            state: 'pending',
        };
        if (!queueHydratedRef.current) {
            pendingAddsBeforeHydration.current.push(newMsg);
        }
        setQueue(prev =>
            sanitizePendingQueue([...prev, newMsg]) as PendingMessage[]);
    }, []);

    return {
        isConnected,
        queue,
        addToQueue,
        syncQueue
    };
};
