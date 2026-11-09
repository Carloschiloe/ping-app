import crypto from 'node:crypto';
import { AppError } from './AppError';

// A personal invitation anyone can open: it names only the person who sent
// it, so whoever signs in with it is connected with them. The token is the
// inviter's id, an expiry and a signature, packed short enough for a chat link.

export const INVITE_LINK_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const PURPOSE = 'VINV1';
const SIGNATURE_BYTES = 16;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function signature(body: Buffer) {
    const key = process.env.ENCRYPTION_KEY;
    if (!key) throw new Error('ENCRYPTION_KEY is not configured');
    return crypto.createHmac('sha256', key).update(PURPOSE).update(body).digest().subarray(0, SIGNATURE_BYTES);
}

export function createInviteLinkToken(inviterUserId: string, now = Date.now()): string {
    if (!UUID.test(inviterUserId)) throw new Error('inviter id must be a uuid');
    const body = Buffer.alloc(20);
    Buffer.from(inviterUserId.replace(/-/g, ''), 'hex').copy(body, 0);
    body.writeUInt32BE(Math.floor((now + INVITE_LINK_TTL_MS) / 1000), 16);
    return Buffer.concat([body, signature(body)]).toString('base64url');
}

export function verifyInviteLinkToken(token: string, now = Date.now()): { inviterUserId: string; expiresAt: number } {
    const raw = /^[A-Za-z0-9_-]{48}$/.test(token) ? Buffer.from(token, 'base64url') : null;
    if (!raw || raw.length !== 20 + SIGNATURE_BYTES) throw new AppError('La invitación no es válida', 400);
    const body = raw.subarray(0, 20);
    if (!crypto.timingSafeEqual(raw.subarray(20), signature(body))) throw new AppError('La invitación no es válida', 400);
    const expiresAt = body.readUInt32BE(16) * 1000;
    if (expiresAt <= now) throw new AppError('La invitación venció. Pide a quien te invitó un enlace nuevo.', 410);
    const hex = body.subarray(0, 16).toString('hex');
    const inviterUserId = `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
    return { inviterUserId, expiresAt };
}
