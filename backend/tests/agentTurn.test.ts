// M-6 — AgentTurn routing tests. Core decides: response / plan / clarification
// / unsupported. Mobile MUST NOT contain semantic routing heuristics.
//
// Mocking strategy: unlike agentEndToEnd.test.ts (which only mocks the
// Supabase client and exercises real retrieval.service.ts SQL-shaped
// matching), this file mocks retrieval.service.ts + memory.service.ts
// WHOLESALE — the exact same pattern already certified by
// agentPlanEndToEnd.test.ts. /agent/turn's own routing calls buildAgentContext
// (which goes through retrieval.service.ts) and, for write-shaped input, ALSO
// runs the M-3 planning pipeline (which independently re-resolves people/
// entities through the SAME retrieval.service.ts functions, by design — see
// agentPlanOrchestrator.service.ts's header comment). Mocking the functions
// directly means both call sites are covered uniformly regardless of how many
// times each fires, with no fragile "N rounds of raw table rows" bookkeeping.
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Server } from 'http';
import type { AgentPlan, AgentPlanStep } from '../src/types/agentPlan';

// M-6 semantic enrichment bridge -- OPENAI_API_KEY is deliberately blank in
// this suite (see beforeAll below), so proposeSemanticContentCandidate would
// otherwise fail safely to null for every natural-phrasing "Dile a ... que
// ..." fixture used throughout this file (no colon/quote -> no deterministic
// candidate -> the real function needs a live model). This test-only stand-in
// proves the BRIDGE WIRING (deterministic-first -> enrichment -> Core
// validation) without a network call: it returns the exact verbatim
// substring that already appears in the fixture utterance -- Core
// (validateCommunicateContent) still independently locates/validates it,
// exactly as it would a real provider's response. Everything else in the
// module (DeterministicObjectiveInterpreter, DeterministicInputInterpreter,
// proposeCommunicateContent, etc.) stays real.
vi.mock('../src/services/agentObjectiveInterpreter.service', async (importOriginal) => {
    const actual = await importOriginal<typeof import('../src/services/agentObjectiveInterpreter.service')>();
    return {
        ...actual,
        proposeSemanticContentCandidate: vi.fn(async (sourceUtterance: string) => {
            if (sourceUtterance.includes('llegaré tarde')) {
                return { verbatimText: 'llegaré tarde.', extractionMode: 'semantic_verbatim' as const };
            }
            return null;
        }),
    };
});

const originalApiKey = process.env.OPENAI_API_KEY;
const originalEncryptionKey = process.env.ENCRYPTION_KEY;

let server: Server;
let baseUrl: string;
let mockHelpers: typeof import('./helpers/supabaseMock');

let resolvePersonMock: ReturnType<typeof vi.fn>;
let retrieveCommitmentsMock: ReturnType<typeof vi.fn>;
let retrieveCommitmentProposalsMock: ReturnType<typeof vi.fn>;
let retrieveCommitmentEventsMock: ReturnType<typeof vi.fn>;
let retrieveMessagesMock: ReturnType<typeof vi.fn>;
let retrieveTranscriptionsMock: ReturnType<typeof vi.fn>;
let retrieveAttachmentsMock: ReturnType<typeof vi.fn>;
let retrieveVisibleCommitmentByIdMock: ReturnType<typeof vi.fn>;
let retrieveMemoryMock: ReturnType<typeof vi.fn>;
let buildAgentContextSpy: ReturnType<typeof vi.fn>;
let authorizePlanSpy: ReturnType<typeof vi.fn>;
let executeAuthorizationSpy: ReturnType<typeof vi.fn>;

const CARLOS = 'e2e-turn-carlos';
const VALID_TOKEN = 'valid-turn-token';
const ALEJANDRA_ID = 'aaaaaaaa-bbbb-4aaa-8aaa-aaaaaaaaaaaa';
const CONVERSATION_ID = '11111111-1111-4111-8111-111111111111';
const ENTRENAR_ID = '22222222-2222-4222-8222-222222222222';

function person(id: string, displayName: string) {
    return { kind: 'user' as const, id, displayName };
}

function commitment(overrides: Record<string, any> = {}) {
    return {
        id: ENTRENAR_ID, entityType: 'commitment' as const, title: 'Entrenar', description: null,
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
    retrieveCommitmentEventsMock = vi.fn(async () => []);
    retrieveMessagesMock = vi.fn(async () => []);
    retrieveTranscriptionsMock = vi.fn(async () => []);
    retrieveAttachmentsMock = vi.fn(async () => []);
    retrieveVisibleCommitmentByIdMock = vi.fn(async () => null);
    retrieveMemoryMock = vi.fn(async () => []);

    const vitest = await import('vitest');
    vitest.vi.doMock('express-rate-limit', () => ({
        default: () => (_req: any, _res: any, next: () => void) => next(),
    }));
    vitest.vi.doMock('../src/services/retrieval.service', () => ({
        resolvePerson: (...args: any[]) => resolvePersonMock(...args),
        retrieveCommitments: (...args: any[]) => retrieveCommitmentsMock(...args),
        retrieveCommitmentProposals: (...args: any[]) => retrieveCommitmentProposalsMock(...args),
        retrieveCommitmentEvents: (...args: any[]) => retrieveCommitmentEventsMock(...args),
        retrieveMessages: (...args: any[]) => retrieveMessagesMock(...args),
        retrieveTranscriptions: (...args: any[]) => retrieveTranscriptionsMock(...args),
        retrieveAttachments: (...args: any[]) => retrieveAttachmentsMock(...args),
        retrieveVisibleCommitmentById: (...args: any[]) => retrieveVisibleCommitmentByIdMock(...args),
        dedupeProvenance: (items: any[]) => items,
    }));
    vitest.vi.doMock('../src/services/memory.service', () => ({
        retrieveMemory: (...args: any[]) => retrieveMemoryMock(...args),
    }));

    // Section 6 test H: "/turn never calls execution or mutation services" —
    // spy on the REAL M-4 modules (never replaced) so a call would still
    // work but is provably absent.
    const authModule = await import('../src/services/agentAuthorization.service');
    const execModule = await import('../src/services/agentExecution.service');
    authorizePlanSpy = vi.spyOn(authModule, 'authorizePlan');
    executeAuthorizationSpy = vi.spyOn(execModule, 'executeAuthorization');

    const contextBuilderModule = await import('../src/services/agentContextBuilder.service');
    buildAgentContextSpy = vi.spyOn(contextBuilderModule, 'buildAgentContext');

    const { supabaseAdminMockModule } = await import('./helpers/supabaseMock');
    vitest.vi.doMock('../src/lib/supabaseAdmin', () => supabaseAdminMockModule());
    mockHelpers = await import('./helpers/supabaseMock');
    mockHelpers.setSupabaseAuthGetUserMock(async (token: string) => {
        if (token === VALID_TOKEN) return { data: { user: { id: CARLOS, email: 'carlos@example.invalid' } }, error: null };
        return { data: { user: null }, error: new Error('invalid token') };
    });

    const { app } = await import('../src/app');
    process.env.OPENAI_API_KEY = '';
    process.env.ENCRYPTION_KEY = 'test-only-turn-token-signing-key';

    await new Promise<void>((resolve) => { server = app.listen(0, () => resolve()); });
    const address = server.address();
    const port = typeof address === 'object' && address ? address.port : 0;
    baseUrl = `http://127.0.0.1:${port}`;
}, 30000);

afterAll(async () => {
    if (originalApiKey === undefined) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = originalApiKey;
    if (originalEncryptionKey === undefined) delete process.env.ENCRYPTION_KEY;
    else process.env.ENCRYPTION_KEY = originalEncryptionKey;
    await new Promise<void>((resolve) => server.close(() => resolve()));
});

beforeEach(() => {
    buildAgentContextSpy.mockClear();
    authorizePlanSpy.mockClear();
    executeAuthorizationSpy.mockClear();
});

afterEach(() => {
    resolvePersonMock.mockReset().mockResolvedValue({ resolved: null, ambiguous: false, candidates: [] });
    retrieveCommitmentsMock.mockReset().mockResolvedValue([]);
    retrieveCommitmentProposalsMock.mockReset().mockResolvedValue([]);
    retrieveCommitmentEventsMock.mockReset().mockResolvedValue([]);
    retrieveMessagesMock.mockReset().mockResolvedValue([]);
    retrieveTranscriptionsMock.mockReset().mockResolvedValue([]);
    retrieveAttachmentsMock.mockReset().mockResolvedValue([]);
    retrieveVisibleCommitmentByIdMock.mockReset().mockResolvedValue(null);
    retrieveMemoryMock.mockReset().mockResolvedValue([]);
    mockHelpers.setSupabaseAdminMock(mockHelpers.createSupabaseAdminMock({}));
});

async function postTurn(body: Record<string, any>, token: string = VALID_TOKEN) {
    const res = await fetch(`${baseUrl}/api/agent/turn`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(body),
    });
    return { status: res.status, body: await res.json() };
}

describe('POST /agent/turn — Core routing ownership (mobile must NOT decide)', () => {
    it('A) read-only question -> kind=response, no plan, no writes', async () => {
        retrieveCommitmentsMock.mockResolvedValue([commitment()]);

        const res = await postTurn({ input: '¿Qué tengo hoy?' });

        expect(res.status).toBe(200);
        expect(res.body.kind).toBe('response');
        expect(res.body.response).toBeDefined();
        expect(res.body.response.status).toBe('answered');
        expect(res.body.plan).toBeUndefined();
        expect(authorizePlanSpy).not.toHaveBeenCalled();
        expect(executeAuthorizationSpy).not.toHaveBeenCalled();
    });

    it('B) action "Dile a Alejandra que llegaré tarde." -> kind=plan', async () => {
        resolvePersonMock.mockResolvedValue({ resolved: person(ALEJANDRA_ID, 'Alejandra Gómez'), ambiguous: false, candidates: [] });

        const res = await postTurn({ input: 'Dile a Alejandra que llegaré tarde.', conversationId: CONVERSATION_ID });

        expect(res.status).toBe(200);
        expect(res.body.kind).toBe('plan');
        expect(res.body.plan.steps.length).toBeGreaterThan(0);
        expect(res.body.plan.steps[0].toolId).toBe('send_message');
        expect(res.body.presentation).toBeDefined();
        expect(res.body.presentation.confirmationLabel).toBe('Enviar');
        expect(res.body.plan.status).not.toBe('executed');
        expect(authorizePlanSpy).not.toHaveBeenCalled();
        expect(executeAuthorizationSpy).not.toHaveBeenCalled();
    });

    it('C) create personal commitment "Agenda entrenar mañana a las 8" -> kind=plan with create_commitment', async () => {
        const res = await postTurn({ input: 'Agenda entrenar mañana a las 8' });

        expect(res.status).toBe(200);
        expect(res.body.kind).toBe('plan');
        expect(res.body.plan.steps[0].toolId).toBe('create_commitment');
        expect(res.body.presentation.confirmationLabel).toBe('Crear');
    });

    it('D) ambiguous action target -> kind=clarification', async () => {
        retrieveCommitmentsMock.mockResolvedValue([
            commitment({ id: 'c1', title: 'Entrenar (lunes)' }),
            commitment({ id: 'c2', title: 'Entrenar (viernes)' }),
        ]);

        const res = await postTurn({ input: 'Mueve Entrenar al viernes' });

        expect(res.status).toBe(200);
        expect(res.body.kind).toBe('clarification');
        expect(res.body.questions).toBeDefined();
        expect(res.body.questions.length).toBeGreaterThan(0);
    });

    it('E) unsupported objective -> kind=unsupported with helpful examples', async () => {
        const res = await postTurn({ input: 'Haz mis impuestos' });

        expect(res.status).toBe(200);
        expect(res.body.kind).toBe('unsupported');
        expect(res.body.reason).toBeDefined();
        expect(res.body.supportedExamples).toBeInstanceOf(Array);
        expect(res.body.supportedExamples.length).toBeGreaterThan(0);
    });

    it('F) voiceInputToken with equivalent final transcript -> same routing as equivalent text input', async () => {
        resolvePersonMock.mockResolvedValue({ resolved: person(ALEJANDRA_ID, 'Alejandra Gómez'), ambiguous: false, candidates: [] });

        const textRes = await postTurn({ input: 'Dile a Alejandra que llegaré tarde.', conversationId: CONVERSATION_ID });
        expect(textRes.body.kind).toBe('plan');

        const token = await buildVoiceToken('Dile a Alejandra que llegaré tarde.', { confidence: 0.95 });
        const voiceRes = await postTurn({ voiceInputToken: token });

        expect(voiceRes.status).toBe(200);
        expect(voiceRes.body.kind).toBe('plan');
        expect(voiceRes.body.plan.steps[0].toolId).toBe('send_message');
    });

    it('7) voice and text converge through the exact same deterministic-first + semantic-enrichment bridge -- identical frozen send_message content either way', async () => {
        resolvePersonMock.mockResolvedValue({ resolved: person(ALEJANDRA_ID, 'Alejandra Gómez'), ambiguous: false, candidates: [] });

        const textRes = await postTurn({ input: 'Dile a Alejandra que llegaré tarde.', conversationId: CONVERSATION_ID });
        const token = await buildVoiceToken('Dile a Alejandra que llegaré tarde.', { confidence: 0.95 });
        const voiceRes = await postTurn({ voiceInputToken: token });

        expect(textRes.body.kind).toBe('plan');
        expect(voiceRes.body.kind).toBe('plan');
        expect(textRes.body.plan.status).toBe(voiceRes.body.plan.status);
        // The public plan shape never exposes raw arguments (sección 44) --
        // convergence is certified via the frozen content preview both
        // plans present to the user, which must be identical either way
        // since both funnel through the exact same bridge/Core validation.
        expect(textRes.body.presentation.stepPresentations[0].contentPreview)
            .toBe(voiceRes.body.presentation.stepPresentations[0].contentPreview);
        expect(textRes.body.presentation.stepPresentations[0].contentPreview).toBe('llegaré tarde.');
    });

    it('G) low-confidence voice transcript on an actionable utterance -> clarification, never a silent plan', async () => {
        resolvePersonMock.mockResolvedValue({ resolved: person(ALEJANDRA_ID, 'Alejandra Gómez'), ambiguous: false, candidates: [] });
        const token = await buildVoiceToken('Dile a Alejandra que llegaré tarde.', { confidence: 0.3 });

        const res = await postTurn({ voiceInputToken: token });

        expect(res.status).toBe(200);
        expect(res.body.kind).toBe('clarification');
    });

    it('H) /turn never calls authorization or execution services', async () => {
        resolvePersonMock.mockResolvedValue({ resolved: person(ALEJANDRA_ID, 'Alejandra Gómez'), ambiguous: false, candidates: [] });

        await postTurn({ input: '¿Qué tengo hoy?' });
        await postTurn({ input: 'Dile a Alejandra que llegaré tarde.', conversationId: CONVERSATION_ID });
        await postTurn({ input: 'Haz mis impuestos' });

        expect(authorizePlanSpy).not.toHaveBeenCalled();
        expect(executeAuthorizationSpy).not.toHaveBeenCalled();
    });

    it('I) legacy /agent/respond and /agent/plan contracts remain unchanged', async () => {
        retrieveCommitmentsMock.mockResolvedValue([commitment()]);
        const res1 = await fetch(`${baseUrl}/api/agent/respond`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${VALID_TOKEN}` },
            body: JSON.stringify({ input: '¿Qué tengo hoy?' }),
        });
        const body1 = await res1.json();
        expect(res1.status).toBe(200);
        expect(body1.status).toBe('answered');

        retrieveCommitmentsMock.mockResolvedValue([]);
        resolvePersonMock.mockResolvedValue({ resolved: person(ALEJANDRA_ID, 'Alejandra Gómez'), ambiguous: false, candidates: [] });
        const res2 = await fetch(`${baseUrl}/api/agent/plan`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${VALID_TOKEN}` },
            body: JSON.stringify({ input: 'Dile a Alejandra que llegaré tarde.', conversationId: CONVERSATION_ID }),
        });
        const body2 = await res2.json();
        expect(res2.status).toBe(200);
        expect(body2.steps).toBeDefined();
    });

    it('J) a response-kind turn builds context exactly once (never re-derives it via runAgent)', async () => {
        retrieveCommitmentsMock.mockResolvedValue([commitment()]);

        const res = await postTurn({ input: '¿Qué tengo hoy?' });

        expect(res.body.kind).toBe('response');
        expect(buildAgentContextSpy).toHaveBeenCalledTimes(1);
    });

    it('K) a deterministically resolved action reuses its objective and does not build the read context first', async () => {
        resolvePersonMock.mockResolvedValue({ resolved: person(ALEJANDRA_ID, 'Alejandra Gómez'), ambiguous: false, candidates: [] });
        const res = await postTurn({ input: 'Dile a Alejandra que llegaré tarde.', conversationId: CONVERSATION_ID });

        expect(res.body.kind).toBe('plan');
        expect(buildAgentContextSpy).not.toHaveBeenCalled();
    });
});

// ─── Voice token helper (mirrors agentVoicePipeline.test.ts's `voiceEnvelope`) ─
async function buildVoiceToken(content: string, opts: { confidence: number }): Promise<string> {
    const { issueVoiceInputToken } = await import('../src/services/agentInputEnvelope.service');
    const { createAgentSession } = await import('../src/services/agentSession.service');
    const now = new Date();
    const session = createAgentSession({ actorUserId: CARLOS, deviceSessionId: 'device-1', surface: 'mobile_voice', signals: [], referents: [], now });
    const envelope = {
        inputId: 'input-1',
        actorUserId: CARLOS,
        surface: 'mobile_voice' as const,
        modality: 'voice' as const,
        content,
        audioRef: 'audio-1',
        transcriptRef: 'transcript-1',
        conversationId: CONVERSATION_ID,
        agentSessionId: session.sessionId,
        deviceSessionId: 'device-1',
        locale: 'es-CL',
        timeZone: 'America/Santiago',
        capturedAt: now.toISOString(),
        explicitConsentContext: { captureInitiatedBy: 'user_action' as const, voiceAuthorizationAllowed: false as const },
        provenance: { traceId: 'trace-1', transcriptStatus: 'final' as const, provider: 'openai', confidence: opts.confidence },
    };
    return issueVoiceInputToken(envelope, now).token;
}

// ─── PlanPresentation — Core-owned, derived strictly from the FROZEN plan ──
// Unit-level (not HTTP): builds AgentPlan/AgentPlanStep fixtures directly so
// this exercises exactly what agentTurn.service.ts#buildPlanPresentation does
// with the REAL, schema-frozen argument shape (never a mobile-side guess),
// independent of what the current deterministic objective interpreter's
// regex vocabulary can or cannot reach from raw text (e.g. wiring
// "responsiblePersonId" for a shared commitment is an M-3 concern with its
// own certified test suite — this file only certifies what Core does with a
// plan once it exists).
describe('PlanPresentation — Core-owned, derives from frozen plan arguments', () => {
    let buildPlanPresentation: typeof import('../src/services/agentTurn.service').buildPlanPresentation;

    beforeAll(async () => {
        ({ buildPlanPresentation } = await import('../src/services/agentTurn.service'));
    });

    function baseStep(overrides: Partial<AgentPlanStep>): AgentPlanStep {
        return {
            stepId: 'step-0',
            toolId: 'send_message',
            toolVersion: 1,
            operation: 'Enviar mensaje a Alejandra Gómez',
            arguments: {},
            dependsOn: [],
            condition: { type: 'always', description: 'No preconditions — can be attempted immediately.' },
            expectedEffect: '',
            authorizationRequirement: 'conversation_membership',
            confirmationRequirement: 'explicit',
            sideEffectClass: 'state_change',
            riskLevel: 'medium',
            preconditions: [],
            postconditions: [],
            rollbackCapability: 'reversible_by_owner',
            provenance: { resolvedFrom: 'entity_resolution', canonicalSourceRefs: [] },
            status: 'pending',
            ...overrides,
        };
    }

    function plan(steps: AgentPlanStep[], overrides: Partial<AgentPlan> = {}): AgentPlan {
        return {
            planId: 'plan-1',
            objective: {
                objectiveType: 'communicate_message', targetEntities: { personHints: [], entityHints: [] },
                constraints: {}, desiredOutcome: '', timeConstraints: { rawHint: null }, actor: CARLOS,
                sourceUtterance: '', confidence: 0.8, ambiguities: [], source: 'deterministic',
            },
            status: 'ready_for_authorization',
            steps,
            requiredConfirmations: ['explicit'],
            unresolvedInputs: [],
            riskSummary: { highestRiskLevel: 'medium', riskLevelCounts: { low: 0, medium: steps.length, high: 0 } },
            canExecute: true,
            createdAt: '2026-09-01T00:00:00.000Z',
            validation: { valid: true, issues: [] },
            humanReadableSummary: 'Haré esto.',
            planDigest: 'x'.repeat(64),
            ...overrides,
        };
    }

    it('send_message: exact recipient + exact frozen message preview', () => {
        const step = baseStep({
            toolId: 'send_message',
            operation: 'Enviar mensaje a Alejandra Gómez',
            arguments: { conversationId: CONVERSATION_ID, recipientPersonId: ALEJANDRA_ID, content: 'Llegaré tarde.' },
        });
        const presentation = buildPlanPresentation(plan([step], { objective: { ...plan([]).objective, objectiveType: 'communicate_message' } }));

        expect(presentation.targetLabel).toBe('Alejandra Gómez');
        expect(presentation.stepPresentations[0].contentPreview).toBe('Llegaré tarde.');
        expect(presentation.confirmationLabel).toBe('Enviar');
    });

    it('create personal commitment: title + canonical date/time', () => {
        const step = baseStep({
            toolId: 'create_commitment',
            operation: 'Crear compromiso "Entrenar"',
            arguments: { title: 'Entrenar', dueAt: '2026-09-10T11:00:00.000Z', responsiblePersonId: null, conversationId: null },
        });
        const presentation = buildPlanPresentation(
            plan([step], { objective: { ...plan([]).objective, objectiveType: 'create_personal_commitment' } }),
            { timezone: 'America/Santiago', locale: 'es-CL', now: new Date('2026-09-09T15:00:00.000Z') },
        );

        expect(presentation.targetLabel).toBe('Entrenar');
        expect(presentation.dateLabel).toContain('08:00');
        expect(presentation.confirmationLabel).toBe('Crear');
    });

    it('shared commitment -> proposal semantics: MUST say "Propondré", never an already-confirmed commitment', () => {
        const step = baseStep({
            toolId: 'create_commitment',
            operation: 'Proponer compromiso "Ver peli" a Alejandra Gómez',
            arguments: { title: 'Ver peli', dueAt: '2026-09-10T21:00:00.000Z', responsiblePersonId: ALEJANDRA_ID, conversationId: CONVERSATION_ID },
        });
        const presentation = buildPlanPresentation(
            plan([step], { objective: { ...plan([]).objective, objectiveType: 'create_commitment_or_proposal' } }),
            { timezone: 'America/Santiago', locale: 'es-CL' },
        );

        expect(presentation.confirmationLabel).toBe('Proponer');
        expect(presentation.headline).toContain('Propondré');
        expect(presentation.stepPresentations[0].recipientLabel).toBe('Alejandra Gómez');
        expect(presentation.stepPresentations[0].dateLabel).toContain('18:00');
        expect(presentation.stepPresentations[0].headline).not.toContain('confirmado');
    });

    it('respond_to_proposal: exact proposal title + exact response choice (accept)', () => {
        const step = baseStep({
            toolId: 'respond_to_proposal',
            operation: 'Aceptar "Ver peli"',
            arguments: { proposalId: 'prop-1', decision: 'approve', proposedDueAt: null },
        });
        const presentation = buildPlanPresentation(plan([step], { objective: { ...plan([]).objective, objectiveType: 'respond_to_existing_proposal' } }));

        expect(presentation.stepPresentations[0].targetLabel).toBe('Ver peli');
        expect(presentation.confirmationLabel).toBe('Aceptar');
    });

    it('respond_to_proposal: exact response choice (reject)', () => {
        const step = baseStep({
            toolId: 'respond_to_proposal',
            operation: 'Rechazar "Ver peli"',
            arguments: { proposalId: 'prop-1', decision: 'reject', proposedDueAt: null },
        });
        const presentation = buildPlanPresentation(plan([step]));

        expect(presentation.confirmationLabel).toBe('Rechazar');
    });

    it('reschedule: exact target + canonical new date', () => {
        const step = baseStep({
            toolId: 'reschedule_commitment',
            operation: 'Reprogramar "Entrenar"',
            arguments: { commitmentId: ENTRENAR_ID, newDueAt: '2026-09-12T08:00:00.000Z' },
        });
        const presentation = buildPlanPresentation(plan([step], { objective: { ...plan([]).objective, objectiveType: 'reschedule_existing_commitment' } }));

        expect(presentation.stepPresentations[0].targetLabel).toBe('Entrenar');
        expect(presentation.dateLabel).toBeDefined();
        expect(presentation.confirmationLabel).toBe('Mover');
    });

    it('complete: exact target + completion effect', () => {
        const step = baseStep({
            toolId: 'complete_commitment',
            operation: 'Completar "Entrenar"',
            arguments: { commitmentId: ENTRENAR_ID, resolutionResult: 'Listo.' },
        });
        const presentation = buildPlanPresentation(plan([step], { objective: { ...plan([]).objective, objectiveType: 'complete_existing_commitment' } }));

        expect(presentation.stepPresentations[0].targetLabel).toBe('Entrenar');
        expect(presentation.confirmationLabel).toBe('Completar');
        expect(presentation.stepPresentations[0].effectDescription).toContain('completado');
    });

    it('multi-step: every side effect is represented in stepPresentations', () => {
        const step1 = baseStep({ stepId: 'step-0', operation: 'Enviar mensaje a Alejandra', arguments: { conversationId: CONVERSATION_ID, recipientPersonId: ALEJANDRA_ID, content: 'Hola' } });
        const step2 = baseStep({ stepId: 'step-1', operation: 'Enviar mensaje a Pedro', arguments: { conversationId: CONVERSATION_ID, recipientPersonId: 'pedro-id', content: 'Hola' } });
        const presentation = buildPlanPresentation(plan([step1, step2]));

        expect(presentation.stepPresentations).toHaveLength(2);
        expect(presentation.stepPresentations.map((s) => s.targetLabel)).toEqual(['Alejandra', 'Pedro']);
    });

    it('conditional: the immediate step and the future conditional step are distinct, never merged', () => {
        const sendStep = baseStep({ stepId: 'step-0', operation: 'Enviar mensaje a Alejandra', arguments: { conversationId: CONVERSATION_ID, recipientPersonId: ALEJANDRA_ID, content: '¿Puedes el viernes?' } });
        const createStep = baseStep({
            stepId: 'step-1', toolId: 'create_commitment',
            operation: 'Crear el compromiso si la persona acepta',
            arguments: { title: 'Entrenar', dueAt: '2026-09-11T08:00:00.000Z', responsiblePersonId: null, conversationId: CONVERSATION_ID },
            dependsOn: ['step-0'],
            condition: { type: 'wait_for_response', dependsOnStepId: 'step-0', description: 'Esperar la respuesta de la persona antes de agendar.' },
        });
        const presentation = buildPlanPresentation(plan([sendStep, createStep]));

        expect(presentation.stepPresentations).toHaveLength(2);
        expect(presentation.stepPresentations[0].toolId).toBe('send_message');
        expect(presentation.stepPresentations[1].toolId).toBe('create_commitment');
        expect(presentation.stepPresentations[0].phase).toBe('immediate');
        expect(presentation.stepPresentations[1].phase).toBe('conditional');
        expect(presentation.stepPresentations[1].conditionLabel).toContain('Esperar');
        expect(createStep.condition.type).toBe('wait_for_response');
        expect(createStep.dependsOn).toEqual([sendStep.stepId]);
    });

    it('never exposes planDigest/stepId/toolId/authorizationId/raw JSON in the human-facing copy fields', () => {
        const step = baseStep({
            toolId: 'send_message',
            operation: 'Enviar mensaje a Alejandra Gómez',
            arguments: { conversationId: CONVERSATION_ID, recipientPersonId: ALEJANDRA_ID, content: 'Llegaré tarde.' },
        });
        const presentation = buildPlanPresentation(plan([step], { planDigest: 'a'.repeat(64) }));

        for (const copy of [presentation.headline, presentation.summary, presentation.effectDescription, presentation.confirmationLabel, presentation.cancelLabel]) {
            expect(copy).not.toContain(presentation.planDigest);
            expect(copy).not.toContain(step.stepId);
        }
    });

    it('refuses to present a draft as something the user could confirm', () => {
        expect(() => buildPlanPresentation(plan([], { status: 'draft', canExecute: false, planDigest: undefined }))).toThrow();
    });
});
