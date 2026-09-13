import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createSupabaseAdminMock, setSupabaseAdminMock, supabaseAdminMockModule } from './helpers/supabaseMock';

// M-4 P1 GAP CLOSED — rescheduleCommitmentExecutor had ZERO dedicated test
// coverage (confirmed via repo-wide grep before writing this file). M-4's
// own documented Scenario C: "another actor changes date/status before
// execution — must detect stale canonical state and block, never execute a
// stale action." That TOCTOU re-check, the owner/assignee authorization
// boundary, the sameInstant() timestamp comparison (PostgREST never returns
// the same literal ISO string it was written with), and
// verification-before-success were entirely unexercised until this file.
vi.mock('../src/lib/supabaseAdmin', () => supabaseAdminMockModule());
vi.mock('../src/services/commitment.service', () => ({
    counterProposeCommitment: vi.fn(),
}));

import { rescheduleCommitmentExecutor } from '../src/services/toolExecutors/rescheduleCommitmentExecutor';
import { counterProposeCommitment } from '../src/services/commitment.service';
import { AppError } from '../src/utils/AppError';

const mockCounterProposeCommitment = vi.mocked(counterProposeCommitment);

function ctx() {
    return { actorUserId: 'owner-1', idempotencyKey: 'idem-1' };
}

beforeEach(() => {
    mockCounterProposeCommitment.mockReset();
});

describe('rescheduleCommitmentExecutor — TOCTOU / authorization / verification (M-4 sección 46, Scenario C)', () => {
    it('entity_changed: el commitment ya no existe en el momento de ejecutar', async () => {
        setSupabaseAdminMock(createSupabaseAdminMock({
            commitments: [{ data: null, error: null }],
        }));
        const outcome = await rescheduleCommitmentExecutor.execute(ctx(), { commitmentId: 'cm-1', newDueAt: '2026-10-01T10:00:00Z' });

        expect(outcome).toEqual({ status: 'failed_terminal', failureCode: 'entity_changed', verified: false });
        expect(mockCounterProposeCommitment).not.toHaveBeenCalled();
    });

    it('not_authorized: el actor no es ni owner ni assignee del commitment REAL', async () => {
        setSupabaseAdminMock(createSupabaseAdminMock({
            commitments: [{ data: { id: 'cm-1', owner_user_id: 'someone-else', assigned_to_user_id: null, status: 'accepted' }, error: null }],
        }));
        const outcome = await rescheduleCommitmentExecutor.execute(ctx(), { commitmentId: 'cm-1', newDueAt: '2026-10-01T10:00:00Z' });

        expect(outcome).toEqual({ status: 'failed_terminal', failureCode: 'not_authorized', verified: false });
        expect(mockCounterProposeCommitment).not.toHaveBeenCalled();
    });

    // Scenario C exacto del ticket M-4: OTRO actor ya cambió el status a algo
    // que ya no admite counter_propose entre planificación y ejecución.
    it('Scenario C (M-4): el commitment YA cambió a un status que no admite counter_propose (ej. cancelled/resolved/rejected) antes de esta ejecución -- invalid_lifecycle, nunca reprograma sobre estado obsoleto', async () => {
        setSupabaseAdminMock(createSupabaseAdminMock({
            commitments: [{ data: { id: 'cm-1', owner_user_id: 'owner-1', assigned_to_user_id: null, status: 'cancelled' }, error: null }],
        }));
        const outcome = await rescheduleCommitmentExecutor.execute(ctx(), { commitmentId: 'cm-1', newDueAt: '2026-10-01T10:00:00Z' });

        expect(outcome).toEqual({ status: 'failed_terminal', failureCode: 'invalid_lifecycle', verified: false });
        expect(mockCounterProposeCommitment).not.toHaveBeenCalled();
    });

    it('éxito: status válido (accepted), el RPC corre y devuelve el mismo instante autorizado con status counter_proposal -- succeeded + verified:true', async () => {
        setSupabaseAdminMock(createSupabaseAdminMock({
            commitments: [{ data: { id: 'cm-1', owner_user_id: 'owner-1', assigned_to_user_id: null, status: 'accepted' }, error: null }],
        }));
        mockCounterProposeCommitment.mockResolvedValueOnce({ proposed_due_at: '2026-10-01T10:00:00.000Z', status: 'counter_proposal' } as any);

        const outcome = await rescheduleCommitmentExecutor.execute(ctx(), { commitmentId: 'cm-1', newDueAt: '2026-10-01T10:00:00Z' });

        expect(outcome.status).toBe('succeeded');
        expect(outcome.verified).toBe(true);
        expect(outcome.resultRef).toEqual({ commitmentId: 'cm-1', proposedDueAt: '2026-10-01T10:00:00.000Z', status: 'counter_proposal' });
        expect(outcome.updatedEntityRefs).toEqual([{ entityType: 'commitment', entityId: 'cm-1' }]);
    });

    // sameInstant() existe precisamente porque PostgREST reformatea el
    // timestamptz -- un literal ISO distinto pero el MISMO instante real
    // nunca debe fallar la verificación.
    it('el RPC devuelve un literal ISO distinto pero el MISMO instante real (reformateo típico de PostgREST) -- sameInstant() lo reconoce, verified:true', async () => {
        setSupabaseAdminMock(createSupabaseAdminMock({
            commitments: [{ data: { id: 'cm-1', owner_user_id: 'owner-1', assigned_to_user_id: null, status: 'accepted' }, error: null }],
        }));
        // mismo instante, distinta representación de offset
        mockCounterProposeCommitment.mockResolvedValueOnce({ proposed_due_at: '2026-10-01T07:00:00.000-03:00', status: 'counter_proposal' } as any);

        const outcome = await rescheduleCommitmentExecutor.execute(ctx(), { commitmentId: 'cm-1', newDueAt: '2026-10-01T10:00:00Z' });
        expect(outcome.status).toBe('succeeded');
        expect(outcome.verified).toBe(true);
    });

    it('el RPC corre pero el proposed_due_at devuelto es un instante DISTINTO al autorizado -- verification_failed, nunca reporta succeeded', async () => {
        setSupabaseAdminMock(createSupabaseAdminMock({
            commitments: [{ data: { id: 'cm-1', owner_user_id: 'owner-1', assigned_to_user_id: null, status: 'accepted' }, error: null }],
        }));
        mockCounterProposeCommitment.mockResolvedValueOnce({ proposed_due_at: '2026-11-01T10:00:00.000Z', status: 'counter_proposal' } as any);

        const outcome = await rescheduleCommitmentExecutor.execute(ctx(), { commitmentId: 'cm-1', newDueAt: '2026-10-01T10:00:00Z' });
        expect(outcome.status).toBe('failed_terminal');
        expect(outcome.failureCode).toBe('verification_failed');
        expect(outcome.verified).toBe(false);
    });

    it('el RPC corre y el instante coincide, pero el status devuelto NO es counter_proposal -- verification_failed', async () => {
        setSupabaseAdminMock(createSupabaseAdminMock({
            commitments: [{ data: { id: 'cm-1', owner_user_id: 'owner-1', assigned_to_user_id: null, status: 'accepted' }, error: null }],
        }));
        mockCounterProposeCommitment.mockResolvedValueOnce({ proposed_due_at: '2026-10-01T10:00:00.000Z', status: 'accepted' } as any);

        const outcome = await rescheduleCommitmentExecutor.execute(ctx(), { commitmentId: 'cm-1', newDueAt: '2026-10-01T10:00:00Z' });
        expect(outcome.status).toBe('failed_terminal');
        expect(outcome.failureCode).toBe('verification_failed');
    });

    it('el RPC lanza un AppError con código Postgres 42501 -- mapea a not_authorized, failed_terminal', async () => {
        setSupabaseAdminMock(createSupabaseAdminMock({
            commitments: [{ data: { id: 'cm-1', owner_user_id: 'owner-1', assigned_to_user_id: null, status: 'accepted' }, error: null }],
        }));
        const err: any = new AppError('permission denied', 403);
        err.code = '42501';
        mockCounterProposeCommitment.mockRejectedValueOnce(err);

        const outcome = await rescheduleCommitmentExecutor.execute(ctx(), { commitmentId: 'cm-1', newDueAt: '2026-10-01T10:00:00Z' });
        expect(outcome).toEqual({ status: 'failed_terminal', failureCode: 'not_authorized', verified: false });
    });

    it('el RPC lanza un error con código Postgres 40001 (carrera real de concurrencia) -- mapea a entity_changed, failed_terminal', async () => {
        setSupabaseAdminMock(createSupabaseAdminMock({
            commitments: [{ data: { id: 'cm-1', owner_user_id: 'owner-1', assigned_to_user_id: null, status: 'accepted' }, error: null }],
        }));
        const err: any = new AppError('could not serialize access', 409);
        err.code = '40001';
        mockCounterProposeCommitment.mockRejectedValueOnce(err);

        const outcome = await rescheduleCommitmentExecutor.execute(ctx(), { commitmentId: 'cm-1', newDueAt: '2026-10-01T10:00:00Z' });
        expect(outcome).toEqual({ status: 'failed_terminal', failureCode: 'entity_changed', verified: false });
    });

    it('un código Postgres no mapeado -- failed_retryable', async () => {
        setSupabaseAdminMock(createSupabaseAdminMock({
            commitments: [{ data: { id: 'cm-1', owner_user_id: 'owner-1', assigned_to_user_id: null, status: 'accepted' }, error: null }],
        }));
        const err: any = new AppError('connection reset', 500);
        err.code = '08006';
        mockCounterProposeCommitment.mockRejectedValueOnce(err);

        const outcome = await rescheduleCommitmentExecutor.execute(ctx(), { commitmentId: 'cm-1', newDueAt: '2026-10-01T10:00:00Z' });
        expect(outcome).toEqual({ status: 'failed_retryable', failureCode: 'transient_failure', verified: false });
    });

    it('un error genuinamente inesperado se relanza, nunca se traga como failed_terminal genérico', async () => {
        setSupabaseAdminMock(createSupabaseAdminMock({
            commitments: [{ data: { id: 'cm-1', owner_user_id: 'owner-1', assigned_to_user_id: null, status: 'accepted' }, error: null }],
        }));
        mockCounterProposeCommitment.mockRejectedValueOnce(new TypeError('unexpected shape'));

        await expect(rescheduleCommitmentExecutor.execute(ctx(), { commitmentId: 'cm-1', newDueAt: '2026-10-01T10:00:00Z' })).rejects.toThrow(TypeError);
    });
});
