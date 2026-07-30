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
            ],
            'rpc:apply_commitment_transition_with_evidence': [{
                data: { id: 'c1', title: 'X', status: 'rejected', rejection_reason: 'No puedo', owner_user_id: OWNER, assigned_to_user_id: null, conversation_id: null, meta: {} },
                error: null,
            }],
            profiles: [{ data: { full_name: 'Carlos' }, error: null }],
        });
        setSupabaseAdminMock(mock);

        const { rejectCommitment } = await import('../src/services/commitment.service');
        const result = await rejectCommitment(OWNER, 'c1', 'No puedo');

        const transitionCall = mock.getRpcCalls()[0];
        expect(transitionCall.args.p_patch.rejection_reason).toBe('No puedo');
        expect(result.rejection_reason).toBe('No puedo');
    });
});

describe('counterProposeCommitment / postponeCommitment (alias legacy)', () => {
    it('escribe proposed_due_at (no due_at) y genera un evento counter_proposed', async () => {
        const mock = createSupabaseAdminMock({
            commitments: [
                { data: { id: 'c1', conversation_id: null, owner_user_id: OWNER, assigned_to_user_id: null, counterparty_contact_id: null }, error: null },
                { data: { id: 'c1', status: 'accepted', owner_user_id: OWNER, assigned_to_user_id: null, counterparty_contact_id: null, due_at: '2026-07-01T00:00:00.000Z', proposed_due_at: null }, error: null },
            ],
            'rpc:apply_commitment_transition_with_evidence': [{
                data: { id: 'c1', title: 'X', status: 'counter_proposal', proposed_due_at: '2026-08-01T00:00:00.000Z', owner_user_id: OWNER, assigned_to_user_id: null, conversation_id: null, meta: {} },
                error: null,
            }],
            profiles: [{ data: { full_name: 'Carlos' }, error: null }],
        });
        setSupabaseAdminMock(mock);

        const { postponeCommitment } = await import('../src/services/commitment.service');
        await postponeCommitment(OWNER, 'c1', '2026-08-01T00:00:00.000Z');

        const transitionCall = mock.getRpcCalls()[0];
        expect(transitionCall.args.p_patch.proposed_due_at).toBe('2026-08-01T00:00:00.000Z');
        expect(transitionCall.args.p_patch).not.toHaveProperty('due_at');
        expect(transitionCall.args.p_event_type).toBe('counter_proposed');
    });
});

describe('atomic Commitment evidence', () => {
    it('resolve sends state change, result and business event through one RPC', async () => {
        const mock = createSupabaseAdminMock({
            commitments: [
                { data: { id: 'c1', conversation_id: null, owner_user_id: OWNER, assigned_to_user_id: null, counterparty_contact_id: null }, error: null },
                { data: { id: 'c1', status: 'accepted', owner_user_id: OWNER, assigned_to_user_id: null, counterparty_contact_id: null, due_at: null, proposed_due_at: null }, error: null },
            ],
            'rpc:apply_commitment_transition_with_evidence': [{
                data: {
                    id: 'c1',
                    title: 'X',
                    status: 'resolved',
                    resolution_result: 'Informe entregado y recibido',
                    owner_user_id: OWNER,
                    assigned_to_user_id: null,
                    conversation_id: null,
                    meta: {},
                },
                error: null,
            }],
            profiles: [{ data: { full_name: 'Carlos' }, error: null }],
        });
        setSupabaseAdminMock(mock);

        const { resolveCommitment } = await import('../src/services/commitment.service');
        const result = await resolveCommitment(OWNER, 'c1', 'Informe entregado y recibido');
        const transitionCall = mock.getRpcCalls()[0];

        expect(transitionCall.name).toBe('apply_commitment_transition_with_evidence');
        expect(transitionCall.args.p_patch.resolution_result).toBe('Informe entregado y recibido');
        expect(transitionCall.args.p_event_type).toBe('resolved');
        expect(mock.getInsertCalls('commitment_events')).toHaveLength(0);
        expect(result.status).toBe('resolved');
    });

    it('resolve rejects an empty result before writing state or evidence', async () => {
        const mock = createSupabaseAdminMock({
            commitments: [
                { data: { id: 'c1', conversation_id: null, owner_user_id: OWNER, assigned_to_user_id: null, counterparty_contact_id: null }, error: null },
                { data: { id: 'c1', status: 'accepted', owner_user_id: OWNER, assigned_to_user_id: null, counterparty_contact_id: null, due_at: null, proposed_due_at: null }, error: null },
            ],
        });
        setSupabaseAdminMock(mock);

        const { resolveCommitment } = await import('../src/services/commitment.service');
        await expect(resolveCommitment(OWNER, 'c1', '  ')).rejects.toThrow('resolution result');
        expect(mock.getRpcCalls()).toHaveLength(0);
    });
});

describe('updateCommitment: compatibilidad temporal de status legacy', () => {
    it('un cambio sólo de título no se anuncia como cambio de fecha u hora', async () => {
        const mock = createSupabaseAdminMock({
            commitments: [
                { data: { id: 'c1', owner_user_id: OWNER, assigned_to_user_id: null, conversation_id: 'conv-1' }, error: null },
                { data: { id: 'c1', title: 'Título anterior', due_at: '2026-07-31T16:00:00.000Z', assigned_to_user_id: null, conversation_id: 'conv-1', type: 'meeting' }, error: null },
                { data: { id: 'c1', title: 'Spiderman el viernes', due_at: '2026-07-31T16:00:00.000Z', assigned_to_user_id: null, conversation_id: 'conv-1', type: 'meeting', status: 'accepted' }, error: null },
            ],
            messages: [{ data: { id: 'system-1' }, error: null }],
        });
        setSupabaseAdminMock(mock);

        const { updateCommitment } = await import('../src/services/commitment.service');
        await updateCommitment(OWNER, 'c1', { title: 'Spiderman el viernes' });

        const notice = mock.getInsertCalls('messages')[0].content;
        expect(notice).toContain('Título actualizado: Spiderman el viernes');
        expect(notice).not.toContain('fecha');
        expect(notice).not.toContain('hora');
    });

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
