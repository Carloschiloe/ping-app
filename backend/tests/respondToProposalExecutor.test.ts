import { describe, it, expect, vi, beforeEach } from 'vitest';

// M-4 P1 GAP CLOSED — respondToProposalExecutor had ZERO dedicated test
// coverage (confirmed via repo-wide grep before writing this file): the
// only exercise of the M-4 execution machinery was
// agentAuthorizationExecution.integration.sql, which only proves the
// agent_authorizations/agent_executions TABLE mechanics (claim/consume/
// replay) using tool ids as opaque strings -- it never invokes this real
// TypeScript executor logic at all. This is the write-pipeline's most
// safety-critical code (it performs the real side effect), so it must be
// tested at the unit level: TOCTOU re-check (stale plan-time snapshot vs.
// live canonical state), authorization boundary (actor_can_respond),
// verification-before-success (a write that "succeeds" at the RPC layer
// but doesn't verify against canonical truth must never report
// status:'succeeded'), and the AppError/Postgres error-code failure
// taxonomy mapping.
vi.mock('../src/services/commitmentProposal.service', () => ({
    getAgreementProposals: vi.fn(),
    respondToSharedProposal: vi.fn(),
}));

import { respondToProposalExecutor } from '../src/services/toolExecutors/respondToProposalExecutor';
import { getAgreementProposals, respondToSharedProposal } from '../src/services/commitmentProposal.service';
import { AppError } from '../src/utils/AppError';

const mockGetAgreementProposals = vi.mocked(getAgreementProposals);
const mockRespondToSharedProposal = vi.mocked(respondToSharedProposal);

function ctx(overrides: Partial<{ actorUserId: string; traceId: string; idempotencyKey: string }> = {}) {
    return { actorUserId: 'actor-1', idempotencyKey: 'idem-1', ...overrides };
}

beforeEach(() => {
    mockGetAgreementProposals.mockReset();
    mockRespondToSharedProposal.mockReset();
});

describe('respondToProposalExecutor — TOCTOU / authorization / verification (M-4 sección 45)', () => {
    it('entity_changed: la proposal ya no está en la lista actual del actor (resuelta/inaccesible entre plan y ejecución) -- nunca ejecuta sobre datos obsoletos', async () => {
        mockGetAgreementProposals.mockResolvedValueOnce([]); // proposal desaparecida
        const outcome = await respondToProposalExecutor.execute(ctx(), { proposalId: 'prop-1', decision: 'approve' });

        expect(outcome).toEqual({ status: 'failed_terminal', failureCode: 'entity_changed', verified: false });
        expect(mockRespondToSharedProposal).not.toHaveBeenCalled();
    });

    it('not_authorized: la proposal existe pero actor_can_respond=false (re-chequeo del estado REAL, nunca confía en el snapshot de planificación)', async () => {
        mockGetAgreementProposals.mockResolvedValueOnce([{ id: 'prop-1', actor_can_respond: false }]);
        const outcome = await respondToProposalExecutor.execute(ctx(), { proposalId: 'prop-1', decision: 'approve' });

        expect(outcome).toEqual({ status: 'failed_terminal', failureCode: 'not_authorized', verified: false });
        expect(mockRespondToSharedProposal).not.toHaveBeenCalled();
    });

    it('approve exitoso: RPC corre Y la relectura canónica confirma actor_has_approved=true -- succeeded + verified:true, con materializedCommitmentId cuando el RPC devuelve el commitment materializado', async () => {
        mockGetAgreementProposals
            .mockResolvedValueOnce([{ id: 'prop-1', actor_can_respond: true }])
            .mockResolvedValueOnce([{ id: 'prop-1', actor_has_approved: true }]);
        mockRespondToSharedProposal.mockResolvedValueOnce({ commitment: { id: 'cm-new' } } as any);

        const outcome = await respondToProposalExecutor.execute(ctx(), { proposalId: 'prop-1', decision: 'approve' });

        expect(outcome.status).toBe('succeeded');
        expect(outcome.verified).toBe(true);
        expect(outcome.resultRef).toEqual({ proposalId: 'prop-1', decision: 'approve', materializedCommitmentId: 'cm-new' });
        expect(outcome.createdEntityRefs).toEqual([{ entityType: 'commitment', entityId: 'cm-new' }]);
        expect(outcome.updatedEntityRefs).toEqual([{ entityType: 'commitment_proposal', entityId: 'prop-1' }]);
    });

    it('approve pero la relectura post-write NO confirma actor_has_approved -- nunca reporta succeeded pese a que el RPC no lanzó (verificación desde fuente canónica, no confía en el propio RPC)', async () => {
        mockGetAgreementProposals
            .mockResolvedValueOnce([{ id: 'prop-1', actor_can_respond: true }])
            .mockResolvedValueOnce([{ id: 'prop-1', actor_has_approved: false }]); // la escritura no se reflejó como se esperaba
        mockRespondToSharedProposal.mockResolvedValueOnce({ commitment: null } as any);

        const outcome = await respondToProposalExecutor.execute(ctx(), { proposalId: 'prop-1', decision: 'approve' });

        expect(outcome.status).toBe('failed_terminal');
        expect(outcome.failureCode).toBe('verification_failed');
        expect(outcome.verified).toBe(false);
    });

    it('reject exitoso: la proposal ya no aparece para el actor tras la relectura (o su status es rejected) -- verified:true', async () => {
        mockGetAgreementProposals
            .mockResolvedValueOnce([{ id: 'prop-1', actor_can_respond: true }])
            .mockResolvedValueOnce([]); // ya no aparece -- rechazo confirmado
        mockRespondToSharedProposal.mockResolvedValueOnce({ commitment: null } as any);

        const outcome = await respondToProposalExecutor.execute(ctx(), { proposalId: 'prop-1', decision: 'reject' });

        expect(outcome.status).toBe('succeeded');
        expect(outcome.verified).toBe(true);
        expect(outcome.createdEntityRefs).toEqual([]);
    });

    // PING — CANONICAL POST-WRITE VERIFICATION COMPLETENESS: counter_propose
    // previously accepted mere `!!after` (the proposal merely still
    // existing) -- these cases prove the strengthened contract: same
    // target id, real pending counter-proposal status, the canonical
    // persisted date represents the SAME INSTANT as the authorized
    // proposedDueAt (never the request payload or pre-write cache), and
    // the counter-proposal author matches the executing actor.
    describe('counter_propose — canonical post-write verification (never mere existence)', () => {
        it('exact match: persisted proposed_due_at represents the same instant as authorized proposedDueAt -- verified:true', async () => {
            mockGetAgreementProposals
                .mockResolvedValueOnce([{ id: 'prop-1', actor_can_respond: true }])
                .mockResolvedValueOnce([{
                    id: 'prop-1',
                    status: 'counter_proposal',
                    proposed_due_at: '2026-10-01T10:00:00.000Z',
                    latest_counterproposal_by_user_id: 'actor-1',
                }]);
            mockRespondToSharedProposal.mockResolvedValueOnce({ commitment: null } as any);

            const outcome = await respondToProposalExecutor.execute(ctx(), { proposalId: 'prop-1', decision: 'counter_propose', proposedDueAt: '2026-10-01T10:00:00Z' });

            expect(outcome.status).toBe('succeeded');
            expect(outcome.verified).toBe(true);
            expect(mockRespondToSharedProposal).toHaveBeenCalledWith('actor-1', 'prop-1', 'counter_propose', { proposedDueAt: '2026-10-01T10:00:00Z' });
        });

        it('timezone-equivalent instant (different literal, same instant) -- verified:true, instant-safe comparison', async () => {
            mockGetAgreementProposals
                .mockResolvedValueOnce([{ id: 'prop-1', actor_can_respond: true }])
                .mockResolvedValueOnce([{
                    id: 'prop-1',
                    status: 'counter_proposal',
                    proposed_due_at: '2026-10-01T07:00:00-03:00', // same instant as 10:00Z
                    latest_counterproposal_by_user_id: 'actor-1',
                }]);
            mockRespondToSharedProposal.mockResolvedValueOnce({ commitment: null } as any);

            const outcome = await respondToProposalExecutor.execute(ctx(), { proposalId: 'prop-1', decision: 'counter_propose', proposedDueAt: '2026-10-01T10:00:00Z' });

            expect(outcome.status).toBe('succeeded');
            expect(outcome.verified).toBe(true);
        });

        it('different instant persisted -- NOT verified, never claims success on a mismatched date', async () => {
            mockGetAgreementProposals
                .mockResolvedValueOnce([{ id: 'prop-1', actor_can_respond: true }])
                .mockResolvedValueOnce([{
                    id: 'prop-1',
                    status: 'counter_proposal',
                    proposed_due_at: '2026-10-02T10:00:00.000Z', // wrong day
                    latest_counterproposal_by_user_id: 'actor-1',
                }]);
            mockRespondToSharedProposal.mockResolvedValueOnce({ commitment: null } as any);

            const outcome = await respondToProposalExecutor.execute(ctx(), { proposalId: 'prop-1', decision: 'counter_propose', proposedDueAt: '2026-10-01T10:00:00Z' });

            expect(outcome.status).toBe('failed_terminal');
            expect(outcome.failureCode).toBe('verification_failed');
            expect(outcome.verified).toBe(false);
        });

        it('unchanged/pre-write proposed date (write silently no-opped) -- NOT verified', async () => {
            mockGetAgreementProposals
                .mockResolvedValueOnce([{ id: 'prop-1', actor_can_respond: true, proposed_due_at: '2026-09-01T10:00:00.000Z' }])
                .mockResolvedValueOnce([{
                    id: 'prop-1',
                    status: 'counter_proposal',
                    proposed_due_at: '2026-09-01T10:00:00.000Z', // never actually changed
                    latest_counterproposal_by_user_id: 'actor-1',
                }]);
            mockRespondToSharedProposal.mockResolvedValueOnce({ commitment: null } as any);

            const outcome = await respondToProposalExecutor.execute(ctx(), { proposalId: 'prop-1', decision: 'counter_propose', proposedDueAt: '2026-10-01T10:00:00Z' });

            expect(outcome.verified).toBe(false);
        });

        it('proposal merely existing (old weak contract: `{ id: "prop-1" }` with no status/date) -- NOT sufficient, NOT verified', async () => {
            mockGetAgreementProposals
                .mockResolvedValueOnce([{ id: 'prop-1', actor_can_respond: true }])
                .mockResolvedValueOnce([{ id: 'prop-1' }]); // exists, but no proof the mutation actually landed
            mockRespondToSharedProposal.mockResolvedValueOnce({ commitment: null } as any);

            const outcome = await respondToProposalExecutor.execute(ctx(), { proposalId: 'prop-1', decision: 'counter_propose', proposedDueAt: '2026-10-01T10:00:00Z' });

            expect(outcome.verified).toBe(false);
            expect(outcome.status).toBe('failed_terminal');
        });

        it('wrong target id in the refreshed list (different proposal matched by coincidence) -- NOT verified', async () => {
            mockGetAgreementProposals
                .mockResolvedValueOnce([{ id: 'prop-1', actor_can_respond: true }])
                .mockResolvedValueOnce([]); // prop-1 not found post-write at all
            mockRespondToSharedProposal.mockResolvedValueOnce({ commitment: null } as any);

            const outcome = await respondToProposalExecutor.execute(ctx(), { proposalId: 'prop-1', decision: 'counter_propose', proposedDueAt: '2026-10-01T10:00:00Z' });

            expect(outcome.verified).toBe(false);
        });

        it('counter-proposal authored by a different actor than the one executing now -- NOT verified (never trusts someone else\'s stale counter-proposal)', async () => {
            mockGetAgreementProposals
                .mockResolvedValueOnce([{ id: 'prop-1', actor_can_respond: true }])
                .mockResolvedValueOnce([{
                    id: 'prop-1',
                    status: 'counter_proposal',
                    proposed_due_at: '2026-10-01T10:00:00.000Z',
                    latest_counterproposal_by_user_id: 'someone-else',
                }]);
            mockRespondToSharedProposal.mockResolvedValueOnce({ commitment: null } as any);

            const outcome = await respondToProposalExecutor.execute(ctx(), { proposalId: 'prop-1', decision: 'counter_propose', proposedDueAt: '2026-10-01T10:00:00Z' });

            expect(outcome.verified).toBe(false);
        });
    });

    it('el RPC lanza un AppError con código Postgres 42501 (RLS/permiso) -- mapea a not_authorized, failed_terminal, nunca relanza', async () => {
        mockGetAgreementProposals.mockResolvedValueOnce([{ id: 'prop-1', actor_can_respond: true }]);
        const err: any = new AppError('permission denied', 403);
        err.code = '42501';
        mockRespondToSharedProposal.mockRejectedValueOnce(err);

        const outcome = await respondToProposalExecutor.execute(ctx(), { proposalId: 'prop-1', decision: 'approve' });
        expect(outcome).toEqual({ status: 'failed_terminal', failureCode: 'not_authorized', verified: false });
    });

    it('el RPC lanza un error con código Postgres P0001 (lifecycle inválido del lado servidor) -- mapea a invalid_lifecycle, failed_terminal', async () => {
        mockGetAgreementProposals.mockResolvedValueOnce([{ id: 'prop-1', actor_can_respond: true }]);
        const err: any = new AppError('invalid transition', 409);
        err.code = 'P0001';
        mockRespondToSharedProposal.mockRejectedValueOnce(err);

        const outcome = await respondToProposalExecutor.execute(ctx(), { proposalId: 'prop-1', decision: 'approve' });
        expect(outcome).toEqual({ status: 'failed_terminal', failureCode: 'invalid_lifecycle', verified: false });
    });

    it('un error desconocido/transitorio (código Postgres no mapeado) -- failed_retryable, nunca terminal (permite reintento real vía claim_agent_execution_step)', async () => {
        mockGetAgreementProposals.mockResolvedValueOnce([{ id: 'prop-1', actor_can_respond: true }]);
        const err: any = new AppError('connection reset', 500);
        err.code = '08006';
        mockRespondToSharedProposal.mockRejectedValueOnce(err);

        const outcome = await respondToProposalExecutor.execute(ctx(), { proposalId: 'prop-1', decision: 'approve' });
        expect(outcome).toEqual({ status: 'failed_retryable', failureCode: 'transient_failure', verified: false });
    });

    it('un error genuinamente inesperado (ni AppError ni con .code) se relanza -- nunca se traga silenciosamente como un failed_terminal genérico', async () => {
        mockGetAgreementProposals.mockResolvedValueOnce([{ id: 'prop-1', actor_can_respond: true }]);
        mockRespondToSharedProposal.mockRejectedValueOnce(new TypeError('unexpected shape'));

        await expect(respondToProposalExecutor.execute(ctx(), { proposalId: 'prop-1', decision: 'approve' })).rejects.toThrow(TypeError);
    });
});
