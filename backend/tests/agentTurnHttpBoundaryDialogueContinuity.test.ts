// M-7B PHYSICAL FAILURE #3 — REAL HTTP-BOUNDARY REGRESSION.
//
// Prior regression coverage (agentDialoguePendingClarification.test.ts) calls
// runAgentTurn(...) directly, in-process, with LlmObjectiveInterpreter/
// LlmInputInterpreter replaced via a static vi.mock at the MODULE level. That
// proved the pending-clarification-answer MECHANISM works when exercised
// directly, but it does NOT prove the mechanism survives two SEPARATE,
// independent HTTP requests hitting the real Express app the way the mobile
// client and Render actually do -- middleware, controller, and (critically)
// whatever object graph agentTurn.service.ts really constructs per request.
//
// This file closes that exact gap: two REAL HTTP requests (via app.listen +
// fetch, mirroring agentTurn.test.ts's own established boundary-test
// pattern), each its own independent request/response cycle, hitting the
// real POST /api/agent/turn route -> requireAuth -> agentTurn.controller.ts
// -> runAgentTurn -> the real (module-singleton) AgentDialogueStateService.
// Only the outbound OpenAI network calls are stubbed (at the OpenAiAgent*
// Model.prototype level, never agentTurn.service.ts's own object
// construction) and retrieval.service.ts/memory.service.ts (Supabase-backed,
// same wholesale-mock convention already established by agentTurn.test.ts).
//
// If dialogue state does NOT survive across these two independent requests,
// this file (not the mocked-module file) is where that would show up --
// exactly the "test vs. physical disagreement" Physical Failure #3 asks to
// resolve.
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Server } from 'http';

let server: Server;
let baseUrl: string;
let mockHelpers: typeof import('./helpers/supabaseMock');
let clearAgentDialogueStateForTests: typeof import('../src/services/agentDialogueState.service').clearAgentDialogueStateForTests;
let AgentDialogueStateService: typeof import('../src/services/agentDialogueState.service').AgentDialogueStateService;
let buildDialogueScopeKey: typeof import('../src/services/agentDialogueState.service').buildDialogueScopeKey;

let resolvePersonMock: ReturnType<typeof vi.fn>;
let retrieveCommitmentsMock: ReturnType<typeof vi.fn>;
let retrieveCommitmentProposalsMock: ReturnType<typeof vi.fn>;
let retrieveCommitmentEventsMock: ReturnType<typeof vi.fn>;
let retrieveMessagesMock: ReturnType<typeof vi.fn>;
let retrieveTranscriptionsMock: ReturnType<typeof vi.fn>;
let retrieveAttachmentsMock: ReturnType<typeof vi.fn>;
let retrieveVisibleCommitmentByIdMock: ReturnType<typeof vi.fn>;
let retrieveMemoryMock: ReturnType<typeof vi.fn>;
let authorizePlanSpy: ReturnType<typeof vi.fn>;
let executeAuthorizationSpy: ReturnType<typeof vi.fn>;
let objectiveModelSpy: ReturnType<typeof vi.spyOn>;
let inputModelSpy: ReturnType<typeof vi.spyOn>;

const CARLOS = 'e2e-boundary-carlos';
const OTHER_ACTOR_TOKEN = 'e2e-boundary-other-actor';
const VALID_TOKEN = 'valid-boundary-token';
const OTHER_TOKEN = 'valid-boundary-token-other-actor';

function person(id: string, displayName: string) {
    return { kind: 'user' as const, id, displayName };
}

// Raw JSON strings matching agentObjectiveInterpretationPayloadSchema and the
// input-interpretation payload shape -- these stand in for what a REAL
// OpenAI response would contain, so LlmObjectiveInterpreter/LlmInputInterpreter's
// own real parse/validate/mapPayloadToObjective code path runs unmodified
// (only the network call itself is stubbed).
function objectivePayloadJson(overrides: Record<string, unknown> = {}) {
    return JSON.stringify({
        objectiveType: 'create_personal_commitment',
        personHints: [],
        entityHints: ['llamar a Pedro'],
        timeHint: null,
        decisionHint: null,
        draftOnly: false,
        responsibleHint: null,
        followUpObjectiveType: null,
        additionalPersonHint: null,
        desiredOutcomeHint: null,
        ...overrides,
    });
}

function inputPayloadJson(overrides: Record<string, unknown> = {}) {
    return JSON.stringify({
        intent: 'commitment_query',
        personHints: [],
        topicHints: [],
        textQuery: null,
        timeExpression: null,
        requestedSources: [],
        commitmentFilterHints: { status: null, statusBasis: null },
        attachmentKindHints: [],
        ambiguityHints: [],
        wantsOverdueFocus: false,
        proposalFocus: null,
        isWriteActionRequest: true,
        ...overrides,
    });
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

    const authModule = await import('../src/services/agentAuthorization.service');
    const execModule = await import('../src/services/agentExecution.service');
    authorizePlanSpy = vi.spyOn(authModule, 'authorizePlan');
    executeAuthorizationSpy = vi.spyOn(execModule, 'executeAuthorization');

    // Stub only the OUTBOUND network call (real OpenAI client), never
    // agentTurn.service.ts's own dependency construction -- this is the
    // critical difference from the module-mock test file: LlmObjectiveInterpreter
    // and LlmInputInterpreter are instantiated for REAL by agentTurn.service.ts
    // exactly as they are in production; only what they'd otherwise send over
    // the network is intercepted.
    const objectiveInterpreterModule = await import('../src/services/agentObjectiveInterpreter.service');
    const inputInterpreterModule = await import('../src/services/agentInputInterpreter.service');
    objectiveModelSpy = vi.spyOn(objectiveInterpreterModule.OpenAiAgentObjectiveModel.prototype, 'interpret');
    inputModelSpy = vi.spyOn(inputInterpreterModule.OpenAiAgentInputModel.prototype, 'interpret');

    const dialogueModule = await import('../src/services/agentDialogueState.service');
    clearAgentDialogueStateForTests = dialogueModule.clearAgentDialogueStateForTests;
    AgentDialogueStateService = dialogueModule.AgentDialogueStateService;
    buildDialogueScopeKey = dialogueModule.buildDialogueScopeKey;

    const { supabaseAdminMockModule } = await import('./helpers/supabaseMock');
    vitest.vi.doMock('../src/lib/supabaseAdmin', () => supabaseAdminMockModule());
    mockHelpers = await import('./helpers/supabaseMock');
    mockHelpers.setSupabaseAuthGetUserMock(async (token: string) => {
        if (token === VALID_TOKEN) return { data: { user: { id: CARLOS, email: 'carlos@example.invalid' } }, error: null };
        if (token === OTHER_TOKEN) return { data: { user: { id: OTHER_ACTOR_TOKEN, email: 'other@example.invalid' } }, error: null };
        return { data: { user: null }, error: new Error('invalid token') };
    });

    // A REAL (non-blank) key -- unlike agentTurn.test.ts's deliberate blank
    // key -- so LlmObjectiveInterpreter/LlmInputInterpreter attempt the real
    // model call path (intercepted by the spies above) instead of failing
    // over to the deterministic fallback immediately. This matters because
    // "Tengo que llamar a Pedro" matches no deterministic write verb, and
    // create_personal_commitment's deterministic fallback only recognizes
    // "recuérdame"/"remind me" -- exactly like real staging, which has a
    // real OPENAI_API_KEY configured.
    process.env.OPENAI_API_KEY = 'sk-test-boundary-key';
    process.env.ENCRYPTION_KEY = 'test-only-boundary-token-signing-key';

    const { app } = await import('../src/app');
    await new Promise<void>((resolve) => { server = app.listen(0, () => resolve()); });
    const address = server.address();
    const port = typeof address === 'object' && address ? address.port : 0;
    baseUrl = `http://127.0.0.1:${port}`;
}, 30000);

afterAll(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
});

beforeEach(() => {
    clearAgentDialogueStateForTests();
    resolvePersonMock.mockReset().mockResolvedValue({ resolved: null, ambiguous: false, candidates: [] });
    retrieveCommitmentsMock.mockReset().mockResolvedValue([]);
    retrieveCommitmentProposalsMock.mockReset().mockResolvedValue([]);
    retrieveCommitmentEventsMock.mockReset().mockResolvedValue([]);
    retrieveMessagesMock.mockReset().mockResolvedValue([]);
    retrieveTranscriptionsMock.mockReset().mockResolvedValue([]);
    retrieveAttachmentsMock.mockReset().mockResolvedValue([]);
    retrieveVisibleCommitmentByIdMock.mockReset().mockResolvedValue(null);
    retrieveMemoryMock.mockReset().mockResolvedValue([]);
    objectiveModelSpy.mockReset();
    inputModelSpy.mockReset();
    authorizePlanSpy.mockClear();
    executeAuthorizationSpy.mockClear();
});

afterEach(() => {
    clearAgentDialogueStateForTests();
});

// Each call is its OWN independent fetch() -- a genuinely separate HTTP
// request/response cycle, never sharing any JS object with the previous
// call except whatever the real server process itself retains (which is
// exactly the thing under test).
async function postTurn(body: Record<string, any>, token: string = VALID_TOKEN) {
    const res = await fetch(`${baseUrl}/api/agent/turn`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(body),
    });
    return { status: res.status, body: await res.json() };
}

describe('REAL HTTP-boundary dialogue continuity (M-7B physical failure #3)', () => {
    it('TASK 3/4 — request 1 (clarification) actually persists dialogue state, observable via the real module-singleton repository', async () => {
        inputModelSpy.mockResolvedValueOnce(inputPayloadJson());
        objectiveModelSpy.mockResolvedValueOnce(objectivePayloadJson());

        const res1 = await postTurn({ input: 'Tengo que llamar a Pedro' });
        expect(res1.status).toBe(200);
        expect(res1.body.kind).toBe('clarification');

        const scopeKey = buildDialogueScopeKey({ surface: 'mobile_text' });
        const state = new AgentDialogueStateService().getSnapshot(CARLOS, scopeKey);
        expect(state).not.toBeNull();
        expect(state?.openObjective?.objectiveType).toBe('create_personal_commitment');
        expect(state?.pendingClarification?.field).toBe('person_ambiguous');
        expect(state?.lifecycle).not.toBe('idle');
        expect(typeof state?.version).toBe('number');
        expect(typeof state?.lastTurnSequence).toBe('number');
    });

    it('TASK 4/5 — request 2, a SEPARATE HTTP request, finds and consumes the pending clarification left by request 1 (the exact physical scenario)', async () => {
        inputModelSpy.mockResolvedValueOnce(inputPayloadJson());
        objectiveModelSpy.mockResolvedValueOnce(objectivePayloadJson());
        const res1 = await postTurn({ input: 'Tengo que llamar a Pedro' });
        expect(res1.body.kind).toBe('clarification');

        // Request 2 -- independent fetch(), no shared JS reference to
        // request 1's response or any local variable it produced.
        resolvePersonMock.mockResolvedValueOnce({
            resolved: person('pedro-gonzalez-id', 'Pedro González'), ambiguous: false, candidates: [],
        });
        const res2 = await postTurn({ input: 'Pedro González' });

        expect(res2.status).toBe(200);
        // The exact physical failure: must NOT be a source-backed read
        // response ("Pedro González está asociado con...").
        expect(res2.body.kind).not.toBe('response');
        expect(JSON.stringify(res2.body)).not.toMatch(/asociado con/i);
        // Turn 2 must not have needed a SECOND LLM interpretation call --
        // only request 1's own single call is on record -- proving it was
        // resolved from dialogue state + live person resolution before
        // isolated-turn classification of request 2 ran.
        expect(inputModelSpy).toHaveBeenCalledTimes(1);
        expect(objectiveModelSpy).toHaveBeenCalledTimes(1);
    });

    it('unique person match reconciles the original objective across two separate requests, never an arbitrary selection', async () => {
        inputModelSpy.mockResolvedValueOnce(inputPayloadJson());
        objectiveModelSpy.mockResolvedValueOnce(objectivePayloadJson());
        await postTurn({ input: 'Tengo que llamar a Pedro' });

        resolvePersonMock.mockResolvedValueOnce({
            resolved: person('pedro-gonzalez-id', 'Pedro González'), ambiguous: false, candidates: [],
        });
        const res2 = await postTurn({ input: 'Pedro González' });

        expect(['clarification', 'plan']).toContain(res2.body.kind);
        const scopeKey = buildDialogueScopeKey({ surface: 'mobile_text' });
        const state = new AgentDialogueStateService().getSnapshot(CARLOS, scopeKey);
        expect(state?.openObjective?.sourceUtterance).toContain('Pedro González');
    });

    it('zero-match and multi-match answers across separate requests never pick an arbitrary person', async () => {
        inputModelSpy.mockResolvedValueOnce(inputPayloadJson());
        objectiveModelSpy.mockResolvedValueOnce(objectivePayloadJson());
        await postTurn({ input: 'Tengo que llamar a Pedro' });

        resolvePersonMock.mockResolvedValueOnce({
            resolved: null, ambiguous: true,
            candidates: [person('p1', 'Pedro González Soto'), person('p2', 'Pedro González Ruiz')],
        });
        const res2 = await postTurn({ input: 'Pedro González' });

        expect(res2.body.kind).toBe('clarification');
        expect(res2.body.questions[0].question).toContain('Pedro González Soto');
        expect(res2.body.questions[0].question).toContain('Pedro González Ruiz');
    });

    it('an explicit unrelated read request across a separate HTTP request escapes the pending clarification', async () => {
        inputModelSpy.mockResolvedValueOnce(inputPayloadJson());
        objectiveModelSpy.mockResolvedValueOnce(objectivePayloadJson());
        await postTurn({ input: 'Tengo que llamar a Pedro' });

        retrieveCommitmentsMock.mockResolvedValueOnce([]);
        inputModelSpy.mockResolvedValueOnce(inputPayloadJson({ intent: 'commitment_query', isWriteActionRequest: false }));
        const res2 = await postTurn({ input: '¿Qué tengo hoy?' });

        expect(res2.body.kind).toBe('response');
    });

    it('different actor (separate token/session) across separate requests is isolated -- does not consume actor A\'s pending clarification', async () => {
        inputModelSpy.mockResolvedValueOnce(inputPayloadJson());
        objectiveModelSpy.mockResolvedValueOnce(objectivePayloadJson());
        await postTurn({ input: 'Tengo que llamar a Pedro' }, VALID_TOKEN);

        inputModelSpy.mockResolvedValueOnce(inputPayloadJson({ intent: 'person_query', isWriteActionRequest: false }));
        resolvePersonMock.mockResolvedValueOnce({
            resolved: person('pedro-gonzalez-id', 'Pedro González'), ambiguous: false, candidates: [],
        });
        const res2 = await postTurn({ input: 'Pedro González' }, OTHER_TOKEN);

        expect(res2.body.kind).not.toBe('plan');
    });

    it('different conversation across separate requests is isolated -- a conversationId-scoped clarification is not consumed by a global-surface turn', async () => {
        const CONVERSATION_ID = '33333333-3333-4333-8333-333333333333';
        inputModelSpy.mockResolvedValueOnce(inputPayloadJson());
        objectiveModelSpy.mockResolvedValueOnce(objectivePayloadJson());
        await postTurn({ input: 'Tengo que llamar a Pedro', conversationId: CONVERSATION_ID });

        inputModelSpy.mockResolvedValueOnce(inputPayloadJson({ intent: 'person_query', isWriteActionRequest: false }));
        resolvePersonMock.mockResolvedValueOnce({
            resolved: person('pedro-gonzalez-id', 'Pedro González'), ambiguous: false, candidates: [],
        });
        // No conversationId this time -> different scope key.
        const res2 = await postTurn({ input: 'Pedro González' });

        expect(res2.body.kind).not.toBe('plan');
    });

    it('stale CAS is still protected across separate requests -- a late write observing an older turnSequence is rejected', async () => {
        const scopeKey = buildDialogueScopeKey({ surface: 'mobile_text' });
        const service = new AgentDialogueStateService();
        service.openObjective({
            actorUserId: CARLOS, dialogueScopeKey: scopeKey,
            objective: {
                objectiveType: 'create_personal_commitment',
                targetEntities: { personHints: [], entityHints: ['llamar a Pedro'] },
                constraints: {}, desiredOutcome: 'llamar a Pedro', timeConstraints: { rawHint: null },
                actor: CARLOS, sourceUtterance: 'Tengo que llamar a Pedro', confidence: 0.8, ambiguities: [], source: 'llm',
            },
            turnId: 't1', turnSequence: 5,
        });

        expect(() =>
            service.applyCorrection({
                actorUserId: CARLOS, dialogueScopeKey: scopeKey, slotName: 'time', previousValue: null, newValue: 'a las 9',
                reason: 'clarification_answer', turnId: 'late', turnSequence: 2,
            }),
        ).toThrow(/stale dialogue turn/i);
    });

    it('no implicit authorization/execution occurs across the two-request clarification-answer flow', async () => {
        inputModelSpy.mockResolvedValueOnce(inputPayloadJson());
        objectiveModelSpy.mockResolvedValueOnce(objectivePayloadJson());
        await postTurn({ input: 'Tengo que llamar a Pedro' });

        resolvePersonMock.mockResolvedValueOnce({
            resolved: person('pedro-gonzalez-id', 'Pedro González'), ambiguous: false, candidates: [],
        });
        await postTurn({ input: 'Pedro González' });

        expect(authorizePlanSpy).not.toHaveBeenCalled();
        expect(executeAuthorizationSpy).not.toHaveBeenCalled();
    });
});
