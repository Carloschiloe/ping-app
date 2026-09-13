import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createSupabaseAdminMock, setSupabaseAdminMock, supabaseAdminMockModule } from './helpers/supabaseMock';

// M-4 P1 GAP CLOSED — completeCommitmentExecutor had ZERO dedicated test
// coverage (confirmed via repo-wide grep before writing this file). This is
// exactly M-4's own documented Scenario D: "if valid at plan time, but
// already completed before execute: no second transition; return
// entity_changed/invalid_lifecycle honestly." That TOCTOU re-check, the
// owner/assignee authorization boundary, and verification-before-success
// were entirely unexercised until this file.
vi.mock('../src/lib/supabaseAdmin', () => supabaseAdminMockModule());
vi.mock('../src/services/commitment.service', () => ({
    resolveCommitment: vi.fn(),
}));

import { completeCommitmentExecutor } from '../src/services/toolExecutors/completeCommitmentExecutor';
import { resolveCommitment } from '../src/services/commitment.service';
import { AppError } from '../src/utils/AppError';

const mockResolveCommitment = vi.mocked(resolveCommitment);

function ctx() {
    return { actorUserId: 'owner-1', idempotencyKey: 'idem-1' };
}

beforeEach(() => {
    mockResolveCommitment.mockReset();
});

describe('completeCommitmentExecutor — TOCTOU / authorization / verification (M-4 sección 47, Scenario D)', () => {
    it('entity_changed: el commitment ya no existe en el momento de ejecutar', async () => {
        setSupabaseAdminMock(createSupabaseAdminMock({
            commitments: [{ data: null, error: null }],
        }));
        const outcome = await completeCommitmentExecutor.execute(ctx(), { commitmentId: 'cm-1', resolutionResult: 'listo' });

        expect(outcome).toEqual({ status: 'failed_terminal', failureCode: 'entity_changed', verified: false });
        expect(mockResolveCommitment).not.toHaveBeenCalled();
    });

    it('not_authorized: el actor no es ni owner ni assignee del commitment REAL (releído en ejecución, nunca confía en el snapshot de planificación)', async () => {
        setSupabaseAdminMock(createSupabaseAdminMock({
            commitments: [{ data: { id: 'cm-1', owner_user_id: 'someone-else', assigned_to_user_id: null, status: 'accepted' }, error: null }],
        }));
        const outcome = await completeCommitmentExecutor.execute(ctx(), { commitmentId: 'cm-1', resolutionResult: 'listo' });

        expect(outcome).toEqual({ status: 'failed_terminal', failureCode: 'not_authorized', verified: false });
        expect(mockResolveCommitment).not.toHaveBeenCalled();
    });

    it('assignee (no owner) SÍ está autorizado a completar', async () => {
        setSupabaseAdminMock(createSupabaseAdminMock({
            commitments: [{ data: { id: 'cm-1', owner_user_id: 'someone-else', assigned_to_user_id: 'owner-1', status: 'accepted' }, error: null }],
        }));
        mockResolveCommitment.mockResolvedValueOnce({ id: 'cm-1', status: 'resolved', resolution_result: 'listo' } as any);

        const outcome = await completeCommitmentExecutor.execute(ctx(), { commitmentId: 'cm-1', resolutionResult: 'listo' });
        expect(outcome.status).toBe('succeeded');
    });

    // Scenario D exacto del ticket M-4: ya estaba resuelto/cancelado/rechazado
    // ANTES de esta ejecución -- nunca una segunda transición silenciosa.
    it('Scenario D (M-4): el commitment YA fue resuelto/cancelado/rechazado antes de esta ejecución (TOCTOU real) -- invalid_lifecycle, nunca ejecuta una segunda transición', async () => {
        setSupabaseAdminMock(createSupabaseAdminMock({
            commitments: [{ data: { id: 'cm-1', owner_user_id: 'owner-1', assigned_to_user_id: null, status: 'cancelled' }, error: null }],
        }));
        const outcome = await completeCommitmentExecutor.execute(ctx(), { commitmentId: 'cm-1', resolutionResult: 'listo' });

        expect(outcome).toEqual({ status: 'failed_terminal', failureCode: 'invalid_lifecycle', verified: false });
        expect(mockResolveCommitment).not.toHaveBeenCalled();
    });

    it('éxito: status válido (accepted), el RPC corre, updated.status==="resolved" Y el resolution_result canónico coincide con el autorizado -- succeeded + verified:true', async () => {
        setSupabaseAdminMock(createSupabaseAdminMock({
            commitments: [{ data: { id: 'cm-1', owner_user_id: 'owner-1', assigned_to_user_id: null, status: 'accepted' }, error: null }],
        }));
        mockResolveCommitment.mockResolvedValueOnce({ id: 'cm-1', status: 'resolved', resolution_result: 'Entrenamiento completado' } as any);

        const outcome = await completeCommitmentExecutor.execute(ctx(), { commitmentId: 'cm-1', resolutionResult: 'Entrenamiento completado' });

        expect(outcome.status).toBe('succeeded');
        expect(outcome.verified).toBe(true);
        expect(outcome.resultRef).toEqual({ commitmentId: 'cm-1', status: 'resolved', resolutionResult: 'Entrenamiento completado' });
        expect(outcome.updatedEntityRefs).toEqual([{ entityType: 'commitment', entityId: 'cm-1' }]);
        expect(mockResolveCommitment).toHaveBeenCalledWith('owner-1', 'cm-1', 'Entrenamiento completado');
    });

    it('el RPC corre pero updated.status NO es "resolved" -- verification_failed, nunca reporta succeeded pese a que el RPC no lanzó', async () => {
        setSupabaseAdminMock(createSupabaseAdminMock({
            commitments: [{ data: { id: 'cm-1', owner_user_id: 'owner-1', assigned_to_user_id: null, status: 'accepted' }, error: null }],
        }));
        mockResolveCommitment.mockResolvedValueOnce({ id: 'cm-1', status: 'accepted', resolution_result: null } as any); // no cambió, pese a no lanzar

        const outcome = await completeCommitmentExecutor.execute(ctx(), { commitmentId: 'cm-1', resolutionResult: 'listo' });
        expect(outcome).toEqual({
            status: 'failed_terminal', failureCode: 'verification_failed', verified: false,
            resultRef: { commitmentId: 'cm-1', status: 'accepted', resolutionResult: null },
            updatedEntityRefs: [{ entityType: 'commitment', entityId: 'cm-1' }],
        });
    });

    // PING — CANONICAL POST-WRITE VERIFICATION COMPLETENESS: status alone
    // was previously sufficient (`updated.status === 'resolved'`) with NO
    // check that the persisted resolution_result actually matches the
    // authorized value -- resolutionResult is REQUIRED by the tool schema
    // (z.string().trim().min(1).max(500), see toolRegistry.service.ts) and
    // persisted VERBATIM after a trim
    // (commitment.service.ts#applyCommitmentTransition:
    // patch.resolution_result = extra.resolutionResult.trim(), no further
    // normalization in commitmentTransitions.ts) -- so exact equality
    // (post-trim) is the correct canonical rule, never a previously
    // optional-field relaxation.
    describe('resolutionResult canonical equality (verbatim, trimmed persistence)', () => {
        it('canonical resolution_result differs from the authorized value -- NOT verified even though status is resolved', async () => {
            setSupabaseAdminMock(createSupabaseAdminMock({
                commitments: [{ data: { id: 'cm-1', owner_user_id: 'owner-1', assigned_to_user_id: null, status: 'accepted' }, error: null }],
            }));
            mockResolveCommitment.mockResolvedValueOnce({ id: 'cm-1', status: 'resolved', resolution_result: 'algo distinto' } as any);

            const outcome = await completeCommitmentExecutor.execute(ctx(), { commitmentId: 'cm-1', resolutionResult: 'Entrenamiento completado' });

            expect(outcome.status).toBe('failed_terminal');
            expect(outcome.failureCode).toBe('verification_failed');
            expect(outcome.verified).toBe(false);
        });

        it('canonical resolution_result is missing/null while an authorized non-empty value was supplied -- NOT verified', async () => {
            setSupabaseAdminMock(createSupabaseAdminMock({
                commitments: [{ data: { id: 'cm-1', owner_user_id: 'owner-1', assigned_to_user_id: null, status: 'accepted' }, error: null }],
            }));
            mockResolveCommitment.mockResolvedValueOnce({ id: 'cm-1', status: 'resolved', resolution_result: null } as any);

            const outcome = await completeCommitmentExecutor.execute(ctx(), { commitmentId: 'cm-1', resolutionResult: 'Entrenamiento completado' });

            expect(outcome.verified).toBe(false);
        });

        it('status resolved alone is insufficient when result content was authorized -- confirms the strengthened contract replaces the old status-only check', async () => {
            setSupabaseAdminMock(createSupabaseAdminMock({
                commitments: [{ data: { id: 'cm-1', owner_user_id: 'owner-1', assigned_to_user_id: null, status: 'accepted' }, error: null }],
            }));
            mockResolveCommitment.mockResolvedValueOnce({ id: 'cm-1', status: 'resolved' } as any); // resolution_result omitted entirely from the canonical read

            const outcome = await completeCommitmentExecutor.execute(ctx(), { commitmentId: 'cm-1', resolutionResult: 'listo' });

            expect(outcome.verified).toBe(false);
        });

        it('leading/trailing whitespace in the authorized value is trimmed the same way the canonical write trims it -- verified:true (matches persistence semantics, not over-strict)', async () => {
            setSupabaseAdminMock(createSupabaseAdminMock({
                commitments: [{ data: { id: 'cm-1', owner_user_id: 'owner-1', assigned_to_user_id: null, status: 'accepted' }, error: null }],
            }));
            mockResolveCommitment.mockResolvedValueOnce({ id: 'cm-1', status: 'resolved', resolution_result: 'listo' } as any);

            const outcome = await completeCommitmentExecutor.execute(ctx(), { commitmentId: 'cm-1', resolutionResult: '  listo  ' });

            expect(outcome.verified).toBe(true);
        });
    });

    it('el RPC lanza un AppError con código Postgres 42501 -- mapea a not_authorized, failed_terminal', async () => {
        setSupabaseAdminMock(createSupabaseAdminMock({
            commitments: [{ data: { id: 'cm-1', owner_user_id: 'owner-1', assigned_to_user_id: null, status: 'accepted' }, error: null }],
        }));
        const err: any = new AppError('permission denied', 403);
        err.code = '42501';
        mockResolveCommitment.mockRejectedValueOnce(err);

        const outcome = await completeCommitmentExecutor.execute(ctx(), { commitmentId: 'cm-1', resolutionResult: 'listo' });
        expect(outcome).toEqual({ status: 'failed_terminal', failureCode: 'not_authorized', verified: false });
    });

    it('el RPC lanza un error con código Postgres 40001 (serialization failure -- carrera real de concurrencia) -- mapea a entity_changed, failed_terminal', async () => {
        setSupabaseAdminMock(createSupabaseAdminMock({
            commitments: [{ data: { id: 'cm-1', owner_user_id: 'owner-1', assigned_to_user_id: null, status: 'accepted' }, error: null }],
        }));
        const err: any = new AppError('could not serialize access', 409);
        err.code = '40001';
        mockResolveCommitment.mockRejectedValueOnce(err);

        const outcome = await completeCommitmentExecutor.execute(ctx(), { commitmentId: 'cm-1', resolutionResult: 'listo' });
        expect(outcome).toEqual({ status: 'failed_terminal', failureCode: 'entity_changed', verified: false });
    });

    it('un código Postgres no mapeado -- failed_retryable (permite reintento real vía claim_agent_execution_step)', async () => {
        setSupabaseAdminMock(createSupabaseAdminMock({
            commitments: [{ data: { id: 'cm-1', owner_user_id: 'owner-1', assigned_to_user_id: null, status: 'accepted' }, error: null }],
        }));
        const err: any = new AppError('connection reset', 500);
        err.code = '08006';
        mockResolveCommitment.mockRejectedValueOnce(err);

        const outcome = await completeCommitmentExecutor.execute(ctx(), { commitmentId: 'cm-1', resolutionResult: 'listo' });
        expect(outcome).toEqual({ status: 'failed_retryable', failureCode: 'transient_failure', verified: false });
    });

    it('un error genuinamente inesperado se relanza, nunca se traga como failed_terminal genérico', async () => {
        setSupabaseAdminMock(createSupabaseAdminMock({
            commitments: [{ data: { id: 'cm-1', owner_user_id: 'owner-1', assigned_to_user_id: null, status: 'accepted' }, error: null }],
        }));
        mockResolveCommitment.mockRejectedValueOnce(new TypeError('unexpected shape'));

        await expect(completeCommitmentExecutor.execute(ctx(), { commitmentId: 'cm-1', resolutionResult: 'listo' })).rejects.toThrow(TypeError);
    });
});
