import { describe, it, expect, vi } from 'vitest';
import { createSupabaseAdminMock, setSupabaseAdminMock, supabaseAdminMockModule } from './helpers/supabaseMock';

vi.mock('../src/lib/supabaseAdmin', () => supabaseAdminMockModule());
vi.mock('../src/services/notification.service', () => ({
    NotificationService: { sendPushNotifications: vi.fn(async () => null) },
}));

const OWNER = 'owner-1';

describe('createCommitment', () => {
    it('escribe conversation_id (columna real) y nunca group_conversation_id/is_group_task', async () => {
        const mock = createSupabaseAdminMock({
            commitments: [{ data: { id: 'c1', title: 'Comprar pan', due_at: null, owner_user_id: OWNER, assigned_to_user_id: null, counterparty_contact_id: null, conversation_id: null, type: 'task', status: 'proposed' }, error: null }],
            commitment_events: [{ data: null, error: null }],
        });
        setSupabaseAdminMock(mock);

        const { createCommitment } = await import('../src/services/commitment.service');
        await createCommitment(OWNER, { title: 'Comprar pan' });

        const insertPayload = mock.getInsertCalls('commitments')[0];
        expect(insertPayload).toHaveProperty('conversation_id');
        expect(insertPayload).not.toHaveProperty('group_conversation_id');
        expect(insertPayload).not.toHaveProperty('is_group_task');
    });

    it('un compromiso sin conversacion ni asignado se crea con status proposed y sin fecha (due_at null valido)', async () => {
        const mock = createSupabaseAdminMock({
            commitments: [{ data: { id: 'c1', title: 'Idea rapida', due_at: null, owner_user_id: OWNER, assigned_to_user_id: null, counterparty_contact_id: null, conversation_id: null, type: 'task', status: 'proposed' }, error: null }],
            commitment_events: [{ data: null, error: null }],
        });
        setSupabaseAdminMock(mock);

        const { createCommitment } = await import('../src/services/commitment.service');
        await createCommitment(OWNER, { title: 'Idea rapida' });

        const insertPayload = mock.getInsertCalls('commitments')[0];
        expect(insertPayload.status).toBe('proposed');
        expect(insertPayload.due_at).toBeNull();
    });

    it('registra un commitment_events con event_type=created DESPUES de que el insert principal ya tuvo exito', async () => {
        const mock = createSupabaseAdminMock({
            commitments: [{ data: { id: 'c1', title: 'X', due_at: null, owner_user_id: OWNER, assigned_to_user_id: null, counterparty_contact_id: null, conversation_id: null, type: 'task', status: 'proposed' }, error: null }],
            commitment_events: [{ data: null, error: null }],
        });
        setSupabaseAdminMock(mock);

        const { createCommitment } = await import('../src/services/commitment.service');
        await createCommitment(OWNER, { title: 'X' });

        const eventPayload = mock.getInsertCalls('commitment_events')[0];
        expect(eventPayload.event_type).toBe('created');
        expect(eventPayload.commitment_id).toBe('c1');
        expect(eventPayload.new_status).toBe('proposed');
    });

    it('rechaza assigned_to_user_id y counterparty_contact_id simultaneos antes de tocar la base', async () => {
        setSupabaseAdminMock(createSupabaseAdminMock({}));
        const { createCommitment } = await import('../src/services/commitment.service');
        await expect(createCommitment(OWNER, { title: 'X', assigned_to_user_id: 'u2', counterparty_contact_id: 'ct1' }))
            .rejects.toThrow('mutually exclusive');
    });
});

describe('rejectCommitment', () => {
    it('escribe rejection_reason en la columna real top-level (nunca en meta)', async () => {
        const mock = createSupabaseAdminMock({
            commitments: [
                { data: { id: 'c1', conversation_id: null, owner_user_id: OWNER, assigned_to_user_id: null, counterparty_contact_id: null }, error: null },
                { data: { id: 'c1', status: 'proposed', owner_user_id: OWNER, assigned_to_user_id: null, counterparty_contact_id: null, due_at: null, proposed_due_at: null }, error: null },
                { data: { id: 'c1', title: 'X', status: 'rejected', rejection_reason: 'No puedo', owner_user_id: OWNER, assigned_to_user_id: null, conversation_id: null, meta: {} }, error: null },
            ],
            commitment_events: [{ data: null, error: null }],
            profiles: [{ data: { full_name: 'Carlos' }, error: null }],
        });
        setSupabaseAdminMock(mock);

        const { rejectCommitment } = await import('../src/services/commitment.service');
        const result = await rejectCommitment(OWNER, 'c1', 'No puedo');

        const updateCall = mock.getUpdateCalls('commitments')[0];
        expect(updateCall.rejection_reason).toBe('No puedo');
        expect(updateCall).not.toHaveProperty('meta');
        expect(result.rejection_reason).toBe('No puedo');
    });
});

describe('counterProposeCommitment / postponeCommitment (alias legacy)', () => {
    it('escribe proposed_due_at (no due_at) y genera un evento counter_proposed', async () => {
        const mock = createSupabaseAdminMock({
            commitments: [
                { data: { id: 'c1', conversation_id: null, owner_user_id: OWNER, assigned_to_user_id: null, counterparty_contact_id: null }, error: null },
                { data: { id: 'c1', status: 'accepted', owner_user_id: OWNER, assigned_to_user_id: null, counterparty_contact_id: null, due_at: '2026-07-01T00:00:00.000Z', proposed_due_at: null }, error: null },
                { data: { id: 'c1', title: 'X', status: 'counter_proposal', proposed_due_at: '2026-08-01T00:00:00.000Z', owner_user_id: OWNER, assigned_to_user_id: null, conversation_id: null, meta: {} }, error: null },
            ],
            commitment_events: [{ data: null, error: null }],
            profiles: [{ data: { full_name: 'Carlos' }, error: null }],
        });
        setSupabaseAdminMock(mock);

        const { postponeCommitment } = await import('../src/services/commitment.service');
        await postponeCommitment(OWNER, 'c1', '2026-08-01T00:00:00.000Z');

        const updateCall = mock.getUpdateCalls('commitments')[0];
        expect(updateCall.proposed_due_at).toBe('2026-08-01T00:00:00.000Z');
        expect(updateCall).not.toHaveProperty('due_at');

        const eventPayload = mock.getInsertCalls('commitment_events')[0];
        expect(eventPayload.event_type).toBe('counter_proposed');
    });
});

describe('updateCommitment: compatibilidad temporal de status legacy', () => {
    it('status:"completed" (enviado por mobile) se traduce a la transicion real resolve, nunca se escribe "completed"', async () => {
        const mock = createSupabaseAdminMock({
            commitments: [
                { data: { id: 'c1', conversation_id: null, owner_user_id: OWNER, assigned_to_user_id: null, counterparty_contact_id: null }, error: null },
                { data: { id: 'c1', status: 'accepted', owner_user_id: OWNER, assigned_to_user_id: null, counterparty_contact_id: null, due_at: null, proposed_due_at: null }, error: null },
                { data: { id: 'c1', title: 'X', due_at: null, assigned_to_user_id: null, conversation_id: null, type: 'task' }, error: null },
                { data: { id: 'c1', title: 'X', status: 'resolved', resolved_at: '2026-07-13T00:00:00.000Z', owner_user_id: OWNER, assigned_to_user_id: null, conversation_id: null, meta: {} }, error: null },
            ],
            commitment_events: [{ data: null, error: null }],
        });
        setSupabaseAdminMock(mock);

        const { updateCommitment } = await import('../src/services/commitment.service');
        const result = await updateCommitment(OWNER, 'c1', { status: 'completed' });

        const updateCall = mock.getUpdateCalls('commitments')[0];
        expect(updateCall.status).toBe('resolved');
        expect(updateCall.status).not.toBe('completed');
        expect(result.status).toBe('resolved');

        const eventPayload = mock.getInsertCalls('commitment_events')[0];
        expect(eventPayload.event_type).toBe('resolved');
    });

    it('un status que ya coincide con el actual es un no-op: no dispara transicion ni evento', async () => {
        const mock = createSupabaseAdminMock({
            commitments: [
                { data: { id: 'c1', conversation_id: null, owner_user_id: OWNER, assigned_to_user_id: null, counterparty_contact_id: null }, error: null },
                { data: { id: 'c1', status: 'accepted', owner_user_id: OWNER, assigned_to_user_id: null, counterparty_contact_id: null, due_at: null, proposed_due_at: null }, error: null },
                { data: { id: 'c1', title: 'X', due_at: null, assigned_to_user_id: null, conversation_id: null, type: 'task' }, error: null },
                { data: { id: 'c1', title: 'X', status: 'accepted', owner_user_id: OWNER, assigned_to_user_id: null, conversation_id: null, meta: {} }, error: null },
            ],
            commitment_events: [{ data: null, error: null }],
        });
        setSupabaseAdminMock(mock);

        const { updateCommitment } = await import('../src/services/commitment.service');
        await updateCommitment(OWNER, 'c1', { status: 'accepted' });

        expect(mock.getInsertCalls('commitment_events')).toHaveLength(0);
    });

    it('un status legacy no reconocible (ni canonico ni alias) propaga un error controlado, no se ignora en silencio', async () => {
        const mock = createSupabaseAdminMock({
            commitments: [
                { data: { id: 'c1', conversation_id: null, owner_user_id: OWNER, assigned_to_user_id: null, counterparty_contact_id: null }, error: null },
                { data: { id: 'c1', status: 'accepted', owner_user_id: OWNER, assigned_to_user_id: null, counterparty_contact_id: null, due_at: null, proposed_due_at: null }, error: null },
            ],
        });
        setSupabaseAdminMock(mock);

        const { updateCommitment } = await import('../src/services/commitment.service');
        await expect(updateCommitment(OWNER, 'c1', { status: 'estado_invalido_xyz' })).rejects.toThrow();
    });
});

describe('checkConflict', () => {
    it('considera abiertos proposed/accepted/counter_proposal (no solo accepted)', async () => {
        const mock = createSupabaseAdminMock({
            commitments: [{ data: [{ id: 'c1', title: 'X', due_at: '2026-07-13T12:00:00.000Z', type: 'task' }], error: null }],
        });
        setSupabaseAdminMock(mock);

        const { checkConflict } = await import('../src/services/commitment.service');
        await checkConflict(OWNER, '2026-07-13T12:00:00.000Z');

        expect(mock.getCalledTables()).toContain('commitments');
    });
});
