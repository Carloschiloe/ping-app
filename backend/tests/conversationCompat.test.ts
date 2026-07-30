import { describe, it, expect } from 'vitest';
import { toLegacyIsGroup, toLegacyIsSelf, toLegacyArchived } from '../src/utils/conversationCompat';

describe('toLegacyIsGroup', () => {
    it('conversation_type "group" se devuelve como is_group=true', () => {
        expect(toLegacyIsGroup('group')).toBe(true);
    });

    it('conversation_type "direct" se devuelve como is_group=false', () => {
        expect(toLegacyIsGroup('direct')).toBe(false);
    });

    it('valores nulos/indefinidos no se tratan como grupo', () => {
        expect(toLegacyIsGroup(null)).toBe(false);
        expect(toLegacyIsGroup(undefined)).toBe(false);
    });
});

describe('toLegacyArchived', () => {
    it('archived_at con timestamp se transforma en archived=true', () => {
        expect(toLegacyArchived('2026-07-13T10:00:00Z')).toBe(true);
    });

    it('archived_at null se transforma en archived=false', () => {
        expect(toLegacyArchived(null)).toBe(false);
    });

    it('archived_at undefined se transforma en archived=false', () => {
        expect(toLegacyArchived(undefined)).toBe(false);
    });
});

describe('toLegacyIsSelf', () => {
    it('identifica una conversación directa con un único participante', () => {
        expect(toLegacyIsSelf('direct', 1)).toBe(true);
    });

    it('no confunde un chat directo compartido ni un grupo con Para mí', () => {
        expect(toLegacyIsSelf('direct', 2)).toBe(false);
        expect(toLegacyIsSelf('group', 1)).toBe(false);
    });
});
