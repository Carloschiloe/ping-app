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

    it('deriva el agregado sin confundir lectura parcial de grupo con read global', () => {
        const shaped = toLegacyMessageShape({
            id: 'm1',
            content: 'grupo',
            message_receipts: [
                { user_id: 'b', delivered_at: 't1', read_at: 't2' },
                { user_id: 'c', delivered_at: 't1', read_at: null },
                { user_id: 'd', delivered_at: null, read_at: null },
            ],
        }, 'c');

        expect(shaped.status).toBe('sent');
        expect(shaped.receipt_summary).toEqual(expect.objectContaining({
            recipient_count: 3,
            delivered_count: 2,
            read_count: 1,
            delivered_to_all: false,
            read_by_all: false,
        }));
        expect(shaped.viewer_receipt.user_id).toBe('c');
    });

    it('define self-chat como receipt no aplicable y conserva status sent', () => {
        const shaped = toLegacyMessageShape({
            id: 'self',
            content: 'nota',
            message_receipts: [],
        }, 'u1');
        expect(shaped.status).toBe('sent');
        expect(shaped.receipt_summary.not_applicable).toBe(true);
        expect(shaped.viewer_receipt).toBeNull();
    });

    it('presenta tombstone sin exponer contenido ni metadata en el contrato mobile', () => {
        const shaped = toLegacyMessageShape({
            id: 'deleted',
            content: 'fuente preservada en DB',
            metadata: { attachment: { fileName: 'privado.pdf' } },
            deleted_at: '2026-08-30T00:00:00Z',
            message_receipts: [],
        });
        expect(shaped.text).toBe('Mensaje eliminado');
        expect(shaped.content).toBeNull();
        expect(shaped.meta).toEqual({ tombstone: true });
    });

    it('normaliza la relacion one-to-one attachment cuando PostgREST devuelve un objeto', () => {
        const shaped = toLegacyMessageShape({
            id: 'with-attachment',
            content: 'documento',
            attachments: {
                id: 'attachment-1',
                kind: 'document',
                mime_type: 'application/pdf',
                size_bytes: 42,
                original_filename: 'evidence.pdf',
                lifecycle_status: 'attached',
            },
        });

        expect(shaped.attachment).toEqual(expect.objectContaining({
            id: 'attachment-1',
            mimeType: 'application/pdf',
            lifecycleStatus: 'attached',
        }));
        expect(shaped.attachments).toBeUndefined();
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
