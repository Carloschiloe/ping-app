import { describe, expect, it } from 'vitest';
import {
    canDeleteMessages,
    isConfirmedMessageId,
    isForwardableMessage,
    orderMessagesForForward,
} from '../src/utils/messageActions';

describe('message actions', () => {
    it('only treats server messages as confirmed', () => {
        expect(isConfirmedMessageId('server-id')).toBe(true);
        expect(isConfirmedMessageId('temp-client-id')).toBe(false);
        expect(isConfirmedMessageId('offline-client-id')).toBe(false);
    });

    it('only permits deleting confirmed messages owned by the user', () => {
        expect(canDeleteMessages([{ id: 'm1', sender_id: 'u1' }], 'u1')).toBe(true);
        expect(canDeleteMessages([{ id: 'm1', sender_id: 'u2' }], 'u1')).toBe(false);
        expect(canDeleteMessages([{ id: 'temp-m1', sender_id: 'u1' }], 'u1')).toBe(false);
        expect(canDeleteMessages([
            { id: 'm1', sender_id: 'u1' },
            { id: 'm2', sender_id: 'u2' },
        ], 'u1')).toBe(false);
    });

    it('does not forward system or file-bearing messages as plain text', () => {
        expect(isForwardableMessage({ id: 'm1', text: 'Hola' })).toBe(true);
        expect(isForwardableMessage({ id: 'm2', text: 'Sistema', meta: { isSystem: true } })).toBe(false);
        expect(isForwardableMessage({ id: 'm3', text: '[imagen]private/path' })).toBe(false);
        expect(isForwardableMessage({ id: 'm4', text: '[document=archivo]private/path' })).toBe(false);
    });

    it('preserves chronological order when forwarding a block', () => {
        const ordered = orderMessagesForForward([
            { id: 'new', created_at: '2026-07-29T12:01:00Z' },
            { id: 'old', created_at: '2026-07-29T12:00:00Z' },
        ]);
        expect(ordered.map((message) => message.id)).toEqual(['old', 'new']);
    });
});
