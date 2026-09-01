import { supabaseAdmin } from '../lib/supabaseAdmin';
import { AppError } from '../utils/AppError';
import {
    assertConversationParticipant,
    assertConversationParticipantReference,
    assertMessageInConversation,
    assertOwnContact,
} from '../utils/authz';
import { readLegacyAssignedToUserId, readLegacyConversationId, readLegacyDueAt } from '../utils/commitmentCompat';

export async function createProposal(userId: string, input: any) {
    const conversationId = readLegacyConversationId(input);
    const sourceMessageId = input.message_id || input.messageId || null;
    const requestedResponsibleUserId = readLegacyAssignedToUserId(input);
    const contactId = input.counterparty_contact_id || input.counterpartyContactId || null;
    const responsibleUserId = contactId ? null : (requestedResponsibleUserId || userId);

    if (requestedResponsibleUserId && contactId) {
        throw new AppError('A proposal cannot reference both a responsible user and an external contact', 400);
    }
    let sourceMessage: any = null;
    if (conversationId) {
        await assertConversationParticipant(userId, conversationId);
        if (sourceMessageId) {
            sourceMessage = await assertMessageInConversation(sourceMessageId, conversationId);
        }
        if (responsibleUserId && responsibleUserId !== userId) {
            await assertConversationParticipantReference(responsibleUserId, conversationId);
        }
    } else if (sourceMessageId) {
        throw new AppError('A source message requires its conversation context', 400);
    } else if (responsibleUserId && responsibleUserId !== userId) {
        throw new AppError('A related responsible person requires an authorized conversation', 400);
    }
    if (contactId) await assertOwnContact(userId, contactId);

    const sourceKind = input.source_kind
        || input.sourceKind
        || (sourceMessage?.metadata?.suggestedTask
            ? 'ai_suggestion'
            : sourceMessageId
                ? 'conversation_message'
                : 'manual');
    if (!['manual', 'conversation_message', 'ai_suggestion'].includes(sourceKind)) {
        throw new AppError('Invalid proposal source kind', 400);
    }

    const proposalPayload = {
            proposed_by_user_id: userId,
            proposed_responsible_user_id: contactId ? null : responsibleUserId,
            counterparty_contact_id: contactId,
            conversation_id: conversationId,
            source_message_id: sourceMessageId,
            source_kind: sourceKind,
            title: input.title,
            description: input.description || null,
            due_at: readLegacyDueAt(input),
            type: input.type || 'task',
            priority: input.priority || null,
            expected_result: input.expected_result || input.expectedResult || null,
            status: 'pending',
    };
    const { data: proposal, error } = await supabaseAdmin
        .rpc('create_commitment_proposal_with_evidence', {
            p_actor_user_id: userId,
            p_proposal: proposalPayload,
        });
    if (error) throw error;
    return proposal;
}

export async function createSharedProposal(userId: string, input: any) {
    const conversationId = readLegacyConversationId(input);
    if (!conversationId) {
        throw new AppError('A shared proposal requires a conversation', 400);
    }

    await assertConversationParticipant(userId, conversationId);
    const sourceMessageId = input.message_id || input.messageId || null;
    const sourceMessage = sourceMessageId
        ? await assertMessageInConversation(sourceMessageId, conversationId)
        : null;

    const requestedResponsibleUserId = readLegacyAssignedToUserId(input);
    const contactId = input.counterparty_contact_id || input.counterpartyContactId || null;
    if (requestedResponsibleUserId && contactId) {
        throw new AppError('A proposal cannot reference both a responsible user and an external contact', 400);
    }
    if (requestedResponsibleUserId && requestedResponsibleUserId !== userId) {
        await assertConversationParticipantReference(requestedResponsibleUserId, conversationId);
    }
    if (contactId) await assertOwnContact(userId, contactId);

    const sourceKind = input.source_kind
        || input.sourceKind
        || (sourceMessage?.metadata?.suggestedTask
            ? 'ai_suggestion'
            : sourceMessageId
                ? 'conversation_message'
                : 'manual');
    if (!['manual', 'conversation_message', 'ai_suggestion'].includes(sourceKind)) {
        throw new AppError('Invalid proposal source kind', 400);
    }
    const proposalPayload = {
        proposed_by_user_id: userId,
        proposed_responsible_user_id: contactId
            ? null
            : (requestedResponsibleUserId || userId),
        counterparty_contact_id: contactId,
        conversation_id: conversationId,
        source_message_id: sourceMessageId,
        source_kind: sourceKind,
        title: input.title,
        description: input.description || null,
        due_at: readLegacyDueAt(input),
        type: input.type || 'task',
        priority: input.priority || null,
        expected_result: input.expected_result || input.expectedResult || null,
        status: 'pending',
    };

    const { data, error } = await supabaseAdmin.rpc(
        'create_shared_commitment_proposal_with_responses',
        {
            p_actor_user_id: userId,
            p_proposal: proposalPayload,
        }
    );
    if (error) throw error;
    return data;
}

export async function respondToSharedProposal(
    userId: string,
    proposalId: string,
    decision: 'approve' | 'reject' | 'counter_propose',
    options: { reason?: string | null; proposedDueAt?: string | null } = {}
) {
    const { data, error } = await supabaseAdmin.rpc(
        'respond_to_commitment_proposal',
        {
            p_proposal_id: proposalId,
            p_actor_user_id: userId,
            p_decision: decision,
            p_reason: options.reason?.trim() || null,
            p_proposed_due_at: options.proposedDueAt || null,
        }
    );
    if (error) throw error;
    return data;
}

function toAgreementView(proposal: any, responses: any[]) {
    const isRejected = proposal.status === 'rejected';
    const isCounterProposal = proposal.status === 'pending'
        && !!proposal.latest_counterproposal_due_at;

    return {
        id: proposal.id,
        proposal_id: proposal.id,
        title: proposal.title,
        description: proposal.description,
        due_at: proposal.due_at,
        proposed_due_at: proposal.latest_counterproposal_due_at,
        status: isRejected
            ? 'rejected'
            : isCounterProposal
                ? 'counter_proposal'
                : 'proposed',
        type: proposal.type,
        priority: proposal.priority,
        expected_result: proposal.expected_result,
        owner_user_id: proposal.proposed_by_user_id,
        assigned_to_user_id: proposal.proposed_responsible_user_id,
        counterparty_contact_id: proposal.counterparty_contact_id,
        conversation_id: proposal.conversation_id,
        message_id: proposal.source_message_id,
        rejection_reason: proposal.rejection_reason,
        agreement_version: proposal.agreement_version,
        latest_counterproposal_by_user_id: proposal.latest_counterproposal_by_user_id,
        latest_counterproposal_due_at: proposal.latest_counterproposal_due_at,
        created_at: proposal.created_at,
        updated_at: proposal.updated_at,
        owner: proposal.proposer,
        assignee: proposal.responsible,
        agreement_responses: responses.map((response) => ({
            ...response,
            participant: response.profile || null,
            profile: undefined,
        })),
        _isAgreementProposal: true,
    };
}

export async function getAgreementProposals(
    userId: string,
    conversationId?: string
) {
    if (conversationId) {
        await assertConversationParticipant(userId, conversationId);
    }

    let visibleProposalIds: string[] = [];
    if (!conversationId) {
        const { data: responseRows, error: responseError } = await supabaseAdmin
            .from('commitment_proposal_responses')
            .select('proposal_id')
            .eq('participant_user_id', userId);
        if (responseError) throw responseError;
        visibleProposalIds = Array.from(new Set(
            (responseRows || []).map((row: any) => row.proposal_id)
        ));
    }

    let query = supabaseAdmin
        .from('commitment_proposals')
        .select(`
            *,
            proposer:proposed_by_user_id(id, full_name, email, avatar_url),
            responsible:proposed_responsible_user_id(id, full_name, email, avatar_url)
        `)
        .neq('status', 'confirmed');

    if (conversationId) {
        query = query.eq('conversation_id', conversationId);
    } else if (visibleProposalIds.length > 0) {
        query = query.or(
            `proposed_by_user_id.eq.${userId},id.in.(${visibleProposalIds.join(',')})`
        );
    } else {
        query = query.eq('proposed_by_user_id', userId);
    }

    const { data: proposals, error } = await query.order('created_at', { ascending: false });
    if (error) throw error;
    if (!proposals?.length) return [];

    const proposalIds = proposals.map((proposal: any) => proposal.id);
    const { data: responses, error: responsesError } = await supabaseAdmin
        .from('commitment_proposal_responses')
        .select(`
            proposal_id,
            participant_user_id,
            agreement_version,
            status,
            proposed_due_at,
            response_note,
            responded_at,
            profile:participant_user_id(id, full_name, email, avatar_url)
        `)
        .in('proposal_id', proposalIds);
    if (responsesError) throw responsesError;

    const responsesByProposal = new Map<string, any[]>();
    for (const response of responses || []) {
        const list = responsesByProposal.get(response.proposal_id) || [];
        list.push(response);
        responsesByProposal.set(response.proposal_id, list);
    }

    return proposals.map((proposal: any) => toAgreementView(
        proposal,
        responsesByProposal.get(proposal.id) || []
    ));
}

export async function attachAgreementResponses<T extends Record<string, any>>(
    commitments: T[]
): Promise<T[]> {
    const proposalIds = commitments
        .map((commitment) => commitment.proposal_id)
        .filter(Boolean);
    if (proposalIds.length === 0) return commitments;

    const { data: responses, error } = await supabaseAdmin
        .from('commitment_proposal_responses')
        .select(`
            proposal_id,
            participant_user_id,
            agreement_version,
            status,
            proposed_due_at,
            response_note,
            responded_at,
            profile:participant_user_id(id, full_name, email, avatar_url)
        `)
        .in('proposal_id', proposalIds);
    if (error) throw error;

    const responsesByProposal = new Map<string, any[]>();
    for (const response of responses || []) {
        const list = responsesByProposal.get(response.proposal_id) || [];
        list.push(response);
        responsesByProposal.set(response.proposal_id, list);
    }

    return commitments.map((commitment) => ({
        ...commitment,
        agreement_responses: (responsesByProposal.get(commitment.proposal_id) || []).map((response) => ({
            ...response,
            participant: response.profile || null,
            profile: undefined,
        })),
    }));
}

export async function confirmProposal(userId: string, proposalId: string) {
    const { data, error } = await supabaseAdmin.rpc('confirm_commitment_proposal', {
        p_proposal_id: proposalId,
        p_actor_user_id: userId,
    });
    if (error) throw error;
    return data;
}

export async function rejectProposal(userId: string, proposalId: string, reason?: string | null) {
    const { data, error } = await supabaseAdmin
        .rpc('reject_commitment_proposal_with_evidence', {
            p_proposal_id: proposalId,
            p_actor_user_id: userId,
            p_reason: reason || null,
        });
    if (error) throw error;
    if (!data) throw new AppError('Pending proposal not found', 404);
    return data;
}

// POST /commitments is retained as a beta compatibility endpoint. Calling it
// is the user's explicit confirmation: Proposal is persisted first and only
// the database transaction below creates Commitment plus its first event.
export async function createConfirmedCommitment(userId: string, input: any) {
    const proposal = await createProposal(userId, input);
    return confirmProposal(userId, proposal.id);
}
