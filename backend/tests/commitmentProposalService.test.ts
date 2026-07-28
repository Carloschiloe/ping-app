import { describe, expect, it, vi } from 'vitest';
import { createSupabaseAdminMock, setSupabaseAdminMock, supabaseAdminMockModule } from './helpers/supabaseMock';

vi.mock('../src/lib/supabaseAdmin', () => supabaseAdminMockModule());

const USER = '11111111-1111-4111-8111-111111111111';
const PROPOSAL = '22222222-2222-4222-8222-222222222222';

describe('canonical Commitment proposals', () => {
    it('createConfirmedCommitment creates Proposal before the confirmation RPC', async () => {
        const mock = createSupabaseAdminMock({
            commitment_proposals: [{
                data: { id: PROPOSAL, status: 'pending', title: 'Enviar informe' },
                error: null,
            }],
            commitment_proposal_events: [{ data: null, error: null }],
            'rpc:confirm_commitment_proposal': [{
                data: { id: 'commitment-1', proposal_id: PROPOSAL, status: 'accepted' },
                error: null,
            }],
        });
        setSupabaseAdminMock(mock);

        const { createConfirmedCommitment } = await import('../src/services/commitmentProposal.service');
        const result = await createConfirmedCommitment(USER, { title: 'Enviar informe' });

        expect(mock.getInsertCalls('commitment_proposals')[0]).toMatchObject({
            proposed_by_user_id: USER,
            proposed_responsible_user_id: USER,
            status: 'pending',
            source_kind: 'manual',
        });
        expect(mock.getRpcCalls()).toEqual([{
            name: 'confirm_commitment_proposal',
            args: { p_proposal_id: PROPOSAL, p_actor_user_id: USER },
        }]);
        expect(result.status).toBe('accepted');
    });

    it('rejecting a Proposal never inserts a Commitment', async () => {
        const mock = createSupabaseAdminMock({
            commitment_proposals: [{
                data: { id: PROPOSAL, status: 'rejected', rejection_reason: 'No corresponde' },
                error: null,
            }],
            commitment_proposal_events: [{ data: null, error: null }],
        });
        setSupabaseAdminMock(mock);

        const { rejectProposal } = await import('../src/services/commitmentProposal.service');
        await rejectProposal(USER, PROPOSAL, 'No corresponde');

        expect(mock.getInsertCalls('commitments')).toHaveLength(0);
        expect(mock.getInsertCalls('commitment_proposal_events')[0]).toMatchObject({
            proposal_id: PROPOSAL,
            event_type: 'rejected',
        });
    });

    it('rejects a cross-conversation source message before creating a Proposal', async () => {
        const mock = createSupabaseAdminMock({
            conversation_participants: [{
                data: { conversation_id: 'c1', role: 'member' },
                error: null,
            }],
            messages: [{ data: null, error: null }],
        });
        setSupabaseAdminMock(mock);

        const { createProposal } = await import('../src/services/commitmentProposal.service');
        await expect(createProposal(USER, {
            title: 'No autorizada',
            conversation_id: 'c1',
            message_id: 'message-from-c2',
        })).rejects.toThrow('Message not found in this conversation');
        expect(mock.getInsertCalls('commitment_proposals')).toHaveLength(0);
    });
});
