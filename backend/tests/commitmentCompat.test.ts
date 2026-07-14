import { describe, it, expect } from 'vitest';
import {
    toLegacyCommitmentShape,
    toLegacyCommitmentListShape,
    readLegacyConversationId,
    readLegacyAssignedToUserId,
    readLegacyDueAt,
} from '../src/utils/commitmentCompat';

describe('toLegacyCommitmentShape', () => {
    it('expone group_conversation_id como alias de conversation_id (columna real)', () => {
        const shaped = toLegacyCommitmentShape({ id: 'c1', conversation_id: 'conv-1' });
        expect(shaped.group_conversation_id).toBe('conv-1');
        expect(shaped.conversation_id).toBe('conv-1');
    });

    it('deriva is_group_task=true cuando hay conversation_id y no hay assigned_to_user_id', () => {
        const shaped = toLegacyCommitmentShape({ id: 'c1', conversation_id: 'conv-1', assigned_to_user_id: null });
        expect(shaped.is_group_task).toBe(true);
    });

    it('deriva is_group_task=false cuando hay un assigned_to_user_id especifico', () => {
        const shaped = toLegacyCommitmentShape({ id: 'c1', conversation_id: 'conv-1', assigned_to_user_id: 'u1' });
        expect(shaped.is_group_task).toBe(false);
    });

    it('expone completed=true (alias booleano) cuando resolved_at esta presente, sin tocar status', () => {
        const shaped = toLegacyCommitmentShape({ id: 'c1', status: 'resolved', resolved_at: '2026-07-01T00:00:00.000Z' });
        expect(shaped.completed).toBe(true);
        expect(shaped.status).toBe('resolved');
    });

    it('completed=false cuando resolved_at es null', () => {
        const shaped = toLegacyCommitmentShape({ id: 'c1', status: 'accepted', resolved_at: null });
        expect(shaped.completed).toBe(false);
    });

    it('devuelve null/undefined sin lanzar cuando la fila es null/undefined', () => {
        expect(toLegacyCommitmentShape(null)).toBeNull();
        expect(toLegacyCommitmentShape(undefined)).toBeUndefined();
    });

    it('toLegacyCommitmentListShape aplica el alias a cada fila de una lista', () => {
        const shaped = toLegacyCommitmentListShape([{ id: 'a', conversation_id: 'x' }, { id: 'b', conversation_id: 'y' }]);
        expect(shaped.map((r) => r.group_conversation_id)).toEqual(['x', 'y']);
    });
});

describe('alias de entrada (legacy -> V2)', () => {
    it('readLegacyConversationId prioriza conversation_id sobre group_conversation_id', () => {
        expect(readLegacyConversationId({ conversation_id: 'a', group_conversation_id: 'b' })).toBe('a');
    });

    it('readLegacyConversationId acepta group_conversation_id (mobile) cuando no hay conversation_id', () => {
        expect(readLegacyConversationId({ group_conversation_id: 'b' })).toBe('b');
    });

    it('readLegacyConversationId acepta groupConversationId (camelCase)', () => {
        expect(readLegacyConversationId({ groupConversationId: 'c' })).toBe('c');
    });

    it('readLegacyAssignedToUserId acepta camelCase assignedToUserId (flujo de sugerencias de IA)', () => {
        expect(readLegacyAssignedToUserId({ assignedToUserId: 'u9' })).toBe('u9');
    });

    it('readLegacyDueAt acepta camelCase dueAt', () => {
        expect(readLegacyDueAt({ dueAt: '2026-07-20T00:00:00.000Z' })).toBe('2026-07-20T00:00:00.000Z');
    });

    it('sin ningun alias presente, todos devuelven null', () => {
        expect(readLegacyConversationId({})).toBeNull();
        expect(readLegacyAssignedToUserId({})).toBeNull();
        expect(readLegacyDueAt({})).toBeNull();
    });
});
