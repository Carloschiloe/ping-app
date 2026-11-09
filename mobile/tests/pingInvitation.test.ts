import { readFileSync } from 'fs';
import { join } from 'path';
import { describe, expect, it } from 'vitest';
import { inviteMessage, inviteTokenFromUrl } from '../src/utils/pingInvitation';

const token = 'Ab3_-'.repeat(9) + 'xyz';

describe('invitation links the app opens', () => {
    it('finds the token however the link arrives', () => {
        expect(inviteTokenFromUrl(`ping:///invite?token=${token}`)).toBe(token);
        expect(inviteTokenFromUrl(`ping://invite?token=${token}`)).toBe(token);
        expect(inviteTokenFromUrl(`https://vorian.app/invite/${token}`)).toBe(token);
        expect(inviteTokenFromUrl(`ping:///invite?x=1&token=${token}&y=2`)).toBe(token);
    });

    it('ignores anything else', () => {
        expect(inviteTokenFromUrl('ping:///invite')).toBeNull();
        expect(inviteTokenFromUrl(`ping:///auth/callback?token=${token}`)).toBeNull();
        expect(inviteTokenFromUrl(`https://otro.com/invite/${token}`)).toBeNull();
        expect(inviteTokenFromUrl(`ping:///invite?token=${token}extra`)).toBeNull();
        expect(inviteTokenFromUrl(null)).toBeNull();
    });

    it('the message says Vorian and carries the link', () => {
        const text = inviteMessage('Ana', 'https://vorian.app/invite/abc');
        expect(text).toContain('Hola Ana');
        expect(text).toContain('Vorian');
        expect(text).not.toMatch(/\bPing\b/);
        expect(text.endsWith('https://vorian.app/invite/abc')).toBe(true);
    });

    it('greets without a name when shared from Perfil', () => {
        expect(inviteMessage(null, 'https://vorian.app/invite/abc')).toMatch(/^Hola, te invito/);
    });

    it('Perfil offers to invite someone with a personal link', () => {
        const profile = readFileSync(join(__dirname, '../src/screens/ProfileScreen.tsx'), 'utf8');
        expect(profile).toContain('title="Invitar a alguien a Vorian"');
        expect(profile).toContain("apiClient.post('/invite-links'");
    });
});
