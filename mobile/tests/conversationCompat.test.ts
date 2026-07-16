import { describe, it, expect } from 'vitest';
import { deriveIsGroup, deriveIsDirect } from '../src/utils/conversationCompat';

describe('deriveIsGroup', () => {
    it('interpreta conversation_type="group" correctamente', () => {
        expect(deriveIsGroup({ conversation_type: 'group' })).toBe(true);
    });

    it('interpreta conversation_type="direct" correctamente', () => {
        expect(deriveIsGroup({ conversation_type: 'direct' })).toBe(false);
    });

    it('usa isGroup como fallback cuando no hay conversation_type (shape actual del API)', () => {
        expect(deriveIsGroup({ isGroup: true })).toBe(true);
        expect(deriveIsGroup({ isGroup: false })).toBe(false);
    });
});

describe('deriveIsDirect', () => {
    it('es el inverso exacto de deriveIsGroup', () => {
        expect(deriveIsDirect({ conversation_type: 'direct' })).toBe(true);
        expect(deriveIsDirect({ conversation_type: 'group' })).toBe(false);
    });
});
