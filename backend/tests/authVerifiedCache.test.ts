import { beforeEach, describe, expect, it, vi } from 'vitest';

const authMocks = vi.hoisted(() => ({
    getUser: vi.fn(async (token: string) => token.startsWith('ok.')
        ? { data: { user: { id: 'user-1', email: 'user@example.test' } }, error: null }
        : { data: { user: null }, error: new Error('invalid token') }),
}));

vi.mock('../src/lib/supabaseAdmin', () => ({ supabaseAdmin: { auth: { getUser: authMocks.getUser } } }));

import { forgetVerifiedTokens, requireAuth } from '../src/middleware/auth';

const token = (secondsLeft: number) => {
    const payload = Buffer.from(JSON.stringify({ exp: Math.floor(Date.now() / 1000) + secondsLeft })).toString('base64url');
    return `ok.${payload}.sig`;
};

function call(bearer: string) {
    const req: any = { headers: { authorization: `Bearer ${bearer}` }, ip: '10.0.0.1', app: { get: () => false }, get: () => undefined };
    const res: any = { locals: {}, setHeader: () => undefined, getHeader: () => undefined, on: () => undefined, once: () => undefined };
    return new Promise<{ req: any; err: unknown }>((resolve) => requireAuth(req, res, (err?: unknown) => resolve({ req, err })));
}

beforeEach(() => {
    forgetVerifiedTokens();
    authMocks.getUser.mockClear();
});

describe('signed-in requests', () => {
    it('asks Supabase once per minute for the same session, not on every request', async () => {
        const t = token(3600);
        const first = await call(t);
        const second = await call(t);
        expect(first.req.user).toEqual({ id: 'user-1', email: 'user@example.test' });
        expect(second.req.user).toEqual({ id: 'user-1', email: 'user@example.test' });
        expect(authMocks.getUser).toHaveBeenCalledTimes(1);
    });

    it('does not remember a session that is about to expire', async () => {
        const t = token(30);
        await call(t);
        await call(t);
        expect(authMocks.getUser).toHaveBeenCalledTimes(2);
    });

    it('never remembers a rejected session', async () => {
        const first = await call('bad.token.sig');
        const second = await call('bad.token.sig');
        expect(first.err).toBeTruthy();
        expect(second.err).toBeTruthy();
        expect(authMocks.getUser).toHaveBeenCalledTimes(2);
    });

    it('asks again after an account is suspended or deleted', async () => {
        const t = token(3600);
        await call(t);
        forgetVerifiedTokens();
        await call(t);
        expect(authMocks.getUser).toHaveBeenCalledTimes(2);
    });
});
