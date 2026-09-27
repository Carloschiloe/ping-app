import crypto from 'node:crypto';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import type { AgentSemanticInterpretation } from '../src/services/agentSemanticInterpreter.service';
import type { NormalizedSemanticTurnV4 } from '../src/types/agentTurnCommit';
import {
    AgentSemanticV4HighFidelityReadOnlyResolver,
    createHighFidelityReadOnlyRepositoryForTest,
} from '../src/services/agentSemanticV4HighFidelityReadOnly.service';
import { runSemanticV4CoreShadow } from '../src/services/agentSemanticV4CoreShadow.service';
import {
    completeLedgerEnvelope,
    containsForbiddenRuntimeSource,
    createLedgerEnvelope,
    readLedgerEnvelope,
    stableLedgerProjection,
    writeLedgerEnvelope,
} from '../certification/m7-ledger-capture';

const ACTOR = '00000000-0000-4000-8000-000000000001';
const CLOCK = '2026-09-26T15:00:00.000Z';
const TIMEZONE = 'America/Santiago';
const DIAGNOSTICS: any = {
    schemaValid: true, failure: null, providerRequestSucceeded: false, providerFailure: false,
    providerErrorClass: null, providerHttpStatus: null, providerErrorCode: null,
    providerErrorMessage: null, finishReason: 'stop', refusalPresent: false, contentPresent: true,
    contentLength: 1, normalizationSuccess: true, fallbackReason: null, model: 'synthetic',
    latencyMs: 0, usage: { inputTokens: 0, outputTokens: 0, totalTokens: 0, reasoningTokens: 0 },
};

const common: Omit<NormalizedSemanticTurnV4, 'kind' | 'readMeaning'> = {
    version: 4, domain: 'commitment', objectiveCompleteness: 'complete', lifecycleCommand: 'none',
    lifecycleTarget: 'unspecified', lifecycleEvidence: 'unknown', pendingSlotAnswer: 'not_a_slot_answer',
    continuationLike: 'no', candidateSlotType: null, independentObjective: 'yes',
    objectiveType: 'create_personal_commitment', entityHints: ['revisar válvulas'], slots: {},
    ambiguityFields: [], confidence: 0.9, source: 'llm', temporalFact: undefined,
};

function semantic(overrides: Partial<NormalizedSemanticTurnV4> = {}): NormalizedSemanticTurnV4 {
    return {
        ...common,
        kind: 'write_request',
        readMeaning: null,
        ...overrides,
    } as NormalizedSemanticTurnV4;
}

function legacy(semanticTurn: NormalizedSemanticTurnV4): AgentSemanticInterpretation {
    return {
        route: semanticTurn.kind === 'read_request' ? 'read' : 'write',
        objective: null,
        interpretation: {
            intent: semanticTurn.kind === 'read_request' ? 'recall' : 'general_context',
            isWriteActionRequest: semanticTurn.kind !== 'read_request',
            confidence: semanticTurn.confidence,
        } as any,
    };
}

function repository(): AgentSemanticV4HighFidelityReadOnlyResolver {
    const rows = {
        commitments: [],
        people: [
            { actorUserId: ACTOR, person: { kind: 'user' as const, id: '00000000-0000-4000-8000-000000000010', displayName: 'Alex' } },
            { actorUserId: ACTOR, person: { kind: 'user' as const, id: '00000000-0000-4000-8000-000000000011', displayName: 'Alex' } },
        ],
    };
    return new AgentSemanticV4HighFidelityReadOnlyResolver(createHighFidelityReadOnlyRepositoryForTest(rows));
}

const turns: Array<{ conversationId: string; turnIndex: number; utterance: string; semantic: NormalizedSemanticTurnV4 }> = [
    { conversationId: 'synthetic-ledger', turnIndex: 1, utterance: 'captura técnica inicial', semantic: semantic() },
    { conversationId: 'synthetic-ledger', turnIndex: 2, utterance: 'corrección de fecha', semantic: semantic({ kind: 'slot_answer', continuationLike: 'yes', independentObjective: 'no', candidateSlotType: 'date', pendingSlotAnswer: 'likely', objectiveCompleteness: 'incomplete', slots: { date: '2026-09-29' } }) },
    { conversationId: 'synthetic-ledger', turnIndex: 3, utterance: 'cambio de objetivo', semantic: semantic({ kind: 'write_request', continuationLike: 'no', independentObjective: 'yes', entityHints: ['otro objetivo'] }) },
    { conversationId: 'synthetic-ledger', turnIndex: 4, utterance: 'retorno al objetivo vigente', semantic: semantic({ kind: 'slot_answer', continuationLike: 'yes', independentObjective: 'no', candidateSlotType: 'date', pendingSlotAnswer: 'likely', objectiveCompleteness: 'incomplete', slots: { date: '2026-10-01' } }) },
    { conversationId: 'synthetic-ledger', turnIndex: 5, utterance: 'confirmación técnica', semantic: semantic({ kind: 'lifecycle_command', lifecycleCommand: 'resume', lifecycleTarget: 'plan', lifecycleEvidence: 'explicit', objectiveCompleteness: 'complete' }) },
    { conversationId: 'synthetic-ledger', turnIndex: 6, utterance: 'referencia ambigua', semantic: semantic({ kind: 'read_request', domain: 'people', objectiveType: 'lookup', entityHints: ['Alex'], candidateSlotType: 'person', readMeaning: { queryShape: 'focused', explicitCollection: false, targetShape: 'person', relationship: { kind: 'person_relationship' }, temporalRole: 'none', commitmentStatus: null } }) },
];

async function evaluate(record: ReturnType<typeof createLedgerEnvelope>) {
    const telemetry: any[] = [];
    const result = await runSemanticV4CoreShadow({
        legacy: record.legacySemanticNormalized as AgentSemanticInterpretation,
        request: { text: record.humanUtterance, modality: 'text', locale: 'es-CL', timezone: record.timezone },
        dialogue: record.dialogueStateBefore as any,
        actorUserId: ACTOR,
        dialogueScopeKey: record.conversationId,
        turnReferenceInstant: record.clock,
        semanticResult: { semantic: record.semanticV4Normalized as NormalizedSemanticTurnV4, diagnostics: DIAGNOSTICS },
        resolver: repository(),
    });
    telemetry.push(result);
    return {
        dialogueStateAfter: record.dialogueStateBefore,
        ledgerStateAfter: { lifecycle: (record.dialogueStateBefore as any)?.lifecycle ?? 'idle' },
        currentObjective: (record.semanticV4Normalized as any)?.objectiveType ?? null,
        currentVersion: (record.dialogueStateBefore as any)?.version ?? 0,
        pendingConfirmationTarget: null,
        disposition: result.core.disposition,
        planShape: result.core.planShape,
        failure: result.failure,
        sideEffects: result.sideEffects,
        resolution: result.core.resolution,
    };
}

describe('M-7 capture/replay ledger envelope', () => {
    it('captures before Core and replays the same Core inputs twice identically', async () => {
        const root = fsTempRoot();
        const captured: any[] = [];
        try {
            for (const item of turns) {
                const dialogue = { lifecycle: item.turnIndex === 6 ? 'collecting' : 'idle', activeDialogue: null, suspendedDialogue: null, version: item.turnIndex, lastAppliedTurnId: `synthetic-${item.turnIndex}`, lastAppliedTurnSequence: item.turnIndex };
                const envelope = createLedgerEnvelope({
                    conversationId: item.conversationId, turnIndex: item.turnIndex, humanUtterance: item.utterance,
                    runtimeFingerprint: { source: 'synthetic', model: 'none', schemaHash: 'synthetic', random: 'disabled' },
                    clock: CLOCK, timezone: TIMEZONE, dialogueStateBefore: dialogue, ledgerStateBefore: dialogue,
                    semanticV4Raw: item.semantic, semanticV4Normalized: item.semantic,
                    legacySemanticRaw: legacy(item.semantic), legacySemanticNormalized: legacy(item.semantic),
                    objectiveInterpreterInput: { text: item.utterance, actorUserId: ACTOR },
                    objectiveInterpreterOutput: { source: 'synthetic', output: null },
                    temporalInputs: NOT_USED_FOR_TEST, temporalOutputs: NOT_USED_FOR_TEST,
                    entityResolverInputs: { actorUserId: ACTOR, entityHints: item.semantic.entityHints },
                    entityResolverOutputs: NOT_USED_FOR_TEST,
                    featureFlags: { coreShadow: true, externalProviders: false },
                    coreInput: { semantic: item.semantic, clock: CLOCK, timezone: TIMEZONE },
                });
                const beforeCore = JSON.stringify(envelope);
                const result = await evaluate(envelope);
                const completed = completeLedgerEnvelope(envelope, result);
                expect(JSON.parse(beforeCore).disposition).toEqual({ status: 'NOT_USED', reason: 'pending_core_evaluation' });
                expect(completed.failure).toBeNull();
                expect(completed.sideEffects.toolsExecuted).toBe(false);
                expect(completed.sideEffects.persistenceWrites).toBe(0);
                expect(containsForbiddenRuntimeSource(completed)).toBeNull();
                const file = writeLedgerEnvelope(root, `turn-${item.turnIndex}.json`, completed as any);
                captured.push(file);
            }

            const envelopes = captured.map(readLedgerEnvelope);
            const replayOne = await Promise.all(envelopes.map(evaluate));
            const replayTwo = await Promise.all(envelopes.map(evaluate));
            const expected = envelopes.map((envelope) => stableLedgerProjection(envelope));
            expect(replayOne.map(stableLedgerProjection)).toEqual(expected);
            expect(replayTwo.map(stableLedgerProjection)).toEqual(replayOne.map(stableLedgerProjection));
        } finally {
            fsRemove(root);
        }
    });
});

function fsTempRoot(): string {
    const fs = require('node:fs') as typeof import('node:fs');
    return fs.mkdtempSync(path.join(os.tmpdir(), 'ping-m7-ledger-capture-'));
}
function fsRemove(root: string): void {
    const fs = require('node:fs') as typeof import('node:fs');
    fs.rmSync(root, { recursive: true, force: true });
}
const NOT_USED_FOR_TEST = { status: 'NOT_USED' as const, reason: 'synthetic fixture does not use external temporal service' };
