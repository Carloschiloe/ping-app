import crypto from 'node:crypto';
import { AppError } from './AppError';

const INVITATION_TTL_MS = 15 * 60 * 1000;
const TOKEN_PREFIX = 'PING1';

type InvitationPayload = {
    version: 1;
    inviterUserId: string;
    inviteeUserId: string;
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

export function createConversationInvitation(
    inviterUserId: string,
    inviteeUserId: string,
    now = Date.now()
) {
    const payload: InvitationPayload = {
        version: 1,
        inviterUserId,
        inviteeUserId,
        expiresAt: now + INVITATION_TTL_MS,
        nonce: crypto.randomBytes(12).toString('base64url'),
    };
    const encoded = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
    return {
        token: `${TOKEN_PREFIX}.${encoded}.${sign(encoded)}`,
        expiresIn: INVITATION_TTL_MS / 1000,
    };
}

export function verifyConversationInvitation(token: string, now = Date.now()) {
    const [prefix, encoded, signature, ...rest] = token.trim().split('.');
    if (prefix !== TOKEN_PREFIX || !encoded || !signature || rest.length > 0) {
        throw new AppError('La invitación no es válida', 400);
    }

    const expected = sign(encoded);
    const receivedBuffer = Buffer.from(signature);
    const expectedBuffer = Buffer.from(expected);
    if (
        receivedBuffer.length !== expectedBuffer.length
        || !crypto.timingSafeEqual(receivedBuffer, expectedBuffer)
    ) {
        throw new AppError('La invitación no es válida', 400);
    }

    let payload: InvitationPayload;
    try {
        payload = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8'));
    } catch {
        throw new AppError('La invitación no es válida', 400);
    }

    if (
        payload.version !== 1
        || typeof payload.inviterUserId !== 'string'
        || typeof payload.inviteeUserId !== 'string'
        || typeof payload.expiresAt !== 'number'
        || typeof payload.nonce !== 'string'
    ) {
        throw new AppError('La invitación no es válida', 400);
    }
    if (payload.expiresAt <= now) {
        throw new AppError('La invitación expiró. Pide una nueva.', 410);
    }
    if (payload.expiresAt > now + INVITATION_TTL_MS + 5_000) {
        throw new AppError('La invitación no es válida', 400);
    }
    return payload;
}
