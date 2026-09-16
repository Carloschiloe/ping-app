import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { supabaseAdmin } from '../src/lib/supabaseAdmin';
import { agentReadV4OrchestrationService } from '../src/services/agentReadV4Orchestration.service';
import type { NormalizedSemanticTurnV4 } from '../src/types/agentTurnCommit';

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

const semanticCount = {
    version: 4, kind: 'read_request', domain: 'commitment', objectiveCompleteness: 'complete', lifecycleCommand: 'none', lifecycleTarget: 'unspecified', lifecycleEvidence: 'unknown', pendingSlotAnswer: 'not_a_slot_answer', continuationLike: 'unknown', candidateSlotType: null, independentObjective: 'yes', objectiveType: 'lookup', entityHints: [], slots: {}, ambiguityFields: [], confidence: .9, source: 'deterministic',
    readMeaning: { queryShape: 'count', explicitCollection: false, targetShape: 'none', relationship: { kind: 'general_recall' }, temporalRole: 'none' },
} as unknown as NormalizedSemanticTurnV4;

const query = (actorUserId: string, overrides: Record<string, unknown> = {}) => ({
    actorUserId,
    queryKey: `integration-count-${actorUserId}-${Object.keys(overrides).join('-') || 'all'}`,
    authorizedScope: { sourceTypes: ['commitment'], ...overrides },
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
        const ownerResult = await agentReadV4OrchestrationService.execute({ ...query(owner), semanticTurn: semanticCount, person: null, temporal: { status: 'not_applicable' } });
        const participantResult = await agentReadV4OrchestrationService.execute({ ...query(participant), semanticTurn: semanticCount, person: null, temporal: { status: 'not_applicable' } });
        const outsiderResult = await agentReadV4OrchestrationService.execute({ ...query(outsider), semanticTurn: semanticCount, person: null, temporal: { status: 'not_applicable' } });
        expect(ownerResult).toMatchObject({ status: 'executed', result: { status: 'completed', completeness: 'complete', conclusion: 'count', count: { value: 4, universe: 'authorized_commitments' } } });
        expect(participantResult).toMatchObject({ status: 'executed', result: { status: 'completed', completeness: 'complete', count: { value: 1 } } });
        expect(outsiderResult).toMatchObject({ status: 'executed', result: { status: 'completed', completeness: 'complete', count: { value: 1, universe: 'authorized_commitments' } } });
    });

    it('preserves conversation, person, contact, status, temporal and FTS filters without pagination', async () => {
        const count = (actorUserId: string, overrides: Record<string, unknown> = {}) => agentReadV4OrchestrationService.execute({ ...query(actorUserId, overrides), semanticTurn: semanticCount, person: null, temporal: { status: 'not_applicable' } });
        await expect(count(owner, { conversationId: conversation })).resolves.toMatchObject({ result: { count: { value: 2 } } });
        await expect(count(assignee, { personId: assignee })).resolves.toMatchObject({ result: { count: { value: 1 } } });
        await expect(count(owner, { contactId: contact })).resolves.toMatchObject({ result: { count: { value: 1 } } });
        await expect(count(owner, { statuses: ['proposed'] })).resolves.toMatchObject({ result: { count: { value: 1 } } });
        await expect(count(owner, { timeRange: { from: '2026-09-19T00:00:00Z', to: '2026-09-21T00:00:00Z' } })).resolves.toMatchObject({ result: { count: { value: 1 } } });
        await expect(count(owner, { approvedTextQuery: 'Alpha' })).resolves.toMatchObject({ result: { count: { value: 1 } } });
    });

    it('returns a real complete zero for an authorized empty scope and rejects unsupported constraints', async () => {
        await expect(agentReadV4OrchestrationService.execute({ ...query(outsider, { conversationId: 'a2000000-0000-4000-8000-000000000099' }), semanticTurn: semanticCount, person: null, temporal: { status: 'not_applicable' } })).resolves.toMatchObject({ result: { status: 'completed', completeness: 'complete', count: { value: 0 } } });
        await expect(agentReadV4OrchestrationService.execute({ ...query(owner, { sourceTypes: ['message'] }), semanticTurn: semanticCount, person: null, temporal: { status: 'not_applicable' } })).resolves.toMatchObject({ result: { status: 'unsupported' } });
    });

    it('returns failed rather than zero when PostgreSQL rejects the authorized actor predicate', async () => {
        await expect(agentReadV4OrchestrationService.execute({ ...query('not-a-uuid'), semanticTurn: semanticCount, person: null, temporal: { status: 'not_applicable' } })).resolves.toMatchObject({ result: { status: 'failed', retryable: true } });
    });
});
