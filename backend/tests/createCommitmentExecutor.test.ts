import { describe, it, expect, vi, beforeEach } from 'vitest';

// M-4 P1 GAP CLOSED — createCommitmentExecutor had ZERO dedicated test
// coverage (confirmed via repo-wide grep before writing this file). Covers
// the standing product rule (M-4 sección 8): a shared action
// (responsiblePersonId set) must ALWAYS go through createSharedProposal
// (a pending proposal, never an already-accepted commitment) and never
// bypass the proposal lifecycle; a personal action goes through
// createConfirmedCommitment. Also covers the sameInstant() timestamp
// verification (PostgREST never round-trips the same literal ISO string)
// and the structural precondition that a shared commitment requires a real
// conversationId at execution time.
vi.mock('../src/services/commitmentProposal.service', () => ({
    createConfirmedCommitment: vi.fn(),
    createSharedProposal: vi.fn(),
}));
vi.mock('../src/utils/authz', () => ({
    assertConversationParticipantReference: vi.fn(),
}));

import { createCommitmentExecutor } from '../src/services/toolExecutors/createCommitmentExecutor';
import { createConfirmedCommitment, createSharedProposal } from '../src/services/commitmentProposal.service';
import { assertConversationParticipantReference } from '../src/utils/authz';
import { AppError } from '../src/utils/AppError';

const mockCreateConfirmedCommitment = vi.mocked(createConfirmedCommitment);
const mockCreateSharedProposal = vi.mocked(createSharedProposal);
const mockAssertConversationParticipantReference = vi.mocked(assertConversationParticipantReference);

function ctx() {
    return { actorUserId: 'actor-1', idempotencyKey: 'idem-1' };
}

beforeEach(() => {
    mockCreateConfirmedCommitment.mockReset();
    mockCreateSharedProposal.mockReset();
    mockAssertConversationParticipantReference.mockReset().mockResolvedValue(undefined as any);
});

describe('createCommitmentExecutor — personal vs. shared routing / verification (M-4 sección 44, sección 8)', () => {
    it('invalid_lifecycle estructural: responsiblePersonId presente pero SIN conversationId -- una proposal compartida exige conversación real, nunca un intento silencioso', async () => {
        const outcome = await createCommitmentExecutor.execute(ctx(), { title: 'entrenar', dueAt: '2026-10-01T08:00:00Z', responsiblePersonId: 'other-user' });

        expect(outcome).toEqual({ status: 'failed_terminal', failureCode: 'invalid_lifecycle', verified: false });
        expect(mockCreateSharedProposal).not.toHaveBeenCalled();
        expect(mockCreateConfirmedCommitment).not.toHaveBeenCalled();
    });

    it('personal (sin responsiblePersonId): SIEMPRE createConfirmedCommitment, nunca createSharedProposal', async () => {
        mockCreateConfirmedCommitment.mockResolvedValueOnce({ id: 'cm-1', title: 'entrenar', due_at: '2026-10-01T08:00:00.000Z', status: 'accepted' } as any);

        const outcome = await createCommitmentExecutor.execute(ctx(), { title: 'entrenar', dueAt: '2026-10-01T08:00:00Z' });

        expect(outcome.status).toBe('succeeded');
        expect(outcome.verified).toBe(true);
        expect(outcome.createdEntityRefs).toEqual([{ entityType: 'commitment', entityId: 'cm-1' }]);
        expect(mockCreateSharedProposal).not.toHaveBeenCalled();
        expect(mockCreateConfirmedCommitment).toHaveBeenCalledWith('actor-1', { title: 'entrenar', due_at: '2026-10-01T08:00:00Z' });
    });

    // Standing product rule, sección 8: nunca bypassa el lifecycle de
    // proposal para una acción compartida -- SIEMPRE createSharedProposal
    // (pending), nunca createConfirmedCommitment (ya-aceptado) cuando hay
    // un responsable distinto.
    it('compartido (responsiblePersonId distinto del actor + conversationId real): SIEMPRE createSharedProposal, nunca createConfirmedCommitment -- nunca bypassa el lifecycle de proposal', async () => {
        mockCreateSharedProposal.mockResolvedValueOnce({ id: 'prop-1', title: 'entrenar', due_at: '2026-10-01T08:00:00.000Z', status: 'proposed' } as any);

        const outcome = await createCommitmentExecutor.execute(ctx(), {
            title: 'entrenar', dueAt: '2026-10-01T08:00:00Z', responsiblePersonId: 'other-user', conversationId: 'conv-1',
        });

        expect(outcome.status).toBe('succeeded');
        expect(outcome.createdEntityRefs).toEqual([{ entityType: 'commitment_proposal', entityId: 'prop-1' }]);
        expect(mockCreateConfirmedCommitment).not.toHaveBeenCalled();
        expect(mockAssertConversationParticipantReference).toHaveBeenCalledWith('other-user', 'conv-1');
    });

    it('compartido con responsiblePersonId === actorUserId (auto-asignado): NUNCA vuelve a chequear la participación del propio actor (ya está implícitamente autorizado)', async () => {
        mockCreateSharedProposal.mockResolvedValueOnce({ id: 'prop-1', title: 'entrenar', due_at: '2026-10-01T08:00:00.000Z', status: 'proposed' } as any);

        await createCommitmentExecutor.execute(ctx(), {
            title: 'entrenar', dueAt: '2026-10-01T08:00:00Z', responsiblePersonId: 'actor-1', conversationId: 'conv-1',
        });

        expect(mockAssertConversationParticipantReference).not.toHaveBeenCalled();
    });

    it('compartido: el responsable NO es participante real de la conversación en el momento de ejecutar -- el AppError se traduce en el catch, nunca crea la proposal', async () => {
        mockAssertConversationParticipantReference.mockRejectedValueOnce(new AppError('not a participant', 403));

        const outcome = await createCommitmentExecutor.execute(ctx(), {
            title: 'entrenar', dueAt: '2026-10-01T08:00:00Z', responsiblePersonId: 'other-user', conversationId: 'conv-1',
        });

        expect(outcome).toEqual({ status: 'failed_terminal', failureCode: 'not_authorized', verified: false });
        expect(mockCreateSharedProposal).not.toHaveBeenCalled();
    });

    it('verification_failed: el título/fecha del commitment creado no coincide con lo autorizado (aunque el RPC no haya lanzado)', async () => {
        mockCreateConfirmedCommitment.mockResolvedValueOnce({ id: 'cm-1', title: 'un título distinto', due_at: '2026-10-01T08:00:00.000Z', status: 'accepted' } as any);

        const outcome = await createCommitmentExecutor.execute(ctx(), { title: 'entrenar', dueAt: '2026-10-01T08:00:00Z' });

        expect(outcome).toEqual({ status: 'failed_terminal', failureCode: 'verification_failed', verified: false, resultRef: { commitmentId: 'cm-1' } });
    });

    it('verification_failed: la proposal compartida creada tiene una fecha distinta al instante autorizado', async () => {
        mockCreateSharedProposal.mockResolvedValueOnce({ id: 'prop-1', title: 'entrenar', due_at: '2026-11-01T08:00:00.000Z', status: 'proposed' } as any);

        const outcome = await createCommitmentExecutor.execute(ctx(), {
            title: 'entrenar', dueAt: '2026-10-01T08:00:00Z', responsiblePersonId: 'other-user', conversationId: 'conv-1',
        });

        expect(outcome).toEqual({ status: 'failed_terminal', failureCode: 'verification_failed', verified: false, resultRef: { proposalId: 'prop-1' } });
    });

    it('sameInstant(): un literal ISO distinto pero el MISMO instante real (reformateo típico de PostgREST) verifica correctamente', async () => {
        mockCreateConfirmedCommitment.mockResolvedValueOnce({ id: 'cm-1', title: 'entrenar', due_at: '2026-10-01T05:00:00.000-03:00', status: 'accepted' } as any);

        const outcome = await createCommitmentExecutor.execute(ctx(), { title: 'entrenar', dueAt: '2026-10-01T08:00:00Z' });
        expect(outcome.status).toBe('succeeded');
    });

    it('AppError con statusCode 403 -- mapea a not_authorized, failed_terminal', async () => {
        mockCreateConfirmedCommitment.mockRejectedValueOnce(new AppError('forbidden', 403));
        const outcome = await createCommitmentExecutor.execute(ctx(), { title: 'entrenar', dueAt: '2026-10-01T08:00:00Z' });
        expect(outcome).toEqual({ status: 'failed_terminal', failureCode: 'not_authorized', verified: false });
    });

    it('AppError con statusCode 400 -- mapea a invalid_lifecycle, failed_terminal', async () => {
        mockCreateConfirmedCommitment.mockRejectedValueOnce(new AppError('bad request', 400));
        const outcome = await createCommitmentExecutor.execute(ctx(), { title: 'entrenar', dueAt: '2026-10-01T08:00:00Z' });
        expect(outcome).toEqual({ status: 'failed_terminal', failureCode: 'invalid_lifecycle', verified: false });
    });

    it('AppError con statusCode inesperado (ej. 500) -- failed_retryable, permite reintento real', async () => {
        mockCreateConfirmedCommitment.mockRejectedValueOnce(new AppError('server error', 500));
        const outcome = await createCommitmentExecutor.execute(ctx(), { title: 'entrenar', dueAt: '2026-10-01T08:00:00Z' });
        expect(outcome).toEqual({ status: 'failed_retryable', failureCode: 'transient_failure', verified: false });
    });

    it('un error genuinamente inesperado (no AppError) se relanza, nunca se traga como failed_terminal genérico', async () => {
        mockCreateConfirmedCommitment.mockRejectedValueOnce(new TypeError('unexpected shape'));
        await expect(createCommitmentExecutor.execute(ctx(), { title: 'entrenar', dueAt: '2026-10-01T08:00:00Z' })).rejects.toThrow(TypeError);
    });
});
