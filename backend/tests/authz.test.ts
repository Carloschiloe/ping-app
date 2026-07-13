import { describe, it, expect, vi } from 'vitest';
import { createSupabaseAdminMock, setSupabaseAdminMock, supabaseAdminMockModule } from './helpers/supabaseMock';

vi.mock('../src/lib/supabaseAdmin', () => supabaseAdminMockModule());

describe('assertConversationParticipant', () => {
    it('resuelve sin lanzar cuando el usuario SI participa en la conversacion', async () => {
        setSupabaseAdminMock(createSupabaseAdminMock({
            conversation_participants: [{ data: { conversation_id: 'c1', role: 'member' }, error: null }],
        }));
        const { assertConversationParticipant } = await import('../src/utils/authz');
        await expect(assertConversationParticipant('u1', 'c1')).resolves.toEqual({ conversation_id: 'c1', role: 'member' });
    });

    it('un usuario no participante es rechazado (lanza AppError)', async () => {
        setSupabaseAdminMock(createSupabaseAdminMock({
            conversation_participants: [{ data: null, error: null }],
        }));
        const { assertConversationParticipant } = await import('../src/utils/authz');
        await expect(assertConversationParticipant('u_ajeno', 'c1')).rejects.toThrow('You do not have access to this conversation');
    });
});

describe('isConversationAdmin / assertConversationAdmin', () => {
    it('admin se determina mediante role = "admin"', async () => {
        setSupabaseAdminMock(createSupabaseAdminMock({
            conversation_participants: [{ data: { role: 'admin' }, error: null }],
        }));
        const { isConversationAdmin } = await import('../src/utils/authz');
        await expect(isConversationAdmin('u1', 'c1')).resolves.toBe(true);
    });

    it('member no se considera admin', async () => {
        setSupabaseAdminMock(createSupabaseAdminMock({
            conversation_participants: [{ data: { role: 'member' }, error: null }],
        }));
        const { isConversationAdmin } = await import('../src/utils/authz');
        await expect(isConversationAdmin('u2', 'c1')).resolves.toBe(false);
    });

    it('assertConversationAdmin rechaza a un member con AppError 403', async () => {
        setSupabaseAdminMock(createSupabaseAdminMock({
            conversation_participants: [{ data: { role: 'member' }, error: null }],
        }));
        const { assertConversationAdmin } = await import('../src/utils/authz');
        await expect(assertConversationAdmin('u2', 'c1')).rejects.toThrow('Only conversation admins can perform this action');
    });

    it('nunca consulta conversations.group_metadata: la autorizacion vive solo en conversation_participants.role', async () => {
        const mock = createSupabaseAdminMock({
            conversation_participants: [{ data: { role: 'admin' }, error: null }],
        });
        setSupabaseAdminMock(mock);
        const { isConversationAdmin } = await import('../src/utils/authz');
        await isConversationAdmin('u1', 'c1');
        expect(mock.getCalledTables()).toEqual(['conversation_participants']);
        expect(mock.getCalledTables()).not.toContain('conversations');
    });
});
