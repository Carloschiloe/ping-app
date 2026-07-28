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

describe('updateMessageStatus authorization', () => {
    it('rechaza a un usuario que no participa en la conversación', async () => {
        setSupabaseAdminMock(createSupabaseAdminMock({
            messages: [{ data: { id: 'm1', status: 'sent', sender_id: 'sender', conversation_id: 'c1' }, error: null }],
            conversation_participants: [{ data: null, error: null }],
        }));
        const { updateMessageStatus } = await import('../src/controllers/message.controller');
        const req: any = { user: { id: 'intruder' }, params: { id: 'm1' }, body: { status: 'delivered' } };
        const res = responseMock();

        await updateMessageStatus(req, res);

        expect(res.status).toHaveBeenCalledWith(403);
        expect(res.json).toHaveBeenCalledWith({ error: 'You do not have access to this conversation' });
    });

    it('impide que el remitente confirme lectura o entrega por el destinatario', async () => {
        setSupabaseAdminMock(createSupabaseAdminMock({
            messages: [{ data: { id: 'm1', status: 'sent', sender_id: 'sender', conversation_id: 'c1' }, error: null }],
            conversation_participants: [{ data: { conversation_id: 'c1', role: 'member' }, error: null }],
        }));
        const { updateMessageStatus } = await import('../src/controllers/message.controller');
        const req: any = { user: { id: 'sender' }, params: { id: 'm1' }, body: { status: 'delivered' } };
        const res = responseMock();

        await updateMessageStatus(req, res);

        expect(res.status).toHaveBeenCalledWith(403);
    });

    it('permite a un destinatario participante avanzar el estado', async () => {
        const mock = createSupabaseAdminMock({
            messages: [
                { data: { id: 'm1', status: 'sent', sender_id: 'sender', conversation_id: 'c1' }, error: null },
                { data: null, error: null },
            ],
            conversation_participants: [{ data: { conversation_id: 'c1', role: 'member' }, error: null }],
        });
        setSupabaseAdminMock(mock);
        const { updateMessageStatus } = await import('../src/controllers/message.controller');
        const req: any = { user: { id: 'recipient' }, params: { id: 'm1' }, body: { status: 'delivered' } };
        const res = responseMock();

        await updateMessageStatus(req, res);

        expect(mock.getUpdateCalls('messages')).toEqual([{ status: 'delivered' }]);
        expect(res.json).toHaveBeenCalledWith({ success: true, status: 'delivered' });
    });
});
