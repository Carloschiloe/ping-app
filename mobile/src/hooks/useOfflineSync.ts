import { useState, useEffect, useCallback, useRef } from 'react';
import NetInfo from '@react-native-community/netinfo';
import AsyncStorage from '@react-native-async-storage/async-storage';

const OFFLINE_QUEUE_KEY = '@ping_offline_messages';

export interface PendingMessage {
    id: string; // temp local id
    conversationId: string | null;
    userId: string | null;
    text: string;
    mediaUri?: string | null;
    mediaType?: 'image' | 'audio' | 'video' | 'document';
    meta?: any;
    retryCount: number;
    createdAt: string;
}

export const useOfflineSync = (onSyncNow?: (msg: PendingMessage) => Promise<boolean>) => {
    const [isConnected, setIsConnected] = useState<boolean | null>(true);
    const [queue, setQueue] = useState<PendingMessage[]>([]);
    const isSyncing = useRef(false);

    // 1. Load queue from storage on mount
    useEffect(() => {
        const loadQueue = async () => {
            try {
                const stored = await AsyncStorage.getItem(OFFLINE_QUEUE_KEY);
                if (stored) {
                    setQueue(JSON.parse(stored));
                }
            } catch (e) {
                console.error('[OfflineSync] Failed to load queue');
            }
        };
        loadQueue();
    }, []);

    // 2. Persist queue changes
    useEffect(() => {
        const saveQueue = async () => {
            try {
                await AsyncStorage.setItem(OFFLINE_QUEUE_KEY, JSON.stringify(queue));
            } catch (e) {
                console.error('[OfflineSync] Failed to save queue');
            }
        };
        saveQueue();
    }, [queue]);

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
        
        const remaining: PendingMessage[] = [...queue];
        const toDelete: string[] = [];

        for (const msg of queue) {
            try {
                const success = await onSyncNow(msg);
                if (success) {
                    toDelete.push(msg.id);
                } else {
                    // Update retry count
                    const idx = remaining.findIndex(m => m.id === msg.id);
                    if (idx !== -1) remaining[idx].retryCount++;
                }
            } catch (err) {
                console.warn(`[OfflineSync] Failed to sync message ${msg.id}`);
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
            syncQueue();
        }
    }, [isConnected, queue.length, syncQueue]);

    const addToQueue = useCallback((msg: Omit<PendingMessage, 'retryCount' | 'createdAt'>) => {
        const newMsg: PendingMessage = {
            ...msg,
            retryCount: 0,
            createdAt: new Date().toISOString()
        };
        setQueue(prev => [...prev, newMsg]);
    }, []);

    return {
        isConnected,
        queue,
        addToQueue,
        syncQueue
    };
};
