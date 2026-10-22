import { describe, expect, it } from 'vitest';
import { TtlCache } from '../src/utils/ttlCache';

describe('TtlCache', () => {
    it('expires entries without extending their lifetime on reads', () => {
        let now = 1000;
        const cache = new TtlCache<string>(100, 4, () => now);

        cache.set('user-a', 'fresh');
        now = 1099;
        expect(cache.get('user-a')).toBe('fresh');
        now = 1100;
        expect(cache.get('user-a')).toBeUndefined();
    });

    it('evicts the least recently used entry when bounded', () => {
        let now = 1000;
        const cache = new TtlCache<string>(1000, 2, () => now);

        cache.set('a', 'A');
        now += 1;
        cache.set('b', 'B');
        now += 1;
        expect(cache.get('a')).toBe('A');
        now += 1;
        cache.set('c', 'C');

        expect(cache.get('a')).toBe('A');
        expect(cache.get('b')).toBeUndefined();
        expect(cache.get('c')).toBe('C');
    });

    it('keeps user-scoped keys independent', () => {
        const cache = new TtlCache<{ owner: string }>(1000);
        cache.set('user-a', { owner: 'a' });
        cache.set('user-b', { owner: 'b' });

        expect(cache.get('user-a')).toEqual({ owner: 'a' });
        expect(cache.get('user-b')).toEqual({ owner: 'b' });
    });
});
