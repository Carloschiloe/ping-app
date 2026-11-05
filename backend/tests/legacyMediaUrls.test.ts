import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
    createSignedUrls: vi.fn(async (paths: string[]) => ({
        data: paths.map((path) => ({ path, signedUrl: `https://db.example.test/storage/v1/object/sign/chat-media/${path}?token=t` })),
        error: null,
    })),
}));

vi.mock('../src/lib/supabaseAdmin', () => ({
    supabaseAdmin: { storage: { from: () => ({ createSignedUrls: mocks.createSignedUrls }) } },
}));

process.env.SUPABASE_URL = 'https://db.example.test';

import { signLegacyMediaUrls } from '../src/middleware/legacyMediaUrls';

const publicUrl = (path: string) => `https://db.example.test/storage/v1/object/public/chat-media/${path}`;

describe('old public file addresses leave the server signed', () => {
    beforeEach(() => vi.clearAllMocks());

    it('signs addresses in fields and inside message text, once per file', async () => {
        const body = {
            messages: [
                { media_url: publicUrl('111.jpg'), content: 'foto' },
                { content: `[audio]${publicUrl('222.m4a')}` },
                { media_url: publicUrl('111.jpg') },
            ],
            profile: { avatar_url: publicUrl('333.png') },
        };
        const signed: any = await signLegacyMediaUrls(body);
        expect(signed.messages[0].media_url).toContain('/object/sign/chat-media/111.jpg?token=');
        expect(signed.messages[1].content).toBe('[audio]https://db.example.test/storage/v1/object/sign/chat-media/222.m4a?token=t');
        expect(signed.profile.avatar_url).toContain('/object/sign/chat-media/333.png');
        expect(mocks.createSignedUrls).toHaveBeenCalledTimes(1);
        expect(mocks.createSignedUrls.mock.calls[0][0].sort()).toEqual(['111.jpg', '222.m4a', '333.png']);
    });

    it('leaves answers without old addresses untouched and costs nothing', async () => {
        const body = { ok: true, url: 'https://example.com/a.jpg' };
        expect(await signLegacyMediaUrls(body)).toBe(body);
        expect(mocks.createSignedUrls).not.toHaveBeenCalled();
    });

    it('reuses a signed address instead of signing again', async () => {
        await signLegacyMediaUrls({ a: publicUrl('444.jpg') });
        await signLegacyMediaUrls({ a: publicUrl('444.jpg') });
        expect(mocks.createSignedUrls).toHaveBeenCalledTimes(1);
    });
});
