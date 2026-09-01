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

    it('Realtime antes que HTTP conserva una sola confirmacion', () => {
        const realtime = {
            id: 'server-1', client_message_id: 'client-1', sender_id: 'user-1', text: 'Mensaje',
        };
        const http = { ...realtime, receipt_summary: { recipient_count: 1 } };
        const afterRealtime = reconcileConfirmedMessage([], realtime);
        const afterHttp = reconcileConfirmedMessage(afterRealtime, http);

        expect(afterHttp).toHaveLength(1);
        expect(afterHttp[0]).toEqual(http);
    });

    it('HTTP antes que Realtime conserva una sola confirmacion', () => {
        const optimistic = {
            id: 'temp-client-1', client_message_id: 'client-1', sender_id: 'user-1', text: 'Mensaje',
        };
        const http = {
            id: 'server-1', client_message_id: 'client-1', sender_id: 'user-1', text: 'Mensaje',
        };
        const afterHttp = reconcileConfirmedMessage([optimistic], http);
        const afterRealtime = reconcileConfirmedMessage(afterHttp, http);

        expect(afterRealtime).toEqual([http]);
    });
});
