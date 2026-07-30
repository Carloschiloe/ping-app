import { afterEach, describe, expect, it } from 'vitest';
import {
    createConversationInvitation,
    verifyConversationInvitation,
} from '../src/utils/conversationInvitation';

const originalKey = process.env.ENCRYPTION_KEY;
const inviter = '11111111-1111-4111-8111-111111111111';
const invitee = '22222222-2222-4222-8222-222222222222';

afterEach(() => {
    if (originalKey === undefined) delete process.env.ENCRYPTION_KEY;
    else process.env.ENCRYPTION_KEY = originalKey;
});

describe('conversation invitation', () => {
    it('vincula de forma firmada al emisor y destinatario durante 15 minutos', () => {
        process.env.ENCRYPTION_KEY = '01234567890123456789012345678901';
        const created = createConversationInvitation(inviter, invitee, 1_000);
        const verified = verifyConversationInvitation(created.token, 2_000);

        expect(created.expiresIn).toBe(900);
        expect(verified.inviterUserId).toBe(inviter);
        expect(verified.inviteeUserId).toBe(invitee);
    });

    it('rechaza manipulación y expiración', () => {
        process.env.ENCRYPTION_KEY = '01234567890123456789012345678901';
        const created = createConversationInvitation(inviter, invitee, 1_000);

        expect(() => verifyConversationInvitation(`${created.token}x`, 2_000))
            .toThrow('La invitación no es válida');
        expect(() => verifyConversationInvitation(created.token, 901_001))
            .toThrow('La invitación expiró');
    });
});
