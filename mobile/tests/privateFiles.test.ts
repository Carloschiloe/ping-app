import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../src/api/client', () => ({
    apiClient: {
        post: vi.fn(),
    },
}));
vi.mock('../src/lib/supabase', () => ({
    supabase: {
        storage: {
            from: vi.fn(() => ({
                uploadToSignedUrl: vi.fn().mockResolvedValue({ error: null }),
            })),
        },
    },
}));

import { apiClient } from '../src/api/client';
import {
    requestPrivateFileUploadUrl,
    resolvePrivateFileUrl,
    uploadPrivateMessageAttachment,
    uploadPrivateProfileAvatar,
} from '../src/lib/privateFiles';

describe('private file mobile preparation', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
            ok: true,
            arrayBuffer: vi.fn().mockResolvedValue(new Uint8Array([1, 2, 3]).buffer),
        }));
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
        vi.mocked(apiClient.post).mockResolvedValueOnce({
            bucket: 'chat-media',
            objectPath: 'conversations/33333333-3333-4333-8333-333333333333/attachments/11111111-1111-4111-8111-111111111111/test.pdf',
            signedUrl: 'https://signed.invalid/upload',
            token: 'temporary-token',
        });

        const result = await uploadPrivateMessageAttachment(
            '33333333-3333-4333-8333-333333333333',
            'file:///test.pdf',
            'application/pdf',
            'test.pdf'
        );

        expect(result).toEqual({
            bucket: 'chat-media',
            objectPath: 'conversations/33333333-3333-4333-8333-333333333333/attachments/11111111-1111-4111-8111-111111111111/test.pdf',
            mimeType: 'application/pdf',
            fileName: 'test.pdf',
        });
        expect(JSON.stringify(result)).not.toContain('signed.invalid');
        expect(JSON.stringify(result)).not.toContain('temporary-token');
    });
});
