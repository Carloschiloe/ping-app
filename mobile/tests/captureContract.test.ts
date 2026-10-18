import { describe, expect, it } from 'vitest';
import { buildCaptureMetadata, buildCaptureRequest } from '../src/types/capture';

describe('shared capture contract', () => {
    it('normalizes text and creates a retry-safe id for quick capture', () => {
        const request = buildCaptureRequest('  Llamar a María mañana  ', 'quick_capture', '2026-10-18T12:00:00.000Z');

        expect(request.text).toBe('Llamar a María mañana');
        expect(request.clientMessageId).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
        expect(request.meta).toEqual({
            capture: {
                source: 'quick_capture',
                capturedAt: '2026-10-18T12:00:00.000Z',
                initiatedBy: 'user_action',
            },
        });
    });

    it('keeps the originating surface explicit for conversation messages', () => {
        expect(buildCaptureMetadata('conversation', '2026-10-18T12:00:00.000Z')).toEqual({
            capture: {
                source: 'conversation',
                capturedAt: '2026-10-18T12:00:00.000Z',
                initiatedBy: 'user_action',
            },
        });
    });

    it('rejects empty captures before they reach the network', () => {
        expect(() => buildCaptureRequest('   ', 'quick_capture')).toThrow('capture_text_required');
    });
});
