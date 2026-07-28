import { describe, expect, it } from 'vitest';
import { classifySendFailure, createClientMessageId } from '../src/utils/synchronization';

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
});
