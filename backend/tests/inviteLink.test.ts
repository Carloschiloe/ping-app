import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import type { Server } from 'http';
import { INVITE_LINK_TTL_MS, createInviteLinkToken, verifyInviteLinkToken } from '../src/utils/inviteLink';
import { appLinkFor, firstNameOf, invitePage } from '../src/legal/invite';

const originalKey = process.env.ENCRYPTION_KEY;
const inviter = '7b3f0c1e-9a2d-4e5f-8a6b-1c2d3e4f5a6b';
const useKey = () => { process.env.ENCRYPTION_KEY = '01234567890123456789012345678901'; };

afterEach(() => {
    if (originalKey === undefined) delete process.env.ENCRYPTION_KEY;
    else process.env.ENCRYPTION_KEY = originalKey;
});

describe('personal invitation link', () => {
    it('carries who sent it, in a short token, for 30 days', () => {
        useKey();
        const token = createInviteLinkToken(inviter, 1_000_000);
        expect(token).toMatch(/^[A-Za-z0-9_-]{48}$/);
        const verified = verifyInviteLinkToken(token, 2_000_000);
        expect(verified.inviterUserId).toBe(inviter);
        expect(verified.expiresAt).toBe(Math.floor((1_000_000 + INVITE_LINK_TTL_MS) / 1000) * 1000);
    });

    it('rejects a changed token, another key, and an old one', () => {
        useKey();
        const token = createInviteLinkToken(inviter, 1_000_000);
        const changed = (token[0] === 'A' ? 'B' : 'A') + token.slice(1);
        expect(() => verifyInviteLinkToken(changed, 2_000_000)).toThrow('no es válida');
        expect(() => verifyInviteLinkToken('corto', 2_000_000)).toThrow('no es válida');
        expect(() => verifyInviteLinkToken(token, 1_000_000 + INVITE_LINK_TTL_MS + 1_000)).toThrow('venció');
        process.env.ENCRYPTION_KEY = 'otra-clave-distinta-de-32-caracteres!!';
        expect(() => verifyInviteLinkToken(token, 2_000_000)).toThrow('no es válida');
    });
});

describe('invitation page', () => {
    it('says Vorian and who invited, for the WhatsApp preview', () => {
        const html = invitePage({ firstName: 'Carlos', token: 'T'.repeat(48), android: false });
        expect(html).toContain('<meta property="og:title" content="Carlos te invitó a Vorian">');
        expect(html).toContain(`href="ping:///invite?token=${'T'.repeat(48)}"`);
        expect(html).not.toMatch(/\bPing\b/);
    });

    it('opens the app through an intent on Android, falling back to the page', () => {
        const link = appLinkFor('T'.repeat(48), true);
        expect(link).toBe(`intent://invite?token=${'T'.repeat(48)}#Intent;scheme=ping;package=com.carloschiloe.ping;S.browser_fallback_url=${encodeURIComponent(`https://vorian.app/invite/${'T'.repeat(48)}`)};end`);
    });

    it('never lets a name break the page', () => {
        expect(firstNameOf('  María José Pérez ')).toBe('María');
        expect(firstNameOf('')).toBeNull();
        const html = invitePage({ firstName: '<script>x</script>', token: null, android: false });
        expect(html).not.toContain('<script>x');
        expect(html).toContain('&lt;script&gt;');
    });
});

describe('GET /invite pages', () => {
    let server: Server;
    let baseUrl: string;

    beforeAll(async () => {
        const { app } = await import('../src/app');
        await new Promise<void>((resolve) => { server = app.listen(0, () => resolve()); });
        const address = server.address();
        baseUrl = `http://127.0.0.1:${typeof address === 'object' && address ? address.port : 0}`;
    }, 30000);
    afterAll(async () => { await new Promise<void>((resolve) => server.close(() => resolve())); });

    it('the plain link still works and says Vorian', async () => {
        const res = await fetch(`${baseUrl}/invite`);
        expect(res.status).toBe(200);
        const html = await res.text();
        expect(html).toContain('Te invitaron a Vorian');
        expect(html).not.toMatch(/\bPing\b/);
    });

    it('a broken link shows a page, not an error', async () => {
        useKey();
        const res = await fetch(`${baseUrl}/invite/${'x'.repeat(48)}`);
        expect(res.status).toBe(404);
        expect(await res.text()).toContain('Vorian');
    });
});
