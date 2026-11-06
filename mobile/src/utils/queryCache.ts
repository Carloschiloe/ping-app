import { useEffect, useRef } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { dehydrate, hydrate, useQueryClient, type DehydratedState, type Query } from '@tanstack/react-query';

// The chat list and the newest messages of recent chats are kept on the
// phone, per account, so Vorian opens showing them at once and refreshes
// them a moment later. Only the first page of each chat is kept, for the
// chats opened most recently, so the copy stays small.

const CACHE_VERSION = 'v1';
const SAVE_DELAY_MS = 2_000;
export const MAX_CACHED_CHATS = 12;

export const queryCacheKey = (userId: string) => `ping.query-cache.${CACHE_VERSION}:${userId}`;

export function isPersistableQuery(query: Pick<Query, 'queryKey' | 'state'>): boolean {
    if (query.state.status !== 'success' || query.state.data == null) return false;
    const [root, conversationId, scrollTarget] = query.queryKey as unknown[];
    if (root === 'conversations') return query.queryKey.length === 1;
    // A chat opened at a searched message is a one-off view, not its latest page.
    return root === 'conversation-messages' && typeof conversationId === 'string' && scrollTarget == null;
}

/** Keeps the chat list, and the newest page of the most recently refreshed chats. */
export function trimCacheState(state: DehydratedState, maxChats = MAX_CACHED_CHATS): DehydratedState {
    const chats = state.queries
        .filter((q) => q.queryKey[0] === 'conversation-messages')
        .sort((a, b) => b.state.dataUpdatedAt - a.state.dataUpdatedAt)
        .slice(0, maxChats)
        .map((q) => {
            const data = q.state.data as { pages?: unknown[]; pageParams?: unknown[] } | undefined;
            if (!data?.pages || data.pages.length <= 1) return q;
            return { ...q, state: { ...q.state, data: { pages: data.pages.slice(0, 1), pageParams: (data.pageParams ?? []).slice(0, 1) } } };
        });
    const lists = state.queries.filter((q) => q.queryKey[0] === 'conversations');
    return { mutations: [], queries: [...lists, ...chats] };
}

export function usePersistedChats(userId?: string | null) {
    const queryClient = useQueryClient();
    const lastUserRef = useRef<string | null>(null);
    useEffect(() => {
        // Signing out removes that account's copy from the phone.
        if (!userId && lastUserRef.current) void clearPersistedChats(lastUserRef.current);
        lastUserRef.current = userId ?? null;
    }, [userId]);
    useEffect(() => {
        if (!userId) return;
        const key = queryCacheKey(userId);
        let active = true;
        let timer: ReturnType<typeof setTimeout> | null = null;
        let unsubscribe: (() => void) | null = null;

        const save = () => {
            timer = null;
            const state = trimCacheState(dehydrate(queryClient, { shouldDehydrateQuery: isPersistableQuery }));
            AsyncStorage.setItem(key, JSON.stringify(state)).catch(() => undefined);
        };

        AsyncStorage.getItem(key)
            .then((raw) => {
                // Newer data already fetched is never replaced by the saved copy.
                if (active && raw) hydrate(queryClient, JSON.parse(raw));
            })
            .catch(() => undefined)
            .finally(() => {
                if (!active) return;
                // Saving starts after the saved copy is read, so it is never overwritten by a partial one.
                unsubscribe = queryClient.getQueryCache().subscribe((event) => {
                    if (event.type !== 'updated' || event.action.type !== 'success' || !isPersistableQuery(event.query)) return;
                    if (!timer) timer = setTimeout(save, SAVE_DELAY_MS);
                });
            });

        return () => {
            active = false;
            unsubscribe?.();
            if (timer) clearTimeout(timer);
        };
    }, [queryClient, userId]);
}

export const clearPersistedChats = (userId: string) => AsyncStorage.removeItem(queryCacheKey(userId)).catch(() => undefined);
