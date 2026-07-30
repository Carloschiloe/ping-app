import { describe, it, expect } from 'vitest';
import { deriveIsGroup, deriveIsDirect, deriveIsSelf } from '../src/utils/conversationCompat';

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

describe('deriveIsSelf', () => {
    it('respeta la marca explícita enviada por el backend', () => {
        expect(deriveIsSelf({ isSelf: true, isGroup: false })).toBe(true);
        expect(deriveIsSelf({ isSelf: false, isGroup: false })).toBe(false);
    });

    it('mantiene compatibilidad con un chat directo sin contraparte', () => {
        expect(deriveIsSelf({ isGroup: false, otherUser: null })).toBe(true);
        expect(deriveIsSelf({ isGroup: false, otherUser: { id: 'u2' } })).toBe(false);
    });
});
