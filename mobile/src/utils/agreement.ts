export type AgreementResponseStatus =
    | 'pending'
    | 'approved'
    | 'rejected'
    | 'counter_proposed';

export interface AgreementResponse {
    participant_user_id: string;
    status: AgreementResponseStatus;
    proposed_due_at?: string | null;
    response_note?: string | null;
    participant?: {
        id?: string;
        full_name?: string | null;
        email?: string | null;
    } | null;
}

export interface InvolvedParticipant {
    id: string;
    name: string;
    status: AgreementResponseStatus | null;
    proposed_due_at?: string | null;
    hasRecordedResponse: boolean;
}

const RESPONSE_LABELS: Record<AgreementResponseStatus, string> = {
    pending: 'Pendiente',
    approved: 'Aprobado',
    rejected: 'Rechazado',
    counter_proposed: 'Sugirió otro horario',
};

export function getAgreementResponseLabel(status?: string | null): string {
    return RESPONSE_LABELS[status as AgreementResponseStatus] || 'Pendiente';
}

export function getAgreementParticipantName(response: AgreementResponse, currentUserId?: string | null): string {
    if (currentUserId && response.participant_user_id === currentUserId) return 'Tú';
    return response.participant?.full_name?.trim()
        || response.participant?.email?.split('@')[0]
        || 'Participante';
}

export function getInvolvedParticipants(
    responses: AgreementResponse[] = [],
    fallbackParticipants: any[] = [],
    currentUserId?: string | null,
): InvolvedParticipant[] {
    if (responses.length > 0) {
        return responses.map((response) => ({
            id: response.participant_user_id,
            name: getAgreementParticipantName(response, currentUserId),
            status: response.status,
            proposed_due_at: response.proposed_due_at,
            hasRecordedResponse: true,
        }));
    }

    const seen = new Set<string>();
    return fallbackParticipants.flatMap((participant) => {
        const rawProfile = Array.isArray(participant?.profiles)
            ? participant.profiles[0]
            : participant?.profiles || participant?.profile || participant;
        const id = participant?.user_id
            || participant?.participant_user_id
            || rawProfile?.id
            || participant?.id;

        if (!id || seen.has(id)) return [];
        seen.add(id);

        const name = currentUserId && id === currentUserId
            ? 'Tú'
            : rawProfile?.full_name?.trim()
                || rawProfile?.email?.split('@')[0]
                || 'Participante';

        return [{
            id,
            name,
            status: null,
            proposed_due_at: null,
            hasRecordedResponse: false,
        }];
    });
}

// M-1H v5 — CANONICAL PROPOSAL PARTICIPATION MODEL. Espejo exacto de
// backend/src/utils/proposalParticipation.ts#getProposalParticipationState
// (mismo modelo conceptual, shape de entrada distinto: aquí el objeto ya
// transformado por toAgreementView -- owner_user_id/assigned_to_user_id/
// agreement_responses -- en vez de una fila cruda de Postgres + join).
// Hallazgo real físico (caso "Entrenar"): Carlos (proposer + responsible)
// ya aprobó, Alejandra sigue pendiente -- ni CommitmentRow ni el modal de
// confirmación sabían responder "¿le corresponde a Carlos hacer algo aquí?"
// sin esta función, sólo miraban status==='proposed'.
export type ProposalActorRole = 'proposer' | 'responsible' | 'participant' | 'none';

export interface ProposalParticipationInput {
    owner_user_id?: string | null; // = proposed_by_user_id
    assigned_to_user_id?: string | null; // = proposed_responsible_user_id
    agreement_responses?: AgreementResponse[];
}

export interface ProposalParticipationState {
    actorRole: ProposalActorRole;
    actorHasApproved: boolean;
    actorCanRespond: boolean;
    pendingResponderIds: string[];
    approvedResponderIds: string[];
    rejectedResponderIds: string[];
    isFullyApproved: boolean;
    requiresMoreResponses: boolean;
}

export function getProposalParticipationState(
    proposal: ProposalParticipationInput,
    actorUserId: string | null | undefined,
): ProposalParticipationState {
    const responses = proposal.agreement_responses ?? [];
    const isSolo = responses.length === 0;

    const actorRole: ProposalActorRole = !actorUserId
        ? 'none'
        : proposal.owner_user_id === actorUserId
            ? 'proposer'
            : proposal.assigned_to_user_id === actorUserId
                ? 'responsible'
                : responses.some((r) => r.participant_user_id === actorUserId)
                    ? 'participant'
                    : 'none';

    if (isSolo) {
        // Proposal SOLO: el owner puede confirmarla en cualquier momento
        // (POST /commitment-proposals/:id/confirm sólo exige ser el owner,
        // nunca depende de agreement_responses).
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

// M-1H v5 — etiqueta canónica de "esperando a quién" para una proposal
// donde el actor no puede/no debe actuar (ya aprobó, o no le corresponde) --
// caso real "Entrenar": Carlos ve "Esperando a Alejandra", nunca "Vencido".
export function getProposalWaitingLabel(
    proposal: ProposalParticipationInput,
    actorUserId: string | null | undefined,
): string {
    const participation = getProposalParticipationState(proposal, actorUserId);
    const responses = proposal.agreement_responses ?? [];
    const pendingNames = responses
        .filter((r) => participation.pendingResponderIds.includes(r.participant_user_id))
        .map((r) => getAgreementParticipantName(r, actorUserId));
    if (pendingNames.length === 1) return `Esperando a ${pendingNames[0]}`;
    if (pendingNames.length > 1) return `Esperando ${pendingNames.length} respuestas`;
    return 'Esperando respuesta';
}

export function getAgreementSummary(responses: AgreementResponse[]): {
    approved: number;
    pending: number;
    rejected: number;
    counterProposed: number;
    total: number;
    label: string;
} {
    const summary = responses.reduce((acc, response) => {
        if (response.status === 'approved') acc.approved += 1;
        if (response.status === 'pending') acc.pending += 1;
        if (response.status === 'rejected') acc.rejected += 1;
        if (response.status === 'counter_proposed') acc.counterProposed += 1;
        return acc;
    }, {
        approved: 0,
        pending: 0,
        rejected: 0,
        counterProposed: 0,
    });

    const total = responses.length;
    let label = `Pendiente ${summary.approved + summary.counterProposed}/${total}`;
    if (summary.rejected > 0) label = 'Rechazado';
    else if (summary.counterProposed > 0 && summary.pending > 0) label = 'Nuevo horario';
    else if (total > 0 && summary.pending === 0) label = 'Aprobado';

    return { ...summary, total, label };
}
