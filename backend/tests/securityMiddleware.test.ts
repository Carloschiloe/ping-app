import express from 'express';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { ZodError, z } from 'zod';
import type { Server } from 'node:http';

const authMocks = vi.hoisted(() => ({
    getUser: vi.fn(async () => ({ data: { user: null }, error: new Error('invalid token') })),
}));

vi.mock('../src/lib/supabaseAdmin', () => ({
    supabaseAdmin: {
        auth: { getUser: authMocks.getUser },
    },
}));

import { requireAuth } from '../src/middleware/auth';
import { globalErrorHandler } from '../src/middleware/errorHandler';
import { AppError } from '../src/utils/AppError';

describe('security middleware', () => {
    it('does not echo rejected input or internal details in validation responses', () => {
        const response: any = {
            status: vi.fn(() => response),
            json: vi.fn(() => response),
        };
        const request: any = { requestId: 'req-validation' };
        const rejected = (() => {
            try {
                z.string().parse({ password: 'do-not-echo' });
            } catch (error) {
                return error as ZodError;
            }
            throw new Error('fixture did not reject');
        })();

        globalErrorHandler(rejected, request, response, vi.fn());

        expect(response.status).toHaveBeenCalledWith(400);
        const body = response.json.mock.calls[0][0];
        expect(JSON.stringify(body)).not.toContain('do-not-echo');
        expect(body.errors[0]).toEqual(expect.objectContaining({ code: 'invalid_type', path: [] }));
        expect(body.errors[0]).not.toHaveProperty('input');
    });

    it('returns a generic response for unexpected AppError status 500', () => {
        const response: any = {
            status: vi.fn(() => response),
            json: vi.fn(() => response),
        };

        globalErrorHandler(
            new AppError('SUPABASE_SERVICE_ROLE_KEY=do-not-echo', 500),
            { requestId: 'req-500' } as any,
            response,
            vi.fn(),
        );

        expect(response.json.mock.calls[0][0]).toMatchObject({
            status: 'error',
            message: 'Internal Server Error',
            requestId: 'req-500',
        });
        expect(JSON.stringify(response.json.mock.calls[0][0])).not.toContain('do-not-echo');
    });
});

describe('requireAuth failure rate limit', () => {
    let server: Server;
    let baseUrl: string;

    beforeAll(async () => {
        const app = express();
        app.get('/protected', requireAuth, (_req, res) => res.json({ ok: true }));
        app.use(globalErrorHandler as any);
        await new Promise<void>((resolve) => {
            server = app.listen(0, '127.0.0.1', () => resolve());
        });
        const address = server.address();
        baseUrl = `http://127.0.0.1:${typeof address === 'object' && address ? address.port : 0}`;
    });

    afterAll(async () => {
        await new Promise<void>((resolve) => server.close(() => resolve()));
    });

    it('cuts repeated invalid-token attempts while leaving the endpoint protected', async () => {
        const statuses: number[] = [];
        for (let attempt = 0; attempt < 21; attempt += 1) {
            const response = await fetch(`${baseUrl}/protected`, {
                headers: { Authorization: `Bearer invalid-${attempt}` },
            });
            statuses.push(response.status);
        }

        expect(statuses.slice(0, 20).every((status) => status === 401)).toBe(true);
        expect(statuses[20]).toBe(429);
        expect(authMocks.getUser).toHaveBeenCalledTimes(20);
    });
});
