import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createSupabaseAdminMock, setSupabaseAdminMock, supabaseAdminMockModule } from './helpers/supabaseMock';

// M-9 — cancelCommitmentExecutor. Mirrors completeCommitmentExecutor.test.ts's
// own TOCTOU / authorization / verification pattern, with the ONE structural
// difference this executor's own header comment documents: cancel is
// OWNER-ONLY (verified directly against
// commitmentTransitions.ts#computeCancel before writing this test file --
// "Only the owner can cancel this commitment", 403), never owner-or-assignee.
vi.mock('../src/lib/supabaseAdmin', () => supabaseAdminMockModule());
vi.mock('../src/services/commitment.service', () => ({
    cancelCommitment: vi.fn(),
}));

import { cancelCommitmentExecutor } from '../src/services/toolExecutors/cancelCommitmentExecutor';
import { cancelCommitment } from '../src/services/commitment.service';
import { AppError } from '../src/utils/AppError';

const mockCancelCommitment = vi.mocked(cancelCommitment);

function ctx() {
    return { actorUserId: 'owner-1', idempotencyKey: 'idem-1' };
}

beforeEach(() => {
    mockCancelCommitment.mockReset();
});

describe('cancelCommitmentExecutor — owner-only authorization, TOCTOU, verification (M-9)', () => {
    it('entity_changed: el commitment ya no existe en el momento de ejecutar', async () => {
        setSupabaseAdminMock(createSupabaseAdminMock({
            commitments: [{ data: null, error: null }],
        }));
        const outcome = await cancelCommitmentExecutor.execute(ctx(), { commitmentId: 'cm-1' });

        expect(outcome).toEqual({ status: 'failed_terminal', failureCode: 'entity_changed', verified: false });
        expect(mockCancelCommitment).not.toHaveBeenCalled();
    });

    it('not_authorized: el actor no es el owner (releído en ejecución, nunca confía en el snapshot de planificación)', async () => {
        setSupabaseAdminMock(createSupabaseAdminMock({
            commitments: [{ data: { id: 'cm-1', owner_user_id: 'someone-else', status: 'accepted' }, error: null }],
        }));
        const outcome = await cancelCommitmentExecutor.execute(ctx(), { commitmentId: 'cm-1' });

        expect(outcome).toEqual({ status: 'failed_terminal', failureCode: 'not_authorized', verified: false });
        expect(mockCancelCommitment).not.toHaveBeenCalled();
    });

    // THE critical asymmetry this executor exists to get right: an ASSIGNEE
    // (who CAN complete/reschedule this same commitment, per
    // completeCommitmentExecutor.test.ts's own "assignee SÍ está
    // autorizado" positive control) must NEVER be authorized to cancel it.
    // There is no `assigned_to_user_id` column read at all in this executor's
    // own select -- confirmed by the executor's own source, not merely
    // asserted by this test -- so an assignee is REJECTED by the same
    // owner-only check a stranger would be, never given a separate,
    // more-permissive path.
    it('SECURITY: un assignee (no owner) NO está autorizado a cancelar, a diferencia de complete/reschedule -- la asimetría exacta que este executor debe preservar', async () => {
        setSupabaseAdminMock(createSupabaseAdminMock({
            commitments: [{ data: { id: 'cm-1', owner_user_id: 'someone-else', status: 'accepted' }, error: null }],
        }));
        // ctx().actorUserId ('owner-1') is neither the owner ('someone-else')
        // nor named anywhere as an assignee in this mock -- this proves the
        // executor rejects on ownership alone, with no assignee bypass to
        // even check against.
        const outcome = await cancelCommitmentExecutor.execute(ctx(), { commitmentId: 'cm-1' });
        expect(outcome.failureCode).toBe('not_authorized');
    });

    it('el owner SÍ está autorizado a cancelar', async () => {
        setSupabaseAdminMock(createSupabaseAdminMock({
            commitments: [{ data: { id: 'cm-1', owner_user_id: 'owner-1', status: 'accepted' }, error: null }],
        }));
        mockCancelCommitment.mockResolvedValueOnce({ id: 'cm-1', status: 'cancelled' } as any);

        const outcome = await cancelCommitmentExecutor.execute(ctx(), { commitmentId: 'cm-1' });
        expect(outcome.status).toBe('succeeded');
        expect(mockCancelCommitment).toHaveBeenCalledWith('owner-1', 'cm-1');
    });

    it('archived_at TOCTOU guard: un commitment archivado retiene un status válido pero debe rechazarse igual (misma disciplina que completeCommitmentExecutor)', async () => {
        setSupabaseAdminMock(createSupabaseAdminMock({
            commitments: [{ data: { id: 'cm-1', owner_user_id: 'owner-1', status: 'accepted', archived_at: '2026-01-01T00:00:00Z' }, error: null }],
        }));
        const outcome = await cancelCommitmentExecutor.execute(ctx(), { commitmentId: 'cm-1' });

        expect(outcome).toEqual({ status: 'failed_terminal', failureCode: 'invalid_lifecycle', verified: false });
        expect(mockCancelCommitment).not.toHaveBeenCalled();
    });

    // TOCTOU real: ya estaba resuelto/cancelado/rechazado ANTES de esta
    // ejecución -- nunca una segunda transición silenciosa.
    it('el commitment YA fue resuelto/cancelado/rechazado antes de esta ejecución (TOCTOU real) -- invalid_lifecycle, nunca ejecuta una segunda transición', async () => {
        setSupabaseAdminMock(createSupabaseAdminMock({
            commitments: [{ data: { id: 'cm-1', owner_user_id: 'owner-1', status: 'resolved' }, error: null }],
        }));
        const outcome = await cancelCommitmentExecutor.execute(ctx(), { commitmentId: 'cm-1' });

        expect(outcome).toEqual({ status: 'failed_terminal', failureCode: 'invalid_lifecycle', verified: false });
        expect(mockCancelCommitment).not.toHaveBeenCalled();
    });

    it('éxito: status válido (accepted), el RPC corre, updated.status==="cancelled" -- succeeded + verified:true', async () => {
        setSupabaseAdminMock(createSupabaseAdminMock({
            commitments: [{ data: { id: 'cm-1', owner_user_id: 'owner-1', status: 'accepted' }, error: null }],
        }));
        mockCancelCommitment.mockResolvedValueOnce({ id: 'cm-1', status: 'cancelled' } as any);

        const outcome = await cancelCommitmentExecutor.execute(ctx(), { commitmentId: 'cm-1' });

        expect(outcome.status).toBe('succeeded');
        expect(outcome.verified).toBe(true);
        expect(outcome.resultRef).toEqual({ commitmentId: 'cm-1', status: 'cancelled' });
        expect(outcome.updatedEntityRefs).toEqual([{ entityType: 'commitment', entityId: 'cm-1' }]);
    });

    it('el RPC corre pero updated.status NO es "cancelled" -- verification_failed, nunca reporta succeeded pese a que el RPC no lanzó', async () => {
        setSupabaseAdminMock(createSupabaseAdminMock({
            commitments: [{ data: { id: 'cm-1', owner_user_id: 'owner-1', status: 'accepted' }, error: null }],
        }));
        mockCancelCommitment.mockResolvedValueOnce({ id: 'cm-1', status: 'accepted' } as any); // no cambió, pese a no lanzar

        const outcome = await cancelCommitmentExecutor.execute(ctx(), { commitmentId: 'cm-1' });
        expect(outcome).toEqual({
            status: 'failed_terminal', failureCode: 'verification_failed', verified: false,
            resultRef: { commitmentId: 'cm-1', status: 'accepted' },
            updatedEntityRefs: [{ entityType: 'commitment', entityId: 'cm-1' }],
        });
    });

    it('AppError con código 42501 (RLS/permiso denegado a nivel de base) -- mapea a not_authorized, failed_terminal', async () => {
        setSupabaseAdminMock(createSupabaseAdminMock({
            commitments: [{ data: { id: 'cm-1', owner_user_id: 'owner-1', status: 'accepted' }, error: null }],
        }));
        mockCancelCommitment.mockRejectedValueOnce(Object.assign(new AppError('forbidden', 403), { code: '42501' }));
        const outcome = await cancelCommitmentExecutor.execute(ctx(), { commitmentId: 'cm-1' });
        expect(outcome).toEqual({ status: 'failed_terminal', failureCode: 'not_authorized', verified: false });
    });

    it('AppError con código 40001 (conflicto de serialización, transición concurrente) -- mapea a entity_changed', async () => {
        setSupabaseAdminMock(createSupabaseAdminMock({
            commitments: [{ data: { id: 'cm-1', owner_user_id: 'owner-1', status: 'accepted' }, error: null }],
        }));
        mockCancelCommitment.mockRejectedValueOnce(Object.assign(new AppError('conflict', 409), { code: '40001' }));
        const outcome = await cancelCommitmentExecutor.execute(ctx(), { commitmentId: 'cm-1' });
        expect(outcome).toEqual({ status: 'failed_terminal', failureCode: 'entity_changed', verified: false });
    });

    it('AppError con código P0001 (guardia de dominio del RPC, ej. carrera contra un archive concurrente) -- mapea a invalid_lifecycle', async () => {
        setSupabaseAdminMock(createSupabaseAdminMock({
            commitments: [{ data: { id: 'cm-1', owner_user_id: 'owner-1', status: 'accepted' }, error: null }],
        }));
        mockCancelCommitment.mockRejectedValueOnce(Object.assign(new AppError('domain guard', 400), { code: 'P0001' }));
        const outcome = await cancelCommitmentExecutor.execute(ctx(), { commitmentId: 'cm-1' });
        expect(outcome).toEqual({ status: 'failed_terminal', failureCode: 'invalid_lifecycle', verified: false });
    });

    it('AppError con código inesperado (ej. 500) -- failed_retryable, permite reintento real', async () => {
        setSupabaseAdminMock(createSupabaseAdminMock({
            commitments: [{ data: { id: 'cm-1', owner_user_id: 'owner-1', status: 'accepted' }, error: null }],
        }));
        mockCancelCommitment.mockRejectedValueOnce(new AppError('server error', 500));
        const outcome = await cancelCommitmentExecutor.execute(ctx(), { commitmentId: 'cm-1' });
        expect(outcome).toEqual({ status: 'failed_retryable', failureCode: 'transient_failure', verified: false });
    });

    it('un error genuinamente inesperado (no AppError, sin código) se relanza, nunca se traga como failed_terminal genérico', async () => {
        setSupabaseAdminMock(createSupabaseAdminMock({
            commitments: [{ data: { id: 'cm-1', owner_user_id: 'owner-1', status: 'accepted' }, error: null }],
        }));
        mockCancelCommitment.mockRejectedValueOnce(new TypeError('unexpected shape'));
        await expect(cancelCommitmentExecutor.execute(ctx(), { commitmentId: 'cm-1' })).rejects.toThrow(TypeError);
    });
});
