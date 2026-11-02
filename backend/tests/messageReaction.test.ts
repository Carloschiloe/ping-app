import { describe, expect, it, vi } from 'vitest';
import { createSupabaseAdminMock, setSupabaseAdminMock, supabaseAdminMockModule } from './helpers/supabaseMock';

vi.mock('../src/lib/supabaseAdmin', () => supabaseAdminMockModule());

const USER = '11111111-1111-4111-8111-111111111111';
const CONV = '22222222-2222-4222-8222-222222222222';
const MSG = '33333333-3333-4333-8333-333333333333';
const member = { data: { conversation_id: CONV, role: 'member', conversations: { deleted_at: null } }, error: null };

describe('toggleMessageReaction', () => {
    it('adds the reaction when the person has not given it yet', async () => {
        const mock = createSupabaseAdminMock({
            conversation_participants: [member],
            messages: [{ data: { id: MSG }, error: null }],
            message_reactions: [{ data: null, error: null }, { data: null, error: null }],
        });
        setSupabaseAdminMock(mock);
        const { toggleMessageReaction } = await import('../src/services/messageReaction.service');

        await expect(toggleMessageReaction(USER, CONV, MSG, '👍')).resolves.toEqual({ reacted: true });
        expect(mock.getInsertCalls('message_reactions')).toEqual([{ message_id: MSG, user_id: USER, reaction: '👍' }]);
    });

    it('takes it back when the same reaction is tapped again', async () => {
        const mock = createSupabaseAdminMock({
            conversation_participants: [member],
            messages: [{ data: { id: MSG }, error: null }],
            message_reactions: [{ data: { id: 'r1' }, error: null }, { data: null, error: null }],
        });
        setSupabaseAdminMock(mock);
        const { toggleMessageReaction } = await import('../src/services/messageReaction.service');

        await expect(toggleMessageReaction(USER, CONV, MSG, '👍')).resolves.toEqual({ reacted: false });
        expect(mock.getInsertCalls('message_reactions')).toHaveLength(0);
    });

    it('refuses a message that is not in that conversation', async () => {
        const mock = createSupabaseAdminMock({
            conversation_participants: [member],
            messages: [{ data: null, error: null }],
        });
        setSupabaseAdminMock(mock);
        const { toggleMessageReaction } = await import('../src/services/messageReaction.service');

        await expect(toggleMessageReaction(USER, CONV, MSG, '👍')).rejects.toThrow('Message not found');
    });
});
