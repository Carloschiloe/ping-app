import { describe, it, expect, vi } from 'vitest';
import { createSupabaseAdminMock, setSupabaseAdminMock, supabaseAdminMockModule } from './helpers/supabaseMock';

vi.mock('../src/lib/supabaseAdmin', () => supabaseAdminMockModule());

describe('canonical conversation creation', () => {
    it('self-chat delega en la transaccion canonica con un unico usuario real', async () => {
        const mock = createSupabaseAdminMock({
            'rpc:create_conversation_with_participants': [{ data: 'c-self', error: null }],
        });
        setSupabaseAdminMock(mock);

        const { getOrCreateSelfConversationId } = await import('../src/services/conversation.service');
        await expect(getOrCreateSelfConversationId('u1')).resolves.toBe('c-self');
        expect(mock.getRpcCalls()).toEqual([{
            name: 'create_conversation_with_participants',
            args: expect.objectContaining({
                p_creator_user_id: 'u1',
                p_conversation_type: 'direct',
                p_participant_ids: ['u1'],
                p_reuse_existing: true,
            }),
        }]);
    });

    it('direct 1:1 envia ambos participantes en una sola operacion', async () => {
        const mock = createSupabaseAdminMock({
            'rpc:create_conversation_with_participants': [{ data: 'c-direct', error: null }],
        });
        setSupabaseAdminMock(mock);

        const { getOrCreateDirectConversationId } = await import('../src/services/conversation.service');
        await expect(getOrCreateDirectConversationId('u1', 'u2')).resolves.toBe('c-direct');
        expect(mock.getRpcCalls()[0].args).toEqual(expect.objectContaining({
            p_participant_ids: ['u1', 'u2'],
            p_reuse_existing: true,
        }));
        expect(mock.getInsertCalls('conversations')).toHaveLength(0);
        expect(mock.getInsertCalls('conversation_participants')).toHaveLength(0);
    });
});
