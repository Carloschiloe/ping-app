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
//
// PING — RESCHEDULE WRITE / VERIFICATION / UI CONSISTENCY FIX: physical
// iPhone failure proved that for a SELF-owned/self-assigned commitment (no
// real counterparty), the executor's original unconditional
// counterProposeCommitment call left due_at untouched forever (only
// proposed_due_at moved, status became 'counter_proposal', waiting on the
// SAME actor who can never externally "accept their own" proposal) --
// confirmed against the real physical staging record (commitment
// a5f2728f-34e0-4f8f-a11b-c94f1ab148d3: owner_user_id ===
// assigned_to_user_id === waiting_on_user_id). The executor now branches:
// no real counterparty (assigned_to_user_id null/self, no
// counterparty_contact_id) -> editCommitment (direct due_at write, the
// SAME path mobile's own manual "Reprogramar fecha" button already uses)
// -- a real counterparty -> counterProposeCommitment UNCHANGED (a
// genuinely shared commitment legitimately needs their consent before
// due_at moves). Every fixture below now sets assigned_to_user_id
// explicitly to disambiguate which path a given test exercises.
vi.mock('../src/lib/supabaseAdmin', () => supabaseAdminMockModule());
vi.mock('../src/services/commitment.service', () => ({
    counterProposeCommitment: vi.fn(),
    editCommitment: vi.fn(),
}));

import { rescheduleCommitmentExecutor } from '../src/services/toolExecutors/rescheduleCommitmentExecutor';
import { counterProposeCommitment, editCommitment } from '../src/services/commitment.service';
import { AppError } from '../src/utils/AppError';

const mockCounterProposeCommitment = vi.mocked(counterProposeCommitment);
const mockEditCommitment = vi.mocked(editCommitment);

function ctx() {
    return { actorUserId: 'owner-1', idempotencyKey: 'idem-1' };
}

beforeEach(() => {
    mockCounterProposeCommitment.mockReset();
    mockEditCommitment.mockReset();
});

describe('rescheduleCommitmentExecutor — TOCTOU / authorization / verification (M-4 sección 46, Scenario C)', () => {
    it('entity_changed: el commitment ya no existe en el momento de ejecutar', async () => {
        setSupabaseAdminMock(createSupabaseAdminMock({
            commitments: [{ data: null, error: null }],
        }));
        const outcome = await rescheduleCommitmentExecutor.execute(ctx(), { commitmentId: 'cm-1', newDueAt: '2026-10-01T10:00:00Z' });

        expect(outcome).toEqual({ status: 'failed_terminal', failureCode: 'entity_changed', verified: false });
        expect(mockCounterProposeCommitment).not.toHaveBeenCalled();
        expect(mockEditCommitment).not.toHaveBeenCalled();
    });

    it('not_authorized: el actor no es ni owner ni assignee del commitment REAL', async () => {
        setSupabaseAdminMock(createSupabaseAdminMock({
            commitments: [{ data: { id: 'cm-1', owner_user_id: 'someone-else', assigned_to_user_id: null, counterparty_contact_id: null, status: 'accepted' }, error: null }],
        }));
        const outcome = await rescheduleCommitmentExecutor.execute(ctx(), { commitmentId: 'cm-1', newDueAt: '2026-10-01T10:00:00Z' });

        expect(outcome).toEqual({ status: 'failed_terminal', failureCode: 'not_authorized', verified: false });
        expect(mockCounterProposeCommitment).not.toHaveBeenCalled();
        expect(mockEditCommitment).not.toHaveBeenCalled();
    });

    // Scenario C exacto del ticket M-4: OTRO actor ya cambió el status a algo
    // que ya no admite counter_propose entre planificación y ejecución.
    it('Scenario C (M-4): el commitment YA cambió a un status que no admite counter_propose (ej. cancelled/resolved/rejected) antes de esta ejecución -- invalid_lifecycle, nunca reprograma sobre estado obsoleto', async () => {
        setSupabaseAdminMock(createSupabaseAdminMock({
            commitments: [{ data: { id: 'cm-1', owner_user_id: 'owner-1', assigned_to_user_id: null, counterparty_contact_id: null, status: 'cancelled' }, error: null }],
        }));
        const outcome = await rescheduleCommitmentExecutor.execute(ctx(), { commitmentId: 'cm-1', newDueAt: '2026-10-01T10:00:00Z' });

        expect(outcome).toEqual({ status: 'failed_terminal', failureCode: 'invalid_lifecycle', verified: false });
        expect(mockCounterProposeCommitment).not.toHaveBeenCalled();
        expect(mockEditCommitment).not.toHaveBeenCalled();
    });

    it('REAL counterparty (assignee distinto del actor): status válido (accepted), counterProposeCommitment corre y devuelve el mismo instante autorizado con status counter_proposal -- succeeded + verified:true, due_at deliberadamente sin tocar', async () => {
        setSupabaseAdminMock(createSupabaseAdminMock({
            commitments: [{ data: { id: 'cm-1', owner_user_id: 'owner-1', assigned_to_user_id: 'someone-else', counterparty_contact_id: null, status: 'accepted' }, error: null }],
        }));
        mockCounterProposeCommitment.mockResolvedValueOnce({ proposed_due_at: '2026-10-01T10:00:00.000Z', status: 'counter_proposal' } as any);

        const outcome = await rescheduleCommitmentExecutor.execute(ctx(), { commitmentId: 'cm-1', newDueAt: '2026-10-01T10:00:00Z' });

        expect(outcome.status).toBe('succeeded');
        expect(outcome.verified).toBe(true);
        expect(outcome.resultRef).toEqual({ commitmentId: 'cm-1', proposedDueAt: '2026-10-01T10:00:00.000Z', status: 'counter_proposal' });
        expect(outcome.updatedEntityRefs).toEqual([{ entityType: 'commitment', entityId: 'cm-1' }]);
        expect(mockEditCommitment).not.toHaveBeenCalled();
    });

    it('REAL counterparty via external contact (counterparty_contact_id set, no assignee): also routes through counterProposeCommitment, never editCommitment', async () => {
        setSupabaseAdminMock(createSupabaseAdminMock({
            commitments: [{ data: { id: 'cm-1', owner_user_id: 'owner-1', assigned_to_user_id: null, counterparty_contact_id: 'contact-1', status: 'accepted' }, error: null }],
        }));
        mockCounterProposeCommitment.mockResolvedValueOnce({ proposed_due_at: '2026-10-01T10:00:00.000Z', status: 'counter_proposal' } as any);

        const outcome = await rescheduleCommitmentExecutor.execute(ctx(), { commitmentId: 'cm-1', newDueAt: '2026-10-01T10:00:00Z' });
        expect(outcome.status).toBe('succeeded');
        expect(mockCounterProposeCommitment).toHaveBeenCalledTimes(1);
        expect(mockEditCommitment).not.toHaveBeenCalled();
    });

    // sameInstant() existe precisamente porque PostgREST reformatea el
    // timestamptz -- un literal ISO distinto pero el MISMO instante real
    // nunca debe fallar la verificación.
    it('REAL counterparty: el RPC devuelve un literal ISO distinto pero el MISMO instante real (reformateo típico de PostgREST) -- sameInstant() lo reconoce, verified:true', async () => {
        setSupabaseAdminMock(createSupabaseAdminMock({
            commitments: [{ data: { id: 'cm-1', owner_user_id: 'owner-1', assigned_to_user_id: 'someone-else', counterparty_contact_id: null, status: 'accepted' }, error: null }],
        }));
        // mismo instante, distinta representación de offset
        mockCounterProposeCommitment.mockResolvedValueOnce({ proposed_due_at: '2026-10-01T07:00:00.000-03:00', status: 'counter_proposal' } as any);

        const outcome = await rescheduleCommitmentExecutor.execute(ctx(), { commitmentId: 'cm-1', newDueAt: '2026-10-01T10:00:00Z' });
        expect(outcome.status).toBe('succeeded');
        expect(outcome.verified).toBe(true);
    });

    it('REAL counterparty: el RPC corre pero el proposed_due_at devuelto es un instante DISTINTO al autorizado -- verification_failed, nunca reporta succeeded', async () => {
        setSupabaseAdminMock(createSupabaseAdminMock({
            commitments: [{ data: { id: 'cm-1', owner_user_id: 'owner-1', assigned_to_user_id: 'someone-else', counterparty_contact_id: null, status: 'accepted' }, error: null }],
        }));
        mockCounterProposeCommitment.mockResolvedValueOnce({ proposed_due_at: '2026-11-01T10:00:00.000Z', status: 'counter_proposal' } as any);

        const outcome = await rescheduleCommitmentExecutor.execute(ctx(), { commitmentId: 'cm-1', newDueAt: '2026-10-01T10:00:00Z' });
        expect(outcome.status).toBe('failed_terminal');
        expect(outcome.failureCode).toBe('verification_failed');
        expect(outcome.verified).toBe(false);
    });

    it('REAL counterparty: el RPC corre y el instante coincide, pero el status devuelto NO es counter_proposal -- verification_failed (nunca reporta succeeded contra un status inesperado)', async () => {
        setSupabaseAdminMock(createSupabaseAdminMock({
            commitments: [{ data: { id: 'cm-1', owner_user_id: 'owner-1', assigned_to_user_id: 'someone-else', counterparty_contact_id: null, status: 'accepted' }, error: null }],
        }));
        mockCounterProposeCommitment.mockResolvedValueOnce({ proposed_due_at: '2026-10-01T10:00:00.000Z', status: 'accepted' } as any);

        const outcome = await rescheduleCommitmentExecutor.execute(ctx(), { commitmentId: 'cm-1', newDueAt: '2026-10-01T10:00:00Z' });
        expect(outcome.status).toBe('failed_terminal');
        expect(outcome.failureCode).toBe('verification_failed');
    });

    it('REAL counterparty: el RPC lanza un AppError con código Postgres 42501 -- mapea a not_authorized, failed_terminal', async () => {
        setSupabaseAdminMock(createSupabaseAdminMock({
            commitments: [{ data: { id: 'cm-1', owner_user_id: 'owner-1', assigned_to_user_id: 'someone-else', counterparty_contact_id: null, status: 'accepted' }, error: null }],
        }));
        const err: any = new AppError('permission denied', 403);
        err.code = '42501';
        mockCounterProposeCommitment.mockRejectedValueOnce(err);

        const outcome = await rescheduleCommitmentExecutor.execute(ctx(), { commitmentId: 'cm-1', newDueAt: '2026-10-01T10:00:00Z' });
        expect(outcome).toEqual({ status: 'failed_terminal', failureCode: 'not_authorized', verified: false });
    });

    it('REAL counterparty: el RPC lanza un error con código Postgres 40001 (carrera real de concurrencia) -- mapea a entity_changed, failed_terminal', async () => {
        setSupabaseAdminMock(createSupabaseAdminMock({
            commitments: [{ data: { id: 'cm-1', owner_user_id: 'owner-1', assigned_to_user_id: 'someone-else', counterparty_contact_id: null, status: 'accepted' }, error: null }],
        }));
        const err: any = new AppError('could not serialize access', 409);
        err.code = '40001';
        mockCounterProposeCommitment.mockRejectedValueOnce(err);

        const outcome = await rescheduleCommitmentExecutor.execute(ctx(), { commitmentId: 'cm-1', newDueAt: '2026-10-01T10:00:00Z' });
        expect(outcome).toEqual({ status: 'failed_terminal', failureCode: 'entity_changed', verified: false });
    });

    it('REAL counterparty: un código Postgres no mapeado -- failed_retryable', async () => {
        setSupabaseAdminMock(createSupabaseAdminMock({
            commitments: [{ data: { id: 'cm-1', owner_user_id: 'owner-1', assigned_to_user_id: 'someone-else', counterparty_contact_id: null, status: 'accepted' }, error: null }],
        }));
        const err: any = new AppError('connection reset', 500);
        err.code = '08006';
        mockCounterProposeCommitment.mockRejectedValueOnce(err);

        const outcome = await rescheduleCommitmentExecutor.execute(ctx(), { commitmentId: 'cm-1', newDueAt: '2026-10-01T10:00:00Z' });
        expect(outcome).toEqual({ status: 'failed_retryable', failureCode: 'transient_failure', verified: false });
    });

    it('REAL counterparty: un error genuinamente inesperado se relanza, nunca se traga como failed_terminal genérico', async () => {
        setSupabaseAdminMock(createSupabaseAdminMock({
            commitments: [{ data: { id: 'cm-1', owner_user_id: 'owner-1', assigned_to_user_id: 'someone-else', counterparty_contact_id: null, status: 'accepted' }, error: null }],
        }));
        mockCounterProposeCommitment.mockRejectedValueOnce(new TypeError('unexpected shape'));

        await expect(rescheduleCommitmentExecutor.execute(ctx(), { commitmentId: 'cm-1', newDueAt: '2026-10-01T10:00:00Z' })).rejects.toThrow(TypeError);
    });
});

// PING — RESCHEDULE WRITE / VERIFICATION / UI CONSISTENCY FIX. The exact
// physical bug: a self-owned/self-assigned commitment (no real
// counterparty) never had its due_at updated by a reschedule, because
// counter_propose always waits for someone ELSE to accept -- and there is
// no one else. These tests certify the new direct-edit path, mirroring
// the real physical staging fixture (owner_user_id === assigned_to_user_id
// === actorUserId, commitmentId a5f2728f-34e0-4f8f-a11b-c94f1ab148d3).
describe('rescheduleCommitmentExecutor — self-owned commitment (no real counterparty): direct due_at edit, never counter_propose', () => {
    it('assigned_to_user_id === actorUserId (self-assigned) -> editCommitment called with due_at, counterProposeCommitment NEVER called', async () => {
        setSupabaseAdminMock(createSupabaseAdminMock({
            commitments: [{ data: { id: 'cm-1', owner_user_id: 'owner-1', assigned_to_user_id: 'owner-1', counterparty_contact_id: null, status: 'accepted' }, error: null }],
        }));
        mockEditCommitment.mockResolvedValueOnce({ due_at: '2026-10-01T10:00:00.000Z', status: 'accepted' } as any);

        const outcome = await rescheduleCommitmentExecutor.execute(ctx(), { commitmentId: 'cm-1', newDueAt: '2026-10-01T10:00:00Z' });

        expect(mockEditCommitment).toHaveBeenCalledWith('owner-1', 'cm-1', { due_at: '2026-10-01T10:00:00Z' });
        expect(mockCounterProposeCommitment).not.toHaveBeenCalled();
        expect(outcome.status).toBe('succeeded');
        expect(outcome.verified).toBe(true);
        expect(outcome.resultRef).toEqual({ commitmentId: 'cm-1', dueAt: '2026-10-01T10:00:00.000Z', status: 'accepted' });
    });

    it('assigned_to_user_id === null (never assigned to anyone) -> also direct due_at edit', async () => {
        setSupabaseAdminMock(createSupabaseAdminMock({
            commitments: [{ data: { id: 'cm-1', owner_user_id: 'owner-1', assigned_to_user_id: null, counterparty_contact_id: null, status: 'accepted' }, error: null }],
        }));
        mockEditCommitment.mockResolvedValueOnce({ due_at: '2026-10-01T10:00:00.000Z', status: 'accepted' } as any);

        const outcome = await rescheduleCommitmentExecutor.execute(ctx(), { commitmentId: 'cm-1', newDueAt: '2026-10-01T10:00:00Z' });
        expect(mockEditCommitment).toHaveBeenCalledTimes(1);
        expect(mockCounterProposeCommitment).not.toHaveBeenCalled();
        expect(outcome.status).toBe('succeeded');
    });

    it('REAL PHYSICAL FIXTURE SHAPE: same actor is owner AND assignee (a5f2728f-... case) -> direct edit, verified against due_at (never proposed_due_at)', async () => {
        setSupabaseAdminMock(createSupabaseAdminMock({
            commitments: [{
                data: {
                    id: 'a5f2728f-34e0-4f8f-a11b-c94f1ab148d3', owner_user_id: 'owner-1', assigned_to_user_id: 'owner-1',
                    counterparty_contact_id: null, status: 'accepted',
                }, error: null,
            }],
        }));
        mockEditCommitment.mockResolvedValueOnce({ due_at: '2026-09-13T22:30:00.000Z', status: 'accepted' } as any);

        const outcome = await rescheduleCommitmentExecutor.execute(ctx(), { commitmentId: 'a5f2728f-34e0-4f8f-a11b-c94f1ab148d3', newDueAt: '2026-09-13T22:30:00.000Z' });
        expect(outcome.status).toBe('succeeded');
        expect(outcome.verified).toBe(true);
        expect((outcome.resultRef as any).dueAt).toBe('2026-09-13T22:30:00.000Z');
    });

    it('editCommitment returns a DIFFERENT due_at than authorized (still tolerating PostgREST offset reformatting via sameInstant) -- a genuinely different instant fails verification, never reports succeeded', async () => {
        setSupabaseAdminMock(createSupabaseAdminMock({
            commitments: [{ data: { id: 'cm-1', owner_user_id: 'owner-1', assigned_to_user_id: 'owner-1', counterparty_contact_id: null, status: 'accepted' }, error: null }],
        }));
        mockEditCommitment.mockResolvedValueOnce({ due_at: '2026-11-01T10:00:00.000Z', status: 'accepted' } as any);

        const outcome = await rescheduleCommitmentExecutor.execute(ctx(), { commitmentId: 'cm-1', newDueAt: '2026-10-01T10:00:00Z' });
        expect(outcome.status).toBe('failed_terminal');
        expect(outcome.failureCode).toBe('verification_failed');
        expect(outcome.verified).toBe(false);
    });

    it('editCommitment returns the SAME instant via a different ISO offset literal (PostgREST reformatting) -- sameInstant() still recognizes it, verified:true', async () => {
        setSupabaseAdminMock(createSupabaseAdminMock({
            commitments: [{ data: { id: 'cm-1', owner_user_id: 'owner-1', assigned_to_user_id: 'owner-1', counterparty_contact_id: null, status: 'accepted' }, error: null }],
        }));
        mockEditCommitment.mockResolvedValueOnce({ due_at: '2026-10-01T07:00:00.000-03:00', status: 'accepted' } as any);

        const outcome = await rescheduleCommitmentExecutor.execute(ctx(), { commitmentId: 'cm-1', newDueAt: '2026-10-01T10:00:00Z' });
        expect(outcome.status).toBe('succeeded');
        expect(outcome.verified).toBe(true);
    });

    it('editCommitment throws AppError 42501 -- maps to not_authorized, failed_terminal, same mapping as the counter_propose path', async () => {
        setSupabaseAdminMock(createSupabaseAdminMock({
            commitments: [{ data: { id: 'cm-1', owner_user_id: 'owner-1', assigned_to_user_id: 'owner-1', counterparty_contact_id: null, status: 'accepted' }, error: null }],
        }));
        const err: any = new AppError('permission denied', 403);
        err.code = '42501';
        mockEditCommitment.mockRejectedValueOnce(err);

        const outcome = await rescheduleCommitmentExecutor.execute(ctx(), { commitmentId: 'cm-1', newDueAt: '2026-10-01T10:00:00Z' });
        expect(outcome).toEqual({ status: 'failed_terminal', failureCode: 'not_authorized', verified: false });
    });

    it('self-owned commitment still respects the SAME invalid_lifecycle status gate as the counter_propose path (e.g. cancelled) -- editCommitment never even called', async () => {
        setSupabaseAdminMock(createSupabaseAdminMock({
            commitments: [{ data: { id: 'cm-1', owner_user_id: 'owner-1', assigned_to_user_id: 'owner-1', counterparty_contact_id: null, status: 'cancelled' }, error: null }],
        }));
        const outcome = await rescheduleCommitmentExecutor.execute(ctx(), { commitmentId: 'cm-1', newDueAt: '2026-10-01T10:00:00Z' });
        expect(outcome).toEqual({ status: 'failed_terminal', failureCode: 'invalid_lifecycle', verified: false });
        expect(mockEditCommitment).not.toHaveBeenCalled();
    });

    // PING — ARCHIVED COMMITMENT TOCTOU GAP FIX: an archived commitment
    // must never be executable as a live canonical reschedule target,
    // even under a race, for BOTH the self-owned direct-edit path and the
    // real-counterparty counter-propose path. `status` and `archived_at`
    // are independent columns (archiving never touches `status`), so a
    // commitment archived while still 'accepted' would otherwise pass the
    // validFromStatuses check unnoticed -- confirmed by reading both
    // edit_commitment_with_evidence and
    // apply_commitment_transition_with_evidence's SQL bodies directly (no
    // archived_at check existed in either before this fix).
    describe('archived commitment TOCTOU: reject before AND after the canonical write boundary, on both reschedule paths, never a silent success', () => {
        it('self-owned path: executor pre-write re-fetch sees archived_at set (live, otherwise-valid status) -- invalid_lifecycle, editCommitment never called', async () => {
            setSupabaseAdminMock(createSupabaseAdminMock({
                commitments: [{ data: { id: 'cm-1', owner_user_id: 'owner-1', assigned_to_user_id: 'owner-1', counterparty_contact_id: null, status: 'accepted', archived_at: '2026-09-14T00:00:00.000Z' }, error: null }],
            }));
            const outcome = await rescheduleCommitmentExecutor.execute(ctx(), { commitmentId: 'cm-1', newDueAt: '2026-10-01T10:00:00Z' });

            expect(outcome).toEqual({ status: 'failed_terminal', failureCode: 'invalid_lifecycle', verified: false });
            expect(mockEditCommitment).not.toHaveBeenCalled();
            expect(mockCounterProposeCommitment).not.toHaveBeenCalled();
        });

        it('real-counterparty path: executor pre-write re-fetch sees archived_at set -- invalid_lifecycle, counterProposeCommitment never called', async () => {
            setSupabaseAdminMock(createSupabaseAdminMock({
                commitments: [{ data: { id: 'cm-1', owner_user_id: 'owner-1', assigned_to_user_id: 'someone-else', counterparty_contact_id: null, status: 'accepted', archived_at: '2026-09-14T00:00:00.000Z' }, error: null }],
            }));
            const outcome = await rescheduleCommitmentExecutor.execute(ctx(), { commitmentId: 'cm-1', newDueAt: '2026-10-01T10:00:00Z' });

            expect(outcome).toEqual({ status: 'failed_terminal', failureCode: 'invalid_lifecycle', verified: false });
            expect(mockCounterProposeCommitment).not.toHaveBeenCalled();
            expect(mockEditCommitment).not.toHaveBeenCalled();
        });

        // Reproduces the exact race the task specifies: T1 resolve while
        // archived_at IS NULL (this executor's own pre-write re-fetch,
        // mocked here as still-unarchived to simulate the window closing
        // AFTER this check), T2 archive happens concurrently, T3/T4 the
        // RPC itself (the true canonical write boundary, under its own row
        // lock) is what actually rejects -- proving the fix does not
        // depend solely on this executor's own pre-check, for both paths.
        it('self-owned path: canonical edit_commitment_with_evidence RPC boundary rejects even when the executor pre-check window already closed -- P0001 maps to invalid_lifecycle, never verified:true', async () => {
            setSupabaseAdminMock(createSupabaseAdminMock({
                commitments: [{ data: { id: 'cm-1', owner_user_id: 'owner-1', assigned_to_user_id: 'owner-1', counterparty_contact_id: null, status: 'accepted', archived_at: null }, error: null }],
            }));
            const err: any = new AppError('Commitment is archived', 409);
            err.code = 'P0001';
            mockEditCommitment.mockRejectedValueOnce(err);

            const outcome = await rescheduleCommitmentExecutor.execute(ctx(), { commitmentId: 'cm-1', newDueAt: '2026-10-01T10:00:00Z' });

            expect(outcome).toEqual({ status: 'failed_terminal', failureCode: 'invalid_lifecycle', verified: false });
        });

        it('real-counterparty path: canonical apply_commitment_transition_with_evidence RPC boundary rejects even when the executor pre-check window already closed -- P0001 maps to invalid_lifecycle, never verified:true', async () => {
            setSupabaseAdminMock(createSupabaseAdminMock({
                commitments: [{ data: { id: 'cm-1', owner_user_id: 'owner-1', assigned_to_user_id: 'someone-else', counterparty_contact_id: null, status: 'accepted', archived_at: null }, error: null }],
            }));
            const err: any = new AppError('Commitment is archived', 409);
            err.code = 'P0001';
            mockCounterProposeCommitment.mockRejectedValueOnce(err);

            const outcome = await rescheduleCommitmentExecutor.execute(ctx(), { commitmentId: 'cm-1', newDueAt: '2026-10-01T10:00:00Z' });

            expect(outcome).toEqual({ status: 'failed_terminal', failureCode: 'invalid_lifecycle', verified: false });
        });
    });
});
