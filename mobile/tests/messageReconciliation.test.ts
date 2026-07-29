import { describe, expect, it } from 'vitest';
import {
    hasConfirmedClientMessage,
    reconcileConfirmedMessage,
} from '../src/utils/messageReconciliation';

describe('message reconciliation', () => {
    it('reemplaza el mensaje optimista por el confirmado usando client_message_id', () => {
        const optimistic = {
            id: 'temp-client-1',
            client_message_id: 'client-1',
            sender_id: 'user-1',
            text: 'Mensaje',
            status: 'sending',
        };
        const confirmed = {
            id: 'server-1',
            client_message_id: 'client-1',
            sender_id: 'user-1',
            text: 'Mensaje',
            status: 'sent',
        };

        expect(reconcileConfirmedMessage([optimistic], confirmed)).toEqual([confirmed]);
    });

    it('elimina representaciones duplicadas de la misma intención confirmada', () => {
        const confirmed = {
            id: 'server-1',
            client_message_id: 'client-1',
            sender_id: 'user-1',
            text: 'Mensaje',
        };
        const duplicate = {
            id: 'temp-client-1',
            client_message_id: 'client-1',
            sender_id: 'user-1',
            text: 'Mensaje',
        };

        expect(reconcileConfirmedMessage([confirmed, duplicate], confirmed)).toEqual([confirmed]);
    });

    it('oculta la cola local cuando el servidor ya confirmó el mismo mensaje', () => {
        expect(hasConfirmedClientMessage([
            { id: 'server-1', client_message_id: 'client-1' },
        ], 'client-1')).toBe(true);
    });
});
