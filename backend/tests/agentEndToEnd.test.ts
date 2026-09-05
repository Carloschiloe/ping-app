import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import type { Server } from 'http';

// M-1F, sección 33 — integración HTTP real: app Express real, middleware
// real (requireAuth, rate limit, validateRequest), controller real,
// orchestrator real, Context Builder real, Retrieval real (sólo el CLIENTE
// de Supabase se mockea, no retrieval.service.ts) — prueba la conexión
// HTTP→Core→response que ningún test unitario (todos mockean al menos una
// capa completa) puede certificar.
//
// Decisión de alcance: se mockea `supabaseAdmin` (mismo patrón ya usado en
// 40+ archivos de este repo, vía tests/helpers/supabaseMock.ts) en vez de
// levantar Postgres local real — el matching/autorización REAL de
// retrieval.service.ts ya está exhaustivamente certificado contra Postgres
// real en M-1B/M-1B.1/M-1C; lo que este archivo agrega es la certeza de que
// el CABLEADO Express (ruta, orden de middleware, requireAuth poblando
// req.user, validación de body, mapeo de errores) funciona de punta a
// punta. No se introduce un framework de integración HTTP nuevo (sin
// supertest, que no es dependencia de este repo) — se usa `fetch` real
// contra `app.listen()` en un puerto efímero, matching lo mínimo necesario.
//
// "No proveedor real obligatorio" (sección 33/34): se fuerza
// OPENAI_API_KEY ausente durante todo este archivo, igual que
// tests/optionalAiStartup.test.ts — el interpreter/synthesizer caen a sus
// fallbacks determinísticos, reales pero sin red, probando la ruta 100%
// segura de punta a punta.
const originalApiKey = process.env.OPENAI_API_KEY;

let server: Server;
let baseUrl: string;
let mockHelpers: typeof import('./helpers/supabaseMock');

const AUTHORIZED_USER_ID = 'e2e-user-authorized';
const OUTSIDER_USER_ID = 'e2e-user-outsider';
const VALID_TOKEN = 'valid-test-token';
const OUTSIDER_TOKEN = 'outsider-test-token';

beforeAll(async () => {
    delete process.env.OPENAI_API_KEY;

    const { supabaseAdminMockModule } = await import('./helpers/supabaseMock');
    // vi.mock no puede llamarse dinámicamente aquí (ya se ejecutó el hoist de
    // otros archivos), así que este archivo mockea el módulo directamente
    // via un stub liviano en memoria equivalente, reutilizando los mismos
    // helpers para construir las respuestas encoladas.
    const vitest = await import('vitest');
    vitest.vi.doMock('../src/lib/supabaseAdmin', () => supabaseAdminMockModule());

    mockHelpers = await import('./helpers/supabaseMock');
    mockHelpers.setSupabaseAuthGetUserMock(async (token: string) => {
        if (token === VALID_TOKEN) return { data: { user: { id: AUTHORIZED_USER_ID, email: 'e2e@example.invalid' } }, error: null };
        if (token === OUTSIDER_TOKEN) return { data: { user: { id: OUTSIDER_USER_ID, email: 'e2e-outsider@example.invalid' } }, error: null };
        return { data: { user: null }, error: new Error('invalid token') };
    });

    const { app } = await import('../src/app');
    await new Promise<void>((resolve) => {
        server = app.listen(0, () => resolve());
    });
    const address = server.address();
    const port = typeof address === 'object' && address ? address.port : 0;
    baseUrl = `http://127.0.0.1:${port}`;
});

afterEach(() => {
    mockHelpers.setSupabaseAdminMock(mockHelpers.createSupabaseAdminMock({}));
});

afterAll(async () => {
    if (originalApiKey !== undefined) process.env.OPENAI_API_KEY = originalApiKey;
    await new Promise<void>((resolve) => server.close(() => resolve()));
});

function commitmentRow(overrides: Partial<Record<string, any>> = {}) {
    return {
        id: 'cm1', title: 'Enviar informe', description: null, status: 'accepted', type: 'task', priority: null,
        due_at: null, proposed_due_at: null, expected_result: null, resolved_at: null, resolution_result: null,
        rejection_reason: null, owner_user_id: AUTHORIZED_USER_ID, assigned_to_user_id: null,
        counterparty_contact_id: null, conversation_id: null, message_id: null, created_at: '2026-09-01T00:00:00Z',
        ...overrides,
    };
}

describe('M-1F: POST /api/agent/respond — integración HTTP real', () => {
    it('sin Authorization header -> 401', async () => {
        const res = await fetch(`${baseUrl}/api/agent/respond`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ input: '¿Qué pendientes tengo?' }),
        });
        expect(res.status).toBe(401);
    });

    it('token inválido -> 401', async () => {
        const res = await fetch(`${baseUrl}/api/agent/respond`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: 'Bearer no-es-un-token-real' },
            body: JSON.stringify({ input: '¿Qué pendientes tengo?' }),
        });
        expect(res.status).toBe(401);
    });

    it('body inválido (input vacío) -> 400', async () => {
        const res = await fetch(`${baseUrl}/api/agent/respond`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${VALID_TOKEN}` },
            body: JSON.stringify({ input: '' }),
        });
        expect(res.status).toBe(400);
    });

    it('conversationId con formato inválido (no UUID) -> 400', async () => {
        const res = await fetch(`${baseUrl}/api/agent/respond`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${VALID_TOKEN}` },
            body: JSON.stringify({ input: 'x', conversationId: 'no-es-un-uuid' }),
        });
        expect(res.status).toBe(400);
    });

    it('request válida, con evidencia real -> 200, forma pública correcta, flujo completo HTTP→Core→respuesta', async () => {
        mockHelpers.setSupabaseAdminMock(mockHelpers.createSupabaseAdminMock({
            commitment_proposal_responses: [{ data: [], error: null }],
            commitments: [
                { data: [commitmentRow()], error: null },     // retrieveCommitments
                { data: [{ id: 'cm1' }], error: null },        // revalidación en retrieveCommitmentEvents
            ],
            commitment_events: [{ data: [], error: null }],
        }));

        const res = await fetch(`${baseUrl}/api/agent/respond`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${VALID_TOKEN}` },
            body: JSON.stringify({ input: '¿Qué pendientes tengo?' }),
        });

        expect(res.status).toBe(200);
        const body = await res.json();
        expect(body.status).toBe('answered');
        expect(typeof body.answer).toBe('string');
        expect(Array.isArray(body.citations)).toBe(true);
        expect(body.citations.some((c: any) => c.sourceType === 'commitment' && c.sourceId === 'cm1')).toBe(true);
        // Nunca se filtran diagnostics internos por esta vía.
        expect(body).not.toHaveProperty('diagnostics');
        expect(body).not.toHaveProperty('claims');
    });

    it('sin evidencia -> 200 con status no_evidence (nunca un error HTTP)', async () => {
        mockHelpers.setSupabaseAdminMock(mockHelpers.createSupabaseAdminMock({
            commitment_proposal_responses: [{ data: [], error: null }],
            commitments: [{ data: [], error: null }],
        }));

        const res = await fetch(`${baseUrl}/api/agent/respond`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${VALID_TOKEN}` },
            body: JSON.stringify({ input: '¿Qué pendientes tengo?' }),
        });

        expect(res.status).toBe(200);
        const body = await res.json();
        expect(body.status).toBe('no_evidence');
    });

    it('outsider con conversationId ajeno -> 403, cero fuga', async () => {
        mockHelpers.setSupabaseAdminMock(mockHelpers.createSupabaseAdminMock({
            conversation_participants: [{ data: null, error: null }], // assertConversationParticipant no encuentra membership
        }));

        const res = await fetch(`${baseUrl}/api/agent/respond`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${OUTSIDER_TOKEN}` },
            body: JSON.stringify({ input: 'x', conversationId: '11111111-1111-4111-8111-111111111111' }),
        });

        expect(res.status).toBe(403);
        const body = await res.json();
        expect(body.error).not.toContain('OpenAI');
        expect(JSON.stringify(body)).not.toContain('11111111-1111-4111-8111-111111111111'.slice(0, 8)); // el error no ecoa el id ajeno
    });
});
