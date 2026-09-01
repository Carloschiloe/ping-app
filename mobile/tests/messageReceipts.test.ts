import { describe, expect, it } from 'vitest';
import { needsDeliveryReceipt, needsReadReceipt } from '../src/utils/messageReceipts';

describe('per-participant message receipts', () => {
    it('self-chat no inventa receipt para el propio remitente', () => {
        const message = { sender_id: 'a', status: 'sent', viewer_receipt: null };
        expect(needsDeliveryReceipt(message, 'a')).toBe(false);
        expect(needsReadReceipt(message, 'a')).toBe(false);
    });

    it('usa el receipt del viewer y no el agregado global del grupo', () => {
        const message = {
            sender_id: 'a',
            status: 'sent',
            viewer_receipt: { delivered_at: '2026-08-30T00:00:00Z', read_at: null },
        };
        expect(needsDeliveryReceipt(message, 'c')).toBe(false);
        expect(needsReadReceipt(message, 'c')).toBe(true);
    });

    it('mantiene fallback legacy para payload Realtime sin joins', () => {
        expect(needsDeliveryReceipt({ sender_id: 'a', status: 'sent' }, 'b')).toBe(true);
        expect(needsReadReceipt({ sender_id: 'a', status: 'delivered' }, 'b')).toBe(true);
    });

    it('no produce receipts para tombstones ni mensajes de sistema', () => {
        expect(needsDeliveryReceipt({ sender_id: 'a', status: 'sent', deleted_at: 'now' }, 'b')).toBe(false);
        expect(needsReadReceipt({ sender_id: null, status: 'sent', metadata: { isSystem: true } }, 'b')).toBe(false);
    });
});
