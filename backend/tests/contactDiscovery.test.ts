import { afterEach, describe, expect, it } from 'vitest';
import {
    createContactProof,
    verifyContactProof,
    verifyContactProofForRequester,
} from '../src/utils/contactDiscovery';
import { syncContactsSchema } from '../src/schemas/contactDiscovery.schema';

const originalKey = process.env.ENCRYPTION_KEY;
const requester = '11111111-1111-4111-8111-111111111111';
const matched = '22222222-2222-4222-8222-222222222222';

afterEach(() => {
    if (originalKey === undefined) delete process.env.ENCRYPTION_KEY;
    else process.env.ENCRYPTION_KEY = originalKey;
});

describe('contact discovery proof', () => {
    it('vincula la coincidencia exacta al usuario que autorizó sus contactos', () => {
        process.env.ENCRYPTION_KEY = '01234567890123456789012345678901';
        const created = createContactProof(requester, matched, 1_000);
        const verified = verifyContactProof(created.proof, 2_000);

        expect(created.expiresIn).toBe(600);
        expect(verified.requesterUserId).toBe(requester);
        expect(verified.matchedUserId).toBe(matched);
    });

    it('rechaza manipulación y expiración', () => {
        process.env.ENCRYPTION_KEY = '01234567890123456789012345678901';
        const created = createContactProof(requester, matched, 1_000);

        expect(() => verifyContactProof(`${created.proof}x`, 2_000))
            .toThrow('no es válida');
        expect(() => verifyContactProof(created.proof, 601_001))
            .toThrow('expiró');
    });

    it('impide que otra cuenta use la coincidencia para abrir un chat', () => {
        process.env.ENCRYPTION_KEY = '01234567890123456789012345678901';
        const created = createContactProof(requester, matched, 1_000);

        expect(() => verifyContactProofForRequester(
            created.proof,
            '33333333-3333-4333-8333-333333333333',
            2_000
        )).toThrow('pertenece a otra cuenta');
    });

    it('acepta coincidencia por teléfono o correo y rechaza inventarios vacíos', () => {
        expect(syncContactsSchema.safeParse({
            body: { phones: ['+56912345678'], emails: [] },
        }).success).toBe(true);
        expect(syncContactsSchema.safeParse({
            body: { phones: [], emails: ['persona@example.com'] },
        }).success).toBe(true);
        expect(syncContactsSchema.safeParse({
            body: { phones: [], emails: [] },
        }).success).toBe(false);
    });
});
