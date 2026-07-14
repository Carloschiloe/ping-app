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

describe('assertCommitmentConversationParticipant', () => {
    it('el owner del compromiso tiene acceso sin necesidad de consultar participantes', async () => {
        setSupabaseAdminMock(createSupabaseAdminMock({
            commitments: [{ data: { id: 'c1', conversation_id: null, owner_user_id: 'u1', assigned_to_user_id: null, counterparty_contact_id: null }, error: null }],
        }));
        const { assertCommitmentConversationParticipant } = await import('../src/utils/authz');
        await expect(assertCommitmentConversationParticipant('u1', 'c1')).resolves.toMatchObject({ owner_user_id: 'u1' });
    });

    it('el asignado tiene acceso aunque no comparta conversacion', async () => {
        setSupabaseAdminMock(createSupabaseAdminMock({
            commitments: [{ data: { id: 'c1', conversation_id: null, owner_user_id: 'owner', assigned_to_user_id: 'u2', counterparty_contact_id: null }, error: null }],
        }));
        const { assertCommitmentConversationParticipant } = await import('../src/utils/authz');
        await expect(assertCommitmentConversationParticipant('u2', 'c1')).resolves.toMatchObject({ assigned_to_user_id: 'u2' });
    });

    it('un compromiso de grupo (sin owner/assignee match) usa conversation_id (columna real V2, no group_conversation_id) para verificar participacion', async () => {
        const mock = createSupabaseAdminMock({
            commitments: [{ data: { id: 'c1', conversation_id: 'conv-1', owner_user_id: 'owner', assigned_to_user_id: null, counterparty_contact_id: null }, error: null }],
            conversation_participants: [{ data: { conversation_id: 'conv-1', role: 'member' }, error: null }],
        });
        setSupabaseAdminMock(mock);
        const { assertCommitmentConversationParticipant } = await import('../src/utils/authz');
        await expect(assertCommitmentConversationParticipant('u3', 'c1')).resolves.toBeTruthy();
    });

    it('un tercero sin relacion ni participacion en la conversacion es rechazado', async () => {
        setSupabaseAdminMock(createSupabaseAdminMock({
            commitments: [{ data: { id: 'c1', conversation_id: 'conv-1', owner_user_id: 'owner', assigned_to_user_id: null, counterparty_contact_id: null }, error: null }],
            conversation_participants: [{ data: null, error: null }],
        }));
        const { assertCommitmentConversationParticipant } = await import('../src/utils/authz');
        await expect(assertCommitmentConversationParticipant('u_ajeno', 'c1')).rejects.toThrow('You do not have access to this conversation');
    });

    it('un compromiso inexistente lanza 404', async () => {
        setSupabaseAdminMock(createSupabaseAdminMock({ commitments: [{ data: null, error: null }] }));
        const { assertCommitmentConversationParticipant } = await import('../src/utils/authz');
        await expect(assertCommitmentConversationParticipant('u1', 'c-inexistente')).rejects.toThrow('Commitment not found');
    });
});

describe('assertOwnContact', () => {
    it('el owner del contacto puede usarlo', async () => {
        setSupabaseAdminMock(createSupabaseAdminMock({
            contacts: [{ data: { id: 'ct1', owner_user_id: 'u1', display_name: 'Proveedor X' }, error: null }],
        }));
        const { assertOwnContact } = await import('../src/utils/authz');
        await expect(assertOwnContact('u1', 'ct1')).resolves.toMatchObject({ id: 'ct1' });
    });

    it('un contacto ajeno (owner_user_id distinto) es rechazado con 403, nunca expuesto', async () => {
        setSupabaseAdminMock(createSupabaseAdminMock({
            contacts: [{ data: { id: 'ct1', owner_user_id: 'otro_usuario', display_name: 'Proveedor X' }, error: null }],
        }));
        const { assertOwnContact } = await import('../src/utils/authz');
        await expect(assertOwnContact('u1', 'ct1')).rejects.toThrow('You do not have access to this contact');
    });

    it('un contacto inexistente lanza 404', async () => {
        setSupabaseAdminMock(createSupabaseAdminMock({ contacts: [{ data: null, error: null }] }));
        const { assertOwnContact } = await import('../src/utils/authz');
        await expect(assertOwnContact('u1', 'ct-inexistente')).rejects.toThrow('Contact not found');
    });
});
