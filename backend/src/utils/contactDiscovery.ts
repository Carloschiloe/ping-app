import crypto from 'node:crypto';
import { AppError } from './AppError';

const CONTACT_PROOF_TTL_MS = 10 * 60 * 1000;
const TOKEN_PREFIX = 'PINGC1';

type ContactProofPayload = {
    version: 1;
    requesterUserId: string;
    matchedUserId: string;
    expiresAt: number;
    nonce: string;
};

function signingKey() {
    const key = process.env.ENCRYPTION_KEY;
    if (!key) throw new Error('ENCRYPTION_KEY is not configured');
    return key;
}

function sign(encodedPayload: string) {
    return crypto
        .createHmac('sha256', signingKey())
        .update(`${TOKEN_PREFIX}.${encodedPayload}`)
        .digest('base64url');
}

export function createContactProof(
    requesterUserId: string,
    matchedUserId: string,
    now = Date.now()
) {
    const payload: ContactProofPayload = {
        version: 1,
        requesterUserId,
        matchedUserId,
        expiresAt: now + CONTACT_PROOF_TTL_MS,
        nonce: crypto.randomBytes(12).toString('base64url'),
    };
    const encoded = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
    return {
        proof: `${TOKEN_PREFIX}.${encoded}.${sign(encoded)}`,
        expiresIn: CONTACT_PROOF_TTL_MS / 1000,
    };
}

export function verifyContactProof(proof: string, now = Date.now()) {
    const [prefix, encoded, signature, ...rest] = proof.trim().split('.');
    if (prefix !== TOKEN_PREFIX || !encoded || !signature || rest.length > 0) {
        throw new AppError('La coincidencia del contacto no es válida', 400);
    }

    const expected = sign(encoded);
    const receivedBuffer = Buffer.from(signature);
    const expectedBuffer = Buffer.from(expected);
    if (
        receivedBuffer.length !== expectedBuffer.length
        || !crypto.timingSafeEqual(receivedBuffer, expectedBuffer)
    ) {
        throw new AppError('La coincidencia del contacto no es válida', 400);
    }

    let payload: ContactProofPayload;
    try {
        payload = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8'));
    } catch {
        throw new AppError('La coincidencia del contacto no es válida', 400);
    }

    if (
        payload.version !== 1
        || typeof payload.requesterUserId !== 'string'
        || typeof payload.matchedUserId !== 'string'
        || typeof payload.expiresAt !== 'number'
        || typeof payload.nonce !== 'string'
    ) {
        throw new AppError('La coincidencia del contacto no es válida', 400);
    }
    if (payload.expiresAt <= now) {
        throw new AppError('La coincidencia del contacto expiró. Actualiza tus contactos.', 410);
    }
    if (payload.expiresAt > now + CONTACT_PROOF_TTL_MS + 5_000) {
        throw new AppError('La coincidencia del contacto no es válida', 400);
    }
    return payload;
}

export function verifyContactProofForRequester(
    proof: string,
    requesterUserId: string,
    now = Date.now()
) {
    const payload = verifyContactProof(proof, now);
    if (payload.requesterUserId !== requesterUserId) {
        throw new AppError('Esta coincidencia pertenece a otra cuenta', 403);
    }
    return payload;
}
