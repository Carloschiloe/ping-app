import { describe, expect, it, vi } from 'vitest';
import { createSupabaseAdminMock, setSupabaseAdminMock, supabaseAdminMockModule } from './helpers/supabaseMock';

vi.mock('../src/lib/supabaseAdmin', () => supabaseAdminMockModule());
vi.mock('../src/services/message.service', () => ({
    processUserMessage: vi.fn(),
    getMessages: vi.fn(),
}));

function responseMock() {
    const res: any = {
        status: vi.fn(() => res),
        json: vi.fn(() => res),
    };
    return res;
}

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
