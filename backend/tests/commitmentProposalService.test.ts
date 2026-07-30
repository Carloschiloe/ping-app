import { describe, expect, it, vi } from 'vitest';
import { createSupabaseAdminMock, setSupabaseAdminMock, supabaseAdminMockModule } from './helpers/supabaseMock';

vi.mock('../src/lib/supabaseAdmin', () => supabaseAdminMockModule());

const USER = '11111111-1111-4111-8111-111111111111';
const PROPOSAL = '22222222-2222-4222-8222-222222222222';

describe('canonical Commitment proposals', () => {
    it('createConfirmedCommitment creates Proposal before the confirmation RPC', async () => {
        const mock = createSupabaseAdminMock({
            'rpc:create_commitment_proposal_with_evidence': [{
                data: { id: PROPOSAL, status: 'pending', title: 'Enviar informe' },
                error: null,
            }],
            'rpc:confirm_commitment_proposal': [{
                data: { id: 'commitment-1', proposal_id: PROPOSAL, status: 'accepted' },
                error: null,
            }],
        });
        setSupabaseAdminMock(mock);

        const { createConfirmedCommitment } = await import('../src/services/commitmentProposal.service');
        const result = await createConfirmedCommitment(USER, { title: 'Enviar informe' });

        expect(mock.getRpcCalls().map((call) => call.name)).toEqual([
            'create_commitment_proposal_with_evidence',
            'confirm_commitment_proposal',
        ]);
        expect(result.status).toBe('accepted');
    });

    it('rejecting a Proposal never inserts a Commitment', async () => {
        const mock = createSupabaseAdminMock({
            'rpc:reject_commitment_proposal_with_evidence': [{
                data: { id: PROPOSAL, status: 'rejected', rejection_reason: 'No corresponde' },
                error: null,
            }],
        });
        setSupabaseAdminMock(mock);

        const { rejectProposal } = await import('../src/services/commitmentProposal.service');
        await rejectProposal(USER, PROPOSAL, 'No corresponde');

        expect(mock.getInsertCalls('commitments')).toHaveLength(0);
        expect(mock.getRpcCalls()).toEqual([{
            name: 'reject_commitment_proposal_with_evidence',
            args: {
                p_proposal_id: PROPOSAL,
                p_actor_user_id: USER,
                p_reason: 'No corresponde',
            },
        }]);
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

    it('creates a shared agreement through the atomic response-snapshot RPC', async () => {
        const mock = createSupabaseAdminMock({
            conversation_participants: [{
                data: { conversation_id: 'conversation-1', role: 'member' },
                error: null,
            }],
            'rpc:create_shared_commitment_proposal_with_responses': [{
                data: { id: PROPOSAL, status: 'pending', agreement_version: 1 },
                error: null,
            }],
        });
        setSupabaseAdminMock(mock);

        const { createSharedProposal } = await import('../src/services/commitmentProposal.service');
        const result = await createSharedProposal(USER, {
            title: 'Revisar contrato',
            conversation_id: 'conversation-1',
            due_at: '2026-08-05T13:00:00.000Z',
        });

        expect(result).toMatchObject({ id: PROPOSAL, status: 'pending' });
        expect(mock.getRpcCalls()).toEqual([{
            name: 'create_shared_commitment_proposal_with_responses',
            args: {
                p_actor_user_id: USER,
                p_proposal: expect.objectContaining({
                    conversation_id: 'conversation-1',
                    title: 'Revisar contrato',
                }),
            },
        }]);
    });

    it('records participant decisions through the guarded agreement RPC', async () => {
        const mock = createSupabaseAdminMock({
            'rpc:respond_to_commitment_proposal': [{
                data: { proposal_id: PROPOSAL, decision: 'counter_propose', finalized: false },
                error: null,
            }],
        });
        setSupabaseAdminMock(mock);

        const { respondToSharedProposal } = await import('../src/services/commitmentProposal.service');
        await respondToSharedProposal(USER, PROPOSAL, 'counter_propose', {
            proposedDueAt: '2026-08-05T16:00:00.000Z',
        });

        expect(mock.getRpcCalls()).toEqual([{
            name: 'respond_to_commitment_proposal',
            args: {
                p_proposal_id: PROPOSAL,
                p_actor_user_id: USER,
                p_decision: 'counter_propose',
                p_reason: null,
                p_proposed_due_at: '2026-08-05T16:00:00.000Z',
            },
        }]);
    });
});
