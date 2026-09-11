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

    // PING — CLEAN MEDIA TOMBSTONE PRESENTATION: mobile's isMessageTombstoned()
    // must derive ONLY from messages.deleted_at, never from
    // attachment.lifecycleStatus — this is only a safe contract if
    // deleted_at is genuinely ALWAYS present on the server-confirmed
    // payload for a tombstoned message. toLegacyMessageShape spreads the
    // full row (selected via '*' in every messages query in this backend —
    // see MESSAGE_API_SELECT and conversation.controller.ts's
    // selectQuery) and never strips deleted_at in either branch, so it is
    // always passed through verbatim. Certified here directly rather than
    // left as an unproven assumption.
    it('deleted_at siempre está presente en el payload confirmado por el servidor para un mensaje tombstoned, con o sin adjunto', () => {
        const deletedTextMessage = toLegacyMessageShape({
            id: 'deleted-text',
            content: null,
            deleted_at: '2026-09-10T00:00:00.000Z',
            message_receipts: [],
        });
        const deletedPhotoMessage = toLegacyMessageShape({
            id: 'deleted-photo',
            content: null,
            attachments: { id: 'p1', kind: 'image', mime_type: 'image/jpeg', lifecycle_status: 'tombstoned' },
            deleted_at: '2026-09-10T00:00:00.000Z',
            message_receipts: [],
        });

        expect(deletedTextMessage.deleted_at).toBe('2026-09-10T00:00:00.000Z');
        expect(deletedPhotoMessage.deleted_at).toBe('2026-09-10T00:00:00.000Z');
    });

    // PING — DELETE PHOTO/VIDEO FROM CHAT: a media message's attachment.id
    // stays present after tombstone (mobile's isMessageTombstoned() depends
    // on this exact shape to detect deletion), but nothing else about the
    // attachment (mimeType, size, filename) is exposed once deleted — the
    // backend's own tombstone contract already deliberately strips these
    // (see toLegacyMessageShape's deleted_at branch), matching the DB-level
    // guarantee that a signed read for this attachment.id will now be
    // rejected (authorize_message_attachment_read requires
    // lifecycle_status = 'attached').
    it('mensaje con foto/video tombstoneado conserva attachment.id pero oculta mimeType/tamaño/nombre — foto y video comparten el mismo contrato', () => {
        const tombstonedPhoto = toLegacyMessageShape({
            id: 'deleted-photo-msg',
            content: null,
            attachments: {
                id: 'photo-attachment-1',
                kind: 'image',
                mime_type: 'image/jpeg',
                size_bytes: 128_000,
                original_filename: 'foto.jpg',
                lifecycle_status: 'tombstoned',
            },
            deleted_at: '2026-09-10T00:00:00Z',
            message_receipts: [],
        });
        const tombstonedVideo = toLegacyMessageShape({
            id: 'deleted-video-msg',
            content: null,
            attachments: {
                id: 'video-attachment-1',
                kind: 'video',
                mime_type: 'video/mp4',
                size_bytes: 4_000_000,
                original_filename: 'clip.mp4',
                lifecycle_status: 'tombstoned',
            },
            deleted_at: '2026-09-10T00:00:00Z',
            message_receipts: [],
        });

        for (const shaped of [tombstonedPhoto, tombstonedVideo]) {
            expect(shaped.text).toBe('Mensaje eliminado');
            expect(shaped.media_url).toBeNull();
            expect(shaped.media_bucket).toBeNull();
            expect(shaped.media_object_path).toBeNull();
            expect(shaped.attachment).toEqual(expect.objectContaining({ lifecycleStatus: 'tombstoned' }));
            expect(shaped.attachment).not.toHaveProperty('mimeType');
            expect(shaped.attachment).not.toHaveProperty('sizeBytes');
            expect(shaped.attachment).not.toHaveProperty('originalFilename');
        }
        // El id del adjunto sigue presente en ambos — es lo único que mobile
        // necesita para identificar la burbuja como "tenía un adjunto",
        // nunca para volver a intentar leerlo.
        expect(tombstonedPhoto.attachment.id).toBe('photo-attachment-1');
        expect(tombstonedVideo.attachment.id).toBe('video-attachment-1');
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

    // PING — CLEAN MEDIA TOMBSTONE PRESENTATION: message lifecycle and
    // attachment lifecycle are separate canonical truths. A row with a
    // tombstoned attachment but no deleted_at (the message itself was never
    // deleted) must never be shaped as if the message were tombstoned — no
    // "Mensaje eliminado" substitution, content/metadata untouched.
    it('adjunto tombstoned sin deleted_at en el mensaje: el mensaje se presenta normal, no como eliminado', () => {
        const shaped = toLegacyMessageShape({
            id: 'attachment-tombstoned-message-alive',
            content: 'Video',
            attachments: {
                id: 'video-1',
                kind: 'video',
                mime_type: 'video/mp4',
                lifecycle_status: 'tombstoned',
            },
            message_receipts: [],
        });

        expect(shaped.deleted_at).toBeFalsy();
        expect(shaped.text).toBe('Video');
        expect(shaped.content).toBe('Video');
        expect(shaped.attachment).toEqual(expect.objectContaining({
            id: 'video-1',
            lifecycleStatus: 'tombstoned',
        }));
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
