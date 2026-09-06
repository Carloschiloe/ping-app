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

// M-1H — extraído de commitmentProposal.service.ts#getAgreementProposals
// (que tenía esta misma lógica inline, duplicada) para que el Agent
// (retrieval.service.ts#retrieveCommitmentProposals) pueda reutilizar
// EXACTAMENTE el mismo criterio de autorización, en vez de reimplementarlo
// una tercera vez. Un actor ve una commitment_proposal si: la propuso él
// mismo, O es un participante con una respuesta registrada en
// commitment_proposal_responses (proposals compartidas). Nunca amplía la
// visibilidad — sólo la tabla objetivo cambia (commitment_proposals, no
// commitments), la RLS/columna owner_user_id de referencia es
// proposed_by_user_id aquí.
export function buildCommitmentProposalVisibilityFilter(
    userId: string,
    participantProposalIds: string[],
): string {
    const filters = [`proposed_by_user_id.eq.${userId}`];
    if (participantProposalIds.length > 0) {
        filters.push(`id.in.(${participantProposalIds.join(',')})`);
    }
    return filters.join(',');
}
