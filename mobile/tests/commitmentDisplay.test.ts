import { describe, it, expect } from 'vitest';
import {
    getDisplayDueAt,
    getRejectionReason,
    isActionCompletedPendingResolution,
    getWaitingLabel,
    classifyDueDate,
    resolveConversationId,
    canViewOriginConversation,
    resolveContactName,
    getStatusLabel,
    getNonEmptyBlocks,
    OPEN_COMMITMENT_BLOCK_KEYS,
} from '../src/utils/commitmentDisplay';

describe('getDisplayDueAt', () => {
    it('counter_proposal muestra proposed_due_at en vez de due_at', () => {
        const result = getDisplayDueAt({ status: 'counter_proposal', due_at: '2026-01-01T10:00:00Z', proposed_due_at: '2026-01-05T10:00:00Z' });
        expect(result).toBe('2026-01-05T10:00:00Z');
    });

    it('en cualquier otro estado usa due_at', () => {
        const result = getDisplayDueAt({ status: 'accepted', due_at: '2026-01-01T10:00:00Z', proposed_due_at: '2026-01-05T10:00:00Z' });
        expect(result).toBe('2026-01-01T10:00:00Z');
    });
});

describe('getRejectionReason', () => {
    it('rejected muestra rejection_reason (columna real V2)', () => {
        expect(getRejectionReason({ rejection_reason: 'No alcanzo el presupuesto' })).toBe('No alcanzo el presupuesto');
    });

    it('cae a meta.rejection_reason solo si la columna real esta vacia (compatibilidad con datos legacy)', () => {
        expect(getRejectionReason({ meta: { rejection_reason: 'motivo legacy' } })).toBe('motivo legacy');
    });

    it('devuelve null cuando no hay motivo en ningun lado', () => {
        expect(getRejectionReason({})).toBeNull();
    });
});

describe('isActionCompletedPendingResolution', () => {
    it('action_completed_at sin resolved_at muestra "pendiente de confirmar resolucion"', () => {
        expect(isActionCompletedPendingResolution({ action_completed_at: '2026-01-01T10:00:00Z', resolved_at: null })).toBe(true);
    });

    it('con resolved_at ya no esta pendiente (el asunto quedo cerrado)', () => {
        expect(isActionCompletedPendingResolution({ action_completed_at: '2026-01-01T10:00:00Z', resolved_at: '2026-01-02T10:00:00Z' })).toBe(false);
    });

    it('sin action_completed_at nunca esta pendiente', () => {
        expect(isActionCompletedPendingResolution({ action_completed_at: null, resolved_at: null })).toBe(false);
    });
});

describe('getWaitingLabel', () => {
    it('waiting_on_user_id === usuario actual muestra "Te corresponde actuar"', () => {
        const label = getWaitingLabel({ waiting_on_user_id: 'u1' }, 'u1');
        expect(label).toBe('Te corresponde actuar');
    });

    it('waiting_on_user_id de otra persona muestra su nombre, no el UUID', () => {
        const label = getWaitingLabel(
            { owner_user_id: 'owner-uuid', assigned_to_user_id: null, waiting_on_user_id: 'owner-uuid', owner: { full_name: 'Carlos' } },
            'otro-usuario'
        );
        expect(label).toBe('Esperando respuesta de Carlos');
        expect(label).not.toContain('owner-uuid');
    });

    it('waiting_on_contact_id muestra el nombre del contacto externo, no el UUID', () => {
        const label = getWaitingLabel(
            { waiting_on_contact_id: 'contact-uuid' },
            'u1',
            [{ id: 'contact-uuid', display_name: 'Proveedor Externo' }]
        );
        expect(label).toBe('Esperando a Proveedor Externo');
        expect(label).not.toContain('contact-uuid');
    });

    it('sin waiting_on_user_id ni waiting_on_contact_id no hay nadie bloqueando (null, nunca status="waiting")', () => {
        expect(getWaitingLabel({}, 'u1')).toBeNull();
    });
});

describe('classifyDueDate', () => {
    const now = new Date('2026-06-15T12:00:00Z').getTime();

    it('sin fecha se clasifica como noDate', () => {
        expect(classifyDueDate({ due_at: null }, now)).toBe('noDate');
    });

    it('fecha pasada se clasifica como overdue', () => {
        expect(classifyDueDate({ due_at: '2026-06-01T00:00:00Z' }, now)).toBe('overdue');
    });

    it('fecha futura se clasifica como upcoming', () => {
        expect(classifyDueDate({ due_at: '2026-07-01T00:00:00Z' }, now)).toBe('upcoming');
    });
});

describe('resolveConversationId / canViewOriginConversation', () => {
    it('Realtime debe preferir conversation_id (columna real V2)', () => {
        expect(resolveConversationId({ conversation_id: 'conv-v2', group_conversation_id: 'conv-legacy' })).toBe('conv-v2');
    });

    it('group_conversation_id nunca es la fuente de verdad para filtrar: solo se usa si conversation_id esta ausente', () => {
        expect(resolveConversationId({ conversation_id: null, group_conversation_id: 'conv-legacy' })).toBe('conv-legacy');
        expect(resolveConversationId({})).toBeNull();
    });

    it('la navegacion al mensaje de origen se habilita con message_id + conversation_id', () => {
        expect(canViewOriginConversation({ message_id: 'm1', conversation_id: 'c1' })).toBe(true);
    });

    it('la navegacion se oculta sin message_id, incluso con conversacion', () => {
        expect(canViewOriginConversation({ conversation_id: 'c1' })).toBe(false);
    });

    it('la navegacion se oculta sin conversation_id, incluso con mensaje', () => {
        expect(canViewOriginConversation({ message_id: 'm1' })).toBe(false);
    });
});

describe('resolveContactName', () => {
    it('los contactos externos se muestran por nombre, nunca por UUID', () => {
        expect(resolveContactName('c1', [{ id: 'c1', display_name: 'Ferreteria Don Jose' }])).toBe('Ferreteria Don Jose');
    });

    it('sin contactId no hay nombre que resolver', () => {
        expect(resolveContactName(null, [])).toBeNull();
    });
});

describe('getStatusLabel', () => {
    it('mapea cada estado canonico V2 a su etiqueta en español', () => {
        expect(getStatusLabel('resolved')).toBe('Resuelto');
        expect(getStatusLabel('cancelled')).toBe('Cancelado');
        expect(getStatusLabel('rejected')).toBe('Rechazado');
        expect(getStatusLabel('counter_proposal')).toBe('Contrapropuesta');
    });
});

describe('getNonEmptyBlocks', () => {
    it('Insights nunca renderiza los alias de Operacion (myFocuses/inProgress), aunque traigan datos', () => {
        const insights = {
            needsAttention: [],
            overdue: [],
            awaitingResponse: [],
            upcoming: [{ id: '1' }],
            noDate: [],
            actionDonePendingResolution: [],
            // Alias legacy de Operacion: el backend los deja vacios a proposito,
            // pero incluso si trajeran datos, no deben aparecer como bloque.
            myFocuses: [{ id: 'x' }],
            inProgress: [{ id: 'y' }],
        };
        const nonEmpty = getNonEmptyBlocks(insights, OPEN_COMMITMENT_BLOCK_KEYS);
        expect(nonEmpty).toEqual(['upcoming']);
        expect(nonEmpty).not.toContain('myFocuses');
        expect(nonEmpty).not.toContain('inProgress');
    });

    it('un bloque vacio no se considera "no vacio"', () => {
        expect(getNonEmptyBlocks({ needsAttention: [] }, ['needsAttention'])).toEqual([]);
    });
});

describe('un commitment V2 completo se puede procesar sin excepciones', () => {
    it('ejercita todas las funciones de visualizacion sobre un commitment con todos los campos V2 poblados', () => {
        const fullCommitment = {
            id: 'c1',
            status: 'counter_proposal',
            owner_user_id: 'owner-1',
            assigned_to_user_id: null,
            counterparty_contact_id: 'contact-1',
            conversation_id: 'conv-1',
            message_id: 'msg-1',
            due_at: '2026-01-01T10:00:00Z',
            proposed_due_at: '2026-01-05T10:00:00Z',
            rejection_reason: null,
            action_completed_at: '2026-01-02T10:00:00Z',
            resolved_at: null,
            waiting_on_user_id: null,
            waiting_on_contact_id: 'contact-1',
            owner: { full_name: 'Carlos' },
            assignee: null,
            meta: {},
        };
        const contacts = [{ id: 'contact-1', display_name: 'Contacto de Prueba' }];

        expect(() => {
            getDisplayDueAt(fullCommitment);
            getRejectionReason(fullCommitment);
            isActionCompletedPendingResolution(fullCommitment);
            getWaitingLabel(fullCommitment, 'owner-1', contacts);
            classifyDueDate(fullCommitment);
            resolveConversationId(fullCommitment);
            canViewOriginConversation(fullCommitment);
            resolveContactName(fullCommitment.counterparty_contact_id, contacts);
            getStatusLabel(fullCommitment.status);
        }).not.toThrow();

        expect(getDisplayDueAt(fullCommitment)).toBe('2026-01-05T10:00:00Z');
        expect(isActionCompletedPendingResolution(fullCommitment)).toBe(true);
        expect(getWaitingLabel(fullCommitment, 'owner-1', contacts)).toBe('Esperando a Contacto de Prueba');
    });
});
