import { beforeEach, describe, expect, it, vi } from 'vitest';
import fs from 'fs';
import path from 'path';

// A tiny query double: each `from(table)` returns a chain whose awaited
// result comes from `results[table]`, and every call is recorded.
const mocks = vi.hoisted(() => {
    const calls: Array<{ table: string; op: string; args: any[] }> = [];
    const results: Record<string, any> = {};
    const chain = (table: string): any => {
        const proxy: any = new Proxy(() => undefined, {
            get(_target, prop: string) {
                if (prop === 'then') {
                    const value = results[table] ?? { data: [], error: null };
                    return (resolve: any) => resolve(typeof value === 'function' ? value(calls) : value);
                }
                return (...args: any[]) => {
                    calls.push({ table, op: prop, args });
                    if (prop === 'single' || prop === 'maybeSingle') {
                        const value = results[`${table}:${prop}`] ?? results[table] ?? { data: null, error: null };
                        return Promise.resolve(value);
                    }
                    return proxy;
                };
            },
        });
        return proxy;
    };
    return {
        calls,
        results,
        from: vi.fn((table: string) => chain(table)),
        rpc: vi.fn(async () => ({ error: null })),
        deleteUser: vi.fn(async () => ({ error: null })),
        list: vi.fn(async () => ({ data: [{ name: 'a.jpg' }], error: null })),
        remove: vi.fn(async () => ({ error: null })),
        assertCanReferenceProfiles: vi.fn(async () => undefined),
        assertConversationParticipant: vi.fn(async () => undefined),
    };
});

vi.mock('../src/lib/supabaseAdmin', () => ({
    supabaseAdmin: {
        from: mocks.from,
        rpc: mocks.rpc,
        auth: { admin: { deleteUser: mocks.deleteUser } },
        storage: { from: () => ({ list: mocks.list, remove: mocks.remove }) },
    },
}));

vi.mock('../src/utils/authz', () => ({
    assertCanReferenceProfiles: mocks.assertCanReferenceProfiles,
    assertConversationParticipant: mocks.assertConversationParticipant,
}));

import {
    assertDirectChatNotBlocked,
    createReport,
    deleteAccount,
    directChatBlock,
} from '../src/services/accountSafety.service';

beforeEach(() => {
    mocks.calls.length = 0;
    for (const key of Object.keys(mocks.results)) delete mocks.results[key];
    vi.clearAllMocks();
});

describe('account deletion', () => {
    it('erases data, then photos, then the sign-in, in that order', async () => {
        const order: string[] = [];
        mocks.rpc.mockImplementationOnce(async () => { order.push('data'); return { error: null }; });
        mocks.remove.mockImplementation(async () => { order.push('photos'); return { error: null }; });
        mocks.deleteUser.mockImplementationOnce(async () => { order.push('sign-in'); return { error: null }; });

        await deleteAccount('user-1');

        expect(mocks.rpc).toHaveBeenCalledWith('delete_user_account', { p_user: 'user-1' });
        expect(mocks.deleteUser).toHaveBeenCalledWith('user-1', true);
        expect(order[0]).toBe('data');
        expect(order[order.length - 1]).toBe('sign-in');
    });

    it('keeps the sign-in if the data could not be erased', async () => {
        mocks.rpc.mockResolvedValueOnce({ error: { message: 'boom' } } as any);
        await expect(deleteAccount('user-1')).rejects.toThrow();
        expect(mocks.deleteUser).not.toHaveBeenCalled();
    });
});

describe('blocks', () => {
    it('costs one lookup when the person has no block at all', async () => {
        mocks.results.user_blocks = { data: [], error: null };
        const block = await directChatBlock('me', 'chat-1');
        expect(block).toEqual({ blockedByMe: false, blockedMe: false, otherUserId: null });
        expect(mocks.from).toHaveBeenCalledTimes(1);
    });

    it('stops sending in a direct chat when the other person blocked me', async () => {
        mocks.results.user_blocks = { data: [{ blocker_id: 'other' }], error: null };
        mocks.results['conversations:maybeSingle'] = { data: { conversation_type: 'direct' }, error: null };
        mocks.results.conversation_participants = { data: [{ user_id: 'other' }], error: null };
        await expect(assertDirectChatNotBlocked('me', 'chat-1')).rejects.toMatchObject({ statusCode: 403 });
    });

    it('never blocks a group chat', async () => {
        mocks.results.user_blocks = { data: [{ blocker_id: 'other' }], error: null };
        mocks.results['conversations:maybeSingle'] = { data: { conversation_type: 'group' }, error: null };
        await expect(assertDirectChatNotBlocked('me', 'group-1')).resolves.toBeUndefined();
    });
});

describe('reports', () => {
    it('keeps a copy of the reported message words, taken from the server', async () => {
        mocks.results['messages:maybeSingle'] = { data: { id: 'm1', sender_id: 'other', content: 'texto ofensivo' }, error: null };
        mocks.results['content_reports:single'] = { data: { id: 'r1' }, error: null };

        await createReport('me', { kind: 'message', reason: 'abuse', conversationId: 'c1', messageId: 'm1', excerpt: 'lo que diga el teléfono' });

        expect(mocks.assertConversationParticipant).toHaveBeenCalledWith('me', 'c1');
        const insert = mocks.calls.find((call) => call.table === 'content_reports' && call.op === 'insert');
        expect(insert?.args[0]).toMatchObject({ reported_user_id: 'other', excerpt: 'texto ofensivo', kind: 'message' });
    });

    it('refuses a report about oneself', async () => {
        mocks.results['messages:maybeSingle'] = { data: { id: 'm1', sender_id: 'me', content: 'hola' }, error: null };
        await expect(createReport('me', { kind: 'message', reason: 'spam', conversationId: 'c1', messageId: 'm1' }))
            .rejects.toMatchObject({ statusCode: 400 });
    });
});

describe('database change', () => {
    const sql = fs.readFileSync(path.join(__dirname, '..', '..', 'supabase', 'migrations', '20261105120000_account_safety_feedback.sql'), 'utf-8');

    it('is additive and closes the new tables to app users', () => {
        expect(sql).not.toMatch(/drop table|truncate|delete from public\.(messages|commitments|conversations)\b/i);
        expect(sql).toContain('revoke all on public.user_blocks, public.content_reports, public.app_feedback from anon, authenticated');
        expect(sql).toContain('revoke all on function public.delete_user_account(uuid) from public, anon, authenticated');
    });
});

describe('before the database change is applied', () => {
    it('messages keep going out when the blocks table does not exist yet', async () => {
        mocks.results.user_blocks = { data: null, error: { code: 'PGRST205', message: 'missing' } };
        await expect(assertDirectChatNotBlocked('me', 'chat-1')).resolves.toBeUndefined();
    });
});
