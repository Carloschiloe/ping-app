import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { NormalizedSemanticTurnV4 } from '../src/types/agentTurnCommit';
import type { AgentSemanticInterpretation } from '../src/services/agentSemanticInterpreter.service';
import type { DispositionDialogueSnapshot } from '../src/types/agentTurnDisposition';
import {
    adaptSemanticV4ToCore,
    isSemanticV4CoreShadowEnabled,
    runSemanticV4CoreShadow,
} from '../src/services/agentSemanticV4CoreShadow.service';

const legacy: AgentSemanticInterpretation = {
    route: 'read',
    objective: null,
    interpretation: { intent: 'recall', isWriteActionRequest: false, confidence: 0.9 } as any,
};

function readTurn(overrides: Partial<NormalizedSemanticTurnV4> = {}): NormalizedSemanticTurnV4 {
    return {
        version: 4, kind: 'read_request', domain: 'commitment', objectiveCompleteness: 'complete',
        lifecycleCommand: 'none', lifecycleTarget: 'unspecified', lifecycleEvidence: 'unknown',
        pendingSlotAnswer: 'not_a_slot_answer', continuationLike: 'no', candidateSlotType: null,
        independentObjective: 'yes', objectiveType: 'lookup', entityHints: [], slots: {},
        ambiguityFields: [], confidence: 0.92, source: 'llm',
        readMeaning: {
            queryShape: 'focused', explicitCollection: false, targetShape: 'commitment',
            relationship: { kind: 'general_recall' }, temporalRole: 'none', commitmentStatus: null,
        },
        ...overrides,
    };
}

function writeTurn(overrides: Partial<NormalizedSemanticTurnV4> = {}): NormalizedSemanticTurnV4 {
    return readTurn({
        kind: 'write_request', domain: 'commitment', objectiveType: 'create_personal_commitment',
        readMeaning: null, entityHints: ['revisar el estanque'], independentObjective: 'yes',
        ...overrides,
    });
}

function lifecycleTurn(command: 'abandon' | 'resume', overrides: Partial<NormalizedSemanticTurnV4> = {}): NormalizedSemanticTurnV4 {
    return readTurn({
        kind: 'lifecycle_command', domain: 'commitment', objectiveType: null,
        readMeaning: null, lifecycleCommand: command, lifecycleEvidence: 'explicit',
        continuationLike: 'yes', independentObjective: 'no', ...overrides,
    });
}

function diagnostics(overrides: Record<string, unknown> = {}) {
    return {
        schemaValid: true, failure: null, providerRequestSucceeded: true,
        providerFailure: false, providerErrorClass: null, providerHttpStatus: null,
        providerErrorCode: null, providerErrorMessage: null, finishReason: 'stop',
        refusalPresent: false, contentPresent: true, contentLength: 10,
        normalizationSuccess: true, fallbackReason: null, model: 'test-model', latencyMs: 1,
        usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2, reasoningTokens: null },
        ...overrides,
    };
}

function producerFor(semantic: NormalizedSemanticTurnV4, diagnosticOverrides: Record<string, unknown> = {}) {
    return {
        modelName: 'test-model',
        produceV4WithDiagnostics: vi.fn().mockResolvedValue({ semantic, diagnostics: diagnostics(diagnosticOverrides) }),
    };
}

const emptyDialogue: DispositionDialogueSnapshot = {
    lifecycle: 'idle', activeDialogue: null, suspendedDialogue: null,
    version: 0, lastAppliedTurnId: null, lastAppliedTurnSequence: 0,
};

async function runShadow(
    semantic: NormalizedSemanticTurnV4,
    options: Partial<Parameters<typeof runSemanticV4CoreShadow>[0]> = {},
) {
    process.env.PING_SEMANTIC_V4_CORE_SHADOW = 'true';
    return runSemanticV4CoreShadow({
        legacy,
        request: { text: 'texto sensible que no debe aparecer en telemetry', modality: 'text' },
        dialogue: null,
        producer: producerFor(semantic),
        ...options,
    });
}

beforeEach(() => {
    process.env.PING_ENVIRONMENT = 'local';
    process.env.NODE_ENV = 'test';
    delete process.env.PING_SEMANTIC_V4_CORE_SHADOW;
});

afterEach(() => {
    delete process.env.PING_SEMANTIC_V4_CORE_SHADOW;
    delete process.env.NODE_ENV;
    process.env.PING_ENVIRONMENT = 'test';
});

describe('Semantic V4 -> Core shadow boundary', () => {
    it('A: OFF makes zero V4 calls', async () => {
        const producer = producerFor(readTurn());
        expect(isSemanticV4CoreShadowEnabled()).toBe(false);
        const telemetry = await runSemanticV4CoreShadow({
            legacy, request: { text: 'sin llamada', modality: 'text' }, dialogue: null, producer,
        });
        expect(producer.produceV4WithDiagnostics).not.toHaveBeenCalled();
        expect(telemetry.enabled).toBe(false);
    });

    it('B/C/D: permits local and staging, never production', async () => {
        process.env.PING_SEMANTIC_V4_CORE_SHADOW = 'true';
        expect(isSemanticV4CoreShadowEnabled()).toBe(true);
        process.env.PING_ENVIRONMENT = 'staging';
        expect(isSemanticV4CoreShadowEnabled()).toBe(true);
        process.env.NODE_ENV = 'production';
        expect(isSemanticV4CoreShadowEnabled()).toBe(false);
    });

    it('adapts V4 facts to the existing V2/disposition contracts without raw text or IDs', () => {
        const turn = readTurn({
            slots: { attribute: 'occurrence_time' },
            temporalFact: { kind: 'time_only', precision: 'minute', hour: 11, minute: 0, meridiem: '24h', ambiguity: 'none' },
        });
        const boundary = adaptSemanticV4ToCore(turn);
        expect(boundary.semanticV4.readMeaning?.temporalRole).toBe('none');
        expect(boundary.semanticV4.temporalFact?.kind).toBe('time_only');
        expect(boundary.semanticV2.version).toBe(2);
        expect(boundary.dispositionSemantic.kind).toBe('read');
        expect(JSON.stringify(boundary)).not.toContain('sensible');
        expect(JSON.stringify(boundary)).not.toMatch(/[0-9a-f]{8}-[0-9a-f-]{27,}/i);
    });

    it('E/F/G: legacy route/result is never changed by V4 disagreement', async () => {
        const before = JSON.parse(JSON.stringify(legacy));
        const telemetry = await runShadow(writeTurn());
        expect(telemetry.differences.some((item) => item.class === 'SEMANTIC_DISAGREEMENT')).toBe(true);
        expect(legacy).toEqual(before);
        expect(telemetry.sideEffects.legacyResultChanged).toBe(false);
        expect(telemetry.core.planShape?.requiresExecution).toBe(false);
    });

    it('H/I/J: resolver is injectable while tools, persistence and real dialogue remain untouched', async () => {
        const resolver = { resolve: vi.fn().mockResolvedValue({ summary: { status: 'resolved', referenceKind: 'commitment', candidateCount: 1 } }) };
        const dialogue = JSON.parse(JSON.stringify(emptyDialogue)) as DispositionDialogueSnapshot;
        const before = JSON.stringify(dialogue);
        const telemetry = await runShadow(readTurn(), { resolver, dialogue });
        expect(resolver.resolve).toHaveBeenCalledTimes(1);
        expect(telemetry.sideEffects).toEqual({ toolsExecuted: false, persistenceWrites: 0, dialogueStateMutated: false, legacyResultChanged: false });
        expect(JSON.stringify(dialogue)).toBe(before);
    });

    it('K/L/M: provider, schema and timeout failures are telemetry-only', async () => {
        process.env.PING_SEMANTIC_V4_CORE_SHADOW = 'true';
        const providerFailure = await runSemanticV4CoreShadow({
            legacy, request: { text: 'falla proveedor', modality: 'text' }, dialogue: null,
            producer: { modelName: 'test-model', produceV4WithDiagnostics: vi.fn().mockRejectedValue(new Error('provider down')) },
        });
        expect(providerFailure.providerFailure).toBe(true);
        const schemaFailure = await runShadow(readTurn(), { producer: producerFor(readTurn(), { schemaValid: false, fallbackReason: 'schema_invalid' }) });
        expect(schemaFailure.fallbackReason).toBe('schema_invalid');
        const timeout = await runSemanticV4CoreShadow({
            legacy, request: { text: 'timeout', modality: 'text' }, dialogue: null,
            producer: { modelName: 'test-model', produceV4WithDiagnostics: vi.fn(() => new Promise(() => undefined)) }, timeoutMs: 1,
        });
        expect(timeout.timeout).toBe(true);
        expect(timeout.sideEffects.persistenceWrites).toBe(0);
    });

    it('N: ambiguity remains structured and is not silently authorized', async () => {
        const resolver = { resolve: vi.fn().mockResolvedValue({ summary: { status: 'ambiguous', referenceKind: 'commitment', candidateCount: 2 } }) };
        const telemetry = await runShadow(readTurn({ ambiguityFields: ['target'] }), { resolver });
        expect(telemetry.core.resolution.status).toBe('ambiguous');
        expect(telemetry.core.resolution.candidateCount).toBe(2);
        expect(telemetry.differences.some((item) => item.class === 'CORE_RESOLUTION_DISAGREEMENT')).toBe(true);
    });

    it('O: continuation is resolved from structured Core state, not concatenated text', async () => {
        const dialogue: DispositionDialogueSnapshot = {
            ...emptyDialogue,
            lifecycle: 'collecting',
            activeDialogue: { objectiveType: 'create_personal_commitment' },
        };
        const resolver = {
            resolve: vi.fn().mockResolvedValue({
                summary: { status: 'resolved', referenceKind: 'commitment', candidateCount: 1 },
                pendingSlotResolution: { status: 'resolved', slot: 'date', value: 'martes', updatedDialogue: { objectiveType: 'create_personal_commitment', date: 'martes' } },
            }),
        };
        const telemetry = await runShadow(readTurn({
            kind: 'slot_answer', objectiveType: null, objectiveCompleteness: 'unknown',
            continuationLike: 'yes', independentObjective: 'no', pendingSlotAnswer: 'likely',
            candidateSlotType: 'date', slots: { date: 'martes' }, readMeaning: null,
        }), { dialogue, resolver });
        expect(telemetry.core.disposition).toBe('answer_pending');
        expect(telemetry.core.resolution.status).toBe('resolved');
    });

    it('P: an explicit topic objective is not forced into a slot answer', async () => {
        const dialogue: DispositionDialogueSnapshot = { ...emptyDialogue, lifecycle: 'collecting', activeDialogue: { objectiveType: 'create_personal_commitment' } };
        const telemetry = await runShadow(readTurn({ objectiveType: 'message_search', independentObjective: 'yes', continuationLike: 'no' }), { dialogue });
        expect(telemetry.core.disposition).toBe('new_objective');
        expect(telemetry.v4.pendingSlotAnswer).toBe('not_a_slot_answer');
    });

    it('Q: a temporal correction changes only the shadow representation', async () => {
        const dialogue = JSON.parse(JSON.stringify(emptyDialogue)) as DispositionDialogueSnapshot;
        const before = JSON.stringify(dialogue);
        const telemetry = await runShadow(writeTurn({ slots: { date: 'martes' }, temporalFact: { kind: 'weekday', precision: 'date', weekday: 2, relation: 'this_or_next' } }), { dialogue });
        expect(telemetry.core.planShape?.relevantSlotNames).toContain('date');
        expect(JSON.stringify(dialogue)).toBe(before);
        expect(telemetry.sideEffects.dialogueStateMutated).toBe(false);
    });

    it('R: telemetry is sanitized and excludes the raw utterance', async () => {
        const secretLike = 'raw-user-utterance-that-must-not-be-logged';
        const telemetry = await runSemanticV4CoreShadow({
            legacy, request: { text: secretLike, modality: 'text' }, dialogue: null,
            producer: producerFor(readTurn()),
        });
        expect(JSON.stringify(telemetry)).not.toContain(secretLike);
        expect(Object.keys(telemetry)).not.toContain('prompt');
        expect(Object.keys(telemetry)).not.toContain('text');
    });
});
