import crypto from 'crypto';

const OAUTH_STATE_MAX_AGE_MS = 10 * 60 * 1000;

type OAuthStatePayload = {
    userId: string;
    issuedAt: number;
    nonce: string;
};

function getSigningKey(): string {
    const key = process.env.ENCRYPTION_KEY;
    if (!key) throw new Error('ENCRYPTION_KEY is not configured');
    return key;
}

function sign(encodedPayload: string): string {
    return crypto.createHmac('sha256', getSigningKey()).update(encodedPayload).digest('base64url');
}

export function createOAuthState(userId: string, now = Date.now()): string {
    const payload: OAuthStatePayload = {
        userId,
        issuedAt: now,
        nonce: crypto.randomBytes(16).toString('base64url'),
    };
    const encodedPayload = Buffer.from(JSON.stringify(payload)).toString('base64url');
    return `${encodedPayload}.${sign(encodedPayload)}`;
}

export function verifyOAuthState(state: string, now = Date.now()): OAuthStatePayload {
    const [encodedPayload, receivedSignature, extra] = state.split('.');
    if (!encodedPayload || !receivedSignature || extra) {
        throw new Error('Invalid OAuth state');
    }

    const expectedSignature = sign(encodedPayload);
    const received = Buffer.from(receivedSignature);
    const expected = Buffer.from(expectedSignature);
    if (received.length !== expected.length || !crypto.timingSafeEqual(received, expected)) {
        throw new Error('Invalid OAuth state');
    }

    let payload: OAuthStatePayload;
    try {
        payload = JSON.parse(Buffer.from(encodedPayload, 'base64url').toString('utf8'));
    } catch {
        throw new Error('Invalid OAuth state');
    }

    if (
        !payload.userId
        || !payload.nonce
        || !Number.isFinite(payload.issuedAt)
        || payload.issuedAt > now
        || now - payload.issuedAt > OAUTH_STATE_MAX_AGE_MS
    ) {
        throw new Error('Expired or invalid OAuth state');
    }

    return payload;
}
