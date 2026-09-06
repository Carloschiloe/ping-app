// M-1H v5 — CANONICAL PRIMARY ACTION DECISION. Hallazgo real físico (caso
// "Entrenar"): CommitmentRow.tsx decidía el botón primario mirando
// ÚNICAMENTE `status==='proposed'` -- eso ya demostró ser insuficiente: no
// distingue un commitment canónico proposto de una commitment_proposal
// donde el actor YA aprobó y sólo falta otra persona (Carlos no debería ver
// "Confirmar" en ese caso, nunca). Esta es la única función canónica que
// decide qué botón mostrar, en cualquier superficie (Mis Compromisos,
// Encargados, Hoy) -- nunca reimplementada ad-hoc por pantalla.
import { normalizeCommitmentStatus } from './commitmentStatus';
import { getProposalParticipationState, type ProposalParticipationInput } from './agreement';

export type CommitmentPrimaryAction = 'accept' | 'counter' | 'reject' | 'waiting' | 'complete' | 'none';

export interface CommitmentPrimaryActionInput extends ProposalParticipationInput {
    status?: string | null;
    _isAgreementProposal?: boolean;
}

export function getCommitmentPrimaryAction(
    item: CommitmentPrimaryActionInput,
    actorUserId: string | null | undefined,
): CommitmentPrimaryAction {
    const status = normalizeCommitmentStatus(item.status);
    if (['resolved', 'cancelled', 'rejected'].includes(status)) return 'none';

    if (item._isAgreementProposal !== true) {
        // Commitment canónico -- el lifecycle NUNCA depende de participación,
        // sólo de su propio status (counter_proposal aquí es un caso de
        // reprogramación de commitment ya activo, no de aprobación de
        // proposal -- sin acción primaria dedicada por ahora, igual que el
        // comportamiento previo a esta unificación).
        if (status === 'proposed') return 'accept';
        if (status === 'accepted') return 'complete';
        return 'none';
    }

    // commitment_proposal: la acción depende de la participación real del
    // actor, nunca sólo del status derivado (regla principal del ticket).
    const participation = getProposalParticipationState(item, actorUserId);
    if (participation.actorCanRespond) return 'accept'; // Aceptar es la acción primaria; Proponer otra fecha/Rechazar viven en el detalle (sección 9/11)
    return 'waiting'; // ya aprobó, o no le corresponde responder -- nunca "Confirmar"/"Completar"
}
