import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod';

vi.mock('../src/lib/supabaseAdmin', () => ({ supabaseAdmin: {} }));

import { validateRequest } from '../src/middleware/validate';
import { serializeContactMatch } from '../src/controllers/user.controller';

describe('Phase 1 containment', () => {
    it('persists Zod defaults and coercions before the controller runs', async () => {
        const request = {
            body: {},
            query: { limit: '25' },
            params: {},
        } as any;
        const next = vi.fn();
        const schema = z.object({
            body: z.object({ phones: z.array(z.string()).default([]) }),
            query: z.object({ limit: z.coerce.number().default(10) }),
            params: z.object({}),
        });

        await validateRequest(schema)(request, {} as any, next);

        expect(next).toHaveBeenCalledTimes(1);
        expect(request.body).toEqual({ phones: [] });
        expect(request.query).toEqual({ limit: 25 });
    });

    it('normalizes Express 5 getter-backed query objects without throwing', async () => {
        const request = { body: {}, params: {} } as any;
        Object.defineProperty(request, 'query', {
            configurable: true,
            enumerable: true,
            get: () => ({ limit: '30' }),
        });
        const next = vi.fn();
        const schema = z.object({
            body: z.object({}),
            query: z.object({ limit: z.coerce.number().default(10) }),
            params: z.object({}),
        });

        await validateRequest(schema)(request, {} as any, next);

        expect(next).toHaveBeenCalledTimes(1);
        expect(request.query).toEqual({ limit: 30 });
    });

    it('does not expose matched contact phone or email', () => {
        const result = serializeContactMatch(
            {
                id: 'user-2',
                full_name: 'Ana',
                avatar_url: null,
            },
            'proof',
        );

        expect(result).toEqual({
            id: 'user-2',
            full_name: 'Ana',
            avatar_url: null,
            contactProof: 'proof',
        });
        expect(result).not.toHaveProperty('phone');
        expect(result).not.toHaveProperty('email');
    });
});
