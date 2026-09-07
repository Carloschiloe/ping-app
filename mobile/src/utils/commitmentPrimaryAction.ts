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
        // PARTICIPANT VISIBILITY + ACTOR PERMISSIONS — paridad real con
        // apply_commitment_transition_with_evidence (probado contra Postgres
        // local): esa RPC exige owner_user_id=actor O assigned_to_user_id=
        // actor de forma incondicional para CUALQUIER transición, sin
        // excepción cuando assigned_to_user_id es null. Antes de este fix,
        // esta función devolvía 'accept'/'complete' para CUALQUIER actor sin
        // mirar owner/assigned_to_user_id -- un "falso affordance" que
        // ofrecía un botón que el backend real siempre iba a rechazar con
        // 403 (ej. Alejandra, participante de la proposal de origen pero
        // nunca owner/assignee del commitment materializado). Ahora exige
        // exactamente lo mismo que el backend: nunca ofrece una acción que
        // vaya a fallar.
        const isOwnerOrAssignee = item.owner_user_id === actorUserId || item.assigned_to_user_id === actorUserId;
        if (status === 'proposed') return isOwnerOrAssignee ? 'accept' : 'waiting';
        if (status === 'accepted') return isOwnerOrAssignee ? 'complete' : 'waiting';
        return 'none';
    }

    // commitment_proposal: la acción depende de la participación real del
    // actor, nunca sólo del status derivado (regla principal del ticket).
    const participation = getProposalParticipationState(item, actorUserId);
    if (participation.actorCanRespond) return 'accept'; // Aceptar es la acción primaria; Proponer otra fecha/Rechazar viven en el detalle (sección 9/11)
    return 'waiting'; // ya aprobó, o no le corresponde responder -- nunca "Confirmar"/"Completar"
}

// PARTICIPANT VISIBILITY + ACTOR PERMISSIONS — CANONICAL cross-surface
// read-model (sección 3/7 del ticket): antes, InsightsScreen.tsx
// ("Pendientes") y TaskDashboardScreen.tsx ("Hoy") reimplementaban CADA UNO
// su propio filtro ad hoc de "¿es esto mío?", ambos basados SÓLO en
// owner_user_id/assigned_to_user_id -- el modelo de asignación única. Ese
// modelo nunca puede representar a un participante de una
// commitment_proposal compartida (su vínculo real vive en
// agreement_responses/actor_role, nunca en assigned_to_user_id) -- por eso
// Alejandra (participante con respuesta pendiente en "Entrenar"/"ver peli")
// desaparecía de Pendientes Y de la agenda de Hoy pese a que el backend SÍ
// la incluía en ambas listas. Esta es la ÚNICA función que decide "¿tengo
// un interés legítimo en ver esto en mi vista principal?", reutilizada tal
// cual por ambas pantallas -- nunca un segundo filter() divergente.
export function isActorRelevantCommitmentItem(
    item: CommitmentPrimaryActionInput & {
        owner_user_id?: string | null;
        assigned_to_user_id?: string | null;
        actor_role?: string | null;
    },
    actorUserId: string | null | undefined,
): boolean {
    if (item._isAgreementProposal === true) {
        // `actor_role` ya viene Core-resuelto desde el backend
        // (commitmentProposal.service.ts#toAgreementView, mismo contrato
        // canónico que ya usaba el Agent) -- se usa tal cual, nunca
        // re-derivado. Fallback (compat con datos en caché de antes de este
        // fix, o si el campo faltara por cualquier motivo): el MISMO cálculo
        // canónico que ya usa getCommitmentPrimaryAction arriba, nunca una
        // tercera heurística independiente.
        if (item.actor_role) return item.actor_role !== 'none';
        return getProposalParticipationState(item, actorUserId).actorRole !== 'none';
    }
    const isAssignedToMe = item.assigned_to_user_id === actorUserId || !item.assigned_to_user_id;
    const isDelegatedByMe = item.owner_user_id === actorUserId && item.assigned_to_user_id !== actorUserId;
    if (isAssignedToMe && !isDelegatedByMe) return true;

    // POST-MATERIALIZATION VISIBILITY (hallazgo real, probado contra
    // Postgres local): cuando una shared proposal se aprueba totalmente,
    // finalize_approved_commitment_proposal (SQL) crea el commitment
    // canónico con owner_user_id/assigned_to_user_id = proposer/responsible
    // ÚNICAMENTE -- un participante que sólo aprobó (ej. Alejandra en
    // "Entrenar", nunca owner ni assignee del commitment resultante) no
    // aparece en ninguno de esos dos campos. El backend YA resuelve su
    // visibilidad correctamente en GET /commitments (buildCommitmentVisibilityFilter
    // incluye `proposal_id.in.(participantProposalIds)`, ver
    // backend/src/utils/commitmentVisibility.ts) y YA adjunta
    // `agreement_responses` a TODO commitment con proposal_id
    // (attachAgreementResponses, llamado incondicionalmente por
    // getCommitments) -- exactamente el mismo shape que ya consume
    // getProposalParticipationState para las proposals. Sin este bridge, el
    // commitment materializado desaparecería de mobile para Alejandra pese a
    // que el backend SÍ se lo devuelve -- el mismo bug de fondo que
    // Compromisos/Hoy tenían para proposals pendientes, ahora para
    // commitments ya materializados. Nunca se re-deriva desde
    // commitment_proposal_responses en mobile (eso violaría "no volver a
    // consultar historial de respuestas por pantalla") -- se reutiliza el
    // campo que el backend ya adjunta.
    return getProposalParticipationState(item, actorUserId).actorRole === 'participant';
}
