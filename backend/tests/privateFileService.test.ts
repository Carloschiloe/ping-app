import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
    createSupabaseAdminMock,
    createSupabaseStorageMock,
    setSupabaseAdminMock,
    setSupabaseStorageMock,
    supabaseAdminMockModule,
} from './helpers/supabaseMock';

vi.mock('../src/lib/supabaseAdmin', () => supabaseAdminMockModule());

import {
    createPrivateFileReadUrl,
    createPrivateFileUploadUrl,
    PRIVATE_FILE_READ_TTL_SECONDS,
} from '../src/services/privateFile.service';

const userId = '11111111-1111-4111-8111-111111111111';
const otherUserId = '22222222-2222-4222-8222-222222222222';
const conversationId = '33333333-3333-4333-8333-333333333333';
const messageId = '44444444-4444-4444-8444-444444444444';

describe('private file authorization', () => {
    beforeEach(() => {
        setSupabaseAdminMock(createSupabaseAdminMock({}));
        setSupabaseStorageMock(createSupabaseStorageMock());
    });

    it('permite lectura a un participante y emite una URL con expiración breve', async () => {
        const db = createSupabaseAdminMock({
            messages: [{
                data: {
                    id: messageId,
                    conversation_id: conversationId,
                    media_bucket: 'chat-media',
                    media_object_path: `${conversationId}/evidence.pdf`,
                },
                error: null,
            }],
            conversation_participants: [{ data: { conversation_id: conversationId, role: 'member' }, error: null }],
        });
        const storage = createSupabaseStorageMock();
        setSupabaseAdminMock(db);
        setSupabaseStorageMock(storage);

        const result = await createPrivateFileReadUrl(userId, 'message', messageId);

        expect(result.expiresIn).toBe(PRIVATE_FILE_READ_TTL_SECONDS);
        expect(storage.from).toHaveBeenCalledWith('chat-media');
        expect(storage.createSignedUrl).toHaveBeenCalledWith(
            `${conversationId}/evidence.pdf`,
            PRIVATE_FILE_READ_TTL_SECONDS
        );
    });

    it('rechaza acceso cruzado e IDOR antes de firmar la lectura', async () => {
        const db = createSupabaseAdminMock({
            messages: [{
                data: {
                    id: messageId,
                    conversation_id: conversationId,
                    media_bucket: 'chat-media',
                    media_object_path: `${conversationId}/evidence.pdf`,
                },
                error: null,
            }],
            conversation_participants: [{ data: null, error: null }],
        });
        const storage = createSupabaseStorageMock();
        setSupabaseAdminMock(db);
        setSupabaseStorageMock(storage);

        await expect(createPrivateFileReadUrl(otherUserId, 'message', messageId))
            .rejects.toMatchObject({ statusCode: 403 });
        expect(storage.createSignedUrl).not.toHaveBeenCalled();
    });

    it('respeta revocación al volver a autorizar cada nueva firma', async () => {
        const messageReference = {
            data: {
                id: messageId,
                conversation_id: conversationId,
                media_bucket: 'chat-media',
                media_object_path: `${conversationId}/evidence.pdf`,
            },
            error: null,
        };
        const db = createSupabaseAdminMock({
            messages: [messageReference, messageReference],
            conversation_participants: [
                { data: { conversation_id: conversationId, role: 'member' }, error: null },
                { data: null, error: null },
            ],
        });
        const storage = createSupabaseStorageMock();
        setSupabaseAdminMock(db);
        setSupabaseStorageMock(storage);

        await expect(createPrivateFileReadUrl(userId, 'message', messageId)).resolves.toBeTruthy();
        await expect(createPrivateFileReadUrl(userId, 'message', messageId))
            .rejects.toMatchObject({ statusCode: 403 });
        expect(storage.createSignedUrl).toHaveBeenCalledTimes(1);
    });

    it('permite preparar una subida sólo después de autorizar el recurso propietario', async () => {
        const db = createSupabaseAdminMock({
            conversation_participants: [{ data: { conversation_id: conversationId, role: 'member' }, error: null }],
        });
        const storage = createSupabaseStorageMock();
        setSupabaseAdminMock(db);
        setSupabaseStorageMock(storage);

        const result = await createPrivateFileUploadUrl(
            userId,
            'message_attachment',
            conversationId,
            'application/pdf'
        );

        expect(result.bucket).toBe('chat-media');
        expect(result.objectPath).toMatch(
            new RegExp(`^conversations/${conversationId}/attachments/[0-9a-f-]+\\.pdf$`)
        );
        expect(storage.createSignedUploadUrl).toHaveBeenCalledWith(
            result.objectPath,
            { upsert: false }
        );
    });

    it('rechaza una subida cruzada antes de emitir credenciales temporales', async () => {
        const db = createSupabaseAdminMock({
            conversation_participants: [{ data: null, error: null }],
        });
        const storage = createSupabaseStorageMock();
        setSupabaseAdminMock(db);
        setSupabaseStorageMock(storage);

        await expect(createPrivateFileUploadUrl(
            otherUserId,
            'message_attachment',
            conversationId,
            'application/pdf'
        )).rejects.toMatchObject({ statusCode: 403 });
        expect(storage.createSignedUploadUrl).not.toHaveBeenCalled();
    });
});
