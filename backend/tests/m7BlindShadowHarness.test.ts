import { describe, expect, it, vi } from 'vitest';
import type { NormalizedSemanticTurnV4 } from '../src/types/agentTurnCommit';
import { adaptSemanticV4ToCore, runSemanticV4CoreShadow } from '../src/services/agentSemanticV4CoreShadow.service';
import { createHighFidelityReadOnlyRepositoryForTest } from '../src/services/agentSemanticV4HighFidelityReadOnly.service';
import { createBlindShadowResolver } from '../certification/m7-blind-shadow-harness';

const ACTOR = '00000000-0000-4000-8000-000000000001';

function readTurn(): NormalizedSemanticTurnV4 {
    return {
        version: 4,
        kind: 'read_request',
        domain: 'commitment',
        objectiveCompleteness: 'complete',
        lifecycleCommand: 'none',
        lifecycleTarget: 'unspecified',
        lifecycleEvidence: 'unknown',
        pendingSlotAnswer: 'not_a_slot_answer',
        continuationLike: 'no',
        candidateSlotType: null,
        independentObjective: 'yes',
        objectiveType: 'commitment_status_lookup',
        entityHints: ['tareas de esta semana'],
        slots: {},
        ambiguityFields: [],
        confidence: 0.9,
        source: 'llm',
        temporalFact: undefined,
        readMeaning: {
            queryShape: 'collection',
            explicitCollection: true,
            targetShape: 'commitment',
            relationship: { kind: 'general_recall' },
            temporalRole: 'none',
            commitmentStatus: null,
        },
    };
}

describe('M-7 blind shadow harness boundary', () => {
    it('injects a real resolver and traverses V4 -> Core -> plan without side effects', async () => {
        const previous = {
            environment: process.env.PING_ENVIRONMENT,
            node: process.env.NODE_ENV,
            enabled: process.env.PING_SEMANTIC_V4_CORE_SHADOW,
        };
        process.env.PING_ENVIRONMENT = 'local';
        process.env.NODE_ENV = 'test';
        process.env.PING_SEMANTIC_V4_CORE_SHADOW = 'true';
        try {
            const repository = createHighFidelityReadOnlyRepositoryForTest();
            const resolver = createBlindShadowResolver(repository);
            expect(typeof resolver.resolve).toBe('function');

            const semantic = readTurn();
            const adapted = adaptSemanticV4ToCore(semantic);
            const producer = {
                modelName: 'harness-regression',
                produceV4WithDiagnostics: vi.fn().mockResolvedValue({
                    semantic,
                    diagnostics: {
                        schemaValid: true,
                        failure: null,
                        providerRequestSucceeded: true,
                        providerFailure: false,
                        providerErrorClass: null,
                        providerHttpStatus: null,
                        providerErrorCode: null,
                        providerErrorMessage: null,
                        finishReason: 'stop',
                        refusalPresent: false,
                        contentPresent: true,
                        contentLength: 1,
                        normalizationSuccess: true,
                        fallbackReason: null,
                        model: 'harness-regression',
                        latencyMs: 0,
                        usage: { inputTokens: 0, outputTokens: 0, totalTokens: 0, reasoningTokens: 0 },
                    },
                }),
            };
            const telemetry = await runSemanticV4CoreShadow({
                legacy: { route: 'read', interpretation: {} as any, objective: null },
                request: { text: 'consulta controlada', modality: 'text', locale: 'es-CL', timezone: 'America/Santiago', dialogue: null },
                dialogue: null,
                actorUserId: ACTOR,
                dialogueScopeKey: 'm7-harness-regression',
                producer,
                resolver,
            });

            expect(adapted.semanticV2.kind).toBe('read_request');
            expect(telemetry.failure).toBeNull();
            expect(telemetry.core.disposition).toBe('ordinary_read');
            expect(telemetry.core.planShape).not.toBeNull();
            expect(telemetry.core.planShape?.route).toBe('read');
            expect(telemetry.sideEffects).toEqual({
                toolsExecuted: false,
                persistenceWrites: 0,
                dialogueStateMutated: false,
                legacyResultChanged: false,
            });
        } finally {
            if (previous.environment === undefined) delete process.env.PING_ENVIRONMENT; else process.env.PING_ENVIRONMENT = previous.environment;
            if (previous.node === undefined) delete process.env.NODE_ENV; else process.env.NODE_ENV = previous.node;
            if (previous.enabled === undefined) delete process.env.PING_SEMANTIC_V4_CORE_SHADOW; else process.env.PING_SEMANTIC_V4_CORE_SHADOW = previous.enabled;
        }
    });
});
