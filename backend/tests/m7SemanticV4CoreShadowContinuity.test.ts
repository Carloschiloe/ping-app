import { describe, expect, it, vi } from 'vitest';
import type { NormalizedSemanticTurnV4 } from '../src/types/agentTurnCommit';
import type { AgentSemanticInterpretation } from '../src/services/agentSemanticInterpreter.service';
import type { DispositionDialogueSnapshot } from '../src/types/agentTurnDisposition';
import { M7_SEMANTIC_V4_CONTINUITY_CASES } from './fixtures/m7SemanticV4ContinuityGateCases';
import { runSemanticV4CoreShadow } from '../src/services/agentSemanticV4CoreShadow.service';
import { AgentSemanticV4HighFidelityReadOnlyResolver, createHighFidelityReadOnlyRepositoryForTest } from '../src/services/agentSemanticV4HighFidelityReadOnly.service';

const highFidelityResolver = new AgentSemanticV4HighFidelityReadOnlyResolver(createHighFidelityReadOnlyRepositoryForTest());

const diagnostics = {
    schemaValid: true, failure: null, providerRequestSucceeded: true, providerFailure: false,
    providerErrorClass: null, providerHttpStatus: null, providerErrorCode: null,
    providerErrorMessage: null, finishReason: 'stop', refusalPresent: false,
    contentPresent: true, contentLength: 10, normalizationSuccess: true,
    fallbackReason: null, model: 'continuity-fixture', latencyMs: 1,
    usage: { inputTokens: null, outputTokens: null, totalTokens: null, reasoningTokens: null },
};

function legacyFor(turn: NormalizedSemanticTurnV4): AgentSemanticInterpretation {
    return {
        route: turn.kind === 'read_request' ? 'read' : 'write',
        objective: null,
        interpretation: { intent: 'recall', isWriteActionRequest: turn.kind !== 'read_request', confidence: turn.confidence } as any,
    };
}

function dialogueForTurn(turn: number): DispositionDialogueSnapshot | null {
    if (turn === 0) return null;
    return {
        lifecycle: 'collecting',
        activeDialogue: { objectiveType: 'continuation_context' },
        suspendedDialogue: null,
        version: turn,
        lastAppliedTurnId: null,
        lastAppliedTurnSequence: turn,
    };
}

describe('Semantic V4 continuity gate through Core shadow', () => {
    it('traverses all 10 cases and 16 turns through V4 -> Core -> disposition -> preparation shape', async () => {
        process.env.PING_ENVIRONMENT = 'local';
        process.env.NODE_ENV = 'test';
        process.env.PING_SEMANTIC_V4_CORE_SHADOW = 'true';
        let turnCount = 0;
        for (const testCase of M7_SEMANTIC_V4_CONTINUITY_CASES) {
            for (let index = 0; index < testCase.turns.length; index += 1) {
                const fixtureTurn = testCase.turns[index];
                const semantic = { version: 4, ...fixtureTurn.semantic } as NormalizedSemanticTurnV4;
                const producer = {
                    modelName: 'continuity-fixture',
                    produceV4WithDiagnostics: vi.fn().mockResolvedValue({ semantic, diagnostics }),
                };
                const telemetry = await runSemanticV4CoreShadow({
                    legacy: legacyFor(semantic),
                    request: { text: fixtureTurn.utterance, modality: 'text' },
                    dialogue: dialogueForTurn(index),
                    actorUserId: '00000000-0000-4000-8000-000000000001',
                    dialogueScopeKey: `continuity:${testCase.id}`,
                    turnReferenceInstant: '2026-09-25T12:00:00.000Z',
                    resolver: highFidelityResolver,
                    producer,
                });
                expect(telemetry.enabled, testCase.id).toBe(true);
                expect(telemetry.v4.kind, testCase.id).not.toBeNull();
                expect(telemetry.core.mappedKind, testCase.id).not.toBeNull();
                expect(telemetry.sideEffects.toolsExecuted, testCase.id).toBe(false);
                expect(telemetry.sideEffects.persistenceWrites, testCase.id).toBe(0);
                expect(telemetry.sideEffects.dialogueStateMutated, testCase.id).toBe(false);
                expect(telemetry.differences.some((difference) => difference.class === 'SHADOW_ERROR'), testCase.id).toBe(false);
                turnCount += 1;
            }
        }
        expect(M7_SEMANTIC_V4_CONTINUITY_CASES).toHaveLength(10);
        expect(turnCount).toBe(16);
    });
});
