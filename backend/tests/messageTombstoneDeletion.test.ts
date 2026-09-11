// PING — DELETE PHOTO/VIDEO FROM CHAT: certifies the canonical deletion
// contract for a message that carries a photo/video attachment, using this
// repo's established mocked-Supabase pattern (see tests/helpers/supabaseMock.ts,
// already used throughout tests/attachmentService.test.ts).
//
// Root cause of "cannot delete photo/video" was proven to be a MOBILE
// rendering gap (MessageItem.tsx never checked tombstone state before
// retrying a now-403'd signed-read forever — see
// mobile/src/utils/messageCompat.ts's isMessageTombstoned and its own
// tests). The backend contract exercised here — tombstone_message's
// owner-or-admin authorization, its cascade to the attachment row, and
// idempotent replay — was already correct and is certified here as the
// baseline that must not regress while fixing the mobile gap.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
    createSupabaseAdminMock,
    setSupabaseAdminMock,
    supabaseAdminMockModule,
} from './helpers/supabaseMock';

vi.mock('../src/lib/supabaseAdmin', () => supabaseAdminMockModule());

const invalidateMemoryForDeletedSource = vi.fn().mockResolvedValue(undefined);
vi.mock('../src/services/memory.service', () => ({
    invalidateMemoryForDeletedSource: (...args: unknown[]) => invalidateMemoryForDeletedSource(...args),
}));

import { tombstoneMessage } from '../src/services/messagingApplication.service';

const actor = '11111111-1111-4111-8111-111111111111';
const outsider = '99999999-9999-4999-8999-999999999999';
const messageId = '22222222-2222-4222-8222-222222222222';
const conversationId = '33333333-3333-4333-8333-333333333333';

function tombstonedMessageRow(overrides: Record<string, unknown> = {}) {
    return {
        id: messageId,
        conversation_id: conversationId,
        sender_id: actor,
        deleted_at: '2026-09-10T00:00:00.000Z',
        deleted_by_user_id: actor,
        deletion_reason: 'user_deleted',
        content: null,
        metadata: { tombstone: true },
        message_receipts: [],
        attachments: null,
        ...overrides,
    };
}

describe('tombstoneMessage — canonical media message deletion', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        invalidateMemoryForDeletedSource.mockResolvedValue(undefined);
        setSupabaseAdminMock(createSupabaseAdminMock({}));
    });

    it('el sender puede eliminar su propio mensaje con foto: la fila queda tombstoned y el adjunto se muestra tombstoned', async () => {
        const db = createSupabaseAdminMock({
            'rpc:tombstone_message': [{ data: null, error: null }],
            messages: [{
                data: tombstonedMessageRow({
                    attachments: { id: 'photo-1', kind: 'image', lifecycle_status: 'tombstoned' },
                }),
                error: null,
            }],
        });
        setSupabaseAdminMock(db);

        const result = await tombstoneMessage(actor, messageId);

        expect(result.text).toBe('Mensaje eliminado');
        expect(result.attachment).toEqual(expect.objectContaining({ lifecycleStatus: 'tombstoned' }));
        expect(db.getRpcCalls()[0]).toEqual({
            name: 'tombstone_message',
            args: { p_message_id: messageId, p_actor_user_id: actor, p_reason: 'user_deleted' },
        });
    });

    it('el sender puede eliminar su propio mensaje con video — mismo contrato que foto', async () => {
        const db = createSupabaseAdminMock({
            'rpc:tombstone_message': [{ data: null, error: null }],
            messages: [{
                data: tombstonedMessageRow({
                    attachments: { id: 'video-1', kind: 'video', lifecycle_status: 'tombstoned' },
                }),
                error: null,
            }],
        });
        setSupabaseAdminMock(db);

        const result = await tombstoneMessage(actor, messageId);

        expect(result.text).toBe('Mensaje eliminado');
        expect(result.attachment).toEqual(expect.objectContaining({ lifecycleStatus: 'tombstoned' }));
    });

    it('un actor que no es el sender ni admin es rechazado (403), sin fallback silencioso', async () => {
        const db = createSupabaseAdminMock({
            'rpc:tombstone_message': [{
                data: null,
                error: { code: '42501', message: 'Actor cannot delete this message' },
            }],
        });
        setSupabaseAdminMock(db);

        await expect(tombstoneMessage(outsider, messageId))
            .rejects.toMatchObject({ statusCode: 403 });
    });

    it('el mensaje no existe: 404, nunca un 500 genérico', async () => {
        const db = createSupabaseAdminMock({
            'rpc:tombstone_message': [{
                data: null,
                error: { code: 'P0002', message: 'Message not found' },
            }],
        });
        setSupabaseAdminMock(db);

        await expect(tombstoneMessage(actor, messageId))
            .rejects.toMatchObject({ statusCode: 404 });
    });

    it('reintentar el mismo delete es idempotente: la segunda llamada no falla y devuelve el mismo estado tombstoned', async () => {
        const db = createSupabaseAdminMock({
            'rpc:tombstone_message': [
                { data: null, error: null },
                { data: null, error: null },
            ],
            messages: [
                { data: tombstonedMessageRow({ attachments: { id: 'photo-1', kind: 'image', lifecycle_status: 'tombstoned' } }), error: null },
                { data: tombstonedMessageRow({ attachments: { id: 'photo-1', kind: 'image', lifecycle_status: 'tombstoned' } }), error: null },
            ],
        });
        setSupabaseAdminMock(db);

        const first = await tombstoneMessage(actor, messageId);
        const second = await tombstoneMessage(actor, messageId);

        expect(first.text).toBe('Mensaje eliminado');
        expect(second.text).toBe('Mensaje eliminado');
        expect(db.getRpcCalls()).toHaveLength(2);
    });

    it('un fallo en la limpieza de memoria (best-effort) nunca revierte ni oculta que el delete ya se confirmó', async () => {
        invalidateMemoryForDeletedSource.mockRejectedValue(new Error('memory cleanup unavailable'));
        const db = createSupabaseAdminMock({
            'rpc:tombstone_message': [{ data: null, error: null }],
            messages: [{
                data: tombstonedMessageRow({ attachments: { id: 'video-1', kind: 'video', lifecycle_status: 'tombstoned' } }),
                error: null,
            }],
        });
        setSupabaseAdminMock(db);

        const result = await tombstoneMessage(actor, messageId);

        expect(result.text).toBe('Mensaje eliminado');
    });
});
