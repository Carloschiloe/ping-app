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
    completeMessageAttachment,
    createMessageAttachmentReadUrl,
    createMessageAttachmentUploadIntent,
    registerLegacyMessageAttachment,
} from '../src/services/attachmentApplication.service';

const actor = '11111111-1111-4111-8111-111111111111';
const conversation = '22222222-2222-4222-8222-222222222222';
const attachmentId = '33333333-3333-4333-8333-333333333333';
const clientUploadId = '44444444-4444-4444-8444-444444444444';
const objectPath = `conversations/${conversation}/attachments/${actor}/evidence.pdf`;

function attachment(overrides: Record<string, unknown> = {}) {
    return {
        id: attachmentId,
        kind: 'document',
        created_by_user_id: actor,
        context_conversation_id: conversation,
        message_id: null,
        bucket: 'chat-media',
        object_path: objectPath,
        mime_type: 'application/pdf',
        size_bytes: null,
        original_filename: 'evidence.pdf',
        lifecycle_status: 'pending',
        expires_at: '2099-01-01T00:00:00.000Z',
        ...overrides,
    };
}

describe('Message Attachment Core application boundary', () => {
    beforeEach(() => {
        setSupabaseAdminMock(createSupabaseAdminMock({}));
        setSupabaseStorageMock(createSupabaseStorageMock());
    });

    it('crea un upload intent idempotente y no persiste credenciales temporales', async () => {
        const db = createSupabaseAdminMock({
            'rpc:create_message_attachment_intent': [
                { data: attachment(), error: null },
                { data: attachment(), error: null },
            ],
        });
        const storage = createSupabaseStorageMock();
        setSupabaseAdminMock(db);
        setSupabaseStorageMock(storage);

        const input = {
            actorUserId: actor,
            conversationId: conversation,
            mimeType: 'application/pdf',
            originalFilename: 'evidence.pdf',
            clientUploadId,
        };
        const first = await createMessageAttachmentUploadIntent(input);
        const retry = await createMessageAttachmentUploadIntent(input);

        expect(first.attachmentId).toBe(attachmentId);
        expect(retry.attachmentId).toBe(attachmentId);
        expect(db.getRpcCalls()).toHaveLength(2);
        expect(db.getInsertCalls('attachments')).toHaveLength(0);
        expect(JSON.stringify(db.getRpcCalls())).not.toContain('signed.invalid');
        expect(JSON.stringify(db.getRpcCalls())).not.toContain('temporary-token');
    });

    it('complete verifica ownership, conversacion, objeto, MIME y tamaño antes del RPC', async () => {
        const db = createSupabaseAdminMock({
            attachments: [{ data: attachment(), error: null }],
            conversation_participants: [
                { data: { conversation_id: conversation, role: 'member' }, error: null },
                { data: { conversation_id: conversation, role: 'member' }, error: null },
            ],
            conversations: [{ data: { id: conversation, deleted_at: null }, error: null }],
            'rpc:complete_message_attachment': [{
                data: attachment({ lifecycle_status: 'uploaded', size_bytes: 128 }),
                error: null,
            }],
        });
        const storage = createSupabaseStorageMock({
            list: {
                data: [{ name: 'evidence.pdf', metadata: { size: 128, mimetype: 'application/pdf' } }],
                error: null,
            },
        });
        setSupabaseAdminMock(db);
        setSupabaseStorageMock(storage);

        const completed = await completeMessageAttachment(actor, attachmentId);

        expect(completed).toMatchObject({
            attachmentId,
            lifecycleStatus: 'uploaded',
            sizeBytes: 128,
        });
        expect(db.getRpcCalls().at(-1)).toEqual({
            name: 'complete_message_attachment',
            args: expect.objectContaining({
                p_attachment_id: attachmentId,
                p_actor_user_id: actor,
                p_verified_mime_type: 'application/pdf',
                p_verified_size_bytes: 128,
            }),
        });
    });

    it('persiste duracion de audio como metadata verificable del intent', async () => {
        const db = createSupabaseAdminMock({
            'rpc:create_message_attachment_intent': [{
                data: attachment({
                    kind: 'audio',
                    mime_type: 'audio/m4a',
                    original_filename: 'voice.m4a',
                    duration_ms: 4200,
                    duration_source: 'client_recorder',
                }),
                error: null,
            }],
        });
        setSupabaseAdminMock(db);

        await createMessageAttachmentUploadIntent({
            actorUserId: actor,
            conversationId: conversation,
            mimeType: 'audio/m4a',
            originalFilename: 'voice.m4a',
            clientUploadId,
            durationMs: 4200,
        });

        expect(db.getRpcCalls()[0].args.p_metadata).toEqual({
            audio: { durationMs: 4200, durationSource: 'client_recorder' },
        });
    });

    it('lee por attachment_id y nunca acepta bucket/path del cliente', async () => {
        const db = createSupabaseAdminMock({
            'rpc:authorize_message_attachment_read': [{
                data: [{
                    attachment_id: attachmentId,
                    bucket: 'chat-media',
                    object_path: objectPath,
                }],
                error: null,
            }],
        });
        const storage = createSupabaseStorageMock();
        setSupabaseAdminMock(db);
        setSupabaseStorageMock(storage);

        const result = await createMessageAttachmentReadUrl(actor, attachmentId);

        expect(result.expiresIn).toBe(60);
        expect(db.getRpcCalls()[0]).toEqual({
            name: 'authorize_message_attachment_read',
            args: { p_attachment_id: attachmentId, p_actor_user_id: actor },
        });
        expect(storage.createSignedUrl).toHaveBeenCalledWith(objectPath, 60);
    });

    it('bloquea IDOR antes de firmar', async () => {
        const db = createSupabaseAdminMock({
            'rpc:authorize_message_attachment_read': [{
                data: null,
                error: { code: '42501', message: 'Attachment is unavailable or unauthorized' },
            }],
        });
        const storage = createSupabaseStorageMock();
        setSupabaseAdminMock(db);
        setSupabaseStorageMock(storage);

        await expect(createMessageAttachmentReadUrl(actor, attachmentId))
            .rejects.toMatchObject({ statusCode: 403 });
        expect(storage.createSignedUrl).not.toHaveBeenCalled();
    });

    it('adapter legacy registra un Attachment uploaded y conserva bucket/path', async () => {
        const db = createSupabaseAdminMock({
            'rpc:register_legacy_message_attachment': [{
                data: attachment({ lifecycle_status: 'uploaded', size_bytes: 128 }),
                error: null,
            }],
        });
        setSupabaseAdminMock(db);

        const result = await registerLegacyMessageAttachment({
            actorUserId: actor,
            conversationId: conversation,
            bucket: 'chat-media',
            objectPath,
            mimeType: 'application/pdf',
            sizeBytes: 128,
            originalFilename: 'evidence.pdf',
            clientUploadId,
        });

        expect(result.id).toBe(attachmentId);
        expect(db.getRpcCalls()[0].args).toMatchObject({
            p_bucket: 'chat-media',
            p_object_path: objectPath,
            p_client_upload_id: clientUploadId,
        });
    });
});
