import { describe, expect, it, vi } from 'vitest';
import { createSupabaseAdminMock, setSupabaseAdminMock, supabaseAdminMockModule } from './helpers/supabaseMock';

vi.mock('../src/lib/supabaseAdmin', () => supabaseAdminMockModule());
vi.mock('../src/services/message.service', () => ({
    processUserMessage: vi.fn(),
    getMessages: vi.fn(),
}));
vi.mock('../src/services/conversation.service', () => ({
    getOrCreateSelfConversationId: vi.fn(async () => 'self-c1'),
}));

function responseMock() {
    const res: any = {
        status: vi.fn(() => res),
        json: vi.fn(() => res),
    };
    return res;
}

describe('legacy message adapter', () => {
    it('forwardea idempotencia y procedencia al writer canonico', async () => {
        const messageService = await import('../src/services/message.service');
        vi.mocked(messageService.processUserMessage).mockResolvedValueOnce({
            message: { id: 'm1' },
        } as never);

        const { createMessage } = await import('../src/controllers/message.controller');
        const captureMeta = {
            capture: {
                source: 'quick_capture',
                capturedAt: '2026-10-18T12:00:00.000Z',
                initiatedBy: 'user_action',
            },
        };
        const req: any = {
            user: { id: 'u1' },
            body: {
                text: 'captura',
                reply_to_id: 'reply-1',
                meta: captureMeta,
                client_message_id: '77777777-7777-4777-8777-777777777777',
            },
        };
        const res = responseMock();

        await createMessage(req, res);

        expect(messageService.processUserMessage).toHaveBeenCalledWith(
            'u1',
            'captura',
            'self-c1',
            'reply-1',
            undefined,
            captureMeta,
            '77777777-7777-4777-8777-777777777777',
        );
        expect(res.status).toHaveBeenCalledWith(201);
    });
});

describe('message receipt authorization adapter', () => {
    it('rechaza a quien no posee un receipt para el mensaje', async () => {
        setSupabaseAdminMock(createSupabaseAdminMock({
            'rpc:mark_message_receipt': [{
                data: null,
                error: { code: '42501', message: 'No receipt belongs to this actor for the message' },
            }],
        }));
        const { updateMessageStatus } = await import('../src/controllers/message.controller');
        const req: any = { user: { id: 'intruder' }, params: { id: 'm1' }, body: { status: 'delivered' } };
        const res = responseMock();

        await updateMessageStatus(req, res);

        expect(res.status).toHaveBeenCalledWith(403);
    });

    it('el remitente no puede producir un receipt inexistente en nombre del receptor', async () => {
        setSupabaseAdminMock(createSupabaseAdminMock({
            'rpc:mark_message_receipt': [{
                data: null,
                error: { code: '42501', message: 'No receipt belongs to this actor for the message' },
            }],
        }));
        const { updateMessageStatus } = await import('../src/controllers/message.controller');
        const req: any = { user: { id: 'sender' }, params: { id: 'm1' }, body: { status: 'delivered' } };
        const res = responseMock();

        await updateMessageStatus(req, res);

        expect(res.status).toHaveBeenCalledWith(403);
    });

    it('delega el avance al receipt del actor y no escribe messages.status', async () => {
        const receipt = { message_id: 'm1', user_id: 'recipient', delivered_at: '2026-08-30T00:00:00Z' };
        const mock = createSupabaseAdminMock({
            'rpc:mark_message_receipt': [{ data: receipt, error: null }],
        });
        setSupabaseAdminMock(mock);
        const { updateMessageStatus } = await import('../src/controllers/message.controller');
        const req: any = { user: { id: 'recipient' }, params: { id: 'm1' }, body: { status: 'delivered' } };
        const res = responseMock();

        await updateMessageStatus(req, res);

        expect(mock.getUpdateCalls('messages')).toHaveLength(0);
        expect(mock.getRpcCalls()).toEqual([{
            name: 'mark_message_receipt',
            args: {
                p_message_id: 'm1',
                p_state: 'delivered',
                p_actor_user_id: 'recipient',
            },
        }]);
        expect(res.json).toHaveBeenCalledWith({ success: true, status: 'delivered', receipt });
    });
});
