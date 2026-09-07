// COMMITMENT UX + ACTOR-AWARE SUGGESTIONS — canonical presentation helpers
// (sección 19 del ticket). Chat/Hoy/Compromisos must NEVER derive actor
// labels independently — every screen calls getProposalActorPresentation /
// getCommitmentActorPresentation, which compose the ALREADY-canonical
// participation/lifecycle functions (getProposalParticipationState,
// getAgreementParticipantName, getCommitmentPrimaryAction) — never a fourth
// independent heuristic. These helpers decide COPY only (sección 20): they
// never invent permission — allowedActions/primaryAction always come from
// the existing canonical functions, never re-derived here.
import {
    getProposalParticipationState,
    getAgreementParticipantName,
    getProposalWaitingLabel,
    type ProposalParticipationInput,
    type AgreementResponse,
} from './agreement';
import { getCommitmentPrimaryAction, type CommitmentPrimaryActionInput, type CommitmentPrimaryAction } from './commitmentPrimaryAction';
import { normalizeCommitmentStatus } from './commitmentStatus';
import { isProposalDatePassed, getWaitingLabel, type WaitingLabelInput } from './commitmentDisplay';

export interface ActorPresentation {
    // "Carlos propone" | "Tú propusiste" | "Responsable: Carlos" | "Asignado por Carlos" | "Con Carlos"
    relationLabel: string;
    // "Necesita tu respuesta" | "Esperando a Alejandra" | "Completado" | "Cancelado" | "Rechazado" | null (nada que decir)
    statusLabel: string | null;
    // true sólo cuando la fecha PROPUESTA (de una proposal aún pendiente) ya pasó -- nunca para un commitment canónico (eso es "vencido", un concepto distinto ya resuelto por overdueSemantics.ts en otro lugar).
    proposalDatePassed: boolean;
    // Reutiliza la MISMA decisión canónica que ya usan las filas -- nunca una segunda heurística de permisos.
    primaryAction: CommitmentPrimaryAction;
    // true cuando el actor no tiene ninguna acción de escritura real disponible (mero participante/viewer) -- sólo afecta cómo se presenta, nunca qué se permite.
    isViewOnly: boolean;
}

function firstName(fullName: string | null | undefined): string | null {
    const trimmed = fullName?.trim();
    if (!trimmed) return null;
    return trimmed.split(' ')[0];
}

function resolveDisplayName(
    userId: string | null | undefined,
    actorUserId: string | null | undefined,
    responses: AgreementResponse[],
    fallbackName?: string | null,
): string {
    if (!userId) return fallbackName || 'Alguien';
    if (userId === actorUserId) return 'Tú';
    const response = responses.find((r) => r.participant_user_id === userId);
    if (response) return firstName(getAgreementParticipantName(response, actorUserId)) || 'Alguien';
    return firstName(fallbackName) || 'Alguien';
}

// ─── PROPOSAL (pending, entityType==='commitment_proposal') ────────────────
export interface ProposalPresentationInput extends ProposalParticipationInput, CommitmentPrimaryActionInput {
    status?: string | null;
    due_at?: string | null;
    proposer_name?: string | null;   // nombre completo ya resuelto por el backend (toAgreementView), si está disponible
    responsible_name?: string | null;
}

export function getProposalActorPresentation(
    proposal: ProposalPresentationInput,
    actorUserId: string | null | undefined,
): ActorPresentation {
    const participation = getProposalParticipationState(proposal, actorUserId);
    const responses = proposal.agreement_responses ?? [];
    const proposerName = resolveDisplayName(proposal.owner_user_id, actorUserId, responses, proposal.proposer_name);
    const primaryAction = getCommitmentPrimaryAction({ ...proposal, _isAgreementProposal: true }, actorUserId);
    const proposalDatePassed = isProposalDatePassed(proposal.due_at ?? null);

    let relationLabel: string;
    switch (participation.actorRole) {
        case 'proposer':
            relationLabel = 'Tú propusiste';
            break;
        case 'responsible':
            relationLabel = proposal.owner_user_id === actorUserId ? 'Tú propusiste' : `${proposerName} te asignó`;
            break;
        case 'participant':
            relationLabel = `${proposerName} propone`;
            break;
        default:
            relationLabel = `Con ${proposerName}`;
    }

    let statusLabel: string | null;
    if (participation.actorCanRespond) {
        // Sección 11: nunca el genérico "Esperando respuesta" cuando el
        // Core sabe que es EL ACTOR quien debe responder.
        statusLabel = 'Necesita tu respuesta';
    } else if (participation.actorRole === 'proposer' || participation.actorRole === 'responsible') {
        // Reutiliza LITERALMENTE getProposalWaitingLabel (agreement.ts) --
        // nunca reimplementa la resolución de "a quién esperar" aquí (eso
        // sería exactamente la "cuarta heurística independiente" que la
        // sección 19 del ticket prohíbe).
        statusLabel = participation.pendingResponderIds.length === 0 && participation.isFullyApproved
            ? null
            : getProposalWaitingLabel(proposal, actorUserId);
    } else if (participation.actorHasApproved) {
        statusLabel = 'Ya respondiste';
    } else {
        statusLabel = 'Pendiente de respuesta';
    }

    return {
        relationLabel,
        statusLabel,
        proposalDatePassed,
        primaryAction,
        isViewOnly: primaryAction === 'waiting' || primaryAction === 'none',
    };
}

// ─── CANONICAL COMMITMENT (materialized, entityType==='commitment') ────────
export interface CommitmentPresentationInput extends CommitmentPrimaryActionInput, WaitingLabelInput {
    status?: string | null;
    owner_user_id?: string | null;
    assigned_to_user_id?: string | null;
    // Mismo shape real ya usado por CommitmentRow.tsx/TodayItemRow.tsx (join
    // owner:owner_user_id(...)/assignee:assigned_to_user_id(...)) -- nunca
    // un campo plano inventado que cada caller tendría que computar aparte.
    owner?: { full_name?: string | null } | null;
    assignee?: { full_name?: string | null } | null;
}

export function getCommitmentActorPresentation(
    commitment: CommitmentPresentationInput,
    actorUserId: string | null | undefined,
): ActorPresentation {
    const status = normalizeCommitmentStatus(commitment.status);
    const isOwner = commitment.owner_user_id === actorUserId;
    const isAssignee = commitment.assigned_to_user_id === actorUserId;
    const isDelegatedByMe = isOwner && commitment.assigned_to_user_id && !isAssignee;
    const ownerName = firstName(commitment.owner?.full_name) || 'Alguien';
    const assigneeName = firstName(commitment.assignee?.full_name) || 'Alguien';
    const primaryAction = getCommitmentPrimaryAction({ ...commitment, _isAgreementProposal: false }, actorUserId);

    let relationLabel: string;
    if (isDelegatedByMe) {
        relationLabel = `Encargado a ${assigneeName}`;
    } else if (isAssignee && !isOwner) {
        relationLabel = `Asignado por ${ownerName}`;
    } else if (isOwner && isAssignee) {
        relationLabel = 'Tuyo';
    } else {
        // Sección 12: ex-participante de la proposal original, ahora sólo
        // viendo el commitment canónico ya materializado -- relación neutral,
        // nunca lenguaje de "esperando respuesta de proposal" (eso ya no
        // aplica, la proposal terminó).
        relationLabel = `Responsable: ${assigneeName}`;
    }

    // Estado real de "esperando" para un commitment YA canónico (nunca el
    // mismo mecanismo que una proposal pendiente -- ver waiting_on_user_id,
    // columna real que sólo existe post-materialización, ej. tras un
    // counter_propose sobre un commitment ya activo). Reutiliza la función
    // canónica ya existente (commitmentDisplay.ts#getWaitingLabel), nunca
    // reimplementada aquí.
    const canonicalWaitingLabel = getWaitingLabel(commitment, actorUserId);

    let statusLabel: string | null;
    if (status === 'resolved') statusLabel = 'Completado';
    else if (status === 'cancelled') statusLabel = 'Cancelado';
    else if (status === 'rejected') statusLabel = 'Rechazado';
    else if (canonicalWaitingLabel) {
        statusLabel = canonicalWaitingLabel;
    } else if (isOwner || isAssignee) {
        // Sección 12: para quien realmente puede actuar y nadie más bloquea
        // el avance, ningún "esperando respuesta" fantasma -- el badge de
        // acción primaria ya comunica el siguiente paso (Confirmar/Completar).
        statusLabel = null;
    } else {
        // Ex-participante view-only: estado neutral, entendible, NUNCA una
        // proposal-waiting-badge reciclada (sección 12 explícito).
        statusLabel = 'Compromiso confirmado';
    }

    return {
        relationLabel,
        statusLabel,
        proposalDatePassed: false, // un commitment canónico nunca reutiliza semántica de "fecha propuesta" -- eso es "vencido" (overdueSemantics.ts), un concepto ya resuelto en otro lugar.
        primaryAction,
        isViewOnly: !isOwner && !isAssignee,
    };
}

// ─── Entry point único: decide cuál de las dos funciones de arriba aplica,
// nunca reimplementado por pantalla (sección 19). ────────────────────────
export function getActorPresentation(
    item: (ProposalPresentationInput | CommitmentPresentationInput) & { _isAgreementProposal?: boolean },
    actorUserId: string | null | undefined,
): ActorPresentation {
    if (item._isAgreementProposal === true) {
        return getProposalActorPresentation(item as ProposalPresentationInput, actorUserId);
    }
    return getCommitmentActorPresentation(item as CommitmentPresentationInput, actorUserId);
}
