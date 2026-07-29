import { describe, expect, it, vi } from 'vitest';
import { MEDIA_UPLOADS_ENABLED, uploadToSupabase } from '../src/lib/upload';

describe('media upload containment', () => {
    it('mantiene cerrada la capacidad de subida en la interfaz', () => {
        expect(MEDIA_UPLOADS_ENABLED).toBe(false);
    });

    it('no realiza nuevas subidas públicas durante la contención', async () => {
        const warning = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

        await expect(
            uploadToSupabase('file:///audio.m4a', 'chat-media', 'audio/m4a')
        ).resolves.toBeNull();

        expect(warning).toHaveBeenCalledWith(
            '[Upload] Media uploads are temporarily disabled pending private Storage authorization'
        );
        warning.mockRestore();
    });
});
