// M-1H v5 — CANONICAL PROPOSAL PARTICIPATION MODEL. Hallazgo real físico
// (caso "Entrenar"): Carlos (proposer + responsible) ya aprobó, Alejandra
// (participante requerida) sigue pendiente -- y tanto la UI como el Agent
// trataban esto como si fuera un commitment activo vencido, porque toda la
// lógica anterior sólo miraba `status==='proposed'`, nunca "¿quién soy yo en
// esta proposal y qué me corresponde hacer?". Esta es la única función
// canónica para responder esa pregunta, en backend -- ver
// mobile/src/utils/agreement.ts#getProposalParticipationState para el
// contrato espejo del lado mobile (mismo modelo conceptual, shapes de
// entrada distintos: aquí fila cruda de Postgres + join de responses; en
// mobile, el objeto ya transformado por toAgreementView).
export type ProposalActorRole = 'proposer' | 'responsible' | 'participant' | 'none';

export interface ProposalResponseRow {
    participant_user_id: string;
    status: 'pending' | 'approved' | 'rejected' | 'counter_proposed';
}

export interface ProposalParticipationInput {
    proposed_by_user_id: string;
    proposed_responsible_user_id: string | null;
    responses: ProposalResponseRow[]; // [] para una proposal SOLO (sin fila en commitment_proposal_responses)
}

export interface ProposalParticipationState {
    actorRole: ProposalActorRole;
    // Un actor "aprobó" si tiene una fila propia con status='approved'. Para
    // una proposal SOLO (sin filas de respuesta) esto es siempre false --
    // no hay concepto de "aprobación" individual registrada, sólo "puede
    // confirmarla" (ver actorCanRespond).
    actorHasApproved: boolean;
    // true si el actor tiene algo pendiente por hacer sobre esta proposal
    // ahora mismo: o su propia fila de respuesta está 'pending', o (proposal
    // SOLO, sin filas) el actor es el owner y puede confirmarla directamente
    // (RPC confirm_commitment_proposal, único guard: ser el owner).
    actorCanRespond: boolean;
    pendingResponderIds: string[]; // excluye al actor mismo
    approvedResponderIds: string[];
    rejectedResponderIds: string[];
    // true cuando YA NO falta ninguna aprobación real para materializar
    // (todas las filas de respuesta están 'approved', o no hay filas -- caso
    // SOLO, donde el owner puede confirmar sin depender de nadie más).
    isFullyApproved: boolean;
    requiresMoreResponses: boolean; // negación exacta de isFullyApproved, expuesta aparte por legibilidad en el caller
}

export function getProposalParticipationState(
    proposal: ProposalParticipationInput,
    actorUserId: string,
): ProposalParticipationState {
    const responses = proposal.responses ?? [];
    const isSolo = responses.length === 0;

    const actorRole: ProposalActorRole = proposal.proposed_by_user_id === actorUserId
        ? 'proposer'
        : proposal.proposed_responsible_user_id === actorUserId
            ? 'responsible'
            : responses.some((r) => r.participant_user_id === actorUserId)
                ? 'participant'
                : 'none';

    if (isSolo) {
        // Proposal SOLO: nunca hay "otros" pendientes -- el owner puede
        // confirmarla en cualquier momento (ver confirm_commitment_proposal,
        // que sólo exige ser el owner, nunca depende de
        // commitment_proposal_responses).
        return {
            actorRole,
            actorHasApproved: false,
            actorCanRespond: actorRole === 'proposer',
            pendingResponderIds: [],
            approvedResponderIds: [],
            rejectedResponderIds: [],
            isFullyApproved: true,
            requiresMoreResponses: false,
        };
    }

    const actorResponse = responses.find((r) => r.participant_user_id === actorUserId);
    const others = responses.filter((r) => r.participant_user_id !== actorUserId);

    const isFullyApproved = responses.every((r) => r.status === 'approved');

    return {
        actorRole,
        actorHasApproved: actorResponse?.status === 'approved',
        actorCanRespond: actorResponse?.status === 'pending',
        pendingResponderIds: others.filter((r) => r.status === 'pending').map((r) => r.participant_user_id),
        approvedResponderIds: responses.filter((r) => r.status === 'approved').map((r) => r.participant_user_id),
        rejectedResponderIds: responses.filter((r) => r.status === 'rejected').map((r) => r.participant_user_id),
        isFullyApproved,
        requiresMoreResponses: !isFullyApproved,
    };
}
