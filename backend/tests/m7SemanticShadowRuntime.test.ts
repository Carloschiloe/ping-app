import { afterEach, describe, expect, it, vi } from 'vitest';
import {
    isSemanticV4ShadowEnabled,
    runSemanticV4Shadow,
} from '../src/services/agentSemanticShadow.service';
import type { NormalizedSemanticTurnV4 } from '../src/types/agentTurnCommit';
import type { AgentSemanticInterpretation } from '../src/services/agentSemanticInterpreter.service';

const legacy: AgentSemanticInterpretation = {
    route: 'read',
    objective: null,
    interpretation: { intent: 'recall', isWriteActionRequest: false, confidence: 0.9 } as any,
};
const v4: NormalizedSemanticTurnV4 = {
    version: 4, kind: 'read_request', domain: 'commitment', objectiveCompleteness: 'complete',
    lifecycleCommand: 'none', lifecycleTarget: 'unspecified', lifecycleEvidence: 'unknown',
    pendingSlotAnswer: 'not_a_slot_answer', continuationLike: 'no', candidateSlotType: null,
    independentObjective: 'yes', objectiveType: 'lookup', entityHints: [], slots: {},
    ambiguityFields: [], confidence: 0.9, source: 'llm', readMeaning: {
        queryShape: 'focused', explicitCollection: false, targetShape: 'commitment',
        relationship: { kind: 'general_recall' }, temporalRole: 'none', commitmentStatus: null,
    },
};

const input = (producer: any, timeoutMs?: number) => runSemanticV4Shadow({
    legacy,
    request: { text: 'una entrada sensible que no debe registrarse', modality: 'text' },
    producer,
    timeoutMs,
});

afterEach(() => {
    delete process.env.PING_SEMANTIC_V4_SHADOW;
    process.env.PING_ENVIRONMENT = 'test';
    delete process.env.NODE_ENV;
});

describe('Semantic V4 runtime shadow boundary', () => {
    it('is OFF by default and does not call the producer', async () => {
        process.env.PING_ENVIRONMENT = 'local';
        const producer = { produceV4WithDiagnostics: vi.fn() };
        expect(isSemanticV4ShadowEnabled()).toBe(false);
        const telemetry = await input(producer);
        expect(producer.produceV4WithDiagnostics).not.toHaveBeenCalled();
        expect(telemetry.enabled).toBe(false);
    });

    it('calls V4 only when explicitly enabled and reports disagreement without governing', async () => {
        process.env.PING_ENVIRONMENT = 'local';
        process.env.PING_SEMANTIC_V4_SHADOW = 'true';
        const producer = { modelName: 'test-model', produceV4WithDiagnostics: vi.fn().mockResolvedValue({ semantic: { ...v4, kind: 'write_request', objectiveType: 'create_personal_commitment', readMeaning: null }, diagnostics: { schemaValid: true, failure: null, providerFailure: false } }) };
        const telemetry = await input(producer);
        expect(producer.produceV4WithDiagnostics).toHaveBeenCalledTimes(1);
        expect(telemetry.routeAgreement).toBe(false);
        expect(telemetry.objectiveAgreement).toBe(false);
        expect(JSON.stringify(telemetry)).not.toContain('entrada sensible');
    });

    it('isolates provider failure and timeout, with no side-effect surface', async () => {
        process.env.PING_ENVIRONMENT = 'local';
        process.env.PING_SEMANTIC_V4_SHADOW = 'true';
        const failure = await input({ produceV4WithDiagnostics: vi.fn().mockRejectedValue(new Error('provider down')) });
        expect(failure.providerFailure).toBe(true);
        const timeout = await input({ produceV4WithDiagnostics: vi.fn(() => new Promise(() => undefined)) }, 1);
        expect(timeout.timeout).toBe(true);
        expect(Object.keys(timeout)).not.toContain('plan');
        expect(Object.keys(timeout)).not.toContain('authorization');
    });

    it('cannot be enabled in production even when the flag is present', async () => {
        process.env.PING_ENVIRONMENT = 'staging';
        process.env.NODE_ENV = 'production';
        process.env.PING_SEMANTIC_V4_SHADOW = 'true';
        const producer = { produceV4WithDiagnostics: vi.fn() };
        expect(isSemanticV4ShadowEnabled()).toBe(false);
        expect((await input(producer)).enabled).toBe(false);
        expect(producer.produceV4WithDiagnostics).not.toHaveBeenCalled();
    });
});
