import { describe, expect, it } from 'vitest';
import {
    classifySendFailure,
    createClientMessageId,
    OFFLINE_QUEUE_MAX_ITEMS,
    sanitizePendingQueue,
    serializePendingQueue,
} from '../src/utils/synchronization';

describe('basic message synchronization', () => {
    it('creates stable UUID-shaped client identities suitable for idempotency', () => {
        const first = createClientMessageId();
        const second = createClientMessageId();
        expect(first).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
        expect(second).not.toBe(first);
    });

    it('treats definitive client errors as rejected, not pending success', () => {
        expect(classifySendFailure(403, 'Sin autorización')).toEqual({
            state: 'rejected',
            error: 'Sin autorización',
        });
    });

    it('treats network and retryable responses as result unknown', () => {
        expect(classifySendFailure(null, 'Network request failed').state).toBe('result_unknown');
        expect(classifySendFailure(408, 'Timeout').state).toBe('result_unknown');
        expect(classifySendFailure(429, 'Retry later').state).toBe('result_unknown');
    });

    it('persists only the minimum fields and excludes transient credentials', () => {
        const now = Date.parse('2026-07-28T12:00:00.000Z');
        const safe = {
            id: 'offline-1',
            conversationId: 'conversation-1',
            userId: 'must-not-persist',
            text: 'Mensaje pendiente',
            meta: { accessToken: 'must-not-persist' },
            mediaUri: 'file:///private/path',
            retryCount: 0,
            createdAt: new Date(now).toISOString(),
            clientMessageId: createClientMessageId(),
            state: 'pending',
        };
        const signedUrl = {
            ...safe,
            id: 'offline-2',
            text: 'https://example.test/file?token=temporary-secret',
        };

        const serialized = serializePendingQueue([safe, signedUrl], now);
        const parsed = JSON.parse(serialized);
        expect(parsed).toHaveLength(1);
        expect(parsed[0]).not.toHaveProperty('userId');
        expect(parsed[0]).not.toHaveProperty('meta');
        expect(parsed[0]).not.toHaveProperty('mediaUri');
        expect(serialized).not.toContain('must-not-persist');
        expect(serialized).not.toContain('temporary-secret');
    });

    it('removes expired entries and enforces the item retention limit', () => {
        const now = Date.parse('2026-07-28T12:00:00.000Z');
        const items = Array.from({ length: OFFLINE_QUEUE_MAX_ITEMS + 5 }, (_, index) => ({
            id: `offline-${index}`,
            conversationId: 'conversation-1',
            text: `message-${index}`,
            retryCount: 0,
            createdAt: index === 0
                ? '2026-07-01T12:00:00.000Z'
                : new Date(now).toISOString(),
            clientMessageId: createClientMessageId(),
            state: 'pending',
        }));

        const sanitized = sanitizePendingQueue(items, now);
        expect(sanitized).toHaveLength(OFFLINE_QUEUE_MAX_ITEMS);
        expect(sanitized.some((item) => item.id === 'offline-0')).toBe(false);
    });

    it('conserva durationMs del audio en la cola offline', () => {
        const now = Date.parse('2026-09-01T12:00:00.000Z');
        const serialized = serializePendingQueue([{
            id: 'offline-audio',
            conversationId: 'conversation-1',
            text: 'Audio',
            retryCount: 0,
            createdAt: new Date(now).toISOString(),
            clientMessageId: createClientMessageId(),
            state: 'pending',
            attachment: {
                attachmentId: '88888888-8888-4888-8888-888888888888',
                mimeType: 'audio/m4a',
                fileName: 'voice.m4a',
                durationMs: 4200,
            },
        }], now);

        expect(JSON.parse(serialized)[0].attachment.durationMs).toBe(4200);
    });

    it('persiste attachmentId offline sin credenciales ni object path', () => {
        const now = Date.parse('2026-08-31T12:00:00.000Z');
        const serialized = serializePendingQueue([{
            id: 'offline-attachment',
            conversationId: 'conversation-1',
            text: 'Documento',
            retryCount: 0,
            createdAt: new Date(now).toISOString(),
            clientMessageId: createClientMessageId(),
            state: 'pending',
            attachment: {
                attachmentId: '66666666-6666-4666-8666-666666666666',
                mimeType: 'application/pdf',
                fileName: 'evidence.pdf',
                signedUrl: 'must-not-persist',
                token: 'must-not-persist',
                objectPath: 'must-not-persist',
            },
        }], now);

        const parsed = JSON.parse(serialized);
        expect(parsed[0].attachment).toEqual({
            attachmentId: '66666666-6666-4666-8666-666666666666',
            mimeType: 'application/pdf',
            fileName: 'evidence.pdf',
        });
        expect(serialized).not.toContain('must-not-persist');
    });
});
