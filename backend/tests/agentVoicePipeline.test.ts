// M-5 — VOICE + AMBIENT CONTEXT FOUNDATION.
//
// Covers the required contracts (handoff sección 10) that were still
// untested after Codex's mid-implementation handoff: token security,
// referent safety (weak "lo"/"hazlo" resolution via typed session context),
// low-confidence transcript gating, and that voice NEVER creates a second,
// looser authorization path — it only ever produces the SAME
// AgentInputEnvelope/plan/authorize contract that text already goes
// through (sección 2/3 del ticket M-5).
//
// Unit-level throughout (no HTTP, no real Postgres/OpenAI) — mirrors the
// pattern already established in agentPlanner.test.ts/
// agentAuthorizationPolicy.test.ts: mock only the true I/O boundaries
// (retrieval.service, date-parser.service, memory.service, the OpenAI SDK
// itself), exercise real planner/session/envelope code otherwise.
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AgentObjective } from '../src/types/agentPlan';
import type { AgentInputEnvelope, ContextReferent } from '../src/types/agentInput';
import type { RetrievalCommitment, RetrievalPerson } from '../src/types/retrieval';

const CARLOS = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const OUTSIDER = 'ffffffff-ffff-4fff-8fff-ffffffffffff';
const ENTRENAR_ID = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
const OTHER_COMMITMENT_ID = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';
const DEVICE_SESSION_ID = '99999999-9999-4999-8999-999999999999';

// runAgentPlanning por defecto construye un LlmObjectiveInterpreter real
// -- .env de desarrollo SÍ trae OPENAI_API_KEY, así que sin esto los tests
// de este archivo que no inyectan un interpreter propio harían una llamada
// de red real y no determinística (mismo hallazgo/principio ya documentado
// en agentPlanEndToEnd.test.ts: "OPENAI_API_KEY ausente -> cae al fallback
// determinístico real, sin red"). Se limpia en beforeAll (después de que
// cualquier import indirecto de supabaseAdmin.ts ya haya corrido su propio
// dotenv.config(), que sólo repuebla variables AÚN undefined).
const originalOpenAiApiKey = process.env.OPENAI_API_KEY;
beforeAll(() => { process.env.OPENAI_API_KEY = ''; });
afterAll(() => {
    if (originalOpenAiApiKey === undefined) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = originalOpenAiApiKey;
});

let resolvePersonMock: ReturnType<typeof vi.fn>;
let retrieveCommitmentsMock: ReturnType<typeof vi.fn>;
let retrieveCommitmentProposalsMock: ReturnType<typeof vi.fn>;
let retrieveVisibleCommitmentByIdMock: ReturnType<typeof vi.fn>;
let parseDateFromTextMock: ReturnType<typeof vi.fn>;
let retrieveMemoryMock: ReturnType<typeof vi.fn>;

vi.mock('../src/services/retrieval.service', () => ({
    resolvePerson: (...args: any[]) => resolvePersonMock(...args),
    retrieveCommitments: (...args: any[]) => retrieveCommitmentsMock(...args),
    retrieveCommitmentProposals: (...args: any[]) => retrieveCommitmentProposalsMock(...args),
    retrieveVisibleCommitmentById: (...args: any[]) => retrieveVisibleCommitmentByIdMock(...args),
}));
vi.mock('../src/services/date-parser.service', () => ({
    parseDateFromText: (...args: any[]) => parseDateFromTextMock(...args),
    resolveTimeZone: (tz?: string | null) => tz || 'America/Santiago',
}));
vi.mock('../src/services/memory.service', () => ({
    retrieveMemory: (...args: any[]) => retrieveMemoryMock(...args),
}));

beforeEach(() => {
    resolvePersonMock = vi.fn(async () => ({ resolved: null, ambiguous: false, candidates: [] }));
    retrieveCommitmentsMock = vi.fn(async () => []);
    retrieveCommitmentProposalsMock = vi.fn(async () => []);
    retrieveVisibleCommitmentByIdMock = vi.fn(async () => null);
    parseDateFromTextMock = vi.fn(() => null);
    retrieveMemoryMock = vi.fn(async () => []);
});

function objective(overrides: Partial<AgentObjective> = {}): AgentObjective {
    return {
        objectiveType: 'reschedule_existing_commitment',
        targetEntities: { personHints: [], entityHints: [] },
        constraints: {},
        desiredOutcome: 'test',
        timeConstraints: { rawHint: 'el viernes' },
        actor: CARLOS,
        sourceUtterance: 'Muévelo al viernes.',
        confidence: 0.9,
        ambiguities: [],
        source: 'deterministic',
        ...overrides,
    };
}

function commitmentFixture(overrides: Partial<RetrievalCommitment> = {}): RetrievalCommitment {
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

function referent(overrides: Partial<ContextReferent> = {}): ContextReferent {
    return {
        referentType: 'current_entity',
        canonicalEntityType: 'commitment',
        canonicalEntityId: ENTRENAR_ID,
        sourceTurnId: 'turn-1',
        confidence: 1,
        expiresAt: new Date(Date.now() + 60_000).toISOString(),
        actorScope: CARLOS,
        resolvedFromSignal: 'current_commitment',
        ...overrides,
    };
}

// ─── CONTRACT D/E/F — referent safety (sección 5 del ticket) ───────────────
describe('agentPlanner — weak referent resolution via typed session context (sección 5)', async () => {
    const { planObjective } = await import('../src/services/agentPlanner.service');

    it('D: "Muévelo al viernes" con un referente único, fresco, del mismo actor -> resuelve sin pedir el nombre', async () => {
        retrieveVisibleCommitmentByIdMock.mockResolvedValue(commitmentFixture({ status: 'accepted' }));
        parseDateFromTextMock.mockReturnValue({ date: new Date('2026-09-11T00:00:00.000Z'), isAllDay: true });
        const result = await planObjective({
            objective: objective({ targetEntities: { personHints: [], entityHints: [] } }),
            actorUserId: CARLOS,
            now: new Date('2026-09-07T00:00:00.000Z'),
            contextReferents: [referent()],
        });
        expect(result.blockingAmbiguities).toEqual([]);
        expect(result.steps).toHaveLength(1);
        expect(result.steps[0].toolId).toBe('reschedule_commitment');
        expect(result.steps[0].provenance.resolvedFrom).toBe('canonical_context');
        expect(retrieveVisibleCommitmentByIdMock).toHaveBeenCalledWith(CARLOS, ENTRENAR_ID);
    });

    it('E: mismo mensaje sin ningún referente en la sesión -> pide que se nombre el compromiso (nunca adivina)', async () => {
        const result = await planObjective({
            objective: objective(),
            actorUserId: CARLOS,
            now: new Date('2026-09-07T00:00:00.000Z'),
            contextReferents: [],
        });
        expect(result.steps).toEqual([]);
        expect(result.blockingAmbiguities[0].field).toBe('targetEntity');
        expect(result.blockingAmbiguities[0].reason).toMatch(/No identifiqué/);
        expect(retrieveVisibleCommitmentByIdMock).not.toHaveBeenCalled();
    });

    it('F: "Hazlo" con DOS referentes activos distintos -> clarifica, nunca elige uno arbitrariamente', async () => {
        const result = await planObjective({
            objective: objective({ sourceUtterance: 'Hazlo.', desiredOutcome: 'Hazlo.' }),
            actorUserId: CARLOS,
            now: new Date('2026-09-07T00:00:00.000Z'),
            contextReferents: [referent(), referent({ canonicalEntityId: OTHER_COMMITMENT_ID, sourceTurnId: 'turn-2' })],
        });
        expect(result.steps).toEqual([]);
        expect(result.blockingAmbiguities[0].reason).toMatch(/más de un referente/);
        expect(retrieveVisibleCommitmentByIdMock).not.toHaveBeenCalled();
    });

    it('un referente EXPIRADO nunca cuenta como referente válido (mismo efecto que "sin referente")', async () => {
        const result = await planObjective({
            objective: objective(),
            actorUserId: CARLOS,
            now: new Date('2026-09-07T00:00:00.000Z'),
            contextReferents: [referent({ expiresAt: '2020-01-01T00:00:00.000Z' })],
        });
        expect(result.steps).toEqual([]);
        expect(result.blockingAmbiguities[0].reason).toMatch(/No identifiqué/);
    });

    it('un referente de BAJA confianza (<0.9) nunca cuenta como referente válido', async () => {
        const result = await planObjective({
            objective: objective(),
            actorUserId: CARLOS,
            now: new Date('2026-09-07T00:00:00.000Z'),
            contextReferents: [referent({ confidence: 0.5 })],
        });
        expect(result.steps).toEqual([]);
        expect(result.blockingAmbiguities[0].reason).toMatch(/No identifiqué/);
    });

    it('un referente de OTRO actor nunca se usa, aunque llegue en el mismo array (defensa en profundidad)', async () => {
        const result = await planObjective({
            objective: objective(),
            actorUserId: CARLOS,
            now: new Date('2026-09-07T00:00:00.000Z'),
            contextReferents: [referent({ actorScope: OUTSIDER })],
        });
        expect(result.steps).toEqual([]);
        expect(retrieveVisibleCommitmentByIdMock).not.toHaveBeenCalled();
    });

    it('G: referente sintácticamente válido pero ya no visible/autorizado para el actor -> falla seguro, nunca planifica', async () => {
        retrieveVisibleCommitmentByIdMock.mockResolvedValue(null); // ya no visible (ej. desasignado, o pertenece a otro actor)
        const result = await planObjective({
            objective: objective(),
            actorUserId: CARLOS,
            now: new Date('2026-09-07T00:00:00.000Z'),
            contextReferents: [referent()],
        });
        expect(result.steps).toEqual([]);
        expect(result.failureMode).toBe('entity_not_found');
        expect(result.failureMessage).toMatch(/ya no está disponible/);
    });
});

// ─── CONTRACT G (server-side) — agentSession.service rejects an invisible/
// unauthorized canonical context ref BEFORE it ever becomes a referent ────
describe('agentSession.service — acceptContextSignals never trusts a client-supplied canonical ref (sección 4/9)', async () => {
    const { acceptContextSignals } = await import('../src/services/agentSession.service');

    it('current_commitment inválido/no autorizado -> rechazado, ninguna señal ni referente se crea', async () => {
        const assertCommitment = vi.fn(async () => { throw new Error('not visible'); });
        await expect(acceptContextSignals(
            {
                actorUserId: CARLOS,
                deviceSessionId: DEVICE_SESSION_ID,
                sourceTurnId: 'turn-1',
                candidates: [{ signalType: 'current_commitment', value: ENTRENAR_ID, capturedAt: new Date().toISOString(), permissionBasis: 'foreground_session' }],
            },
            { assertCommitment },
        )).rejects.toThrow();
        expect(assertCommitment).toHaveBeenCalledWith(CARLOS, ENTRENAR_ID);
    });

    it('current_commitment con formato no-UUID -> rechazado antes de tocar cualquier autorización', async () => {
        const assertCommitment = vi.fn(async () => undefined);
        await expect(acceptContextSignals(
            {
                actorUserId: CARLOS,
                deviceSessionId: DEVICE_SESSION_ID,
                sourceTurnId: 'turn-1',
                candidates: [{ signalType: 'current_commitment', value: 'not-a-uuid', capturedAt: new Date().toISOString(), permissionBasis: 'foreground_session' }],
            },
            { assertCommitment },
        )).rejects.toThrow();
        expect(assertCommitment).not.toHaveBeenCalled();
    });

    it('current_commitment válido y autorizado -> produce señal + referente canónico', async () => {
        const assertCommitment = vi.fn(async () => undefined);
        const now = new Date('2026-09-07T00:00:00.000Z');
        const result = await acceptContextSignals(
            {
                actorUserId: CARLOS,
                deviceSessionId: DEVICE_SESSION_ID,
                sourceTurnId: 'turn-1',
                candidates: [{ signalType: 'current_commitment', value: ENTRENAR_ID, capturedAt: now.toISOString(), permissionBasis: 'foreground_session' }],
                now,
            },
            { assertCommitment },
        );
        expect(result.referents).toHaveLength(1);
        expect(result.referents[0].canonicalEntityType).toBe('commitment');
        expect(result.referents[0].actorScope).toBe(CARLOS);
    });

    it('sensibilidad "high" nunca se acepta en M-5 (sección 4: sólo low/medium)', async () => {
        await expect(acceptContextSignals({
            actorUserId: CARLOS,
            deviceSessionId: DEVICE_SESSION_ID,
            sourceTurnId: 'turn-1',
            candidates: [{ signalType: 'current_commitment', value: ENTRENAR_ID, capturedAt: new Date().toISOString(), permissionBasis: 'foreground_session', sensitivity: 'high' }],
        })).rejects.toThrow();
    });
});

// ─── Token security (sección 9: strict validation, actor/session-bound) ────
describe('agentInputEnvelope.service — voiceInputToken is signed, TTL-bound and actor/session-bound (sección 9)', async () => {
    const originalKey = process.env.ENCRYPTION_KEY;
    let issueVoiceInputToken: typeof import('../src/services/agentInputEnvelope.service').issueVoiceInputToken;
    let verifyVoiceInputToken: typeof import('../src/services/agentInputEnvelope.service').verifyVoiceInputToken;
    let createAgentSession: typeof import('../src/services/agentSession.service').createAgentSession;
    let clearAgentSessionsForTests: typeof import('../src/services/agentSession.service').clearAgentSessionsForTests;

    beforeEach(async () => {
        process.env.ENCRYPTION_KEY = 'test-only-voice-token-signing-key';
        ({ issueVoiceInputToken, verifyVoiceInputToken } = await import('../src/services/agentInputEnvelope.service'));
        ({ createAgentSession, clearAgentSessionsForTests } = await import('../src/services/agentSession.service'));
        clearAgentSessionsForTests();
    });

    afterEach(() => {
        if (originalKey === undefined) delete process.env.ENCRYPTION_KEY;
        else process.env.ENCRYPTION_KEY = originalKey;
    });

    function voiceEnvelope(now: Date, overrides: Partial<AgentInputEnvelope> = {}): AgentInputEnvelope {
        const session = createAgentSession({ actorUserId: CARLOS, deviceSessionId: DEVICE_SESSION_ID, surface: 'mobile_voice', signals: [], referents: [], now });
        return {
            inputId: 'input-1',
            actorUserId: CARLOS,
            surface: 'mobile_voice',
            modality: 'voice',
            content: '¿Qué tengo hoy?',
            audioRef: 'audio-1',
            transcriptRef: 'transcript-1',
            conversationId: null,
            agentSessionId: session.sessionId,
            deviceSessionId: DEVICE_SESSION_ID,
            locale: 'es-CL',
            timeZone: 'America/Santiago',
            capturedAt: now.toISOString(),
            explicitConsentContext: { captureInitiatedBy: 'user_action', voiceAuthorizationAllowed: false },
            provenance: { traceId: 'trace-1', transcriptStatus: 'final', provider: 'openai', confidence: 0.9 },
            ...overrides,
        };
    }

    it('roundtrip válido: emite y verifica, devolviendo el envelope y los referentes de la sesión', async () => {
        const now = new Date('2026-09-07T10:00:00.000Z');
        const envelope = voiceEnvelope(now);
        const { token } = issueVoiceInputToken(envelope, now);
        const result = verifyVoiceInputToken(token, CARLOS, now);
        expect(result.envelope.inputId).toBe('input-1');
        expect(result.envelope.content).toBe('¿Qué tengo hoy?');
    });

    it('sólo un transcript FINAL de voz puede convertirse en input firmado (nunca un parcial, nunca texto)', () => {
        const now = new Date('2026-09-07T10:00:00.000Z');
        const textEnvelope = voiceEnvelope(now, { modality: 'text', surface: 'mobile_text', audioRef: null, transcriptRef: null, agentSessionId: null, deviceSessionId: null });
        expect(() => issueVoiceInputToken(textEnvelope, now)).toThrow();

        const partialEnvelope = voiceEnvelope(now, { provenance: { traceId: 'trace-1', transcriptStatus: null as any, provider: 'openai', confidence: 0.9 } });
        expect(() => issueVoiceInputToken(partialEnvelope, now)).toThrow();
    });

    it('token expirado (TTL 5 min) -> rechazado con 410', async () => {
        const now = new Date('2026-09-07T10:00:00.000Z');
        const envelope = voiceEnvelope(now);
        const { token } = issueVoiceInputToken(envelope, now);
        const later = new Date(now.getTime() + 6 * 60 * 1000);
        expect(() => verifyVoiceInputToken(token, CARLOS, later)).toThrowError(expect.objectContaining({ statusCode: 410 }));
    });

    it('token emitido para OTRO actor -> rechazado con 403 (nunca cruza identidades)', async () => {
        const now = new Date('2026-09-07T10:00:00.000Z');
        const envelope = voiceEnvelope(now);
        const { token } = issueVoiceInputToken(envelope, now);
        expect(() => verifyVoiceInputToken(token, OUTSIDER, now)).toThrowError(expect.objectContaining({ statusCode: 403 }));
    });

    it('firma manipulada -> rechazada (HMAC real, no un chequeo cosmético)', async () => {
        const now = new Date('2026-09-07T10:00:00.000Z');
        const envelope = voiceEnvelope(now);
        const { token } = issueVoiceInputToken(envelope, now);
        const [encoded] = token.split('.');
        const tampered = `${encoded}.${Buffer.from('not-the-real-signature').toString('base64url')}`;
        expect(() => verifyVoiceInputToken(tampered, CARLOS, now)).toThrowError(expect.objectContaining({ statusCode: 403 }));
    });

    it('payload con forma inválida (sin punto separador, o basura) -> 400, nunca crashea el proceso', () => {
        const now = new Date('2026-09-07T10:00:00.000Z');
        expect(() => verifyVoiceInputToken('not-a-real-token', CARLOS, now)).toThrowError(expect.objectContaining({ statusCode: 400 }));
        expect(() => verifyVoiceInputToken('', CARLOS, now)).toThrowError(expect.objectContaining({ statusCode: 400 }));
    });

    it('sesión de agente ya expirada/inexistente -> el token deja de ser utilizable (sección 4: "session context is temporary")', async () => {
        const now = new Date('2026-09-07T10:00:00.000Z');
        const envelope = voiceEnvelope(now);
        const { token } = issueVoiceInputToken(envelope, now);
        clearAgentSessionsForTests(); // simula expiración/purga de la sesión efímera
        expect(() => verifyVoiceInputToken(token, CARLOS, now)).toThrowError(expect.objectContaining({ statusCode: 403 }));
    });
});

// ─── CONTRACT (transcript safety) — low-confidence voice transcripts must
// block planning rather than let the objective interpreter guess ─────────
describe('agentPlanOrchestrator — low-confidence voice transcript blocks planning before interpretation (sección 6)', async () => {
    const { runAgentPlanning } = await import('../src/services/agentPlanOrchestrator.service');

    function envelope(confidence: number | null): any {
        return {
            inputId: 'input-1', actorUserId: CARLOS, surface: 'mobile_voice', modality: 'voice',
            content: 'Dile a Alejandra que llegaré tarde', audioRef: 'a1', transcriptRef: 't1',
            conversationId: null, agentSessionId: 's1', deviceSessionId: DEVICE_SESSION_ID,
            locale: null, timeZone: null, capturedAt: new Date().toISOString(),
            explicitConsentContext: { captureInitiatedBy: 'user_action', voiceAuthorizationAllowed: false },
            provenance: { traceId: 'trace-1', transcriptStatus: 'final', provider: 'openai', confidence },
        };
    }

    it('confianza baja (0.4 < 0.65) -> needs_clarification inmediato, cero pasos, cero interpretación de objetivo', async () => {
        const interpreter = { interpret: vi.fn(async () => ({})) };
        const result = await runAgentPlanning(
            { actorUserId: CARLOS, input: 'Dile a Alejandra que llegaré tarde', inputEnvelope: envelope(0.4) },
            { objectiveInterpreter: interpreter as any },
        );
        expect(result.status).toBe('needs_clarification');
        expect(result.steps).toEqual([]);
        expect(result.canExecute).toBe(false);
        expect(interpreter.interpret).not.toHaveBeenCalled();
    });

    it('confianza null (proveedor sin señal de confianza) -> NO bloquea, sigue el flujo normal', async () => {
        resolvePersonMock.mockResolvedValue({ resolved: { kind: 'user', id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', displayName: 'Alejandra' } as RetrievalPerson, ambiguous: false, candidates: [] });
        const result = await runAgentPlanning({ actorUserId: CARLOS, input: 'Dile a Alejandra que llegaré tarde', conversationId: '11111111-1111-4111-8111-111111111111', inputEnvelope: envelope(null) });
        expect(result.status).not.toBe('needs_clarification');
    });

    it('confianza alta (0.9) -> NO bloquea, sigue el flujo normal', async () => {
        resolvePersonMock.mockResolvedValue({ resolved: { kind: 'user', id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', displayName: 'Alejandra' } as RetrievalPerson, ambiguous: false, candidates: [] });
        const result = await runAgentPlanning({ actorUserId: CARLOS, input: 'Dile a Alejandra que llegaré tarde', conversationId: '11111111-1111-4111-8111-111111111111', inputEnvelope: envelope(0.9) });
        expect(result.status).not.toBe('needs_clarification');
    });

    it('sin inputEnvelope (texto plano, flujo pre-M-5) -> comportamiento idéntico al de siempre', async () => {
        resolvePersonMock.mockResolvedValue({ resolved: { kind: 'user', id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', displayName: 'Alejandra' } as RetrievalPerson, ambiguous: false, candidates: [] });
        const result = await runAgentPlanning({ actorUserId: CARLOS, input: 'Dile a Alejandra que llegaré tarde', conversationId: '11111111-1111-4111-8111-111111111111' });
        expect(result.status).toBe('ready_for_authorization');
    });
});

// ─── CONTRACT K — un mismo objetivo produce el mismo plan sin importar si
// llegó como texto o como transcript final de voz (misma envolvente Core) ──
describe('CONTRACT K — texto vs. voz producen un plan estructuralmente equivalente', async () => {
    const { runAgentPlanning } = await import('../src/services/agentPlanOrchestrator.service');

    it('"Agenda entrenar mañana a las 8." por texto y por voz (transcript final, alta confianza) -> mismo objectiveType/status/steps', async () => {
        const now = new Date('2026-09-07T09:00:00.000Z');
        parseDateFromTextMock.mockReturnValue({ date: new Date('2026-09-08T08:00:00.000Z'), isAllDay: false });
        const textResult = await runAgentPlanning({ actorUserId: CARLOS, input: 'Agenda entrenar mañana a las 8.', now });
        const voiceResult = await runAgentPlanning({
            actorUserId: CARLOS,
            input: 'Agenda entrenar mañana a las 8.',
            now,
            inputEnvelope: {
                inputId: 'input-2', actorUserId: CARLOS, surface: 'mobile_voice', modality: 'voice',
                content: 'Agenda entrenar mañana a las 8.', audioRef: 'a2', transcriptRef: 't2',
                conversationId: null, agentSessionId: 's2', deviceSessionId: DEVICE_SESSION_ID,
                locale: null, timeZone: null, capturedAt: now.toISOString(),
                explicitConsentContext: { captureInitiatedBy: 'user_action', voiceAuthorizationAllowed: false },
                provenance: { traceId: 'trace-2', transcriptStatus: 'final', provider: 'openai', confidence: 0.95 },
            } as any,
        });
        expect(voiceResult.objective.objectiveType).toBe(textResult.objective.objectiveType);
        expect(voiceResult.status).toBe(textResult.status);
        expect(voiceResult.steps.map((s) => s.toolId)).toEqual(textResult.steps.map((s) => s.toolId));
        expect(voiceResult.canExecute).toBe(textResult.canExecute);
        // Ninguno de los dos ejecuta nada -- ambos son sólo un plan (sección 2).
        expect(textResult.status === 'ready_for_authorization' ? textResult.canExecute : true).toBe(true);
    });
});

// ─── CONTRACT J — un plan/autorización de voz nunca se auto-confirma; el
// esquema exige exactamente los mismos campos que el flujo de texto ────────
describe('CONTRACT J — voiceInputToken nunca reemplaza la confirmación explícita (sección 2 del ticket M-5)', async () => {
    const { agentAuthorizeRequestSchema } = await import('../src/schemas/agentAuthorizeRequest.schema');
    const { agentPlanRequestSchema } = await import('../src/schemas/agentPlanRequest.schema');

    const DIGEST = 'd'.repeat(64); // sha256 hex (64 chars) — forma exigida por el schema

    it('authorize con voiceInputToken pero SIN confirm:true -> 400 (voice no es autorización)', () => {
        const result = agentAuthorizeRequestSchema.safeParse({
            body: { voiceInputToken: 'x'.repeat(30), planDigest: DIGEST, stepIds: ['step-0'], confirm: false },
        });
        expect(result.success).toBe(false);
    });

    it('authorize con voiceInputToken y confirm:true pero SIN stepIds -> 400', () => {
        const result = agentAuthorizeRequestSchema.safeParse({
            body: { voiceInputToken: 'x'.repeat(30), planDigest: DIGEST, stepIds: [], confirm: true },
        });
        expect(result.success).toBe(false);
    });

    it('authorize con input Y voiceInputToken a la vez -> 400 (exactamente uno de los dos)', () => {
        const result = agentAuthorizeRequestSchema.safeParse({
            body: { input: 'hola', voiceInputToken: 'x'.repeat(30), planDigest: DIGEST, stepIds: ['step-0'], confirm: true },
        });
        expect(result.success).toBe(false);
    });

    it('authorize sin input NI voiceInputToken -> 400', () => {
        const result = agentAuthorizeRequestSchema.safeParse({
            body: { planDigest: DIGEST, stepIds: ['step-0'], confirm: true },
        });
        expect(result.success).toBe(false);
    });

    it('voiceInputToken junto con conversationId/channel/locale/timezone -> 400 (el contexto de voz va atado al token firmado, no se puede sobreescribir)', () => {
        const plan = agentPlanRequestSchema.safeParse({
            body: { voiceInputToken: 'x'.repeat(30), conversationId: '11111111-1111-4111-8111-111111111111' },
        });
        expect(plan.success).toBe(false);
        const authorize = agentAuthorizeRequestSchema.safeParse({
            body: { voiceInputToken: 'x'.repeat(30), channel: 'mobile', planDigest: DIGEST, stepIds: ['step-0'], confirm: true },
        });
        expect(authorize.success).toBe(false);
    });

    it('authorize válido con voiceInputToken (forma correcta) -> pasa la validación de esquema (la autorización real sigue exigiendo planDigest/atomic RPC, cubierto en agentAuthorizationPolicy.test.ts + integración Postgres)', () => {
        const result = agentAuthorizeRequestSchema.safeParse({
            body: { voiceInputToken: 'x'.repeat(30), planDigest: DIGEST, stepIds: ['step-0'], confirm: true },
        });
        expect(result.success).toBe(true);
    });
});
