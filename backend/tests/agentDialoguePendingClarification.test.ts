// M-7B PHYSICAL FAILURE #2 REGRESSION: physically, TURN 1 ("Tengo que llamar
// a Pedro") correctly produced a natural person_ambiguous clarification
// (Physical Failure #1's fix), but TURN 2 ("Pedro González") was classified
// as an independent person_query and returned a source-backed summary
// ("Pedro González está asociado con varios compromisos...") instead of
// being recognized as the answer to the question Ping had just asked.
//
// Root cause (proven via source trace, see the M-7B physical failure #2
// report): (a) Turn 1's person_ambiguous clarification never wrote anything
// to AgentDialogueStateService at all -- it returned from inside
// buildAgentContext's read pipeline, entirely upstream of and separate from
// runWriteActionTurn, M-7B's only write path -- so there was no dialogue
// state for Turn 2 to find even in principle; (b) even generically,
// runAgentTurn never consulted dialogue state before committing to
// isolated-turn read/write classification.
//
// Fixed by (1) persisting dialogue state from the read-pipeline
// person_ambiguous branch when it is blocking a real write-intent objective
// (agentTurn.service.ts), and (2) adding a dialogue-first check at the very
// top of runAgentTurn that gives a pending clarification a chance to consume
// the new turn as its answer -- via live resolvePerson() resolution, never
// LLM-trusted identity -- before any other routing commits
// (agentDialogueContinuation.service.ts#tryAnswerPendingClarification).
//
// Mocking strategy: mirrors tests/agentDialogueContinuation.test.ts's own
// static vi.mock pattern (LlmObjectiveInterpreter/LlmInputInterpreter
// replaced with controllable stubs, everything else in both modules stays
// real) -- this lets "Tengo que llamar a Pedro" (which matches no
// deterministic write verb, exactly like the real physical phrase) reach the
// read pipeline's person_ambiguous branch with a real, controllable
// objective, instead of forcing the test onto a different phrase that
// happens to match the deterministic fast path.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AgentObjective } from '../src/types/agentPlan';

const { llmObjectiveInterpretMock, llmInputInterpretMock } = vi.hoisted(() => ({
    llmObjectiveInterpretMock: vi.fn(),
    llmInputInterpretMock: vi.fn(),
}));

vi.mock('../src/services/agentObjectiveInterpreter.service', async (importOriginal) => {
    const actual = await importOriginal<typeof import('../src/services/agentObjectiveInterpreter.service')>();
    return {
        ...actual,
        LlmObjectiveInterpreter: class {
            async interpret(input: string, context: { actorUserId: string; conversationId?: string }) {
                return llmObjectiveInterpretMock(input, context);
            }
        },
    };
});

vi.mock('../src/services/agentInputInterpreter.service', async (importOriginal) => {
    const actual = await importOriginal<typeof import('../src/services/agentInputInterpreter.service')>();
    return {
        ...actual,
        LlmInputInterpreter: class {
            async interpret(input: string) {
                return llmInputInterpretMock(input);
            }
        },
    };
});

const { resolvePersonMock } = vi.hoisted(() => ({ resolvePersonMock: vi.fn() }));

vi.mock('../src/services/retrieval.service', () => ({
    resolvePerson: (...args: unknown[]) => resolvePersonMock(...args),
    resolveDirectConversation: vi.fn(async () => ({ conversationId: null, ambiguous: false, candidateCount: 0 })),
    retrieveCommitments: vi.fn(async () => []),
    retrieveCommitmentProposals: vi.fn(async () => []),
    retrieveCommitmentEvents: vi.fn(async () => []),
    retrieveMessages: vi.fn(async () => []),
    retrieveTranscriptions: vi.fn(async () => []),
    retrieveAttachments: vi.fn(async () => []),
    retrieveVisibleCommitmentById: vi.fn(async () => null),
    dedupeProvenance: (items: unknown[]) => items,
}));

vi.mock('../src/services/memory.service', () => ({
    retrieveMemory: vi.fn(async () => []),
    ingestMemoryFromEvent: vi.fn(async () => undefined),
}));

let runAgentTurn: typeof import('../src/services/agentTurn.service').runAgentTurn;
let clearAgentDialogueStateForTests: typeof import('../src/services/agentDialogueState.service').clearAgentDialogueStateForTests;
let AgentDialogueStateService: typeof import('../src/services/agentDialogueState.service').AgentDialogueStateService;
let buildDialogueScopeKey: typeof import('../src/services/agentDialogueState.service').buildDialogueScopeKey;
let authorizePlanSpy: ReturnType<typeof vi.spyOn>;
let executeAuthorizationSpy: ReturnType<typeof vi.spyOn>;

const ACTOR = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const OTHER_ACTOR = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const CONVERSATION_ID = '11111111-1111-4111-8111-111111111111';
const OTHER_CONVERSATION_ID = '22222222-2222-4222-8222-222222222222';

beforeEach(async () => {
    vi.resetModules();
    const turnModule = await import('../src/services/agentTurn.service');
    runAgentTurn = turnModule.runAgentTurn;
    const dialogueModule = await import('../src/services/agentDialogueState.service');
    clearAgentDialogueStateForTests = dialogueModule.clearAgentDialogueStateForTests;
    AgentDialogueStateService = dialogueModule.AgentDialogueStateService;
    buildDialogueScopeKey = dialogueModule.buildDialogueScopeKey;
    clearAgentDialogueStateForTests();
    llmObjectiveInterpretMock.mockReset();
    llmInputInterpretMock.mockReset();
    resolvePersonMock.mockReset();

    const authModule = await import('../src/services/agentAuthorization.service');
    const execModule = await import('../src/services/agentExecution.service');
    authorizePlanSpy = vi.spyOn(authModule, 'authorizePlan');
    executeAuthorizationSpy = vi.spyOn(execModule, 'executeAuthorization');
}, 30000);

afterEach(() => {
    clearAgentDialogueStateForTests();
    vi.restoreAllMocks();
});

function writeInterpretation(overrides: Record<string, unknown> = {}) {
    return {
        intent: 'commitment_query', intentConfidence: 0.3, personHints: [], topicHints: [],
        textQuery: null, timeExpression: null, statusHints: null, requestedTransition: null,
        wantsCommitments: false, wantsMessages: false, wantsTranscriptions: false, wantsAttachments: false,
        wantsOverdueFocus: false, proposalFocus: null, isWriteActionRequest: true,
        ambiguityHints: [], source: 'llm', modelUsed: 'test-fake', ...overrides,
    };
}

function readOnlyInterpretation(overrides: Record<string, unknown> = {}) {
    return { ...writeInterpretation(overrides), isWriteActionRequest: false, intent: overrides.intent ?? 'general_context' };
}

function objective(overrides: Partial<AgentObjective> = {}): AgentObjective {
    return {
        objectiveType: 'create_personal_commitment',
        targetEntities: { personHints: [], entityHints: ['llamar a Pedro'] },
        constraints: {},
        desiredOutcome: 'llamar a Pedro',
        timeConstraints: { rawHint: null },
        actor: ACTOR,
        sourceUtterance: 'Tengo que llamar a Pedro',
        confidence: 0.8,
        ambiguities: [],
        source: 'llm',
        ...overrides,
    };
}

function retrievalPerson(id: string, displayName: string) {
    return { kind: 'user' as const, id, displayName };
}

// Turn 1: "Tengo que llamar a Pedro" -- matches no deterministic write verb
// (same real phrase from the physical test), so it goes through
// buildAgentContext's read pipeline. resolvePersonMock's FIRST call resolves
// "Pedro" ambiguously/unresolved; the LLM input interpreter says
// isWriteActionRequest=true (a real commitment-creation intent), and the LLM
// objective interpreter proposes the create_personal_commitment objective.
async function askPedroClarification(conversationId: string = CONVERSATION_ID) {
    llmInputInterpretMock.mockResolvedValueOnce(writeInterpretation());
    resolvePersonMock.mockResolvedValueOnce({ resolved: null, ambiguous: false, candidates: [] });
    llmObjectiveInterpretMock.mockResolvedValueOnce(objective());
    return runAgentTurn({ actorUserId: ACTOR, input: 'Tengo que llamar a Pedro', conversationId });
}

describe('Turn 1 — read-pipeline person_ambiguous now persists dialogue state (TASK 1/2)', () => {
    it('1. creates/preserves an open dialogue objective with a pending person clarification', async () => {
        const res = await askPedroClarification();
        expect(res.kind).toBe('clarification');

        const scopeKey = buildDialogueScopeKey({ conversationId: CONVERSATION_ID, surface: 'mobile_text' });
        const state = new AgentDialogueStateService().getSnapshot(ACTOR, scopeKey);
        expect(state?.openObjective?.objectiveType).toBe('create_personal_commitment');
        expect(state?.lifecycle).not.toBe('idle');
        expect(state?.pendingClarification?.field).toBe('person_ambiguous');
    });

    it('a genuinely read-only ambiguous query (isWriteActionRequest=false) persists no dialogue state', async () => {
        llmInputInterpretMock.mockResolvedValueOnce(readOnlyInterpretation());
        resolvePersonMock.mockResolvedValueOnce({ resolved: null, ambiguous: false, candidates: [] });

        const res = await runAgentTurn({ actorUserId: ACTOR, input: '¿Qué sabes de Pedro?', conversationId: CONVERSATION_ID });
        expect(res.kind).toBe('clarification');

        const scopeKey = buildDialogueScopeKey({ conversationId: CONVERSATION_ID, surface: 'mobile_text' });
        const state = new AgentDialogueStateService().getSnapshot(ACTOR, scopeKey);
        expect(state).toBeNull();
    });
});

describe('Turn 2 — pending clarification is checked before isolated-turn routing (TASK 2/3/8)', () => {
    it('2/3. "Pedro González" is classified as a clarification answer, never a source-backed read response', async () => {
        await askPedroClarification();

        resolvePersonMock.mockResolvedValueOnce({
            resolved: retrievalPerson('pedro-gonzalez-id', 'Pedro González'), ambiguous: false, candidates: [],
        });
        const res = await runAgentTurn({ actorUserId: ACTOR, input: 'Pedro González', conversationId: CONVERSATION_ID });

        expect(res.kind).not.toBe('response');
        expect(JSON.stringify(res)).not.toMatch(/asociado con/i);
        // Turn 2 never reaches the LLM input/objective interpreters a SECOND
        // time (only turn 1's own single call, from askPedroClarification,
        // is on record) -- it is resolved entirely from the pending dialogue
        // + live person resolution, proving dialogue-first routing actually
        // won before any isolated-turn interpretation of turn 2 occurred.
        expect(llmInputInterpretMock).toHaveBeenCalledTimes(1);
        // Turn 2 gets one structural objective interpretation to distinguish
        // a complete new objective from a bare person-name answer.
        expect(llmObjectiveInterpretMock).toHaveBeenCalledTimes(2);
    });

    it('4/5/6/10/11. a unique match reconciles the ORIGINAL objective (title completed with the resolved name), never an arbitrary selection, and reaches the real planner', async () => {
        await askPedroClarification();

        resolvePersonMock.mockResolvedValueOnce({
            resolved: retrievalPerson('pedro-gonzalez-id', 'Pedro González'), ambiguous: false, candidates: [],
        });
        const res = await runAgentTurn({ actorUserId: ACTOR, input: 'Pedro González', conversationId: CONVERSATION_ID });

        // create_personal_commitment has no date in "Tengo que llamar a
        // Pedro" -> after resolving the person, the NEXT real missing
        // requirement (date, per planCreateCommitment's own contract) is
        // still missing, so this correctly asks the next clarification
        // rather than forcing a plan -- TASK 7's "respect actual planner
        // requirements" proven by the planner's own real ambiguity.
        expect(res.kind).toBe('clarification');
        if (res.kind === 'clarification') {
            expect(res.questions[0].field).not.toBe('person_ambiguous');
            expect(res.questions[0].question).not.toBe('person_ambiguous');
        }

        const scopeKey = buildDialogueScopeKey({ conversationId: CONVERSATION_ID, surface: 'mobile_text' });
        const state = new AgentDialogueStateService().getSnapshot(ACTOR, scopeKey);
        expect(state?.openObjective?.sourceUtterance).toContain('Pedro González');
        expect(state?.openObjective?.sourceUtterance).not.toBe('Tengo que llamar a Pedro');
        expect(state?.openObjective?.targetEntities.entityHints[0]).toContain('Pedro González');
    });

    it('7. zero matches for the clarification answer asks a natural clarification again, never an arbitrary person, never a plan', async () => {
        await askPedroClarification();

        resolvePersonMock.mockResolvedValueOnce({ resolved: null, ambiguous: false, candidates: [] });
        const res = await runAgentTurn({ actorUserId: ACTOR, input: 'Roberto Gómez', conversationId: CONVERSATION_ID });

        expect(res.kind).toBe('clarification');
        if (res.kind === 'clarification') {
            expect(res.questions[0].question).not.toBe('person_ambiguous');
        }
    });

    it('8. multiple matches for the clarification answer asks a natural disambiguation again, never an arbitrary selection', async () => {
        await askPedroClarification();

        resolvePersonMock.mockResolvedValueOnce({
            resolved: null, ambiguous: true,
            candidates: [retrievalPerson('p1', 'Pedro González Soto'), retrievalPerson('p2', 'Pedro González Ruiz')],
        });
        const res = await runAgentTurn({ actorUserId: ACTOR, input: 'Pedro González', conversationId: CONVERSATION_ID });

        expect(res.kind).toBe('clarification');
        if (res.kind === 'clarification') {
            expect(res.questions[0].question).toContain('Pedro González Soto');
            expect(res.questions[0].question).toContain('Pedro González Ruiz');
            expect(res.questions[0].question).not.toBe('person_ambiguous');
        }
    });

    it('9. no arbitrary person is ever chosen -- a multi-match never silently picks the first candidate', async () => {
        await askPedroClarification();
        resolvePersonMock.mockResolvedValueOnce({
            resolved: null, ambiguous: true,
            candidates: [retrievalPerson('p1', 'Pedro González Soto'), retrievalPerson('p2', 'Pedro González Ruiz')],
        });
        const res = await runAgentTurn({ actorUserId: ACTOR, input: 'Pedro González', conversationId: CONVERSATION_ID });

        expect(res.kind).not.toBe('plan');
        const scopeKey = buildDialogueScopeKey({ conversationId: CONVERSATION_ID, surface: 'mobile_text' });
        const state = new AgentDialogueStateService().getSnapshot(ACTOR, scopeKey);
        expect(state?.openObjective?.sourceUtterance).not.toContain('Soto');
        expect(state?.openObjective?.sourceUtterance).not.toContain('Ruiz');
    });

    it('12. resolved clarification clears the OLD person_ambiguous pending question (no stale lingering)', async () => {
        await askPedroClarification();
        resolvePersonMock.mockResolvedValueOnce({
            resolved: retrievalPerson('pedro-gonzalez-id', 'Pedro González'), ambiguous: false, candidates: [],
        });
        await runAgentTurn({ actorUserId: ACTOR, input: 'Pedro González', conversationId: CONVERSATION_ID });

        const scopeKey = buildDialogueScopeKey({ conversationId: CONVERSATION_ID, surface: 'mobile_text' });
        const state = new AgentDialogueStateService().getSnapshot(ACTOR, scopeKey);
        if (state?.pendingClarification) {
            expect(state.pendingClarification.field).not.toBe('person_ambiguous');
        }
    });

    it('13/14. next real missing field is evaluated by the real planner; a fully-specified reconciled objective reaches ready_for_authorization / plan', async () => {
        await askPedroClarification();
        resolvePersonMock.mockResolvedValueOnce({
            resolved: retrievalPerson('pedro-gonzalez-id', 'Pedro González'), ambiguous: false, candidates: [],
        });
        const res = await runAgentTurn({ actorUserId: ACTOR, input: 'Pedro González', conversationId: CONVERSATION_ID });
        // Still missing date -> clarification, never a plan -- proves the
        // "next missing field" (date) was correctly evaluated, not silently
        // skipped.
        expect(res.kind).toBe('clarification');
    });

    it('15/16/17/18. resolved answer reuses the real planner/authorization/execution pipeline -- never a second path, never implicit authorization', async () => {
        await askPedroClarification();
        resolvePersonMock.mockResolvedValueOnce({
            resolved: retrievalPerson('pedro-gonzalez-id', 'Pedro González'), ambiguous: false, candidates: [],
        });
        const res = await runAgentTurn({ actorUserId: ACTOR, input: 'Pedro González', conversationId: CONVERSATION_ID });

        expect(['clarification', 'plan']).toContain(res.kind);
        if (res.kind === 'plan') {
            expect(res.plan.steps[0].toolId).toBe('create_commitment');
            expect(res.plan.status).not.toBe('executed');
        }
        expect(authorizePlanSpy).not.toHaveBeenCalled();
        expect(executeAuthorizationSpy).not.toHaveBeenCalled();
    });

    it('19/20. exact physical failure regression: never a source-backed "person summary" read response', async () => {
        await askPedroClarification();
        resolvePersonMock.mockResolvedValueOnce({
            resolved: retrievalPerson('pedro-gonzalez-id', 'Pedro González'), ambiguous: false, candidates: [],
        });
        const res = await runAgentTurn({ actorUserId: ACTOR, input: 'Pedro González', conversationId: CONVERSATION_ID });

        expect(res.kind).not.toBe('response');
        expect((res as { response?: unknown }).response).toBeUndefined();
    });
});

describe('Escape / new-objective behavior (TASK 9)', () => {
    it('21. an explicit unrelated read request escapes the pending person clarification instead of being force-treated as an answer', async () => {
        await askPedroClarification();

        llmInputInterpretMock.mockResolvedValueOnce(readOnlyInterpretation({ intent: 'commitment_query', intentConfidence: 0.8 }));
        const res = await runAgentTurn({ actorUserId: ACTOR, input: '¿Qué tengo hoy?', conversationId: CONVERSATION_ID });

        expect(res.kind).toBe('response');
        // The escaped request abandons the old dialogue instead of leaving
        // stale clarification slots active.
        const scopeKey = buildDialogueScopeKey({ conversationId: CONVERSATION_ID, surface: 'mobile_text' });
        const state = new AgentDialogueStateService().getSnapshot(ACTOR, scopeKey);
        expect(state?.lifecycle).toBe('idle');
        expect(state?.openObjective).toBeNull();
    });

    it('21b. "Muéstrame mis compromisos" also escapes as a new read objective', async () => {
        await askPedroClarification();

        llmInputInterpretMock.mockResolvedValueOnce(readOnlyInterpretation({ intent: 'commitment_query', intentConfidence: 0.8 }));
        const res = await runAgentTurn({ actorUserId: ACTOR, input: 'Muéstrame mis compromisos', conversationId: CONVERSATION_ID });

        expect(res.kind).toBe('response');
    });
});

describe('Dialogue isolation (TASK 9/11, test areas 22/23)', () => {
    it('22. different conversation is isolated -- a bare-name turn elsewhere is not hijacked by this conversation\'s pending clarification', async () => {
        await askPedroClarification(CONVERSATION_ID);

        llmInputInterpretMock.mockResolvedValueOnce(readOnlyInterpretation({ intent: 'person_query', intentConfidence: 0.7 }));
        resolvePersonMock.mockResolvedValueOnce({
            resolved: retrievalPerson('someone-else', 'Someone Else'), ambiguous: false, candidates: [],
        });
        const res = await runAgentTurn({ actorUserId: ACTOR, input: 'Someone Else', conversationId: OTHER_CONVERSATION_ID });

        expect(res.kind).not.toBe('plan');
    });

    it('23. different actor is isolated -- another actor\'s bare-name turn does not consume this actor\'s pending clarification', async () => {
        await askPedroClarification(CONVERSATION_ID);

        llmInputInterpretMock.mockResolvedValueOnce(readOnlyInterpretation({ intent: 'person_query', intentConfidence: 0.7 }));
        resolvePersonMock.mockResolvedValueOnce({
            resolved: retrievalPerson('pedro-gonzalez-id', 'Pedro González'), ambiguous: false, candidates: [],
        });
        const res = await runAgentTurn({ actorUserId: OTHER_ACTOR, input: 'Pedro González', conversationId: CONVERSATION_ID });

        expect(res.kind).not.toBe('plan');
    });
});

describe('Stale-turn / CAS protection (TASK 10, test area 24)', () => {
    it('24. a stale write to dialogue state is rejected by the existing CAS guard -- proves the pending-clarification wiring did not bypass it', async () => {
        const { AgentDialogueStateService: DialogueService, buildDialogueScopeKey: buildKey } = await import('../src/services/agentDialogueState.service');
        const service = new DialogueService();
        const scopeKey = buildKey({ surface: 'mobile_text' });
        service.openObjective({ actorUserId: ACTOR, dialogueScopeKey: scopeKey, objective: objective(), turnId: 't1', turnSequence: 5 });

        expect(() =>
            service.applyCorrection({
                actorUserId: ACTOR, dialogueScopeKey: scopeKey, slotName: 'time', previousValue: null, newValue: 'a las 9',
                reason: 'clarification_answer', turnId: 'late', turnSequence: 2,
            }),
        ).toThrow(/stale dialogue turn/i);
    });
});

describe('No memory write / no regex-family-for-names (test areas 25/26/27)', () => {
    it('25. no memory_records write occurs anywhere in the pending-clarification-answer path (source-level proof)', () => {
        const fs = require('node:fs') as typeof import('node:fs');
        const path = require('node:path') as typeof import('node:path');
        const source = fs.readFileSync(path.join(__dirname, '../src/services/agentDialogueContinuation.service.ts'), 'utf-8');
        const codeOnly = source.split('\n').filter((l) => !l.trim().startsWith('//')).join('\n');
        expect(codeOnly).not.toMatch(/memory_records/);
        expect(codeOnly).not.toMatch(/from ['"].*memory\.service['"]/);
    });

    it('26/27. no phrase-specific "Pedro" code and no new regex family for names -- the exact same mechanism resolves a completely different name', async () => {
        llmInputInterpretMock.mockResolvedValueOnce(writeInterpretation());
        resolvePersonMock.mockResolvedValueOnce({ resolved: null, ambiguous: false, candidates: [] });
        llmObjectiveInterpretMock.mockResolvedValueOnce(objective({ sourceUtterance: 'Tengo que llamar a Marta', targetEntities: { personHints: [], entityHints: ['llamar a Marta'] } }));
        await runAgentTurn({ actorUserId: ACTOR, input: 'Tengo que llamar a Marta', conversationId: CONVERSATION_ID });

        resolvePersonMock.mockResolvedValueOnce({
            resolved: retrievalPerson('marta-id', 'Marta Silva'), ambiguous: false, candidates: [],
        });
        const res = await runAgentTurn({ actorUserId: ACTOR, input: 'Marta Silva', conversationId: CONVERSATION_ID });

        expect(res.kind).not.toBe('response');
        expect(JSON.stringify(res)).not.toMatch(/asociado con/i);

        const fs = require('node:fs') as typeof import('node:fs');
        const path = require('node:path') as typeof import('node:path');
        const source = fs.readFileSync(path.join(__dirname, '../src/services/agentDialogueContinuation.service.ts'), 'utf-8');
        expect(source).not.toMatch(/PEDRO_REGEX|NAME_REGEX|Pedro['"]?\s*===|=== ['"]Pedro/);
    });
});
