import { beforeEach, describe, expect, it, vi } from 'vitest';

const store = new Map<string, string>();
vi.mock('@react-native-async-storage/async-storage', () => ({
    default: {
        getItem: async (key: string) => store.get(key) ?? null,
        setItem: async (key: string, value: string) => { store.set(key, value); },
        removeItem: async (key: string) => { store.delete(key); },
    },
}));

import { isPersistableQuery, trimCacheState, MAX_CACHED_CHATS } from '../src/utils/queryCache';
import { readSavedSummary, saveSummary } from '../src/utils/summaryCache';

const ok = (data: unknown, dataUpdatedAt = 1) => ({ status: 'success', data, dataUpdatedAt }) as any;

describe('chats kept on the phone', () => {
    it('keeps the chat list and the latest page of a chat, not a searched view or a failed load', () => {
        expect(isPersistableQuery({ queryKey: ['conversations'], state: ok([]) })).toBe(true);
        expect(isPersistableQuery({ queryKey: ['conversation-messages', 'c1', undefined], state: ok({ pages: [] }) })).toBe(true);
        expect(isPersistableQuery({ queryKey: ['conversation-messages', 'c1', 'm9'], state: ok({ pages: [] }) })).toBe(false);
        expect(isPersistableQuery({ queryKey: ['conversations'], state: { status: 'error', data: undefined } as any })).toBe(false);
        expect(isPersistableQuery({ queryKey: ['commitments'], state: ok([]) })).toBe(false);
    });

    it('keeps only the newest page of the most recent chats', () => {
        const chat = (id: string, at: number) => ({
            queryKey: ['conversation-messages', id], queryHash: id,
            state: ok({ pages: [{ messages: [id] }, { messages: ['older'] }], pageParams: [null, 'x'] }, at),
        });
        const queries = [{ queryKey: ['conversations'], queryHash: 'list', state: ok([]) }, ...Array.from({ length: 15 }, (_, i) => chat(`c${i}`, i))];
        const trimmed = trimCacheState({ mutations: [], queries } as any);
        const chats = trimmed.queries.filter((q) => q.queryKey[0] === 'conversation-messages');
        expect(chats).toHaveLength(MAX_CACHED_CHATS);
        expect(chats[0].queryKey[1]).toBe('c14');
        expect((chats[0].state.data as any).pages).toHaveLength(1);
        expect(trimmed.queries[0].queryKey).toEqual(['conversations']);
    });
});

describe('summary kept per chat', () => {
    beforeEach(() => store.clear());
    const summary = { text: 'Resumen', sections: { overview: 'o', agreements: [], pending: [], latest: '' }, messageCount: 10 };

    it('shows the saved summary while no message came after it', async () => {
        saveSummary('u1', 'c1', 'm5', summary);
        await Promise.resolve();
        expect(await readSavedSummary('u1', 'c1', 'm5')).toEqual(summary);
        expect(await readSavedSummary('u1', 'c1', 'm6')).toBeNull();
        expect(await readSavedSummary('u2', 'c1', 'm5')).toBeNull();
    });

    it('does not keep a summary that failed', async () => {
        saveSummary('u1', 'c1', 'm5', { text: 'No se pudo generar el resumen.', sections: null });
        await Promise.resolve();
        expect(await readSavedSummary('u1', 'c1', 'm5')).toBeNull();
    });
});
