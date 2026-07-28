import { describe, expect, it } from 'vitest';
import { computeCommitmentTransition, CommitmentStateSnapshot } from '../src/utils/commitmentTransitions';

describe('beta journey: confirmed Commitment, progress, follow-up and resolution', () => {
    it('keeps progress distinct from resolution and preserves an explicit result', () => {
        const initial: CommitmentStateSnapshot = {
            id: 'commitment-beta',
            status: 'accepted',
            ownerUserId: 'owner',
            assignedToUserId: 'owner',
            counterpartyContactId: null,
            dueAt: null,
            proposedDueAt: null,
        };

        const progress = computeCommitmentTransition({
            action: 'action_complete',
            actorUserId: 'owner',
            commitment: initial,
            now: '2026-07-28T12:00:00.000Z',
        });
        expect(progress.patch.action_completed_at).toBeTruthy();
        expect(progress.patch.status).toBeUndefined();
        expect(progress.event.new_status).toBe('accepted');

        const followUp = computeCommitmentTransition({
            action: 'schedule_follow_up',
            actorUserId: 'owner',
            commitment: initial,
            followUpAt: '2026-07-29T12:00:00.000Z',
            nextAction: 'Confirmar recepción',
        });
        expect(followUp.patch.status).toBeUndefined();
        expect(followUp.event.event_type).toBe('follow_up_scheduled');

        const resolution = computeCommitmentTransition({
            action: 'resolve',
            actorUserId: 'owner',
            commitment: initial,
            now: '2026-07-30T12:00:00.000Z',
        });
        const resolutionResult = 'La contraparte confirmó la recepción del informe.';
        expect(resolution.patch.status).toBe('resolved');
        expect(resolutionResult.trim().length).toBeGreaterThan(3);
    });
});
