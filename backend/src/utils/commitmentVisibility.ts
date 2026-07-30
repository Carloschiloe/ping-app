import { supabaseAdmin } from '../lib/supabaseAdmin';

export async function getParticipantProposalIds(userId: string): Promise<string[]> {
    const { data, error } = await supabaseAdmin
        .from('commitment_proposal_responses')
        .select('proposal_id')
        .eq('participant_user_id', userId);

    if (error) throw error;
    return Array.from(new Set(
        (data || [])
            .map((row: any) => row.proposal_id)
            .filter(Boolean)
    ));
}

export function buildCommitmentVisibilityFilter(
    userId: string,
    participantProposalIds: string[],
    unassignedConversationIds: string[] = []
) {
    const filters = [
        `owner_user_id.eq.${userId}`,
        `assigned_to_user_id.eq.${userId}`,
    ];

    if (participantProposalIds.length > 0) {
        filters.push(`proposal_id.in.(${participantProposalIds.join(',')})`);
    }
    if (unassignedConversationIds.length > 0) {
        filters.push(
            `and(assigned_to_user_id.is.null,conversation_id.in.(${unassignedConversationIds.join(',')}))`
        );
    }

    return filters.join(',');
}
