import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../src/api/client', () => ({
    apiClient: {
        post: vi.fn(),
    },
}));

let uploadToSignedUrlMock: ReturnType<typeof vi.fn>;
vi.mock('../src/lib/supabase', () => ({
    supabase: {
        storage: {
            from: vi.fn(() => ({
                uploadToSignedUrl: (...args: unknown[]) => uploadToSignedUrlMock(...args),
            })),
        },
    },
}));

// Canonical cross-platform reader: expo-file-system's native `File` class,
// which (per its own type docs) reads both `file://` and `content://` URIs
// through the native module — unlike the RN fetch polyfill, which cannot
// reliably read Android `content://` (SAF) URIs. Mocked here with a real
// `.arrayBuffer()` implementation so tests exercise the actual adapter
// contract instead of a legacy `fetch(uri)` stub.
let mockFileBytesByUri: Map<string, ArrayBuffer>;
let mockFileShouldThrow: Set<string>;
vi.mock('expo-file-system', () => ({
    File: class MockFile {
        uri: string;
        constructor(uri: string) {
            this.uri = uri;
        }
        async arrayBuffer(): Promise<ArrayBuffer> {
            if (mockFileShouldThrow.has(this.uri)) {
                throw new Error('native read failure');
            }
            return mockFileBytesByUri.get(this.uri) ?? new Uint8Array([1, 2, 3]).buffer;
        }
    },
}));

import { apiClient } from '../src/api/client';
import {
    clearPrivateFileReadCache,
    getPrivateFileRefreshDelay,
    requestPrivateFileUploadUrl,
    resolveAttachmentUrl,
    resolvePrivateFileUrl,
    uploadPrivateMessageAttachment,
    uploadPrivateProfileAvatar,
} from '../src/lib/privateFiles';

describe('private file mobile preparation', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        // clearAllMocks resets call history but NOT queued
        // mockResolvedValueOnce implementations. A test whose upload throws
        // before consuming every queued apiClient.post response (e.g. the
        // local-read-failure test below, which never reaches the second/
        // "complete" call) would otherwise leak its unconsumed queued value
        // into the next test's first apiClient.post call. Reassigning the
        // mock function itself drops any such leftover queue.
        vi.mocked(apiClient.post).mockReset();
        clearPrivateFileReadCache();
        mockFileBytesByUri = new Map();
        mockFileShouldThrow = new Set();
        uploadToSignedUrlMock = vi.fn().mockResolvedValue({ error: null });
    });

    it('resuelve lectura por recurso sin aceptar bucket ni object_path del cliente', async () => {
        vi.mocked(apiClient.post).mockResolvedValue({
            signedUrl: 'https://signed.invalid/read',
            expiresIn: 60,
        });

        await resolvePrivateFileUrl('message', '44444444-4444-4444-8444-444444444444');

        expect(apiClient.post).toHaveBeenCalledWith('/files/read-url', {
            resourceType: 'message',
            resourceId: '44444444-4444-4444-8444-444444444444',
        });
    });

    it('reutiliza una firma vigente y programa su renovación antes de expirar', async () => {
        vi.mocked(apiClient.post).mockResolvedValue({
            signedUrl: 'https://signed.invalid/read',
            expiresIn: 60,
        });

        await resolvePrivateFileUrl('message', '55555555-5555-4555-8555-555555555555');
        await resolvePrivateFileUrl('message', '55555555-5555-4555-8555-555555555555');

        expect(apiClient.post).toHaveBeenCalledTimes(1);
        expect(getPrivateFileRefreshDelay(60)).toBe(50_000);
    });

    it('mantiene las subidas cerradas y no solicita una firma al backend', async () => {
        const warning = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

        await expect(requestPrivateFileUploadUrl(
            'message_attachment',
            '33333333-3333-4333-8333-333333333333',
            'application/pdf'
        )).resolves.toBeNull();

        expect(apiClient.post).not.toHaveBeenCalled();
        expect(warning).toHaveBeenCalledWith(
            '[Upload] Private media uploads remain disabled in mobile'
        );
        warning.mockRestore();
    });

    it('sube y confirma un avatar sin persistir la URL firmada', async () => {
        vi.mocked(apiClient.post)
            .mockResolvedValueOnce({
                bucket: 'chat-media',
                objectPath: 'profiles/11111111-1111-4111-8111-111111111111/avatar/test.jpg',
                signedUrl: 'https://signed.invalid/upload',
                token: 'temporary-token',
            })
            .mockResolvedValueOnce({ ok: true })
            .mockResolvedValueOnce({
                signedUrl: 'https://signed.invalid/read',
                expiresIn: 60,
            });

        const result = await uploadPrivateProfileAvatar(
            '11111111-1111-4111-8111-111111111111',
            'file:///avatar.jpg',
            'image/jpeg'
        );

        expect(result.expiresIn).toBe(60);
        expect(apiClient.post).toHaveBeenNthCalledWith(
            2,
            '/files/profile-avatar/complete',
            {
                bucket: 'chat-media',
                objectPath: 'profiles/11111111-1111-4111-8111-111111111111/avatar/test.jpg',
            }
        );
    });

    it('devuelve sólo bucket y ruta al preparar un adjunto de mensaje', async () => {
        vi.mocked(apiClient.post)
            .mockResolvedValueOnce({
                attachmentId: '66666666-6666-4666-8666-666666666666',
                upload: {
                    bucket: 'chat-media',
                    objectPath: 'conversations/33333333-3333-4333-8333-333333333333/attachments/11111111-1111-4111-8111-111111111111/test.pdf',
                    signedUrl: 'https://signed.invalid/upload',
                    token: 'temporary-token',
                },
                expiresAt: '2099-01-01T00:00:00.000Z',
            })
            .mockResolvedValueOnce({ lifecycleStatus: 'uploaded' });

        const result = await uploadPrivateMessageAttachment(
            '33333333-3333-4333-8333-333333333333',
            'file:///test.pdf',
            'application/pdf',
            'test.pdf'
        );

        expect(result).toEqual({
            attachmentId: '66666666-6666-4666-8666-666666666666',
            mimeType: 'application/pdf',
            fileName: 'test.pdf',
        });
        expect(apiClient.post).toHaveBeenNthCalledWith(
            2,
            '/attachments/66666666-6666-4666-8666-666666666666/complete',
            {}
        );
        expect(JSON.stringify(result)).not.toContain('signed.invalid');
        expect(JSON.stringify(result)).not.toContain('temporary-token');
    });

    it('envia y conserva la duracion del audio sin credenciales efimeras', async () => {
        vi.mocked(apiClient.post)
            .mockResolvedValueOnce({
                attachmentId: '88888888-8888-4888-8888-888888888888',
                upload: {
                    bucket: 'chat-media',
                    objectPath: 'conversations/c/attachments/u/voice.m4a',
                    signedUrl: 'https://signed.invalid/upload',
                    token: 'temporary-token',
                },
                expiresAt: '2099-01-01T00:00:00.000Z',
            })
            .mockResolvedValueOnce({ lifecycleStatus: 'uploaded' });

        const result = await uploadPrivateMessageAttachment(
            '33333333-3333-4333-8333-333333333333',
            'file:///voice.m4a',
            'audio/m4a',
            'voice.m4a',
            4200,
        );

        expect(apiClient.post).toHaveBeenNthCalledWith(1, '/attachments/upload-intents',
            expect.objectContaining({ durationMs: 4200, mimeType: 'audio/m4a' }));
        expect(result).toEqual(expect.objectContaining({ durationMs: 4200 }));
        expect(JSON.stringify(result)).not.toContain('signed.invalid');
        expect(JSON.stringify(result)).not.toContain('temporary-token');
    });

    it('resuelve y cachea lectura usando la identidad estable del attachment', async () => {
        vi.mocked(apiClient.post).mockResolvedValue({
            signedUrl: 'https://signed.invalid/attachment',
            expiresIn: 60,
        });

        await resolveAttachmentUrl('77777777-7777-4777-8777-777777777777');
        await resolveAttachmentUrl('77777777-7777-4777-8777-777777777777');

        expect(apiClient.post).toHaveBeenCalledTimes(1);
        expect(apiClient.post).toHaveBeenCalledWith(
            '/attachments/77777777-7777-4777-8777-777777777777/read-url',
            {}
        );
    });

    describe('canonical cross-platform upload adapter (Android content:// root cause fix)', () => {
        function mockAttachmentIntent(objectPathSuffix: string) {
            vi.mocked(apiClient.post)
                .mockResolvedValueOnce({
                    attachmentId: '99999999-9999-4999-8999-999999999999',
                    upload: {
                        bucket: 'chat-media',
                        objectPath: `conversations/c/attachments/u/${objectPathSuffix}`,
                        signedUrl: 'https://signed.invalid/upload',
                        token: 'temporary-token',
                    },
                    expiresAt: '2099-01-01T00:00:00.000Z',
                })
                .mockResolvedValueOnce({ lifecycleStatus: 'uploaded' });
        }

        it('sube una imagen desde una URI Android content:// (SAF) sin usar fetch', async () => {
            const uri = 'content://com.android.providers.media.documents/document/image%3A123';
            const bytes = new Uint8Array([10, 20, 30, 40]).buffer;
            mockFileBytesByUri.set(uri, bytes);
            mockAttachmentIntent('photo.jpg');

            const result = await uploadPrivateMessageAttachment(
                '33333333-3333-4333-8333-333333333333',
                uri,
                'image/jpeg',
                'photo.jpg'
            );

            expect(result).toEqual({
                attachmentId: '99999999-9999-4999-8999-999999999999',
                mimeType: 'image/jpeg',
                fileName: 'photo.jpg',
            });
            expect(uploadToSignedUrlMock).toHaveBeenCalledWith(
                'conversations/c/attachments/u/photo.jpg',
                'temporary-token',
                bytes,
                { contentType: 'image/jpeg' }
            );
        });

        it('sube un video desde una URI Android content:// (SAF) sin usar fetch', async () => {
            const uri = 'content://com.android.providers.media.documents/document/video%3A456';
            const bytes = new Uint8Array(2048).buffer;
            mockFileBytesByUri.set(uri, bytes);
            mockAttachmentIntent('clip.mp4');

            const result = await uploadPrivateMessageAttachment(
                '33333333-3333-4333-8333-333333333333',
                uri,
                'video/mp4',
                'clip.mp4'
            );

            expect(result.attachmentId).toBe('99999999-9999-4999-8999-999999999999');
            expect(uploadToSignedUrlMock).toHaveBeenCalledWith(
                'conversations/c/attachments/u/clip.mp4',
                'temporary-token',
                bytes,
                { contentType: 'video/mp4' }
            );
        });

        it('mantiene el comportamiento existente para iOS file:// en imagen y video', async () => {
            const imageUri = 'file:///var/mobile/Containers/Data/Application/x/photo.jpg';
            const videoUri = 'file:///var/mobile/Containers/Data/Application/x/clip.mov';
            const imageBytes = new Uint8Array([1, 1, 1]).buffer;
            const videoBytes = new Uint8Array([2, 2, 2]).buffer;
            mockFileBytesByUri.set(imageUri, imageBytes);
            mockFileBytesByUri.set(videoUri, videoBytes);

            mockAttachmentIntent('photo.jpg');
            await uploadPrivateMessageAttachment(
                '33333333-3333-4333-8333-333333333333',
                imageUri,
                'image/jpeg',
                'photo.jpg'
            );
            expect(uploadToSignedUrlMock).toHaveBeenNthCalledWith(
                1,
                'conversations/c/attachments/u/photo.jpg',
                'temporary-token',
                imageBytes,
                { contentType: 'image/jpeg' }
            );

            mockAttachmentIntent('clip.mov');
            await uploadPrivateMessageAttachment(
                '33333333-3333-4333-8333-333333333333',
                videoUri,
                'video/quicktime',
                'clip.mov'
            );
            expect(uploadToSignedUrlMock).toHaveBeenNthCalledWith(
                2,
                'conversations/c/attachments/u/clip.mov',
                'temporary-token',
                videoBytes,
                { contentType: 'video/quicktime' }
            );
        });

        it('preserva MIME type y nombre de archivo exactos a través del adaptador, sin importar el esquema de URI', async () => {
            const uri = 'content://media/external/video/media/789';
            mockFileBytesByUri.set(uri, new Uint8Array([9, 9]).buffer);
            mockAttachmentIntent('recuerdo.mp4');

            const result = await uploadPrivateMessageAttachment(
                '33333333-3333-4333-8333-333333333333',
                uri,
                'video/mp4',
                'recuerdo.mp4'
            );

            expect(result.mimeType).toBe('video/mp4');
            expect(result.fileName).toBe('recuerdo.mp4');
            expect(apiClient.post).toHaveBeenNthCalledWith(
                1,
                '/attachments/upload-intents',
                expect.objectContaining({
                    mimeType: 'video/mp4',
                    originalFilename: 'recuerdo.mp4',
                })
            );
        });

        it('produce el mismo contrato de subida (bucket, objectPath, token, contentType) para content:// y file://', async () => {
            const androidUri = 'content://com.android.providers.media.documents/document/image%3A1';
            const iosUri = 'file:///var/mobile/x/image.jpg';
            const sameBytes = new Uint8Array([5, 5, 5]).buffer;
            mockFileBytesByUri.set(androidUri, sameBytes);
            mockFileBytesByUri.set(iosUri, sameBytes);

            mockAttachmentIntent('shared.jpg');
            await uploadPrivateMessageAttachment(
                '33333333-3333-4333-8333-333333333333',
                androidUri,
                'image/jpeg',
                'shared.jpg'
            );
            const androidCallArgs = uploadToSignedUrlMock.mock.calls[0];

            mockAttachmentIntent('shared.jpg');
            await uploadPrivateMessageAttachment(
                '33333333-3333-4333-8333-333333333333',
                iosUri,
                'image/jpeg',
                'shared.jpg'
            );
            const iosCallArgs = uploadToSignedUrlMock.mock.calls[1];

            expect(androidCallArgs).toEqual(iosCallArgs);
        });

        it('rechaza la subida si la lectura nativa del archivo local falla (URI content:// inválida/revocada)', async () => {
            const uri = 'content://com.android.providers.media.documents/document/image%3Adeleted';
            mockFileShouldThrow.add(uri);
            mockAttachmentIntent('gone.jpg');

            await expect(uploadPrivateMessageAttachment(
                '33333333-3333-4333-8333-333333333333',
                uri,
                'image/jpeg',
                'gone.jpg'
            )).rejects.toThrow('No se pudo leer el archivo seleccionado.');

            expect(uploadToSignedUrlMock).not.toHaveBeenCalled();
        });

        it('preserva byteLength exacto para un video grande (varios MB) a través del adaptador', async () => {
            const uri = 'file:///var/mobile/clip.mp4';
            const largeBytes = new ArrayBuffer(18 * 1024 * 1024); // 18MB, bajo el cap de 20MB
            mockFileBytesByUri.set(uri, largeBytes);
            mockAttachmentIntent('clip.mp4');

            await uploadPrivateMessageAttachment(
                '33333333-3333-4333-8333-333333333333',
                uri,
                'video/mp4',
                'clip.mp4'
            );

            const [, , uploadedBody] = uploadToSignedUrlMock.mock.calls[0];
            expect(uploadedBody.byteLength).toBe(18 * 1024 * 1024);
        });

        it('un fallo real de Supabase Storage lanza un mensaje de dominio seguro, preservando el error real como cause', async () => {
            const uri = 'file:///clip.mp4';
            mockFileBytesByUri.set(uri, new Uint8Array([1, 2, 3]).buffer);
            mockAttachmentIntent('clip.mp4');
            const storageError = { message: 'Payload too large', name: 'StorageApiError' };
            uploadToSignedUrlMock.mockResolvedValue({ error: storageError });

            try {
                await uploadPrivateMessageAttachment(
                    '33333333-3333-4333-8333-333333333333',
                    uri,
                    'video/mp4',
                    'clip.mp4'
                );
                expect.unreachable();
            } catch (error) {
                // El mensaje lanzado es seguro/genérico — no expone el detalle
                // interno de Storage directamente al llamador/UI.
                expect((error as Error).message).toBe('No se pudo subir el archivo de forma segura.');
                expect((error as Error).message).not.toContain('Payload too large');
                // El error real se preserva internamente vía cause — no se
                // pierde, solo no se propaga como texto de cara al usuario.
                expect((error as Error).cause).toBe(storageError);
            }
        });

        it('una subida exitosa no emite ningún diagnóstico (sin logging permanente/ruidoso en el camino feliz)', async () => {
            const uri = 'content://media/external/video/media/555';
            mockFileBytesByUri.set(uri, new Uint8Array([7, 7, 7, 7]).buffer);
            mockAttachmentIntent('diag.mp4');
            const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

            await uploadPrivateMessageAttachment(
                '33333333-3333-4333-8333-333333333333',
                uri,
                'video/mp4',
                'diag.mp4'
            );

            expect(warnSpy).not.toHaveBeenCalled();
            warnSpy.mockRestore();
        });

        it('un fallo de subida emite diagnóstico seguro (scheme, mimeType, byteLength) sin loggear tokens/signed URLs/bytes', async () => {
            const uri = 'content://media/external/video/media/555';
            mockFileBytesByUri.set(uri, new Uint8Array([7, 7, 7, 7]).buffer);
            mockAttachmentIntent('diag.mp4');
            uploadToSignedUrlMock.mockResolvedValue({
                error: { message: 'Payload too large', name: 'StorageApiError' },
            });
            const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

            await expect(uploadPrivateMessageAttachment(
                '33333333-3333-4333-8333-333333333333',
                uri,
                'video/mp4',
                'diag.mp4'
            )).rejects.toThrow();

            const loggedCalls = warnSpy.mock.calls.map((call) => JSON.stringify(call));
            const diagnosticCall = loggedCalls.find((c) => c.includes('storage-upload-failed'));
            expect(diagnosticCall).toBeDefined();
            expect(diagnosticCall).toContain('"scheme":"content"');
            expect(diagnosticCall).toContain('"mimeType":"video/mp4"');
            expect(diagnosticCall).toContain('"byteLength":4');
            expect(loggedCalls.join('|')).not.toContain('temporary-token');
            expect(loggedCalls.join('|')).not.toContain('signed.invalid');
            warnSpy.mockRestore();
        });

        it('un fallo de lectura local emite diagnóstico seguro sin loggear bytes/tokens', async () => {
            const uri = 'content://media/external/video/media/bad';
            mockFileShouldThrow.add(uri);
            mockAttachmentIntent('bad.mp4');
            const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

            await expect(uploadPrivateMessageAttachment(
                '33333333-3333-4333-8333-333333333333',
                uri,
                'video/mp4',
                'bad.mp4'
            )).rejects.toThrow();

            const loggedCalls = warnSpy.mock.calls.map((call) => JSON.stringify(call));
            const diagnosticCall = loggedCalls.find((c) => c.includes('local-read-failed'));
            expect(diagnosticCall).toBeDefined();
            expect(diagnosticCall).toContain('"scheme":"content"');
            expect(diagnosticCall).toContain('"mimeType":"video/mp4"');
            expect(loggedCalls.join('|')).not.toContain('temporary-token');
            expect(loggedCalls.join('|')).not.toContain('signed.invalid');
            warnSpy.mockRestore();
        });
    });
});
