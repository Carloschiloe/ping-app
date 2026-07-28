import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../src/api/client', () => ({
    apiClient: {
        post: vi.fn(),
    },
}));

import { apiClient } from '../src/api/client';
import {
    requestPrivateFileUploadUrl,
    resolvePrivateFileUrl,
} from '../src/lib/privateFiles';

describe('private file mobile preparation', () => {
    beforeEach(() => {
        vi.clearAllMocks();
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
});
