import express from 'express';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type { Server } from 'node:http';

// Separate file: the auth failure limiter is module-level state, so this
// scenario needs a fresh budget instead of the one securityMiddleware.test.ts
// exhausts on purpose.
const authMocks = vi.hoisted(() => ({
    getUser: vi.fn(async (token: string) => token === 'valid'
        ? { data: { user: { id: 'user-1', email: 'user@example.test' } }, error: null }
        : { data: { user: null }, error: new Error('invalid token') }),
}));

vi.mock('../src/lib/supabaseAdmin', () => ({
    supabaseAdmin: {
        auth: { getUser: authMocks.getUser },
    },
}));

import { requireAuth } from '../src/middleware/auth';
import { globalErrorHandler } from '../src/middleware/errorHandler';
import { AppError } from '../src/utils/AppError';

describe('requireAuth failure rate limit with downstream 4xx', () => {
    let server: Server;
    let baseUrl: string;

    beforeAll(async () => {
        const app = express();
        // Stands in for a route whose own limiter or validation rejects an
        // authenticated request (e.g. the live-voice telemetry limiter).
        app.post('/limited', requireAuth, (_req, _res, next) => next(new AppError('Too many requests', 429)));
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

    it('does not lock an authenticated user out after downstream 4xx responses', async () => {
        for (let attempt = 0; attempt < 30; attempt += 1) {
            const response = await fetch(`${baseUrl}/limited`, {
                method: 'POST',
                headers: { Authorization: 'Bearer valid' },
            });
            expect(response.status).toBe(429);
        }

        const response = await fetch(`${baseUrl}/protected`, {
            headers: { Authorization: 'Bearer valid' },
        });
        expect(response.status).toBe(200);
    });

    it('still cuts repeated invalid-token attempts', async () => {
        const statuses: number[] = [];
        for (let attempt = 0; attempt < 21; attempt += 1) {
            const response = await fetch(`${baseUrl}/protected`, {
                headers: { Authorization: `Bearer invalid-${attempt}` },
            });
            statuses.push(response.status);
        }

        expect(statuses.slice(0, 20).every((status) => status === 401)).toBe(true);
        expect(statuses[20]).toBe(429);
    });
});
