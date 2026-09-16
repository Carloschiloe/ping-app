import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { supabaseAdmin } from '../src/lib/supabaseAdmin';
import { executeExactCommitmentCount } from '../src/services/agentExactCommitmentCount.service';

const owner = 'a1000000-0000-4000-8000-000000000001';
const assignee = 'a1000000-0000-4000-8000-000000000002';
const participant = 'a1000000-0000-4000-8000-000000000003';
const outsider = 'a1000000-0000-4000-8000-000000000004';
const conversation = 'a2000000-0000-4000-8000-000000000001';
const contact = 'a3000000-0000-4000-8000-000000000001';
const proposal = 'a4000000-0000-4000-8000-000000000001';
const ownCommitment = 'a5000000-0000-4000-8000-000000000001';
const assignedCommitment = 'a5000000-0000-4000-8000-000000000002';
const proposalCommitment = 'a5000000-0000-4000-8000-000000000003';
const archivedCommitment = 'a5000000-0000-4000-8000-000000000004';
const outsiderCommitment = 'a5000000-0000-4000-8000-000000000005';
const contactCommitment = 'a5000000-0000-4000-8000-000000000006';

const query = (actorUserId: string, overrides: Record<string, unknown> = {}) => ({
    actorUserId,
    queryKey: `integration-count-${actorUserId}-${Object.keys(overrides).join('-') || 'all'}`,
    query: {
        domain: 'commitment',
        cardinality: 'count',
        target: null,
        relationship: { kind: 'general_recall' },
        temporal: { role: 'none', value: null },
        authorizedScope: { sourceTypes: ['commitment'], ...overrides },
        evidenceRequirement: { relationship: 'general_recall', sourceTypes: ['commitment'] },
    },
});

async function removeFixtures() {
    await supabaseAdmin.from('commitment_proposal_responses').delete().eq('proposal_id', proposal);
    await supabaseAdmin.from('commitments').delete().in('id', [ownCommitment, assignedCommitment, proposalCommitment, archivedCommitment, outsiderCommitment, contactCommitment]);
    await supabaseAdmin.from('commitment_proposals').delete().eq('id', proposal);
    await supabaseAdmin.from('contacts').delete().eq('id', contact);
    await supabaseAdmin.from('conversations').delete().eq('id', conversation);
    for (const id of [owner, assignee, participant, outsider]) await supabaseAdmin.auth.admin.deleteUser(id);
}

async function insertOrThrow(table: string, row: Record<string, unknown>) {
    const { error } = await supabaseAdmin.from(table).insert(row);
    if (error) throw new Error(`${table}: ${error.message}`);
}

describe('Exact Commitment Count against local Supabase', () => {
    beforeAll(async () => {
        await removeFixtures();
        for (const [id, name] of [[owner, 'count-owner'], [assignee, 'count-assignee'], [participant, 'count-participant'], [outsider, 'count-outsider']]) {
            const { error } = await supabaseAdmin.auth.admin.createUser({ id, email: `${name}@example.invalid`, password: 'local-count-only-password', email_confirm: true });
            if (error) throw error;
        }
        await insertOrThrow('conversations', { id: conversation, conversation_type: 'group', name: 'count integration', created_by: owner });
        await insertOrThrow('contacts', { id: contact, owner_user_id: owner, display_name: 'Count contact' });
        await insertOrThrow('commitment_proposals', { id: proposal, proposed_by_user_id: owner, proposed_responsible_user_id: null, conversation_id: conversation, source_kind: 'manual', title: 'Count proposal', status: 'confirmed' });
        await insertOrThrow('commitment_proposal_responses', { proposal_id: proposal, participant_user_id: participant, status: 'approved' });
        const rows = [
            { id: ownCommitment, owner_user_id: owner, title: 'Alpha exact count', status: 'accepted', conversation_id: conversation },
            { id: assignedCommitment, owner_user_id: owner, assigned_to_user_id: assignee, title: 'Bravo assigned', status: 'accepted', conversation_id: conversation },
            { id: proposalCommitment, owner_user_id: owner, proposal_id: proposal, title: 'Charlie proposal', status: 'accepted', due_at: '2026-09-20T12:00:00Z' },
            { id: archivedCommitment, owner_user_id: owner, title: 'Archived excluded', status: 'accepted', archived_at: '2026-09-10T00:00:00Z' },
            { id: outsiderCommitment, owner_user_id: outsider, title: 'Outsider hidden', status: 'accepted' },
            { id: contactCommitment, owner_user_id: owner, counterparty_contact_id: contact, title: 'Delta contact', status: 'proposed' },
        ];
        for (const row of rows) await insertOrThrow('commitments', row);
    });

    afterAll(removeFixtures);

    it('counts the complete authorized universe, including proposal participation, excluding archived rows', async () => {
        const ownerResult = await executeExactCommitmentCount(query(owner));
        const participantResult = await executeExactCommitmentCount(query(participant));
        const outsiderResult = await executeExactCommitmentCount(query(outsider));
        expect(ownerResult).toMatchObject({ status: 'completed', completeness: 'complete', conclusion: 'count', count: { value: 4, universe: 'authorized_commitments' } });
        expect(participantResult).toMatchObject({ status: 'completed', completeness: 'complete', count: { value: 1 } });
        expect(outsiderResult).toMatchObject({ status: 'completed', completeness: 'complete', count: { value: 1, universe: 'authorized_commitments' } });
    });

    it('preserves conversation, person, contact, status, temporal and FTS filters without pagination', async () => {
        await expect(executeExactCommitmentCount(query(owner, { conversationId: conversation }))).resolves.toMatchObject({ count: { value: 2 } });
        await expect(executeExactCommitmentCount(query(assignee, { personId: assignee }))).resolves.toMatchObject({ count: { value: 1 } });
        await expect(executeExactCommitmentCount(query(owner, { contactId: contact }))).resolves.toMatchObject({ count: { value: 1 } });
        await expect(executeExactCommitmentCount(query(owner, { statuses: ['proposed'] }))).resolves.toMatchObject({ count: { value: 1 } });
        await expect(executeExactCommitmentCount(query(owner, { timeRange: { from: '2026-09-19T00:00:00Z', to: '2026-09-21T00:00:00Z' } }))).resolves.toMatchObject({ count: { value: 1 } });
        await expect(executeExactCommitmentCount(query(owner, { approvedTextQuery: 'Alpha' }))).resolves.toMatchObject({ count: { value: 1 } });
    });

    it('returns a real complete zero for an authorized empty scope and rejects unsupported constraints', async () => {
        await expect(executeExactCommitmentCount(query(outsider, { conversationId: 'a2000000-0000-4000-8000-000000000099' }))).resolves.toMatchObject({ status: 'completed', completeness: 'complete', count: { value: 0 } });
        await expect(executeExactCommitmentCount(query(owner, { sourceTypes: ['message'] }))).resolves.toMatchObject({ status: 'unsupported' });
    });

    it('returns failed rather than zero when PostgreSQL rejects the authorized actor predicate', async () => {
        await expect(executeExactCommitmentCount(query('not-a-uuid'))).resolves.toMatchObject({ status: 'failed', retryable: true });
    });
});
