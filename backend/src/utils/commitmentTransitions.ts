// Maquina de estados centralizada y PURA para el ciclo de vida de un
// commitment V2. Ningun controller/service debe decidir "que status sigue" ni
// "quien puede hacer esto" por su cuenta: todos pasan por
// computeCommitmentTransition() de este archivo. Al ser pura (sin I/O), es
// exhaustivamente testeable sin mocks de Supabase.
//
// El actor ya debe estar autorizado a VER/tocar el commitment antes de llamar
// aqui (ver assertCommitmentConversationParticipant en utils/authz.ts, que si
// hace I/O). Este modulo solo decide, dado ese actor y el estado actual de la
// fila, si la ACCION especifica es valida y que cambia.
import { AppError } from './AppError';
import { CanonicalCommitmentStatus } from './commitmentStatus';

export type CommitmentTransitionAction =
    | 'accept'
    | 'reject'
    | 'counter_propose'
    | 'action_complete'
    | 'resolve'
    | 'cancel'
    | 'reopen'
    | 'reassign'
    | 'schedule_follow_up';

// Debe coincidir exactamente con commitment_events_type_check en el baseline
// V2 (supabase/migrations/20260712000000_baseline_v2.sql).
export type CommitmentEventType =
    | 'created' | 'edited' | 'archived' | 'accepted' | 'rejected' | 'counter_proposed' | 'rescheduled'
    | 'action_completed' | 'resolved' | 'reopened' | 'cancelled'
    | 'follow_up_scheduled' | 'reassigned';

export interface CommitmentStateSnapshot {
    id: string;
    status: CanonicalCommitmentStatus;
    ownerUserId: string;
    assignedToUserId: string | null;
    counterpartyContactId: string | null;
    dueAt: string | null;
    proposedDueAt: string | null;
}

export interface CommitmentTransitionInput {
    action: CommitmentTransitionAction;
    actorUserId: string;
    commitment: CommitmentStateSnapshot;
    now?: string;
    // reject
    reason?: string | null;
    // counter_propose
    newProposedDueAt?: string | null;
    // reassign
    newAssignedToUserId?: string | null;
    newCounterpartyContactId?: string | null;
    // schedule_follow_up
    followUpAt?: string | null;
    nextAction?: string | null;
    waitingOnUserId?: string | null;
    waitingOnContactId?: string | null;
}

export interface CommitmentTransitionResult {
    patch: Record<string, any>;
    event: {
        event_type: CommitmentEventType;
        previous_status: CanonicalCommitmentStatus;
        new_status: CanonicalCommitmentStatus;
        payload: Record<string, any>;
    };
}

export const COMMITMENT_TRANSITION_TABLE: Record<CommitmentTransitionAction, {
    validFromStatuses: CanonicalCommitmentStatus[];
    eventType: CommitmentEventType;
    description: string;
}> = {
    accept: {
        validFromStatuses: ['proposed', 'counter_proposal'],
        eventType: 'accepted',
        description: 'El asignado (o cualquier participante si no hay asignado) acepta la propuesta.',
    },
    reject: {
        validFromStatuses: ['proposed', 'counter_proposal'],
        eventType: 'rejected',
        description: 'El asignado (o cualquier participante si no hay asignado) rechaza la propuesta.',
    },
    counter_propose: {
        validFromStatuses: ['proposed', 'accepted', 'counter_proposal'],
        eventType: 'counter_proposed',
        description: 'El owner o el asignado proponen una nueva fecha, pendiente de confirmacion.',
    },
    action_complete: {
        validFromStatuses: ['proposed', 'accepted', 'counter_proposal'],
        eventType: 'action_completed',
        description: 'Se marca que la accion ya se realizo. No cambia el status (independiente de resolve).',
    },
    resolve: {
        validFromStatuses: ['proposed', 'accepted', 'counter_proposal'],
        eventType: 'resolved',
        description: 'El owner o el asignado cierran el asunto como resuelto.',
    },
    cancel: {
        validFromStatuses: ['proposed', 'accepted', 'counter_proposal'],
        eventType: 'cancelled',
        description: 'Solo el owner puede cancelar el compromiso.',
    },
    reopen: {
        validFromStatuses: ['rejected', 'resolved', 'cancelled'],
        eventType: 'reopened',
        description: 'El owner o el asignado reabren un compromiso cerrado. Vuelve a accepted si tiene asignado, si no a proposed.',
    },
    reassign: {
        validFromStatuses: ['proposed', 'accepted', 'counter_proposal'],
        eventType: 'reassigned',
        description: 'Solo el owner puede reasignar la contraparte del compromiso.',
    },
    schedule_follow_up: {
        validFromStatuses: ['proposed', 'accepted', 'counter_proposal'],
        eventType: 'follow_up_scheduled',
        description: 'El owner o el asignado programan la proxima accion/seguimiento. No cambia el status.',
    },
};

function actorRole(commitment: CommitmentStateSnapshot, actorUserId: string): 'owner' | 'assignee' | null {
    if (commitment.ownerUserId === actorUserId) return 'owner';
    if (commitment.assignedToUserId === actorUserId) return 'assignee';
    return null;
}

function assertValidFromStatus(action: CommitmentTransitionAction, commitment: CommitmentStateSnapshot) {
    const rule = COMMITMENT_TRANSITION_TABLE[action];
    if (!rule.validFromStatuses.includes(commitment.status)) {
        throw new AppError(
            `Cannot perform "${action}" on a commitment with status "${commitment.status}"`,
            409
        );
    }
}

const nowIso = (input: CommitmentTransitionInput) => input.now || new Date().toISOString();

export function computeCommitmentTransition(input: CommitmentTransitionInput): CommitmentTransitionResult {
    switch (input.action) {
        case 'accept': return computeAccept(input);
        case 'reject': return computeReject(input);
        case 'counter_propose': return computeCounterPropose(input);
        case 'action_complete': return computeActionComplete(input);
        case 'resolve': return computeResolve(input);
        case 'cancel': return computeCancel(input);
        case 'reopen': return computeReopen(input);
        case 'reassign': return computeReassign(input);
        case 'schedule_follow_up': return computeScheduleFollowUp(input);
        default: {
            const exhaustive: never = input.action;
            throw new AppError(`Unknown commitment transition action: ${exhaustive}`, 400);
        }
    }
}

function computeAccept(input: CommitmentTransitionInput): CommitmentTransitionResult {
    const { commitment, actorUserId } = input;
    assertValidFromStatus('accept', commitment);

    const isAssigneeOrOpen = commitment.assignedToUserId === actorUserId || commitment.assignedToUserId === null;
    if (!isAssigneeOrOpen) {
        throw new AppError('Only the assigned user (or anyone, if unassigned) can accept this commitment', 403);
    }

    const patch: Record<string, any> = {
        status: 'accepted',
        assigned_to_user_id: actorUserId,
        waiting_on_user_id: null,
        waiting_on_contact_id: null,
        rejection_reason: null,
    };

    if (commitment.status === 'counter_proposal') {
        patch.due_at = commitment.proposedDueAt;
        patch.proposed_due_at = null;
    }

    return {
        patch,
        event: {
            event_type: 'accepted',
            previous_status: commitment.status,
            new_status: 'accepted',
            payload: { selfAssigned: commitment.assignedToUserId === null },
        },
    };
}

function computeReject(input: CommitmentTransitionInput): CommitmentTransitionResult {
    const { commitment, actorUserId, reason } = input;
    assertValidFromStatus('reject', commitment);

    const isAssigneeOrOpen = commitment.assignedToUserId === actorUserId || commitment.assignedToUserId === null;
    if (!isAssigneeOrOpen) {
        throw new AppError('Only the assigned user (or anyone, if unassigned) can reject this commitment', 403);
    }

    return {
        patch: {
            status: 'rejected',
            rejection_reason: reason ?? null,
            waiting_on_user_id: null,
            waiting_on_contact_id: null,
        },
        event: {
            event_type: 'rejected',
            previous_status: commitment.status,
            new_status: 'rejected',
            payload: { reason: reason ?? null },
        },
    };
}

function computeCounterPropose(input: CommitmentTransitionInput): CommitmentTransitionResult {
    const { commitment, actorUserId, newProposedDueAt } = input;
    assertValidFromStatus('counter_propose', commitment);

    if (!newProposedDueAt) {
        throw new AppError('newProposedDueAt is required to counter-propose', 400);
    }

    const role = actorRole(commitment, actorUserId);
    const isOpenParticipant = commitment.assignedToUserId === null;
    if (!role && !isOpenParticipant) {
        throw new AppError('Only the owner or the assigned user can counter-propose a new date', 403);
    }

    let waitingOnUserId: string | null = null;
    let waitingOnContactId: string | null = null;
    if (commitment.assignedToUserId) {
        waitingOnUserId = actorUserId === commitment.assignedToUserId ? commitment.ownerUserId : commitment.assignedToUserId;
    } else if (commitment.counterpartyContactId) {
        waitingOnContactId = commitment.counterpartyContactId;
    }

    return {
        patch: {
            status: 'counter_proposal',
            proposed_due_at: newProposedDueAt,
            waiting_on_user_id: waitingOnUserId,
            waiting_on_contact_id: waitingOnContactId,
        },
        event: {
            event_type: 'counter_proposed',
            previous_status: commitment.status,
            new_status: 'counter_proposal',
            payload: { proposedDueAt: newProposedDueAt, previousDueAt: commitment.dueAt },
        },
    };
}

function computeActionComplete(input: CommitmentTransitionInput): CommitmentTransitionResult {
    const { commitment, actorUserId } = input;
    assertValidFromStatus('action_complete', commitment);

    const role = actorRole(commitment, actorUserId);
    const isOpenParticipant = commitment.assignedToUserId === null;
    if (!role && !isOpenParticipant) {
        throw new AppError('Only the owner or the assigned user can mark the action as completed', 403);
    }

    return {
        patch: { action_completed_at: nowIso(input) },
        event: {
            event_type: 'action_completed',
            previous_status: commitment.status,
            new_status: commitment.status,
            payload: {},
        },
    };
}

function computeResolve(input: CommitmentTransitionInput): CommitmentTransitionResult {
    const { commitment, actorUserId } = input;
    assertValidFromStatus('resolve', commitment);

    const role = actorRole(commitment, actorUserId);
    const isOpenParticipant = commitment.assignedToUserId === null;
    if (!role && !isOpenParticipant) {
        throw new AppError('Only the owner or the assigned user can resolve this commitment', 403);
    }

    return {
        patch: {
            status: 'resolved',
            resolved_at: nowIso(input),
            waiting_on_user_id: null,
            waiting_on_contact_id: null,
        },
        event: {
            event_type: 'resolved',
            previous_status: commitment.status,
            new_status: 'resolved',
            payload: {},
        },
    };
}

function computeCancel(input: CommitmentTransitionInput): CommitmentTransitionResult {
    const { commitment, actorUserId } = input;
    assertValidFromStatus('cancel', commitment);

    if (actorRole(commitment, actorUserId) !== 'owner') {
        throw new AppError('Only the owner can cancel this commitment', 403);
    }

    const reason = input.reason?.trim() || null;

    return {
        patch: {
            status: 'cancelled',
            waiting_on_user_id: null,
            waiting_on_contact_id: null,
        },
        event: {
            event_type: 'cancelled',
            previous_status: commitment.status,
            new_status: 'cancelled',
            payload: { reason },
        },
    };
}

function computeReopen(input: CommitmentTransitionInput): CommitmentTransitionResult {
    const { commitment, actorUserId } = input;
    assertValidFromStatus('reopen', commitment);

    const role = actorRole(commitment, actorUserId);
    const isOpenParticipant = commitment.assignedToUserId === null;
    if (!role && !isOpenParticipant) {
        throw new AppError('Only the owner or the assigned user can reopen this commitment', 403);
    }

    // Decision de diseno (pura, sin consultar el historial de eventos): si el
    // compromiso tiene un asignado, reabrir vuelve a 'accepted' (ya habia
    // consentimiento, se retoma el trabajo). Si no tiene asignado, vuelve a
    // 'proposed' (requiere que alguien vuelva a tomarlo).
    const newStatus: CanonicalCommitmentStatus = commitment.assignedToUserId ? 'accepted' : 'proposed';

    return {
        patch: {
            status: newStatus,
            resolved_at: null,
            action_completed_at: null,
            rejection_reason: null,
            proposed_due_at: null,
        },
        event: {
            event_type: 'reopened',
            previous_status: commitment.status,
            new_status: newStatus,
            payload: { reopenedFromStatus: commitment.status },
        },
    };
}

function computeReassign(input: CommitmentTransitionInput): CommitmentTransitionResult {
    const { commitment, actorUserId, newAssignedToUserId, newCounterpartyContactId } = input;
    assertValidFromStatus('reassign', commitment);

    if (actorRole(commitment, actorUserId) !== 'owner') {
        throw new AppError('Only the owner can reassign this commitment', 403);
    }

    if (newAssignedToUserId && newCounterpartyContactId) {
        throw new AppError('A commitment cannot be reassigned to both a user and an external contact', 400);
    }

    const nextAssignedToUserId = newAssignedToUserId ?? null;
    const nextCounterpartyContactId = newCounterpartyContactId ?? null;
    const assigneeChanged = nextAssignedToUserId !== commitment.assignedToUserId
        || nextCounterpartyContactId !== commitment.counterpartyContactId;

    // Si ya estaba aceptado y la contraparte realmente cambia, la nueva
    // contraparte todavia no ha confirmado nada: vuelve a 'proposed'.
    const newStatus: CanonicalCommitmentStatus =
        commitment.status === 'accepted' && assigneeChanged ? 'proposed' : commitment.status;

    return {
        patch: {
            assigned_to_user_id: nextAssignedToUserId,
            counterparty_contact_id: nextCounterpartyContactId,
            status: newStatus,
            waiting_on_user_id: nextAssignedToUserId,
            waiting_on_contact_id: nextCounterpartyContactId,
        },
        event: {
            event_type: 'reassigned',
            previous_status: commitment.status,
            new_status: newStatus,
            payload: {
                previousAssignedToUserId: commitment.assignedToUserId,
                previousCounterpartyContactId: commitment.counterpartyContactId,
                newAssignedToUserId: nextAssignedToUserId,
                newCounterpartyContactId: nextCounterpartyContactId,
            },
        },
    };
}

function computeScheduleFollowUp(input: CommitmentTransitionInput): CommitmentTransitionResult {
    const { commitment, actorUserId, followUpAt, nextAction, waitingOnUserId, waitingOnContactId } = input;
    assertValidFromStatus('schedule_follow_up', commitment);

    const role = actorRole(commitment, actorUserId);
    const isOpenParticipant = commitment.assignedToUserId === null;
    if (!role && !isOpenParticipant) {
        throw new AppError('Only the owner or the assigned user can schedule a follow-up', 403);
    }

    if (!followUpAt) {
        throw new AppError('followUpAt is required to schedule a follow-up', 400);
    }

    if (waitingOnUserId && waitingOnContactId) {
        throw new AppError('waitingOnUserId and waitingOnContactId are mutually exclusive', 400);
    }

    const patch: Record<string, any> = { follow_up_at: followUpAt };
    if (nextAction !== undefined) patch.next_action = nextAction;
    if (waitingOnUserId !== undefined) patch.waiting_on_user_id = waitingOnUserId;
    if (waitingOnContactId !== undefined) patch.waiting_on_contact_id = waitingOnContactId;

    return {
        patch,
        event: {
            event_type: 'follow_up_scheduled',
            previous_status: commitment.status,
            new_status: commitment.status,
            payload: { followUpAt, nextAction: nextAction ?? null },
        },
    };
}
