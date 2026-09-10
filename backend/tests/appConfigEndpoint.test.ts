import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Server } from 'http';

// PING — CANONICAL ATTACHMENT SIZE POLICY: proves GET /config is real,
// unauthenticated, wired HTTP (real Express app + real fetch, matching this
// repo's established no-supertest pattern — see tests/agentEndToEnd.test.ts)
// and exposes the SAME constant attachmentApplication.service.ts and the
// DB size-verification path already use (MAX_MESSAGE_ATTACHMENT_BYTES,
// owned by privateFile.service.ts) — not a second, independently-defined
// number that could drift from the real enforcement path.
let server: Server;
let baseUrl: string;

beforeAll(async () => {
    const { app } = await import('../src/app');
    process.env.OPENAI_API_KEY = '';
    await new Promise<void>((resolve) => {
        server = app.listen(0, () => resolve());
    });
    const address = server.address();
    const port = typeof address === 'object' && address ? address.port : 0;
    baseUrl = `http://127.0.0.1:${port}`;
}, 30000);

afterAll(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
});

describe('GET /config — canonical app configuration', () => {
    it('responde sin autenticación con el policy real (no un stub separado)', async () => {
        const { MAX_MESSAGE_ATTACHMENT_BYTES } = await import('../src/services/privateFile.service');

        const response = await fetch(`${baseUrl}/api/config`);
        const body = await response.json();

        expect(response.status).toBe(200);
        expect(body.limits.maxMessageAttachmentBytes).toBe(MAX_MESSAGE_ATTACHMENT_BYTES);
        // Certifica el valor canónico actual (50MB) explícitamente, para que
        // un futuro cambio accidental del constante sea visible en el diff
        // de este test, no sólo en una comparación contra sí mismo.
        expect(body.limits.maxMessageAttachmentBytes).toBe(52428800);
    });

    it('no requiere Authorization header (mismo patrón que /health)', async () => {
        const response = await fetch(`${baseUrl}/api/config`);
        expect(response.status).toBe(200);
    });
});
