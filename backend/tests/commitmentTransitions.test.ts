import { describe, it, expect } from 'vitest';
import {
    computeCommitmentTransition,
    COMMITMENT_TRANSITION_TABLE,
    CommitmentStateSnapshot,
} from '../src/utils/commitmentTransitions';

const OWNER = 'owner-1';
const ASSIGNEE = 'assignee-1';
const OTHER = 'stranger-1';
const CONTACT = 'contact-1';
const NOW = '2026-07-13T12:00:00.000Z';

function snapshot(overrides: Partial<CommitmentStateSnapshot> = {}): CommitmentStateSnapshot {
    return {
        id: 'c1',
        status: 'proposed',
        ownerUserId: OWNER,
        assignedToUserId: ASSIGNEE,
        counterpartyContactId: null,
        dueAt: '2026-07-20T15:00:00.000Z',
        proposedDueAt: null,
        ...overrides,
    };
}

describe('computeCommitmentTransition: accept', () => {
    it('el asignado acepta una propuesta: status -> accepted, limpia rejection_reason y waiting_on', () => {
        const result = computeCommitmentTransition({ action: 'accept', actorUserId: ASSIGNEE, commitment: snapshot(), now: NOW });
        expect(result.patch.status).toBe('accepted');
        expect(result.patch.assigned_to_user_id).toBe(ASSIGNEE);
        expect(result.patch.waiting_on_user_id).toBeNull();
        expect(result.patch.waiting_on_contact_id).toBeNull();
        expect(result.patch.rejection_reason).toBeNull();
        expect(result.event).toEqual({ event_type: 'accepted', previous_status: 'proposed', new_status: 'accepted', payload: { selfAssigned: false } });
    });

    it('un compromiso sin asignado (grupo) puede ser auto-asignado por quien acepta', () => {
        const result = computeCommitmentTransition({ action: 'accept', actorUserId: OTHER, commitment: snapshot({ assignedToUserId: null }), now: NOW });
        expect(result.patch.assigned_to_user_id).toBe(OTHER);
        expect(result.event.payload.selfAssigned).toBe(true);
    });

    it('un usuario que no es el asignado (y hay asignado) NO puede aceptar: lanza 403', () => {
        expect(() => computeCommitmentTransition({ action: 'accept', actorUserId: OTHER, commitment: snapshot(), now: NOW }))
            .toThrow('Only the assigned user');
    });

    it('no se puede aceptar un compromiso ya resuelto (estado invalido): lanza 409', () => {
        expect(() => computeCommitmentTransition({ action: 'accept', actorUserId: ASSIGNEE, commitment: snapshot({ status: 'resolved' }), now: NOW }))
            .toThrow(/status "resolved"/);
    });

    it('aceptar una contrapropuesta traslada proposed_due_at a due_at y limpia proposed_due_at', () => {
        const result = computeCommitmentTransition({
            action: 'accept',
            actorUserId: ASSIGNEE,
            commitment: snapshot({ status: 'counter_proposal', proposedDueAt: '2026-08-01T10:00:00.000Z' }),
            now: NOW,
        });
        expect(result.patch.due_at).toBe('2026-08-01T10:00:00.000Z');
        expect(result.patch.proposed_due_at).toBeNull();
    });
});

describe('computeCommitmentTransition: reject', () => {
    it('rechaza y escribe rejection_reason (columna real, no meta)', () => {
        const result = computeCommitmentTransition({ action: 'reject', actorUserId: ASSIGNEE, commitment: snapshot(), reason: 'No puedo esa fecha', now: NOW });
        expect(result.patch.status).toBe('rejected');
        expect(result.patch.rejection_reason).toBe('No puedo esa fecha');
        expect(result.event.event_type).toBe('rejected');
    });

    it('reject sin motivo explicito guarda rejection_reason null (no lanza)', () => {
        const result = computeCommitmentTransition({ action: 'reject', actorUserId: ASSIGNEE, commitment: snapshot(), now: NOW });
        expect(result.patch.rejection_reason).toBeNull();
    });

    it('un tercero ajeno no puede rechazar: lanza 403', () => {
        expect(() => computeCommitmentTransition({ action: 'reject', actorUserId: OTHER, commitment: snapshot(), now: NOW }))
            .toThrow('Only the assigned user');
    });
});

describe('computeCommitmentTransition: counter_propose', () => {
    it('requiere newProposedDueAt: sin fecha lanza error controlado', () => {
        expect(() => computeCommitmentTransition({ action: 'counter_propose', actorUserId: OWNER, commitment: snapshot(), now: NOW }))
            .toThrow('newProposedDueAt is required');
    });

    it('escribe proposed_due_at (no due_at) y deja status counter_proposal', () => {
        const result = computeCommitmentTransition({ action: 'counter_propose', actorUserId: OWNER, commitment: snapshot({ status: 'accepted' }), newProposedDueAt: '2026-09-01T10:00:00.000Z', now: NOW });
        expect(result.patch.status).toBe('counter_proposal');
        expect(result.patch.proposed_due_at).toBe('2026-09-01T10:00:00.000Z');
        expect(result.patch.due_at).toBeUndefined();
    });

    it('cuando el asignado contrapropone, waiting_on_user_id apunta al owner (la otra parte)', () => {
        const result = computeCommitmentTransition({ action: 'counter_propose', actorUserId: ASSIGNEE, commitment: snapshot({ status: 'accepted' }), newProposedDueAt: '2026-09-01T10:00:00.000Z', now: NOW });
        expect(result.patch.waiting_on_user_id).toBe(OWNER);
    });

    it('cuando el owner contrapropone, waiting_on_user_id apunta al asignado', () => {
        const result = computeCommitmentTransition({ action: 'counter_propose', actorUserId: OWNER, commitment: snapshot({ status: 'accepted' }), newProposedDueAt: '2026-09-01T10:00:00.000Z', now: NOW });
        expect(result.patch.waiting_on_user_id).toBe(ASSIGNEE);
    });

    it('no se puede contraproponer sobre un compromiso rechazado (estado invalido): lanza 409', () => {
        expect(() => computeCommitmentTransition({ action: 'counter_propose', actorUserId: OWNER, commitment: snapshot({ status: 'rejected' }), newProposedDueAt: '2026-09-01T10:00:00.000Z', now: NOW }))
            .toThrow(/status "rejected"/);
    });
});

describe('computeCommitmentTransition: action_complete', () => {
    it('marca action_completed_at SIN cambiar el status', () => {
        const result = computeCommitmentTransition({ action: 'action_complete', actorUserId: ASSIGNEE, commitment: snapshot({ status: 'accepted' }), now: NOW });
        expect(result.patch.action_completed_at).toBe(NOW);
        expect(result.patch.status).toBeUndefined();
        expect(result.event.previous_status).toBe('accepted');
        expect(result.event.new_status).toBe('accepted');
    });

    it('un tercero ajeno no puede marcar la accion como completada', () => {
        expect(() => computeCommitmentTransition({ action: 'action_complete', actorUserId: OTHER, commitment: snapshot({ status: 'accepted' }), now: NOW }))
            .toThrow('Only the owner or the assigned user');
    });
});

describe('computeCommitmentTransition: resolve', () => {
    it('marca resolved_at y status resolved, limpia waiting_on', () => {
        const result = computeCommitmentTransition({ action: 'resolve', actorUserId: OWNER, commitment: snapshot({ status: 'accepted', assignedToUserId: null }), now: NOW });
        expect(result.patch.status).toBe('resolved');
        expect(result.patch.resolved_at).toBe(NOW);
        expect(result.patch.waiting_on_user_id).toBeNull();
    });

    it('no se puede resolver un compromiso ya cancelado: lanza 409', () => {
        expect(() => computeCommitmentTransition({ action: 'resolve', actorUserId: OWNER, commitment: snapshot({ status: 'cancelled' }), now: NOW }))
            .toThrow(/status "cancelled"/);
    });
});

describe('computeCommitmentTransition: cancel', () => {
    it('solo el owner puede cancelar: el asignado recibe 403', () => {
        expect(() => computeCommitmentTransition({ action: 'cancel', actorUserId: ASSIGNEE, commitment: snapshot(), now: NOW }))
            .toThrow('Only the owner can cancel');
    });

    it('el owner cancela correctamente', () => {
        const result = computeCommitmentTransition({
            action: 'cancel',
            actorUserId: OWNER,
            commitment: snapshot(),
            reason: 'Se resolvió antes',
            now: NOW,
        });
        expect(result.patch.status).toBe('cancelled');
        expect(result.event.event_type).toBe('cancelled');
        expect(result.event.payload).toEqual({ reason: 'Se resolvió antes' });
        expect(result.patch).not.toHaveProperty('resolved_at');
    });

    it('cancelar sin motivo conserva evidencia explícita sin inventar una razón', () => {
        const result = computeCommitmentTransition({ action: 'cancel', actorUserId: OWNER, commitment: snapshot(), now: NOW });
        expect(result.event.payload).toEqual({ reason: null });
    });
});

describe('computeCommitmentTransition: reopen', () => {
    it('reabrir con asignado presente vuelve a accepted y limpia los 4 campos de cierre', () => {
        const result = computeCommitmentTransition({
            action: 'reopen', actorUserId: OWNER,
            commitment: snapshot({ status: 'resolved', proposedDueAt: '2026-08-01T00:00:00.000Z' }),
            now: NOW,
        });
        expect(result.patch.status).toBe('accepted');
        expect(result.patch.resolved_at).toBeNull();
        expect(result.patch.action_completed_at).toBeNull();
        expect(result.patch.rejection_reason).toBeNull();
        expect(result.patch.proposed_due_at).toBeNull();
    });

    it('reabrir sin asignado vuelve a proposed', () => {
        const result = computeCommitmentTransition({ action: 'reopen', actorUserId: OWNER, commitment: snapshot({ status: 'rejected', assignedToUserId: null }), now: NOW });
        expect(result.patch.status).toBe('proposed');
    });

    it('no se puede reabrir un compromiso que no esta en un estado terminal (proposed): lanza 409', () => {
        expect(() => computeCommitmentTransition({ action: 'reopen', actorUserId: OWNER, commitment: snapshot({ status: 'proposed' }), now: NOW }))
            .toThrow(/status "proposed"/);
    });
});

describe('computeCommitmentTransition: reassign', () => {
    it('solo el owner puede reasignar: el asignado recibe 403', () => {
        expect(() => computeCommitmentTransition({ action: 'reassign', actorUserId: ASSIGNEE, commitment: snapshot(), newAssignedToUserId: OTHER, now: NOW }))
            .toThrow('Only the owner can reassign');
    });

    it('reasignar un compromiso accepted a otra persona lo regresa a proposed (la nueva parte no ha confirmado)', () => {
        const result = computeCommitmentTransition({ action: 'reassign', actorUserId: OWNER, commitment: snapshot({ status: 'accepted' }), newAssignedToUserId: OTHER, now: NOW });
        expect(result.patch.status).toBe('proposed');
        expect(result.patch.assigned_to_user_id).toBe(OTHER);
        expect(result.patch.waiting_on_user_id).toBe(OTHER);
    });

    it('reasignar a la misma persona (sin cambio real) no altera el status', () => {
        const result = computeCommitmentTransition({ action: 'reassign', actorUserId: OWNER, commitment: snapshot({ status: 'accepted' }), newAssignedToUserId: ASSIGNEE, now: NOW });
        expect(result.patch.status).toBe('accepted');
    });

    it('no se puede reasignar a un usuario Y a un contacto externo simultaneamente', () => {
        expect(() => computeCommitmentTransition({ action: 'reassign', actorUserId: OWNER, commitment: snapshot(), newAssignedToUserId: OTHER, newCounterpartyContactId: CONTACT, now: NOW }))
            .toThrow('cannot be reassigned to both');
    });
});

describe('computeCommitmentTransition: schedule_follow_up', () => {
    it('programa follow_up_at y next_action sin cambiar el status', () => {
        const result = computeCommitmentTransition({
            action: 'schedule_follow_up', actorUserId: OWNER, commitment: snapshot({ status: 'accepted' }),
            followUpAt: '2026-07-25T09:00:00.000Z', nextAction: 'Llamar para confirmar', now: NOW,
        });
        expect(result.patch.follow_up_at).toBe('2026-07-25T09:00:00.000Z');
        expect(result.patch.next_action).toBe('Llamar para confirmar');
        expect(result.patch.status).toBeUndefined();
    });

    it('sin followUpAt lanza error controlado', () => {
        expect(() => computeCommitmentTransition({ action: 'schedule_follow_up', actorUserId: OWNER, commitment: snapshot({ status: 'accepted' }), now: NOW }))
            .toThrow('followUpAt is required');
    });

    it('waitingOnUserId y waitingOnContactId son mutuamente excluyentes', () => {
        expect(() => computeCommitmentTransition({
            action: 'schedule_follow_up', actorUserId: OWNER, commitment: snapshot({ status: 'accepted' }),
            followUpAt: '2026-07-25T09:00:00.000Z', waitingOnUserId: ASSIGNEE, waitingOnContactId: CONTACT, now: NOW,
        })).toThrow('mutually exclusive');
    });
});

describe('COMMITMENT_TRANSITION_TABLE', () => {
    const CANONICAL = ['proposed', 'accepted', 'counter_proposal', 'rejected', 'resolved', 'cancelled'];

    it('cada accion declara solo estados canonicos V2 como origen valido', () => {
        for (const action of Object.keys(COMMITMENT_TRANSITION_TABLE) as (keyof typeof COMMITMENT_TRANSITION_TABLE)[]) {
            for (const status of COMMITMENT_TRANSITION_TABLE[action].validFromStatuses) {
                expect(CANONICAL).toContain(status);
            }
        }
    });

    it('reopen es la unica accion que parte de un estado terminal (rejected/resolved/cancelled)', () => {
        expect(COMMITMENT_TRANSITION_TABLE.reopen.validFromStatuses.sort()).toEqual(['cancelled', 'rejected', 'resolved']);
    });
});
