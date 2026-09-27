import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import crypto from 'node:crypto';
import { sanitizeSmokeError } from '../certification/m7-v4-end-to-end-smoke-observability';
import { smokeArtifactDirectory, smokeArtifactPath } from '../certification/m7-v4-end-to-end-smoke-observability';
import { parseSemanticV4ModelOutput } from '../src/services/canonicalSemanticProducer.service';
import { runSemanticV4CoreShadow } from '../src/services/agentSemanticV4CoreShadow.service';
import { createBlindShadowResolver } from '../certification/m7-blind-shadow-harness';
import { createHighFidelityReadOnlyRepositoryForTest } from '../src/services/agentSemanticV4HighFidelityReadOnly.service';

const ACTOR = '00000000-0000-4000-8000-000000000001';

function readTurn() {
    return {
        version: 4 as const,
        kind: 'read_request' as const,
        domain: 'commitment' as const,
        objectiveCompleteness: 'complete' as const,
        lifecycleCommand: 'none' as const,
        lifecycleTarget: 'unspecified' as const,
        lifecycleEvidence: 'unknown' as const,
        pendingSlotAnswer: 'not_a_slot_answer' as const,
        continuationLike: 'no' as const,
        candidateSlotType: null,
        independentObjective: 'yes' as const,
        objectiveType: 'commitment_status_lookup',
        entityHints: ['visible commitments'],
        slots: {},
        ambiguityFields: [],
        confidence: 0.9,
        source: 'llm' as const,
        temporalFact: undefined,
        readMeaning: {
            queryShape: 'collection' as const,
            explicitCollection: true,
            targetShape: 'commitment' as const,
            relationship: { kind: 'general_recall' as const },
            temporalRole: 'none' as const,
            commitmentStatus: null,
        },
    };
}

describe('M-7 V4 smoke error observability', () => {
    it('preserves useful SDK fields while removing key and authorization material', () => {
        const result = sanitizeSmokeError({
            name: 'BadRequestError',
            status: 400,
            code: 'invalid_request_error',
            type: 'invalid_request_error',
            message: 'Authorization: Bearer sk-proj-super-secret OPENAI_API_KEY=sk-live-secret',
        });
        expect(result).toMatchObject({ name: 'BadRequestError', status: 400, code: 'invalid_request_error', type: 'invalid_request_error' });
        expect(JSON.stringify(result)).not.toContain('sk-proj-super-secret');
        expect(JSON.stringify(result)).not.toContain('sk-live-secret');
        expect(JSON.stringify(result)).not.toContain('Bearer sk-');
        expect(JSON.stringify(result)).not.toContain('Authorization: Bearer');
    });

    it('captures a nested cause without persisting its token material', () => {
        const result = sanitizeSmokeError({
            name: 'APIConnectionError',
            code: 'ECONNRESET',
            message: 'request failed',
            cause: {
                name: 'Error',
                code: 'ECONNRESET',
                message: 'token=secret-value Authorization=Bearer abc123',
            },
        });
        expect(result.cause).toEqual({ name: 'Error', code: 'ECONNRESET', message: 'token=[redacted] Authorization=[redacted]' });
        expect(JSON.stringify(result)).not.toContain('secret-value');
        expect(JSON.stringify(result)).not.toContain('abc123');
    });

    it('is bounded and safe for unknown thrown values', () => {
        const result = sanitizeSmokeError('unexpected OPENAI_API_KEY=sk-unknown');
        expect(result).toEqual({ name: null, status: null, code: null, type: null, message: 'unexpected OPENAI_API_KEY=[redacted]', cause: null });
    });

    it('writes, fsyncs, reads, hashes and replays one artifact from the ignored workspace path', async () => {
        const previous = {
            environment: process.env.PING_ENVIRONMENT,
            node: process.env.NODE_ENV,
            enabled: process.env.PING_SEMANTIC_V4_CORE_SHADOW,
        };
        const artifactPath = smokeArtifactPath(`m7-v4-filesystem-regression-${Date.now()}.json`);
        const semantic = readTurn();
        const rawV4Output = JSON.stringify({
            kind: semantic.kind,
            domain: semantic.domain,
            objectiveCompleteness: semantic.objectiveCompleteness,
            lifecycleCommand: semantic.lifecycleCommand,
            lifecycleTarget: semantic.lifecycleTarget,
            lifecycleEvidence: semantic.lifecycleEvidence,
            pendingSlotAnswer: semantic.pendingSlotAnswer,
            continuationLike: semantic.continuationLike,
            candidateSlotType: semantic.candidateSlotType,
            independentObjective: semantic.independentObjective,
            objectiveType: semantic.objectiveType,
            entityHints: semantic.entityHints,
            slots: [],
            ambiguityFields: semantic.ambiguityFields,
            confidence: semantic.confidence,
            temporalFact: null,
            readMeaning: semantic.readMeaning,
        });
        const artifact = JSON.stringify({ rawV4Output }, null, 2) + '\n';
        try {
            fs.mkdirSync(smokeArtifactDirectory(), { recursive: true });
            const fd = fs.openSync(artifactPath, 'wx');
            try {
                fs.writeSync(fd, artifact, undefined, 'utf8');
                fs.fsyncSync(fd);
            } finally {
                fs.closeSync(fd);
            }
            const reread = fs.readFileSync(artifactPath, 'utf8');
            expect(reread).toBe(artifact);
            expect(crypto.createHash('sha256').update(reread, 'utf8').digest('hex'))
                .toBe(crypto.createHash('sha256').update(artifact, 'utf8').digest('hex'));

            process.env.PING_ENVIRONMENT = 'local';
            process.env.NODE_ENV = 'test';
            process.env.PING_SEMANTIC_V4_CORE_SHADOW = 'true';
            const loaded = JSON.parse(reread);
            const parsed = parseSemanticV4ModelOutput(loaded.rawV4Output);
            expect(parsed.diagnostics).toEqual({ schemaValid: true, failure: null });
            const diagnostic = {
                schemaValid: true, failure: null, providerRequestSucceeded: true, providerFailure: false,
                providerErrorClass: null, providerHttpStatus: null, providerErrorCode: null,
                providerErrorMessage: null, finishReason: 'stop', refusalPresent: false,
                contentPresent: true, contentLength: rawV4Output.length, normalizationSuccess: true,
                fallbackReason: null, model: 'offline-artifact-replay', latencyMs: 0,
                usage: { inputTokens: 0, outputTokens: 0, totalTokens: 0, reasoningTokens: 0 },
            };
            const producer = { modelName: 'offline-artifact-replay', produceV4WithDiagnostics: async () => ({ semantic: parsed.semantic, diagnostics: diagnostic }) };
            const replayInput = {
                legacy: { route: 'read' as const, interpretation: {} as any, objective: null },
                request: { text: 'offline artifact replay', modality: 'text' as const, locale: 'es-CL', timezone: 'America/Santiago', dialogue: null },
                dialogue: null,
                actorUserId: ACTOR,
                dialogueScopeKey: 'm7-filesystem-regression',
                producer,
                resolver: createBlindShadowResolver(createHighFidelityReadOnlyRepositoryForTest()),
            };
            const first = await runSemanticV4CoreShadow(replayInput);
            const second = await runSemanticV4CoreShadow(replayInput);
            expect(first.failure).toBeNull();
            expect(first.core.planShape).not.toBeNull();
            expect(second.failure).toBeNull();
            expect({ ...second, latencyMs: null }).toEqual({ ...first, latencyMs: null });
            expect(first.sideEffects).toEqual({ toolsExecuted: false, persistenceWrites: 0, dialogueStateMutated: false, legacyResultChanged: false });
        } finally {
            fs.rmSync(artifactPath, { force: true });
            if (previous.environment === undefined) delete process.env.PING_ENVIRONMENT; else process.env.PING_ENVIRONMENT = previous.environment;
            if (previous.node === undefined) delete process.env.NODE_ENV; else process.env.NODE_ENV = previous.node;
            if (previous.enabled === undefined) delete process.env.PING_SEMANTIC_V4_CORE_SHADOW; else process.env.PING_SEMANTIC_V4_CORE_SHADOW = previous.enabled;
        }
    });
});
