import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import type { Server } from 'http';

// M-3 — integración HTTP real para POST /api/agent/plan, mismo principio que
// agentEndToEnd.test.ts (M-1F): app Express real, middleware real
// (requireAuth, rate limit compartido, validateRequest), controller real,
// orchestrator real, planner/validator reales. Se mockea retrieval.service.ts
// / date-parser.service.ts / memory.service.ts wholesale (mismo patrón ya
// aceptado en agentContextBuilder.test.ts, sección 21 del ticket: "prefer
// resolving required reads during plan construction using existing
// retrieval functions" -- lo que se prueba aquí es el CABLEADO HTTP y la
// composición real objective->plan->validator, no el matching SQL de
// retrieval, ya certificado por separado). OPENAI_API_KEY ausente durante
// todo el archivo -> el objective interpreter cae a su fallback
// determinístico real, sin red (sección 49).
const originalApiKey = process.env.OPENAI_API_KEY;

let server: Server;
let baseUrl: string;
let mockHelpers: typeof import('./helpers/supabaseMock');

const CARLOS = 'e2e-plan-carlos';
const OUTSIDER = 'e2e-plan-outsider';
const VALID_TOKEN = 'valid-plan-token';

const ALEJANDRA_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const PEDRO_ID = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const CONVERSATION_ID = '11111111-1111-4111-8111-111111111111';
const ENTRENAR_ID = '22222222-2222-4222-8222-222222222222';

let resolvePersonMock: ReturnType<typeof vi.fn>;
let retrieveCommitmentsMock: ReturnType<typeof vi.fn>;
let retrieveCommitmentProposalsMock: ReturnType<typeof vi.fn>;
let retrieveMemoryMock: ReturnType<typeof vi.fn>;

function person(id: string, displayName: string) {
    return { kind: 'user' as const, id, displayName };
}

function commitment(overrides: Record<string, any> = {}) {
    return {
        id: ENTRENAR_ID, entityType: 'commitment', title: 'Entrenar', description: null,
        status: 'accepted', type: 'task', priority: null, dueAt: null, proposedDueAt: null,
        expectedResult: null, resolvedAt: null, resolutionResult: null, rejectionReason: null,
        ownerUserId: CARLOS, assignedToUserId: CARLOS, counterpartyContactId: null,
        conversationId: null, messageId: null, createdAt: '2026-09-01T00:00:00.000Z',
        provenance: { sourceType: 'commitment', sourceId: ENTRENAR_ID },
        ...overrides,
    };
}

beforeAll(async () => {
    resolvePersonMock = vi.fn(async () => ({ resolved: null, ambiguous: false, candidates: [] }));
    retrieveCommitmentsMock = vi.fn(async () => []);
    retrieveCommitmentProposalsMock = vi.fn(async () => []);
    retrieveMemoryMock = vi.fn(async () => []);

    const vitest = await import('vitest');
    // Este archivo certifica lógica de planificación, no rate-limiting (ya
    // gobernado por su propio límite en routes/index.ts) -- con 20+ tests
    // contra el MISMO actor autenticado en la misma ventana de 5 minutos,
    // el límite real (max: 20) se alcanzaría y produciría 429 falsos
    // negativos sin relación con la corrección del planner (hallazgo real
    // durante el testing de este mismo archivo). Se neutraliza aquí, nunca
    // en el código de producción.
    vitest.vi.doMock('express-rate-limit', () => ({
        default: () => (_req: any, _res: any, next: () => void) => next(),
    }));
    vitest.vi.doMock('../src/services/retrieval.service', () => ({
        resolvePerson: (...args: any[]) => resolvePersonMock(...args),
        retrieveCommitments: (...args: any[]) => retrieveCommitmentsMock(...args),
        retrieveCommitmentProposals: (...args: any[]) => retrieveCommitmentProposalsMock(...args),
    }));
    vitest.vi.doMock('../src/services/memory.service', () => ({
        retrieveMemory: (...args: any[]) => retrieveMemoryMock(...args),
    }));

    const { supabaseAdminMockModule } = await import('./helpers/supabaseMock');
    vitest.vi.doMock('../src/lib/supabaseAdmin', () => supabaseAdminMockModule());
    mockHelpers = await import('./helpers/supabaseMock');
    mockHelpers.setSupabaseAuthGetUserMock(async (token: string) => {
        if (token === VALID_TOKEN) return { data: { user: { id: CARLOS, email: 'carlos@example.invalid' } }, error: null };
        return { data: { user: null }, error: new Error('invalid token') };
    });

    const { app } = await import('../src/app');
    // IMPORTANTE (hallazgo real durante el testing de este mismo archivo):
    // app.ts llama a dotenv.config() (sin `override`) en su propio top-level
    // -- si esta variable se borra ANTES de importar app.ts, dotenv.config()
    // la vuelve a poblar desde el .env real (dotenv sólo respeta valores que
    // YA existen; un valor borrado ya no existe). Por eso se limpia DESPUÉS
    // de importar app.ts, nunca antes -- así queda garantizado que ningún
    // test de este archivo dispara una llamada real a OpenAI (sección 49:
    // "no network").
    process.env.OPENAI_API_KEY = '';

    await new Promise<void>((resolve) => { server = app.listen(0, () => resolve()); });
    const address = server.address();
    const port = typeof address === 'object' && address ? address.port : 0;
    baseUrl = `http://127.0.0.1:${port}`;
}, 30000);
// Timeout explícito (hallazgo real durante el testing de este mismo
// archivo): con dos archivos de integración HTTP real (este +
// agentEndToEnd.test.ts) booteando su propia app Express completa bajo
// carga paralela, el default de vitest (10s) se excede de forma consistente
// -- nunca por un bug de planificación (--no-file-parallelism, o cada
// archivo en aislamiento, pasan 100% de las veces). 30s es margen real, no
// una supresión del síntoma.

afterEach(() => {
    resolvePersonMock.mockReset().mockResolvedValue({ resolved: null, ambiguous: false, candidates: [] });
    retrieveCommitmentsMock.mockReset().mockResolvedValue([]);
    retrieveCommitmentProposalsMock.mockReset().mockResolvedValue([]);
    retrieveMemoryMock.mockReset().mockResolvedValue([]);
    mockHelpers.setSupabaseAdminMock(mockHelpers.createSupabaseAdminMock({}));
});

afterAll(async () => {
    if (originalApiKey !== undefined) process.env.OPENAI_API_KEY = originalApiKey;
    await new Promise<void>((resolve) => server.close(() => resolve()));
});

async function callPlan(body: Record<string, unknown>, token: string = VALID_TOKEN) {
    const res = await fetch(`${baseUrl}/api/agent/plan`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(body),
    });
    return { status: res.status, body: await res.json() };
}

describe('POST /api/agent/plan — wiring HTTP (sección 38)', () => {
    it('sin Authorization -> 401', async () => {
        const res = await fetch(`${baseUrl}/api/agent/plan`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ input: 'x' }) });
        expect(res.status).toBe(401);
    });
    it('input vacío -> 400', async () => {
        const { status } = await callPlan({ input: '' });
        expect(status).toBe(400);
    });
    it('conversationId no-uuid -> 400', async () => {
        const { status } = await callPlan({ input: 'x', conversationId: 'not-a-uuid' });
        expect(status).toBe(400);
    });
});

describe('CONTRACT SCENARIO A: "Dile a Alejandra que llegaré tarde." (sección 42)', () => {
    it('200, objective communicate_message, persona resuelta, un futuro send-message step, confirmación explícita, NUNCA ejecutado', async () => {
        resolvePersonMock.mockResolvedValue({ resolved: person(ALEJANDRA_ID, 'Alejandra'), ambiguous: false, candidates: [] });
        const { status, body } = await callPlan({ input: 'Dile a Alejandra que llegaré tarde.', conversationId: CONVERSATION_ID });
        expect(status).toBe(200);
        expect(body.objectiveType).toBe('communicate_message');
        expect(body.status).toBe('ready_for_authorization');
        expect(body.steps).toHaveLength(1);
        expect(body.steps[0].toolId).toBe('send_message');
        expect(body.steps[0].confirmationRequirement).toBe('explicit');
        expect(body.canExecute).toBe(true); // "ready for future M-4 authorization", NUNCA ya ejecutado (sección 44)
        expect(body).not.toHaveProperty('arguments'); // la forma pública nunca expone argumentos crudos
    });
});

describe('CONTRACT SCENARIO B (literal, sección 6/42): "Agenda entrenar mañana a las 8."', () => {
    it('tiempo resuelto determinísticamente, un step create_commitment futuro, confirmación explícita, NUNCA creado, sin exigir un destinatario que el producto no requiere', async () => {
        const { status, body } = await callPlan({ input: 'Agenda entrenar mañana a las 8.' });
        expect(status).toBe(200);
        expect(body.objectiveType).toBe('create_commitment_or_proposal');
        expect(body.status).toBe('ready_for_authorization');
        expect(resolvePersonMock).not.toHaveBeenCalled(); // nunca exige un responsable si el usuario no nombró a nadie
        expect(body.steps).toHaveLength(1);
        expect(body.steps[0].toolId).toBe('create_commitment');
        expect(body.steps[0].confirmationRequirement).toBe('explicit');
        expect(body.steps[0].sideEffectClass).toBe('state_change');
        expect(body.canExecute).toBe(true); // "ready for M-4 authorization", nunca ya ejecutado
    });

    it('sin ninguna fecha/hora en el texto -> needs_clarification (nunca crea con una fecha adivinada)', async () => {
        const { body } = await callPlan({ input: 'Agenda entrenar.' });
        expect(body.status).toBe('needs_clarification');
        expect(body.steps).toEqual([]);
        expect(body.clarification[0].field).toBe('dueAt');
    });
});

describe('CONTRACT SCENARIO C: "Mueve Entrenar al viernes." (sección 42)', () => {
    it('resuelve la entidad canónica, verifica autoridad, plan de reschedule, confirmación requerida, NUNCA ejecutado', async () => {
        retrieveCommitmentsMock.mockResolvedValue([commitment({ status: 'accepted' })]);
        const { status, body } = await callPlan({ input: 'Mueve Entrenar al viernes.' });
        expect(status).toBe(200);
        expect(body.objectiveType).toBe('reschedule_existing_commitment');
        expect(body.status).toBe('ready_for_authorization');
        expect(body.steps[0].toolId).toBe('reschedule_commitment');
        expect(body.steps[0].confirmationRequirement).toBe('explicit');
    });
});

describe('CONTRACT SCENARIO D: "Completa Entrenar." (sección 42)', () => {
    it('resuelve target, verifica lifecycle, plan sólo si válido, NUNCA ejecutado', async () => {
        retrieveCommitmentsMock.mockResolvedValue([commitment({ status: 'accepted' })]);
        const { body } = await callPlan({ input: 'Completa Entrenar.' });
        expect(body.objectiveType).toBe('complete_existing_commitment');
        expect(body.status).toBe('ready_for_authorization');
        expect(body.steps[0].toolId).toBe('complete_commitment');
    });
});

describe('CONTRACT SCENARIO E: "Rechaza Entrenar por mí." donde el actor no puede responder (sección 42)', () => {
    it('invalid/clarify, NUNCA se planea una acción no autorizada', async () => {
        retrieveCommitmentProposalsMock.mockResolvedValue([commitment({ entityType: 'commitment_proposal', status: 'pending', actorCanRespond: false, actorHasApproved: true })]);
        const { status, body } = await callPlan({ input: 'Rechaza Entrenar por mí.' });
        expect(status).toBe(200); // nunca un error HTTP -- un fallo de negocio conocido sigue siendo 200 (mismo principio que /agent/respond)
        expect(body.status).toBe('draft');
        expect(body.canExecute).toBe(false);
        expect(body.failureMode).toBe('not_authorized');
        expect(body.steps).toEqual([]);
    });
});

describe('CONTRACT SCENARIO F: "Pregúntale a Alejandra si puede el viernes y si acepta, agéndalo." (sección 42/17/18)', () => {
    it('plan multi-step condicional', async () => {
        resolvePersonMock.mockResolvedValue({ resolved: person(ALEJANDRA_ID, 'Alejandra'), ambiguous: false, candidates: [] });
        const { body } = await callPlan({ input: 'Pregúntale a Alejandra si puede el viernes y si acepta, agéndalo.', conversationId: CONVERSATION_ID });
        expect(body.objectiveType).toBe('communicate_and_wait');
        expect(body.steps).toHaveLength(2);
        expect(body.steps[0].toolId).toBe('send_message');
        expect(body.steps[1].toolId).toBe('create_commitment');
        expect(body.steps[1].dependsOn).toEqual([body.steps[0].stepId]);
        expect(body.steps[1].conditionDescription).toMatch(/esperar/i);
    });
});

describe('CONTRACT SCENARIO G: "Avísale a Alejandra y Pedro." (sección 42/20)', () => {
    it('pasos de comunicación paralelos, sin dependencia entre ellos', async () => {
        resolvePersonMock.mockImplementation(async (_actorId: string, input: { name: string }) => {
            if (input.name === 'Alejandra') return { resolved: person(ALEJANDRA_ID, 'Alejandra'), ambiguous: false, candidates: [] };
            if (input.name === 'Pedro') return { resolved: person(PEDRO_ID, 'Pedro'), ambiguous: false, candidates: [] };
            return { resolved: null, ambiguous: false, candidates: [] };
        });
        const { body } = await callPlan({ input: 'Avísale a Alejandra y Pedro.', conversationId: CONVERSATION_ID });
        expect(body.objectiveType).toBe('communicate_message');
        expect(body.steps).toHaveLength(2);
        expect(body.steps.every((s: any) => s.dependsOn.length === 0)).toBe(true);
        expect(new Set(body.steps.map((s: any) => s.toolId))).toEqual(new Set(['send_message']));
    });
});

function memoryFact(overrides: Record<string, any> = {}) {
    return {
        id: 'mem-alejandra-1', isCurrent: true, sensitivity: 'normal', confidence: 0.9,
        objectValue: 'a las 08:00', canonicalText: 'Alejandra prefiere entrenar a las 08:00',
        ...overrides,
    };
}

describe('CONTRACT SCENARIO H (literal, sección 6/42): "Usa el horario que Alejandra prefiere para entrenar."', () => {
    it('memoria vigente/autorizada/no-restringida/confiable -> tiempo canónico extraído de memoria, provenance con memory source ref, plan válido', async () => {
        retrieveMemoryMock.mockResolvedValue([memoryFact()]);
        const { status, body } = await callPlan({ input: 'Usa el horario que Alejandra prefiere para entrenar.' });
        expect(status).toBe(200);
        expect(body.objectiveType).toBe('create_commitment_or_proposal');
        expect(body.status).toBe('ready_for_authorization');
        expect(body.steps).toHaveLength(1);
        expect(body.steps[0].toolId).toBe('create_commitment');
        expect(body.canExecute).toBe(true);
        // La respuesta pública no expone canonicalSourceRefs crudos (forma
        // mínima, sección 38) -- la trayectoria completa (incluyendo la
        // referencia real a memory/mem-alejandra-1) ya está certificada a
        // nivel de agentPlanner.test.ts (provenance.canonicalSourceRefs).
    });

    it('adversarial: memoria histórica (isCurrent=false) NUNCA dispara la acción silenciosamente -> needs_clarification', async () => {
        retrieveMemoryMock.mockResolvedValue([memoryFact({ isCurrent: false })]);
        const { body } = await callPlan({ input: 'Usa el horario que Alejandra prefiere para entrenar.' });
        expect(body.status).toBe('needs_clarification');
    });

    it('adversarial: memoria "restricted" -> bloqueada/no usada, nunca expuesta', async () => {
        retrieveMemoryMock.mockResolvedValue([memoryFact({ sensitivity: 'restricted' })]);
        const { body } = await callPlan({ input: 'Usa el horario que Alejandra prefiere para entrenar.' });
        expect(body.status).toBe('needs_clarification');
    });

    it('adversarial: memoria de confianza insuficiente ("no autorizada" a conducir una acción real) -> no usada', async () => {
        retrieveMemoryMock.mockResolvedValue([memoryFact({ confidence: 0.2 })]);
        const { body } = await callPlan({ input: 'Usa el horario que Alejandra prefiere para entrenar.' });
        expect(body.status).toBe('needs_clarification');
    });

    it('sin ninguna memoria adecuada -> needs_clarification (sección 29: "otherwise clarification")', async () => {
        retrieveMemoryMock.mockResolvedValue([]);
        const { body } = await callPlan({ input: 'Usa el horario que Alejandra prefiere para entrenar.' });
        expect(body.status).toBe('needs_clarification');
        expect(body.clarification[0].field).toBe('dueAt');
    });
});

describe('adversarial B: destinatario no reconocido -> resuelto/rechazado desde texto, nunca un ID inventado (sección 41)', () => {
    it('persona no encontrada -> needs_clarification, jamás un plan con un id inventado', async () => {
        resolvePersonMock.mockResolvedValue({ resolved: null, ambiguous: false, candidates: [] });
        const { body } = await callPlan({ input: 'Dile a Zzyx que llegaré tarde.', conversationId: CONVERSATION_ID });
        expect(body.status).toBe('needs_clarification');
        expect(body.steps).toEqual([]);
        expect(body.clarification[0].field).toBe('recipient');
    });
});

describe('adversarial C: completar una proposal pendiente -> rejected (sección 41/24)', () => {
    it('"Completa Entrenar" sobre una proposal pendiente -> draft, failureMode invalid_lifecycle', async () => {
        retrieveCommitmentsMock.mockResolvedValue([]); // no aparece como commitment
        retrieveCommitmentProposalsMock.mockResolvedValue([commitment({ entityType: 'commitment_proposal', status: 'pending' })]);
        const { body } = await callPlan({ input: 'Completa Entrenar.' });
        expect(body.status).toBe('draft');
        expect(body.failureMode).toBe('invalid_lifecycle');
    });
});

describe('adversarial D: aceptar/rechazar en nombre de otro actor -> rejected (sección 41)', () => {
    it('el actor autenticado (CARLOS) sin actorCanRespond -> failureMode not_authorized, nunca actúa "por" otra persona', async () => {
        retrieveCommitmentProposalsMock.mockResolvedValue([commitment({ entityType: 'commitment_proposal', actorCanRespond: false, actorHasApproved: true })]);
        const { body } = await callPlan({ input: 'Acepta Entrenar.' });
        expect(body.status).toBe('draft');
        expect(body.failureMode).toBe('not_authorized');
    });
});

describe('REPEATED PLAN DETERMINISM (sección 43): mismo actor/input/dataset -> misma forma estructural', () => {
    it('3 llamadas idénticas producen objectiveType/toolIds/status/canExecute idénticos', async () => {
        retrieveCommitmentsMock.mockResolvedValue([commitment({ status: 'accepted' })]);
        const results = await Promise.all(Array.from({ length: 3 }, () => callPlan({ input: 'Mueve Entrenar al viernes.' })));
        const [first, ...rest] = results;
        for (const r of rest) {
            expect(r.body.objectiveType).toBe(first.body.objectiveType);
            expect(r.body.status).toBe(first.body.status);
            expect(r.body.canExecute).toBe(first.body.canExecute);
            expect(r.body.steps.map((s: any) => s.toolId)).toEqual(first.body.steps.map((s: any) => s.toolId));
        }
    });
});

describe('sección 40: [PING_PLAN_TRACE] nunca se filtra al público', () => {
    it('la respuesta pública nunca expone traceId/validation/objective crudo', async () => {
        const { body } = await callPlan({ input: 'Dile a Alejandra que llegaré tarde.', conversationId: CONVERSATION_ID });
        expect(body).not.toHaveProperty('traceId');
        expect(body).not.toHaveProperty('validation');
        expect(body).not.toHaveProperty('objective');
    });
});
