import { describe, it, expect } from 'vitest';
import { resolveMessageContent, resolveMessageMetadata, isMessageFromUser, resolveReactionEmoji } from '../src/utils/messageCompat';

describe('isMessageFromUser', () => {
    it('sender_id identifica al autor del mensaje', () => {
        expect(isMessageFromUser({ sender_id: 'u1' }, 'u1')).toBe(true);
        expect(isMessageFromUser({ sender_id: 'u2' }, 'u1')).toBe(false);
    });

    it('devuelve false sin userId (nunca asume autoria)', () => {
        expect(isMessageFromUser({ sender_id: 'u1' }, null)).toBe(false);
    });
});

describe('resolveReactionEmoji', () => {
    it('uses the V2 reaction column', () => {
        expect(resolveReactionEmoji({ reaction: '👍' })).toBe('👍');
    });

    it('keeps compatibility with the legacy emoji column', () => {
        expect(resolveReactionEmoji({ emoji: '❤️' })).toBe('❤️');
    });

    it('does not render invalid reactions as undefined', () => {
        expect(resolveReactionEmoji({})).toBeNull();
    });
});

describe('resolveMessageContent', () => {
    it('usa content antes que text cuando ambos estan presentes', () => {
        expect(resolveMessageContent({ content: 'hola V2', text: 'hola V1' })).toBe('hola V2');
    });

    it('cae a text si content no esta presente (compatibilidad con el alias del backend)', () => {
        expect(resolveMessageContent({ text: 'solo legacy' })).toBe('solo legacy');
    });
});

describe('resolveMessageMetadata', () => {
    it('usa metadata antes que meta cuando ambos estan presentes', () => {
        expect(resolveMessageMetadata({ metadata: { isSystem: true }, meta: { isSystem: false } })).toEqual({ isSystem: true });
    });

    it('cae a meta si metadata no esta presente', () => {
        expect(resolveMessageMetadata({ meta: { isSystem: true } })).toEqual({ isSystem: true });
    });
});
