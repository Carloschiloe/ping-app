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

    it('cancel sends the reason and confirmed cancellation through the atomic RPC', async () => {
        const mock = createSupabaseAdminMock({
            commitments: [
                { data: { id: 'c1', conversation_id: null, owner_user_id: OWNER, assigned_to_user_id: null, counterparty_contact_id: null }, error: null },
                { data: { id: 'c1', status: 'accepted', owner_user_id: OWNER, assigned_to_user_id: null, counterparty_contact_id: null, due_at: null, proposed_due_at: null }, error: null },
            ],
            'rpc:apply_commitment_transition_with_evidence': [{
                data: {
                    id: 'c1',
                    title: 'Reunión de prueba',
                    type: 'meeting',
                    status: 'cancelled',
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

        const { cancelCommitment } = await import('../src/services/commitment.service');
        const result = await cancelCommitment(OWNER, 'c1', 'Se resolvió antes');
        const transitionCall = mock.getRpcCalls()[0];

        expect(transitionCall.name).toBe('apply_commitment_transition_with_evidence');
        expect(transitionCall.args.p_patch.status).toBe('cancelled');
        expect(transitionCall.args.p_event_type).toBe('cancelled');
        expect(transitionCall.args.p_event_payload).toEqual({ reason: 'Se resolvió antes' });
        expect(result.status).toBe('cancelled');
    });
});

describe('canonical application update boundary', () => {
    it('un cambio sólo de título no se anuncia como cambio de fecha u hora', async () => {
        const mock = createSupabaseAdminMock({
            commitments: [
                { data: { id: 'c1', owner_user_id: OWNER, assigned_to_user_id: null, conversation_id: 'conv-1' }, error: null },
                { data: { id: 'c1', title: 'Título anterior', due_at: '2026-07-31T16:00:00.000Z', assigned_to_user_id: null, conversation_id: 'conv-1', type: 'meeting' }, error: null },
            ],
            'rpc:edit_commitment_with_evidence': [{
                data: { id: 'c1', title: 'Spiderman el viernes', due_at: '2026-07-31T16:00:00.000Z', assigned_to_user_id: null, conversation_id: 'conv-1', type: 'meeting', status: 'accepted' },
                error: null,
            }],
            messages: [{ data: { id: 'system-1' }, error: null }],
        });
        setSupabaseAdminMock(mock);

        const { updateCommitment } = await import('../src/services/commitmentApplication.service');
        await updateCommitment(OWNER, 'c1', { title: 'Spiderman el viernes' });

        expect(mock.getRpcCalls()[0].name).toBe('edit_commitment_with_evidence');
        expect(mock.getUpdateCalls('commitments')).toHaveLength(0);
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

        const { updateCommitment } = await import('../src/services/commitmentApplication.service');
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

        const { updateCommitment } = await import('../src/services/commitmentApplication.service');
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

        const { updateCommitment } = await import('../src/services/commitmentApplication.service');
        await expect(updateCommitment(OWNER, 'c1', { status: 'estado_invalido_xyz' })).rejects.toThrow();
    });

    it('traduce status legacy aceptable a una transicion explicita y atomica', async () => {
        const proposed = {
            id: 'c1',
            status: 'proposed',
            owner_user_id: OWNER,
            assigned_to_user_id: OWNER,
            counterparty_contact_id: null,
            conversation_id: null,
            due_at: null,
            proposed_due_at: null,
        };
        const mock = createSupabaseAdminMock({
            commitments: [
                { data: proposed, error: null },
                { data: proposed, error: null },
                { data: proposed, error: null },
                { data: proposed, error: null },
            ],
            'rpc:apply_commitment_transition_with_evidence': [{
                data: { ...proposed, title: 'X', status: 'accepted', meta: {} },
                error: null,
            }],
            profiles: [{ data: { full_name: 'Carlos' }, error: null }],
        });
        setSupabaseAdminMock(mock);

        const { updateCommitment } = await import('../src/services/commitmentApplication.service');
        const result = await updateCommitment(OWNER, 'c1', { status: 'accepted' });

        expect(result.status).toBe('accepted');
        expect(mock.getRpcCalls()[0]).toEqual(expect.objectContaining({
            name: 'apply_commitment_transition_with_evidence',
            args: expect.objectContaining({ p_event_type: 'accepted' }),
        }));
        expect(mock.getUpdateCalls('commitments')).toHaveLength(0);
    });

    it('rechaza mezclar lifecycle y edicion en el PATCH generico', async () => {
        const mock = createSupabaseAdminMock({});
        setSupabaseAdminMock(mock);

        const { updateCommitment } = await import('../src/services/commitmentApplication.service');
        await expect(updateCommitment(OWNER, 'c1', {
            title: 'No debe aplicarse',
            status: 'accepted',
        })).rejects.toThrow('cannot be combined');

        expect(mock.getRpcCalls()).toHaveLength(0);
        expect(mock.getCalledTables()).toHaveLength(0);
    });
});

describe('archive compatibility adapter', () => {
    it('delega delete a archive con evento/auditoria atomicos', async () => {
        const mock = createSupabaseAdminMock({
            commitments: [{
                data: { id: 'c1', owner_user_id: OWNER, conversation_id: null },
                error: null,
            }],
            'rpc:archive_commitment_with_evidence': [{
                data: { id: 'c1', owner_user_id: OWNER, archived_at: '2026-08-28T20:00:00.000Z' },
                error: null,
            }],
        });
        setSupabaseAdminMock(mock);

        const { deleteCommitment } = await import('../src/services/commitmentApplication.service');
        const result = await deleteCommitment(OWNER, 'c1');

        expect(result.archived_at).toBeTruthy();
        expect(mock.getRpcCalls()).toEqual([{
            name: 'archive_commitment_with_evidence',
            args: { p_commitment_id: 'c1', p_actor_user_id: OWNER },
        }]);
        expect(mock.getUpdateCalls('commitments')).toHaveLength(0);
    });

    // PING — TERMINAL LIFECYCLE ACTIONS AUDIT: archive is orthogonal to
    // lifecycle status -- archive_commitment_with_evidence
    // (20260828160000_commitment_core_canonical_writes.sql) only ever sets
    // archived_at/updated_at in its own UPDATE statement, never `status`
    // (confirmed by direct SQL read). This proves the JS-side call never
    // passes a status field to the RPC either, and that archiving a
    // commitment in ANY lifecycle status (here, already 'resolved') never
    // rewrites that status -- archived_at controls visibility/retention
    // only, never lifecycle truth.
    it('archivar un commitment YA resuelto conserva su status "resolved" intacto -- archived_at nunca sustituye ni reescribe el status canónico', async () => {
        const mock = createSupabaseAdminMock({
            commitments: [{
                data: { id: 'c1', owner_user_id: OWNER, conversation_id: null },
                error: null,
            }],
            'rpc:archive_commitment_with_evidence': [{
                data: { id: 'c1', owner_user_id: OWNER, status: 'resolved', archived_at: '2026-08-28T20:00:00.000Z' },
                error: null,
            }],
        });
        setSupabaseAdminMock(mock);

        const { deleteCommitment } = await import('../src/services/commitmentApplication.service');
        const result = await deleteCommitment(OWNER, 'c1');

        expect(result.status).toBe('resolved'); // nunca 'cancelled' ni ningún otro valor -- archive nunca es un sustituto de lifecycle
        expect(result.archived_at).toBeTruthy();
        // El RPC real (archive_commitment_with_evidence) sólo acepta
        // (p_commitment_id, p_actor_user_id) -- nunca un status editable.
        expect(mock.getRpcCalls()[0].args).toEqual({ p_commitment_id: 'c1', p_actor_user_id: OWNER });
    });
});

// PING — ARCHIVE LIFECYCLE COMPLETION: audit found archiveCommitment had no
// symmetric restore operation anywhere (no RPC, no service method, no
// endpoint, no mobile hook) -- an archived commitment could never become
// visible again. restoreCommitment mirrors archiveCommitment exactly: same
// owner-only authorization (assertCommitmentOwner), same
// supabaseAdmin.rpc call shape, only the RPC name and the direction of
// archived_at differ.
describe('restoreCommitment — contraparte simétrica de archiveCommitment', () => {
    it('llama a restore_commitment_with_evidence con (p_commitment_id, p_actor_user_id), nunca un status editable', async () => {
        const mock = createSupabaseAdminMock({
            commitments: [{
                data: { id: 'c1', owner_user_id: OWNER, conversation_id: null },
                error: null,
            }],
            'rpc:restore_commitment_with_evidence': [{
                data: { id: 'c1', owner_user_id: OWNER, status: 'cancelled', archived_at: null },
                error: null,
            }],
        });
        setSupabaseAdminMock(mock);

        const { restoreCommitment } = await import('../src/services/commitment.service');
        const result = await restoreCommitment(OWNER, 'c1');

        expect(result.archived_at).toBeNull();
        expect(mock.getRpcCalls()).toEqual([{
            name: 'restore_commitment_with_evidence',
            args: { p_commitment_id: 'c1', p_actor_user_id: OWNER },
        }]);
    });

    // Repite exactamente la misma prueba de orthogonalidad ya hecha para
    // archive (arriba): restaurar un commitment archivado en CUALQUIER
    // status (aquí, 'cancelled') nunca reescribe ese status -- restore sólo
    // limpia archived_at, nunca es un sustituto de reopen/cancel/resolve.
    it('restaurar un commitment archivado conserva su status "cancelled" intacto -- restore nunca reabre, cancela ni resuelve', async () => {
        const mock = createSupabaseAdminMock({
            commitments: [{
                data: { id: 'c1', owner_user_id: OWNER, conversation_id: null },
                error: null,
            }],
            'rpc:restore_commitment_with_evidence': [{
                data: { id: 'c1', owner_user_id: OWNER, status: 'cancelled', archived_at: null, due_at: '2026-06-01T00:00:00.000Z', resolved_at: null },
                error: null,
            }],
        });
        setSupabaseAdminMock(mock);

        const { restoreCommitment } = await import('../src/services/commitment.service');
        const result = await restoreCommitment(OWNER, 'c1');

        expect(result.status).toBe('cancelled'); // nunca 'accepted'/'proposed' -- restore nunca reabre
        expect(result.archived_at).toBeNull();
        expect(result.due_at).toBe('2026-06-01T00:00:00.000Z'); // restore nunca toca due_at
        expect(result.resolved_at).toBeNull(); // restore nunca toca resolved_at
    });

    // assertCommitmentOwner (mismo guard que archiveCommitment) se ejecuta
    // ANTES del RPC -- un actor no-owner nunca llega a invocar
    // restore_commitment_with_evidence en absoluto, la misma defensa en
    // profundidad que ya existe para archive.
    it('un actor que no es el owner nunca llega a invocar el RPC -- assertCommitmentOwner corta antes', async () => {
        const mock = createSupabaseAdminMock({
            commitments: [{
                data: { id: 'c1', owner_user_id: OWNER, conversation_id: null },
                error: null,
            }],
        });
        setSupabaseAdminMock(mock);

        const { restoreCommitment } = await import('../src/services/commitment.service');
        await expect(restoreCommitment('someone-else', 'c1')).rejects.toThrow();
        expect(mock.getRpcCalls()).toHaveLength(0);
    });

    // PING — RESTORE PHYSICAL FAILURE: root cause was NOT this code --
    // restoreCommitment/the RPC call shape were always correct. The bug was
    // that 20260913010000_commitment_restore_with_evidence.sql was never
    // applied to the staging database (`supabase migration list --linked`
    // showed local=20260913010000, remote="" -- confirmed directly against
    // staging: rpc('restore_commitment_with_evidence', ...) returned
    // PGRST202 "Could not find the function ... in the schema cache").
    // Fixed by running `supabase db push --linked` against the already-
    // linked staging project (oonijgmddgyymhrlnvuu) -- re-verified live: the
    // same dummy-id probe now returns P0002 "Commitment not found" (proving
    // the function exists), and the actual physically-archived record
    // (id 9e39edeb-d7b0-467d-9073-f0848251c7d3, "entrenar", cancelled) was
    // restored successfully with matching Event ('restored')/Audit
    // ('commitment_restored') evidence rows, due_at/resolved_at unchanged,
    // and a same-record double-restore correctly rejected with P0001. This
    // test certifies the SAME propagation contract restoreCommitment must
    // preserve if the RPC ever returns a not-found error again (e.g. from
    // Postgres directly, PGRST202-equivalent, or any other undefined-
    // function shape) -- the service must never swallow it, and the
    // controller's existing generic-500-for-unmapped-code fallback
    // ("Unable to process commitment request", the exact string physically
    // observed on iPhone) is the correct, already-existing behavior for a
    // genuinely unexpected error code, not a bug to special-case here.
    it('si el RPC devuelve un error de "función no encontrada" (mismo shape que PGRST202 physically observado), restoreCommitment nunca lo traga -- se propaga tal cual al controller', async () => {
        const mock = createSupabaseAdminMock({
            commitments: [{
                data: { id: 'c1', owner_user_id: OWNER, conversation_id: null },
                error: null,
            }],
            'rpc:restore_commitment_with_evidence': [{
                data: null,
                error: { code: 'PGRST202', message: 'Could not find the function public.restore_commitment_with_evidence(p_actor_user_id, p_commitment_id) in the schema cache' },
            }],
        });
        setSupabaseAdminMock(mock);

        const { restoreCommitment } = await import('../src/services/commitment.service');
        await expect(restoreCommitment(OWNER, 'c1')).rejects.toMatchObject({ code: 'PGRST202' });
    });

    // Mismo comportamiento ya certificado para archive: un segundo restore
    // sobre un commitment YA restaurado (archived_at ya null) debe fallar
    // con el guard explícito del RPC (P0001 "Commitment is not archived"),
    // nunca un no-op silencioso -- verificado en vivo contra staging tras
    // el fix (ver comentario arriba).
    it('un segundo restore sobre el mismo commitment (ya no archivado) propaga el P0001 "Commitment is not archived" del RPC, sin tragárselo', async () => {
        const mock = createSupabaseAdminMock({
            commitments: [{
                data: { id: 'c1', owner_user_id: OWNER, conversation_id: null },
                error: null,
            }],
            'rpc:restore_commitment_with_evidence': [{
                data: null,
                error: { code: 'P0001', message: 'Commitment is not archived' },
            }],
        });
        setSupabaseAdminMock(mock);

        const { restoreCommitment } = await import('../src/services/commitment.service');
        await expect(restoreCommitment(OWNER, 'c1')).rejects.toMatchObject({ code: 'P0001', message: 'Commitment is not archived' });
    });
});

// PING — ARCHIVE LIFECYCLE COMPLETION: audit found NO backend query mode
// ever retrieves an archived commitment -- getCommitments unconditionally
// excludes archived_at (.is('archived_at', null)), and neither
// retrieval.service.ts (Agent) nor canonicalTruthRegistry.ts ever includes
// it either. getArchivedCommitments is a NEW, separate query -- it never
// modifies getCommitments' own filter, it inverts the same predicate in an
// entirely distinct function so normal retrieval can never regress.
describe('getArchivedCommitments — retrieval explícita, separada de getCommitments', () => {
    it('filtra por NOT archived_at IS NULL (el inverso exacto del filtro de getCommitments), nunca mezclado con la lista normal', async () => {
        const mock = createSupabaseAdminMock({
            commitment_proposal_responses: [{ data: [], error: null }],
            commitments: [{
                data: [{ id: 'c1', title: 'Archivado', status: 'cancelled', archived_at: '2026-09-13T00:00:00.000Z', owner_user_id: OWNER }],
                error: null,
            }],
        });
        setSupabaseAdminMock(mock);

        const { getArchivedCommitments } = await import('../src/services/commitment.service');
        const result = await getArchivedCommitments(OWNER);

        // El mock no distingue is(col, null) de not(col, 'is', null) por
        // nombre de método propio (ambos pasan por is: vi.fn -- ver
        // supabaseMock.ts) así que se certifica contra el resultado
        // observable: el item archivado SÍ vuelve en getArchivedCommitments
        // (nunca lo excluye), a diferencia de getCommitments (probado abajo).
        expect(result).toEqual([
            expect.objectContaining({ id: 'c1', archived_at: '2026-09-13T00:00:00.000Z' }),
        ]);
    });

    it('el mismo commitment archivado NUNCA aparece en getCommitments (la lista normal sigue excluyendo archived_at incondicionalmente)', async () => {
        // getCommitments real filtra en SQL (.is('archived_at', null)) -- el
        // mock no ejecuta SQL, así que esta prueba certifica el CONTRATO del
        // filtro (la llamada .is('archived_at', null) ocurre) más que el
        // resultado, que es lo que un test de integración Postgres real
        // cubre (commitmentCore.integration.sql).
        const mock = createSupabaseAdminMock({
            commitment_proposal_responses: [{ data: [], error: null }],
            commitments: [{ data: [], error: null }],
        });
        setSupabaseAdminMock(mock);

        const { getCommitments } = await import('../src/services/commitment.service');
        await getCommitments(OWNER);

        expect(mock.getIsCalls('commitments')).toContainEqual(['archived_at', null]);
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

describe('getCommitments agreement traceability', () => {
    it('selects proposal_id and attaches every participant response', async () => {
        const mock = createSupabaseAdminMock({
            commitments: [{
                data: [{
                    id: 'c1',
                    proposal_id: 'proposal-1',
                    title: 'Acuerdo confirmado',
                    status: 'accepted',
                }],
                error: null,
            }],
            commitment_proposal_responses: [{
                data: [{
                    proposal_id: 'proposal-1',
                    participant_user_id: OWNER,
                    status: 'approved',
                    profile: { id: OWNER, full_name: 'Carlos' },
                }],
                error: null,
            }],
        });
        setSupabaseAdminMock(mock);

        const { getCommitments } = await import('../src/services/commitment.service');
        const result = await getCommitments(OWNER);

        expect(String(mock.getSelectCalls('commitments')[0])).toContain('proposal_id');
        expect(result[0].agreement_responses).toEqual([
            expect.objectContaining({
                participant_user_id: OWNER,
                status: 'approved',
                participant: { id: OWNER, full_name: 'Carlos' },
            }),
        ]);
    });

    it('includes confirmed agreements for a recipient who is not owner or assignee', async () => {
        const recipientId = '22222222-2222-4222-8222-222222222222';
        const proposalId = '33333333-3333-4333-8333-333333333333';
        const mock = createSupabaseAdminMock({
            commitment_proposal_responses: [
                {
                    data: [{ proposal_id: proposalId }],
                    error: null,
                },
                {
                    data: [{
                        proposal_id: proposalId,
                        participant_user_id: recipientId,
                        status: 'approved',
                        profile: { id: recipientId, full_name: 'Receptora' },
                    }],
                    error: null,
                },
            ],
            commitments: [{
                data: [{
                    id: 'commitment-visible-to-recipient',
                    proposal_id: proposalId,
                    owner_user_id: OWNER,
                    assigned_to_user_id: OWNER,
                    status: 'accepted',
                }],
                error: null,
            }],
        });
        setSupabaseAdminMock(mock);

        const { getCommitments } = await import('../src/services/commitment.service');
        const result = await getCommitments(recipientId);

        expect(mock.getOrCalls('commitments')[0]).toContain(`proposal_id.in.(${proposalId})`);
        expect(result).toEqual([
            expect.objectContaining({
                id: 'commitment-visible-to-recipient',
                agreement_responses: [
                    expect.objectContaining({
                        participant_user_id: recipientId,
                        status: 'approved',
                    }),
                ],
            }),
        ]);
    });
});
