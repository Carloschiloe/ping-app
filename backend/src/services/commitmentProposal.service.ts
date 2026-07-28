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
    if (conversationId) {
        await assertConversationParticipant(userId, conversationId);
        if (sourceMessageId) await assertMessageInConversation(sourceMessageId, conversationId);
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
        || (sourceMessageId ? 'conversation_message' : 'manual');

    const { data: proposal, error } = await supabaseAdmin
        .from('commitment_proposals')
        .insert({
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
        })
        .select('*')
        .single();
    if (error) throw error;

    const { error: eventError } = await supabaseAdmin
        .from('commitment_proposal_events')
        .insert({
            proposal_id: proposal.id,
            actor_user_id: userId,
            event_type: 'proposed',
            payload: {
                source_kind: sourceKind,
                conversation_id: conversationId,
                source_message_id: sourceMessageId,
            },
        });
    if (eventError) throw eventError;
    return proposal;
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
    const now = new Date().toISOString();
    const { data, error } = await supabaseAdmin
        .from('commitment_proposals')
        .update({
            status: 'rejected',
            decision_by_user_id: userId,
            decision_at: now,
            rejection_reason: reason || null,
            updated_at: now,
        })
        .eq('id', proposalId)
        .eq('proposed_by_user_id', userId)
        .eq('status', 'pending')
        .select('*')
        .maybeSingle();
    if (error) throw error;
    if (!data) throw new AppError('Pending proposal not found', 404);

    const { error: eventError } = await supabaseAdmin
        .from('commitment_proposal_events')
        .insert({
            proposal_id: proposalId,
            actor_user_id: userId,
            event_type: 'rejected',
            payload: { reason: reason || null },
        });
    if (eventError) throw eventError;
    return data;
}

// POST /commitments is retained as a beta compatibility endpoint. Calling it
// is the user's explicit confirmation: Proposal is persisted first and only
// the database transaction below creates Commitment plus its first event.
export async function createConfirmedCommitment(userId: string, input: any) {
    const proposal = await createProposal(userId, input);
    return confirmProposal(userId, proposal.id);
}
