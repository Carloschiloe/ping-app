import { describe, expect, it, vi } from 'vitest';
import { uploadToSupabase } from '../src/lib/upload';

describe('media upload containment', () => {
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
