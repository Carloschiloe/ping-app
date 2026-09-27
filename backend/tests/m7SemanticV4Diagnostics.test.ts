import { describe, expect, it, vi } from 'vitest';
import { readFile, unlink } from 'node:fs/promises';
import { join } from 'node:path';
import {
    CanonicalSemanticProducer,
    type SemanticModelWithDiagnostics,
    type SemanticV4ProviderCallResult,
} from '../src/services/canonicalSemanticProducer.service';
import { toSanitizedProbeEvidence, writeSanitizedProbeEvidence } from './helpers/m7SemanticV4ProbeEvidence';

const validProviderPayload = {
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
    objectiveType: 'lookup',
    entityHints: [],
    slots: [],
    ambiguityFields: [],
    confidence: 0.9,
    temporalFact: null,
    openObjectiveRelation: 'independent',
    readMeaning: {
        queryShape: 'focused',
        explicitCollection: false,
        targetShape: 'commitment',
        relationship: { kind: 'general_recall' },
        temporalRole: 'none',
        commitmentStatus: null,
    },
};

function response(overrides: Partial<Extract<SemanticV4ProviderCallResult, { kind: 'response' }>> = {}): Extract<SemanticV4ProviderCallResult, { kind: 'response' }> {
    return {
        kind: 'response',
        content: JSON.stringify(validProviderPayload),
        finishReason: 'stop',
        refusalPresent: false,
        usage: { inputTokens: 11, outputTokens: 7, totalTokens: 18, reasoningTokens: null },
        latencyMs: 12,
        ...overrides,
    };
}

function model(result: SemanticV4ProviderCallResult): SemanticModelWithDiagnostics {
    return {
        modelName: 'diagnostic-fixture',
        interpret: vi.fn(),
        interpretWithDiagnostics: vi.fn(async () => result),
    };
}

async function diagnose(result: SemanticV4ProviderCallResult) {
    return new CanonicalSemanticProducer(model(result)).produceV4WithDiagnostics({
        text: 'consulta controlada', modality: 'text', locale: 'es-CL', timezone: 'America/Santiago', dialogue: null,
    });
}

describe('Semantic V4 diagnostics are test-only and preserve fail-safe semantics', () => {
    it('A: valid V4 response records provider, schema, parsing and normalization success', async () => {
        const result = await diagnose(response());
        expect(result.semantic.source).toBe('llm');
        expect(result.diagnostics).toMatchObject({
            providerRequestSucceeded: true, providerFailure: false, schemaValid: true,
            failure: null, normalizationSuccess: true, fallbackReason: null,
            contentPresent: true, finishReason: 'stop', refusalPresent: false,
            model: 'diagnostic-fixture',
        });
        expect(result.diagnostics.usage).toEqual({ inputTokens: 11, outputTokens: 7, totalTokens: 18, reasoningTokens: null });
    });

    it.each([
        ['B HTTP error', { kind: 'error', errorClass: 'http', httpStatus: 400, errorCode: 'unsupported_parameter', errorMessage: 'Unsupported parameter: max_tokens', latencyMs: 3 }, 'provider_error', 'http'],
        ['C timeout', { kind: 'error', errorClass: 'timeout', httpStatus: null, errorCode: 'ETIMEDOUT', errorMessage: 'request timed out', latencyMs: 4 }, 'provider_error', 'timeout'],
    ] as const)('%s remains unknown but exposes provider failure', async (_label, call, fallbackReason, errorClass) => {
        const result = await diagnose(call);
        expect(result.semantic.kind).toBe('unknown');
        expect(result.semantic.source).toBe('fallback');
        expect(result.diagnostics).toMatchObject({ providerRequestSucceeded: false, providerFailure: true, fallbackReason, providerErrorClass: errorClass });
    });

    it('D: invalid JSON is distinct from provider failure', async () => {
        const result = await diagnose(response({ content: '{invalid', finishReason: 'stop' }));
        expect(result.diagnostics).toMatchObject({ providerRequestSucceeded: true, failure: 'invalid_json', fallbackReason: 'invalid_json', normalizationSuccess: false });
    });

    it('E: schema-invalid JSON is distinct from invalid JSON', async () => {
        const result = await diagnose(response({ content: JSON.stringify({ kind: 'read_request' }) }));
        expect(result.diagnostics).toMatchObject({ providerRequestSucceeded: true, schemaValid: false, failure: 'schema_invalid', fallbackReason: 'schema_invalid' });
    });

    it('F: empty content is observable without exposing content', async () => {
        const result = await diagnose(response({ content: null }));
        expect(result.diagnostics).toMatchObject({ contentPresent: false, contentLength: 0, fallbackReason: 'empty_content' });
    });

    it('G: refusal is observable as a separate safe fallback reason', async () => {
        const result = await diagnose(response({ content: null, refusalPresent: true }));
        expect(result.diagnostics).toMatchObject({ refusalPresent: true, fallbackReason: 'refusal' });
    });

    it('H: truncated output records finish_reason and does not masquerade as schema failure', async () => {
        const result = await diagnose(response({ content: '{"kind":', finishReason: 'length' }));
        expect(result.diagnostics).toMatchObject({ finishReason: 'length', failure: 'invalid_json', fallbackReason: 'truncated_output' });
    });

    it('production-facing produceV4 keeps the same unknown fail-safe for a provider error', async () => {
        const producer = new CanonicalSemanticProducer(model({ kind: 'error', errorClass: 'http', httpStatus: 429, errorCode: 'rate_limit_exceeded', errorMessage: 'rate limit', latencyMs: 1 }));
        const result = await producer.produceV4({ text: 'consulta controlada', modality: 'text' });
        expect(result).toMatchObject({ kind: 'unknown', source: 'fallback', confidence: 0 });
    });

    it('writes only sanitized evidence for valid and failed probes', async () => {
        const validResult = await diagnose(response());
        const failureResult = await diagnose({ kind: 'error', errorClass: 'http', httpStatus: 400, errorCode: 'unsupported_parameter', errorMessage: 'Unsupported parameter: max_tokens', latencyMs: 2 });
        const validPath = join(process.env.TEMP ?? 'C:\\tmp', 'ping-m7-v4-evidence-valid.json');
        const failurePath = join(process.env.TEMP ?? 'C:\\tmp', 'ping-m7-v4-evidence-failure.json');
        try {
            await writeSanitizedProbeEvidence(validPath, toSanitizedProbeEvidence('diagnostic-fixture', 'OFFLINE_VALID', validResult.semantic, validResult.diagnostics));
            await writeSanitizedProbeEvidence(failurePath, toSanitizedProbeEvidence('diagnostic-fixture', 'OFFLINE_FAILURE', failureResult.semantic, failureResult.diagnostics));
            const validText = await readFile(validPath, 'utf8');
            const failureText = await readFile(failurePath, 'utf8');
            expect(validText).not.toContain('OPENAI_API_KEY');
            expect(validText).not.toContain('Authorization');
            expect(validText).not.toContain('consulta controlada');
            expect(validText).not.toContain('headers');
            expect(JSON.parse(validText)).toMatchObject({ model: 'diagnostic-fixture', caseId: 'OFFLINE_VALID', diagnostics: { schemaValid: true, fallbackReason: null } });
            expect(JSON.parse(failureText)).toMatchObject({ model: 'diagnostic-fixture', caseId: 'OFFLINE_FAILURE', diagnostics: { providerErrorClass: 'http', httpStatus: 400, providerErrorCode: 'unsupported_parameter', providerErrorMessage: 'Unsupported parameter: max_tokens', fallbackReason: 'provider_error' } });
        } finally {
            await Promise.all([unlink(validPath).catch(() => undefined), unlink(failurePath).catch(() => undefined)]);
        }
    });
});
