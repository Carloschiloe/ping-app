import express from 'express';
import type { Server } from 'node:http';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createAgentRateLimiter } from '../src/middleware/agentRateLimit';

describe('Agent rate limits', () => {
    let server: Server;
    let baseUrl: string;

    beforeAll(async () => {
        const app = express();
        const respondLimiter = createAgentRateLimiter();
        const turnLimiter = createAgentRateLimiter();

        app.use((req, _res, next) => {
            req.user = { id: 'rate-limit-test-user' };
            next();
        });
        app.post('/respond', respondLimiter, (_req, res) => res.sendStatus(200));
        app.post('/turn', turnLimiter, (_req, res) => res.sendStatus(200));

        await new Promise<void>((resolve) => {
            server = app.listen(0, '127.0.0.1', () => resolve());
        });
        const address = server.address();
        baseUrl = `http://127.0.0.1:${typeof address === 'object' && address ? address.port : 0}`;
    });

    afterAll(async () => {
        await new Promise<void>((resolve) => server.close(() => resolve()));
    });

    it('keeps independent endpoint budgets while enforcing the same-route cap', async () => {
        const request = (path: string) => fetch(`${baseUrl}${path}`, { method: 'POST' });

        const respondStatuses: number[] = [];
        for (let attempt = 0; attempt < 20; attempt += 1) {
            respondStatuses.push((await request('/respond')).status);
        }

        expect(respondStatuses.every((status) => status === 200)).toBe(true);
        expect((await request('/turn')).status).toBe(200);
        expect((await request('/respond')).status).toBe(429);
    });
});
