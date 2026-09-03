import { describe, expect, it, vi } from 'vitest';
import { createSupabaseAdminMock, setSupabaseAdminMock, supabaseAdminMockModule } from './helpers/supabaseMock';

vi.mock('../src/lib/supabaseAdmin', () => supabaseAdminMockModule());

function responseMock() {
    const res: any = {
        status: vi.fn(() => res),
        json: vi.fn(() => res),
    };
    return res;
}

describe('C-6: markConversationUnread (service)', () => {
    it('delega en el RPC canónico con los args correctos', async () => {
        const mock = createSupabaseAdminMock({
            'rpc:mark_conversation_unread': [{ data: true, error: null }],
        });
        setSupabaseAdminMock(mock);

        const { markConversationUnread } = await import('../src/services/messagingApplication.service');
        await expect(markConversationUnread('u1', 'c1')).resolves.toBe(true);
        expect(mock.getRpcCalls()).toEqual([{
            name: 'mark_conversation_unread',
            args: { p_conversation_id: 'c1', p_actor_user_id: 'u1' },
        }]);
    });

    it('mapea el error 42501 del RPC (no-miembro) a AppError 403', async () => {
        setSupabaseAdminMock(createSupabaseAdminMock({
            'rpc:mark_conversation_unread': [{
                data: null,
                error: { code: '42501', message: 'Actor is not a conversation participant' },
            }],
        }));
        const { markConversationUnread } = await import('../src/services/messagingApplication.service');

        await expect(markConversationUnread('intruder', 'c1')).rejects.toMatchObject({ statusCode: 403 });
    });

    it('mapea cualquier otro error a 500 genérico', async () => {
        setSupabaseAdminMock(createSupabaseAdminMock({
            'rpc:mark_conversation_unread': [{ data: null, error: { code: 'XXOOO', message: 'boom' } }],
        }));
        const { markConversationUnread } = await import('../src/services/messagingApplication.service');

        await expect(markConversationUnread('u1', 'c1')).rejects.toMatchObject({ statusCode: 500 });
    });
});

describe('C-6: PATCH /conversations/:id/unread (controller)', () => {
    it('un miembro puede marcar su propia conversación como no leída', async () => {
        const mock = createSupabaseAdminMock({
            'rpc:mark_conversation_unread': [{ data: true, error: null }],
        });
        setSupabaseAdminMock(mock);
        const { markAsUnread } = await import('../src/controllers/conversation.controller');
        const req: any = { user: { id: 'u1' }, params: { id: 'c1' } };
        const res = responseMock();

        await markAsUnread(req, res);

        expect(mock.getRpcCalls()).toEqual([{
            name: 'mark_conversation_unread',
            args: { p_conversation_id: 'c1', p_actor_user_id: 'u1' },
        }]);
        expect(res.json).toHaveBeenCalledWith({ success: true, updated: true });
    });

    it('rechaza a quien no es participante de la conversación (403)', async () => {
        setSupabaseAdminMock(createSupabaseAdminMock({
            'rpc:mark_conversation_unread': [{
                data: null,
                error: { code: '42501', message: 'Actor is not a conversation participant' },
            }],
        }));
        const { markAsUnread } = await import('../src/controllers/conversation.controller');
        const req: any = { user: { id: 'intruder' }, params: { id: 'c1' } };
        const res = responseMock();

        await markAsUnread(req, res);

        expect(res.status).toHaveBeenCalledWith(403);
    });

    it('no acepta un user_id del cliente — siempre usa el actor autenticado (req.user.id)', async () => {
        const mock = createSupabaseAdminMock({
            'rpc:mark_conversation_unread': [{ data: true, error: null }],
        });
        setSupabaseAdminMock(mock);
        const { markAsUnread } = await import('../src/controllers/conversation.controller');
        // Even if a client tried to smuggle a different user_id in the body, the
        // controller signature never reads req.body for this endpoint.
        const req: any = { user: { id: 'u1' }, params: { id: 'c1' }, body: { user_id: 'someone-else' } };
        const res = responseMock();

        await markAsUnread(req, res);

        expect(mock.getRpcCalls()[0].args.p_actor_user_id).toBe('u1');
    });
});

describe('C-6: PATCH /conversations/:id/read limpia marked_unread_at incluso con privacy_read_receipts=false', () => {
    it('privacy_read_receipts=true: delega en mark_conversation_read (que ya limpia el marcador en el RPC)', async () => {
        const mock = createSupabaseAdminMock({
            profiles: [{ data: { privacy_read_receipts: true }, error: null }],
            'rpc:mark_conversation_read': [{ data: 3, error: null }],
        });
        setSupabaseAdminMock(mock);
        const { markAsRead } = await import('../src/controllers/conversation.controller');
        const req: any = { user: { id: 'u1' }, params: { id: 'c1' } };
        const res = responseMock();

        await markAsRead(req, res);

        expect(mock.getRpcCalls()).toEqual([{
            name: 'mark_conversation_read',
            args: { p_conversation_id: 'c1', p_actor_user_id: 'u1' },
        }]);
        expect(mock.getUpdateCalls('conversation_participants')).toHaveLength(0);
        expect(res.json).toHaveBeenCalledWith({ success: true, updated: 3 });
    });

    it('privacy_read_receipts=false: NO toca message_receipts vía RPC, pero SÍ limpia marked_unread_at directamente', async () => {
        const mock = createSupabaseAdminMock({
            profiles: [{ data: { privacy_read_receipts: false }, error: null }],
        });
        setSupabaseAdminMock(mock);
        const { markAsRead } = await import('../src/controllers/conversation.controller');
        const req: any = { user: { id: 'u1' }, params: { id: 'c1' } };
        const res = responseMock();

        await markAsRead(req, res);

        // The read-receipts RPC is never invoked in this branch.
        expect(mock.getRpcCalls()).toEqual([]);
        // But the manual unread marker IS cleared via a direct, scoped update.
        expect(mock.getUpdateCalls('conversation_participants')).toEqual([{ marked_unread_at: null }]);
        expect(mock.getEqCalls('conversation_participants')).toEqual(
            expect.arrayContaining([['conversation_id', 'c1'], ['user_id', 'u1']])
        );
        expect(res.json).toHaveBeenCalledWith({ success: true, status: 'skipped', updated: 0 });
    });
});

describe('C-6: GET /conversations expone manuallyUnread sin alterar unreadCount', () => {
    it('deriva manuallyUnread de conversation_participants.marked_unread_at y deja unreadCount real intacto', async () => {
        const mock = createSupabaseAdminMock({
            conversation_participants: [
                // First call in list(): participations for the requesting user.
                { data: [{ conversation_id: 'c1', archived_at: null, marked_unread_at: '2026-09-03T10:00:00Z' }], error: null },
                // Second call in list(): all participants across conversations (for otherUser/group derivation).
                { data: [{ conversation_id: 'c1', user_id: 'u1', role: 'member', profiles: { id: 'u1', email: 'me@x.com', full_name: 'Me', avatar_url: null, last_seen: null } }], error: null },
            ],
            conversations: [{ data: [{ id: 'c1', conversation_type: 'direct', name: null, avatar_url: null, deleted_at: null }], error: null }],
            messages: [{ data: [], error: null }],
            message_receipts: [{ data: [], error: null }],
        });
        setSupabaseAdminMock(mock);
        const { list } = await import('../src/controllers/conversation.controller');
        const req: any = { user: { id: 'u1' } };
        const res = responseMock();

        await list(req, res);

        const payload = res.json.mock.calls[0][0];
        expect(payload.conversations).toHaveLength(1);
        expect(payload.conversations[0].manuallyUnread).toBe(true);
        // unreadCount is untouched — still the real, independently-computed count (0 here, no unread receipts queued).
        expect(payload.conversations[0].unreadCount).toBe(0);
    });

    it('manuallyUnread es false cuando marked_unread_at es null', async () => {
        const mock = createSupabaseAdminMock({
            conversation_participants: [
                { data: [{ conversation_id: 'c1', archived_at: null, marked_unread_at: null }], error: null },
                { data: [{ conversation_id: 'c1', user_id: 'u1', role: 'member', profiles: { id: 'u1', email: 'me@x.com', full_name: 'Me', avatar_url: null, last_seen: null } }], error: null },
            ],
            conversations: [{ data: [{ id: 'c1', conversation_type: 'direct', name: null, avatar_url: null, deleted_at: null }], error: null }],
            messages: [{ data: [], error: null }],
            message_receipts: [{ data: [], error: null }],
        });
        setSupabaseAdminMock(mock);
        const { list } = await import('../src/controllers/conversation.controller');
        const req: any = { user: { id: 'u1' } };
        const res = responseMock();

        await list(req, res);

        expect(res.json.mock.calls[0][0].conversations[0].manuallyUnread).toBe(false);
    });
});
