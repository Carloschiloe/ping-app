import { describe, expect, it, vi, beforeEach } from 'vitest';
import { createSupabaseAdminMock, setSupabaseAdminMock, supabaseAdminMockModule } from './helpers/supabaseMock';

vi.mock('../src/lib/supabaseAdmin', () => supabaseAdminMockModule());
vi.mock('../src/services/commitmentApplication.service', () => ({
    updateCommitment: vi.fn(),
}));

import { editCommitmentExecutor } from '../src/services/toolExecutors/editCommitmentExecutor';
import { updateCommitment } from '../src/services/commitmentApplication.service';

const mockUpdateCommitment = vi.mocked(updateCommitment);

function ctx() {
    return { actorUserId: 'owner-1', idempotencyKey: 'idem-1' };
}

beforeEach(() => mockUpdateCommitment.mockReset());

describe('editCommitmentExecutor — canonical audited edit', () => {
    it('edits the existing row through commitmentApplication and verifies the returned title', async () => {
        setSupabaseAdminMock(createSupabaseAdminMock({
            commitments: [{ data: { id: 'cm-1', owner_user_id: 'owner-1', archived_at: null, status: 'accepted' }, error: null }],
        }));
        mockUpdateCommitment.mockResolvedValueOnce({ id: 'cm-1', title: 'Reunión con Juan', status: 'accepted' } as any);

        const outcome = await editCommitmentExecutor.execute(ctx(), { commitmentId: 'cm-1', title: 'Reunión con Juan' });

        expect(mockUpdateCommitment).toHaveBeenCalledWith('owner-1', 'cm-1', { title: 'Reunión con Juan' });
        expect(outcome).toMatchObject({ status: 'succeeded', verified: true, updatedEntityRefs: [{ entityType: 'commitment', entityId: 'cm-1' }] });
    });

    it('never edits a commitment the actor does not own', async () => {
        setSupabaseAdminMock(createSupabaseAdminMock({
            commitments: [{ data: { id: 'cm-1', owner_user_id: 'someone-else', archived_at: null, status: 'accepted' }, error: null }],
        }));

        const outcome = await editCommitmentExecutor.execute(ctx(), { commitmentId: 'cm-1', title: 'Reunión con Juan' });

        expect(outcome).toEqual({ status: 'failed_terminal', failureCode: 'not_authorized', verified: false });
        expect(mockUpdateCommitment).not.toHaveBeenCalled();
    });
});
