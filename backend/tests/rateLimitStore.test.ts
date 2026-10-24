import { afterEach, describe, expect, it, vi } from 'vitest';
import { createRateLimitStore } from '../src/middleware/rateLimitStore';

describe('shared rate-limit store', () => {
    afterEach(() => {
        vi.unstubAllEnvs();
    });

    it('uses the process-local fallback when Redis is not configured', async () => {
        vi.stubEnv('PING_RATE_LIMIT_REDIS_URL', '');
        const store = createRateLimitStore('test-fallback');
        store.init({ windowMs: 60_000, limit: 2 } as any);

        const first = await store.increment('actor-1');
        const firstTotalHits = first.totalHits;
        const second = await store.increment('actor-1');

        expect(store.localKeys).toBe(true);
        expect(firstTotalHits).toBe(1);
        expect(second.totalHits).toBe(2);
        expect(second.resetTime).toBeInstanceOf(Date);
    });

    it('does not expose connection details in the store prefix', () => {
        vi.stubEnv('PING_RATE_LIMIT_REDIS_URL', '');
        const store = createRateLimitStore('test-redacted');
        expect(store.prefix).toBe('ping:test-redacted:');
        expect(JSON.stringify(store)).not.toContain('private.example');
    });
});
