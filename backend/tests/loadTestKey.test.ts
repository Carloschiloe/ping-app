import { describe, expect, it } from 'vitest';
import { hasLoadTestKey } from '../src/middleware/loadTestKey';

const KEY = 'k'.repeat(40);
const req = (sent?: string) => ({ get: (name: string) => (name === 'x-load-test-key' ? sent : undefined) }) as any;

describe('temporary key for load tests', () => {
    it('only lets through the exact key, and only while one is set on the server', () => {
        expect(hasLoadTestKey(req(KEY), KEY)).toBe(true);
        expect(hasLoadTestKey(req(KEY + 'x'), KEY)).toBe(false);
        expect(hasLoadTestKey(req(undefined), KEY)).toBe(false);
        expect(hasLoadTestKey(req(KEY), undefined)).toBe(false);
        expect(hasLoadTestKey(req(''), '')).toBe(false);
    });

    it('ignores a key too short to be safe', () => {
        expect(hasLoadTestKey(req('short'), 'short')).toBe(false);
    });
});
