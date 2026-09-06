// M-1H v2 — hallazgo real a nivel de RPC (no sólo de ruta HTTP): un
// commitment_proposal puede ser SOLO (creado vía POST /commitment-proposals,
// nunca tiene fila en commitment_proposal_responses) o COMPARTIDO (creado
// vía POST /commitment-proposals/shared, con una fila de respuesta por
// participante). El RPC respond_to_commitment_proposal EXIGE esa fila
// ("Actor is not required for this agreement", 403 si no existe) -- usarlo
// para una proposal solo sólo cambia el error de 404 a 403, nunca la
// confirma. El RPC correcto para una proposal solo es
// confirm_commitment_proposal (POST /commitment-proposals/:id/confirm), que
// sólo exige ser el owner de la proposal. Ver
// supabase/migrations/20260730123000_shared_commitment_agreements.sql
// (respond_to_commitment_proposal / confirm_commitment_proposal /
// finalize_approved_commitment_proposal).
//
// El discriminador real y suficiente: agreement_responses sólo existe (no
// vacío) para proposals compartidas -- lo llena
// create_shared_commitment_proposal_with_responses al crearlas; una
// proposal solo nunca tiene esas filas. La visibilidad ya garantiza que, si
// el actor puede ver una proposal compartida, es porque tiene una fila de
// respuesta propia entre agreement_responses (ver
// commitmentVisibility.ts#buildCommitmentProposalVisibilityFilter).
export type CommitmentConfirmAction =
    | { type: 'acceptCommitment'; id: string }
    | { type: 'respondToProposal'; id: string }
    | { type: 'confirmProposal'; id: string };

export function resolveCommitmentConfirmAction(commitment: any): CommitmentConfirmAction {
    const id = commitment?.id ?? commitment;
    if (commitment?._isAgreementProposal) {
        const isShared = Array.isArray(commitment.agreement_responses) && commitment.agreement_responses.length > 0;
        return isShared ? { type: 'respondToProposal', id } : { type: 'confirmProposal', id };
    }
    return { type: 'acceptCommitment', id };
}
