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
