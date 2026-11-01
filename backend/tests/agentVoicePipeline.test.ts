// M-5 — voice input foundation: signed voice tokens (TTL, actor and session
// bound) and server-side acceptance of ambient context signals. A dictated
// turn reaches the same assistant as text; these contracts keep its
// provenance honest. Unit-level: only true I/O boundaries are mocked.
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
vi.mock('../src/services/date-parser.service', async (importOriginal) => {
    const actual = await importOriginal<typeof import('../src/services/date-parser.service')>();
    return {
        ...actual,
        parseDateFromText: (...args: any[]) => parseDateFromTextMock(...args),
        resolveTimeZone: (tz?: string | null) => tz || 'America/Santiago',
    };
});
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

    function voiceEnvelope(now: Date, overrides: Partial<AgentInputEnvelope> = {}, surface: 'mobile_voice' | 'tablet' = 'mobile_voice'): AgentInputEnvelope {
        const session = createAgentSession({ actorUserId: CARLOS, deviceSessionId: DEVICE_SESSION_ID, surface, signals: [], referents: [], now });
        return {
            inputId: 'input-1',
            actorUserId: CARLOS,
            surface,
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
        const { createReviewedVoiceTextInputEnvelope } = await import('../src/services/agentInputEnvelope.service');
        const reviewed = createReviewedVoiceTextInputEnvelope({
            actorUserId: CARLOS,
            content: 'texto corregido por el usuario',
            reviewedVoiceInputToken: token,
            traceId: 'review-trace',
            now,
        });
        expect(reviewed.envelope.modality).toBe('text');
        expect(reviewed.envelope.content).toBe('texto corregido por el usuario');
        expect(reviewed.envelope.audioRef).toBe('audio-1');
        expect(reviewed.envelope.provenance.reviewedByUser).toBe(true);
        expect(reviewed.envelope.provenance.reviewedVoiceInputId).toBe('input-1');
        expect(result.envelope.content).toBe('¿Qué tengo hoy?');
    });

    it('roundtrip válido para tablet: conserva la superficie de voz sin crear otro pipeline', async () => {
        const now = new Date('2026-09-07T10:00:00.000Z');
        const envelope = voiceEnvelope(now, {}, 'tablet');
        const { token } = issueVoiceInputToken(envelope, now);
        const result = verifyVoiceInputToken(token, CARLOS, now);
        expect(result.envelope.surface).toBe('tablet');
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
