import { describe, it, expect, vi } from 'vitest';
import { createSupabaseAdminMock, setSupabaseAdminMock, supabaseAdminMockModule } from './helpers/supabaseMock';

vi.mock('../src/lib/supabaseAdmin', () => supabaseAdminMockModule());
vi.mock('../src/services/notification.service', () => ({
    NotificationService: { sendPushNotifications: vi.fn(async () => null) },
}));

const OWNER = 'owner-1';

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
    it('status:"completed" no puede eludir el resultado obligatorio de resolución', async () => {
        const mock = createSupabaseAdminMock({
            commitments: [
                { data: { id: 'c1', conversation_id: null, owner_user_id: OWNER, assigned_to_user_id: null, counterparty_contact_id: null }, error: null },
                { data: { id: 'c1', status: 'accepted', owner_user_id: OWNER, assigned_to_user_id: null, counterparty_contact_id: null, due_at: null, proposed_due_at: null }, error: null },
            ],
        });
        setSupabaseAdminMock(mock);

        const { updateCommitment } = await import('../src/services/commitment.service');
        await expect(updateCommitment(OWNER, 'c1', { status: 'completed' }))
            .rejects.toThrow('resolution result');
        expect(mock.getUpdateCalls('commitments')).toHaveLength(0);
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
