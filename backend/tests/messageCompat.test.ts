import { describe, it, expect } from 'vitest';
import { toLegacyMessageShape, toLegacyMessageListShape } from '../src/utils/messageCompat';

describe('toLegacyMessageShape', () => {
    it('mapea content a text (mensaje humano)', () => {
        const row = { id: '1', content: 'hola', sender_id: 'u1' };
        expect(toLegacyMessageShape(row).text).toBe('hola');
    });

    it('mapea metadata a meta', () => {
        const row = { id: '1', metadata: { isSystem: true }, sender_id: null };
        expect(toLegacyMessageShape(row).meta).toEqual({ isSystem: true });
    });

    it('conserva sender_id sin exponer ninguna columna user_id inventada', () => {
        const row = { id: '1', content: 'hola', sender_id: 'u1' };
        const shaped = toLegacyMessageShape(row);
        expect(shaped.sender_id).toBe('u1');
        expect('user_id' in shaped).toBe(false);
    });

    it('usa {} como fallback de meta cuando metadata es null', () => {
        const row = { id: '1', content: 'hola', metadata: null };
        expect(toLegacyMessageShape(row).meta).toEqual({});
    });

    it('devuelve null/undefined sin lanzar si la fila es null/undefined', () => {
        expect(toLegacyMessageShape(null)).toBeNull();
        expect(toLegacyMessageShape(undefined)).toBeUndefined();
    });
});

describe('toLegacyMessageListShape', () => {
    it('aplica el alias a cada fila de una lista', () => {
        const rows = [
            { id: '1', content: 'a', metadata: { x: 1 } },
            { id: '2', content: 'b', metadata: null },
        ];
        const shaped = toLegacyMessageListShape(rows);
        expect(shaped.map(r => r.text)).toEqual(['a', 'b']);
        expect(shaped[0].meta).toEqual({ x: 1 });
        expect(shaped[1].meta).toEqual({});
    });

    it('devuelve [] si la lista es null/undefined', () => {
        expect(toLegacyMessageListShape(null)).toEqual([]);
        expect(toLegacyMessageListShape(undefined)).toEqual([]);
    });
});
