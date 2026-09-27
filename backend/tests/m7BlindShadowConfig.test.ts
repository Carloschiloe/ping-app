import { describe, expect, it } from 'vitest';
import { getBlindMaxCompletionTokens } from '../certification/m7-blind-shadow-config';

describe('M-7 blind shadow runner configuration', () => {
    it('defaults an unset budget to 1024', () => {
        expect(getBlindMaxCompletionTokens({})).toBe(1024);
    });

    it('accepts the explicit frozen budget', () => {
        expect(getBlindMaxCompletionTokens({ M7_BLIND_MAX_COMPLETION_TOKENS: '1024' })).toBe(1024);
    });

    it('fails explicitly for an invalid budget', () => {
        expect(() => getBlindMaxCompletionTokens({ M7_BLIND_MAX_COMPLETION_TOKENS: 'not-a-number' }))
            .toThrow('M7_BLIND_MAX_COMPLETION_TOKENS must be an integer');
    });
});
