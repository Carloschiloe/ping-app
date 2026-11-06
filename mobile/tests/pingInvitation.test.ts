import { describe, expect, it } from 'vitest';
import { PING_PUBLIC_INVITE_URL } from '../src/utils/pingInvitation';

describe('Ping invitations', () => {
    it('uses a clickable HTTPS production invitation URL', () => {
        expect(PING_PUBLIC_INVITE_URL).toBe('https://vorian.app/invite');
        expect(PING_PUBLIC_INVITE_URL).toMatch(/^https:\/\//);
    });
});
