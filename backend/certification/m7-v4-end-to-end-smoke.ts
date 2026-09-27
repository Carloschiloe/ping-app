import fs from 'node:fs';
import path from 'node:path';
import dotenv from 'dotenv';

// Load the local backend environment before importing the OpenAI producer.
dotenv.config({ path: path.resolve(process.cwd(), '.env') });
process.env.M7_BLIND_MAX_COMPLETION_TOKENS ??= '1024';
process.env.NODE_ENV = 'test';
process.env.PING_ENVIRONMENT = 'local';
process.env.PING_SEMANTIC_V4_CORE_SHADOW = 'true';

const {
    OpenAiSemanticModel,
    SEMANTIC_V4_PROVIDER_SCHEMA_HASH,
    buildSemanticChatCompletionParams,
    parseSemanticV4ModelOutput,
} = require('../src/services/canonicalSemanticProducer.service');
const { adaptSemanticV4ToCore, runSemanticV4CoreShadow } = require('../src/services/agentSemanticV4CoreShadow.service');
const { createHighFidelityReadOnlyRepositoryForTest } = require('../src/services/agentSemanticV4HighFidelityReadOnly.service');
const { createBlindShadowResolver } = require('./m7-blind-shadow-harness');
const { sanitizeSmokeError, smokeArtifactPath } = require('./m7-v4-end-to-end-smoke-observability');

const MODEL = 'gpt-5.6-sol';
const ACTOR = '00000000-0000-4000-8000-000000000001';
const TECHNICAL_SMOKE_TEXT = 'Para este smoke técnico, enumera mis compromisos visibles sin modificar nada.';
const ARTIFACT_PATH = smokeArtifactPath('m7-v4-end-to-end-smoke.v1.json');
const ERROR_ARTIFACT_PATH = smokeArtifactPath('m7-v4-end-to-end-smoke.error.v1.json');

function assert(condition: unknown, message: string): asserts condition {
    if (!condition) throw new Error(message);
}

function diagnostics(response: any, parsed: any) {
    return {
        schemaValid: parsed.diagnostics.schemaValid,
        failure: parsed.diagnostics.failure,
        providerRequestSucceeded: true,
        providerFailure: false,
        providerErrorClass: null,
        providerHttpStatus: null,
        providerErrorCode: null,
        providerErrorMessage: null,
        finishReason: response.finishReason,
        refusalPresent: response.refusalPresent,
        contentPresent: typeof response.content === 'string' && response.content.length > 0,
        contentLength: response.content?.length ?? 0,
        normalizationSuccess: parsed.semantic.source === 'llm',
        fallbackReason: null,
        model: MODEL,
        latencyMs: response.latencyMs,
        usage: response.usage,
    };
}

function replayProducer(semantic: any, diagnostic: any) {
    return {
        modelName: MODEL,
        produceV4WithDiagnostics: async () => ({ semantic, diagnostics: diagnostic }),
    };
}

function stableTelemetry(value: any) {
    return JSON.stringify({ ...value, latencyMs: null });
}

async function main() {
    assert(process.env.OPENAI_API_KEY, 'OPENAI_API_KEY is not available through backend/.env');
    assert(!fs.existsSync(ARTIFACT_PATH), `Smoke artifact already exists: ${ARTIFACT_PATH}`);
    assert(!fs.existsSync(ERROR_ARTIFACT_PATH), `Smoke error artifact already exists: ${ERROR_ARTIFACT_PATH}`);

    const request = {
        text: TECHNICAL_SMOKE_TEXT,
        modality: 'text' as const,
        locale: 'es-CL',
        timezone: 'America/Santiago',
        dialogue: null,
        semanticVersion: 4 as const,
    };
    const transport = buildSemanticChatCompletionParams(MODEL, request);
    assert(transport.max_completion_tokens === 1024, 'Unexpected GPT-5 completion budget');
    assert(!Object.prototype.hasOwnProperty.call(transport, 'temperature'), 'temperature must be omitted for GPT-5 reasoning');
    assert(!Object.prototype.hasOwnProperty.call(transport, 'max_tokens'), 'max_tokens must be omitted for GPT-5 reasoning');

    const model = new OpenAiSemanticModel(MODEL);
    let providerResponse: any;
    try {
        providerResponse = await model.interpretWithDiagnostics(request);
    } catch (error) {
        fs.mkdirSync(path.dirname(ERROR_ARTIFACT_PATH), { recursive: true });
        fs.writeFileSync(ERROR_ARTIFACT_PATH, JSON.stringify({
            artifactVersion: 1,
            model: MODEL,
            providerErrorClass: 'sdk',
            error: sanitizeSmokeError(error),
        }, null, 2) + '\n', { encoding: 'utf8', flag: 'wx' });
        throw new Error('Provider call threw; sanitized diagnostic persisted');
    }
    if (providerResponse.kind !== 'response') {
        fs.mkdirSync(path.dirname(ERROR_ARTIFACT_PATH), { recursive: true });
        fs.writeFileSync(ERROR_ARTIFACT_PATH, JSON.stringify({
            artifactVersion: 1,
            model: MODEL,
            providerErrorClass: providerResponse.errorClass ?? 'unknown',
            providerError: {
                status: providerResponse.httpStatus ?? null,
                code: providerResponse.errorCode ?? null,
                message: sanitizeSmokeError({ message: providerResponse.errorMessage }).message,
                cause: null,
            },
        }, null, 2) + '\n', { encoding: 'utf8', flag: 'wx' });
        assert(false, `Provider call failed: ${providerResponse.errorClass ?? 'unknown'}`);
    }
    assert(providerResponse.finishReason === 'stop', `Unexpected finish reason: ${providerResponse.finishReason}`);
    assert(typeof providerResponse.content === 'string' && providerResponse.content.length > 0, 'Provider returned no content');

    const parsed = parseSemanticV4ModelOutput(providerResponse.content);
    const providerDiagnostics = diagnostics(providerResponse, parsed);
    assert(parsed.diagnostics.schemaValid, `Provider schema invalid: ${parsed.diagnostics.failure}`);
    assert(parsed.diagnostics.failure === null, `Parser failure: ${parsed.diagnostics.failure}`);
    assert(parsed.semantic.source === 'llm', 'V4 normalization did not produce an LLM semantic turn');

    fs.mkdirSync(path.dirname(ARTIFACT_PATH), { recursive: true });
    fs.writeFileSync(ARTIFACT_PATH, JSON.stringify({
        artifactVersion: 1,
        model: MODEL,
        schemaHash: SEMANTIC_V4_PROVIDER_SCHEMA_HASH,
        request,
        rawV4Output: providerResponse.content,
        normalizedSemanticV4: parsed.semantic,
        providerDiagnostics,
        sideEffects: { writers: 0, persistenceMutations: 0, tools: 0, messages: 0, memoryWrites: 0 },
    }, null, 2) + '\n', { encoding: 'utf8', flag: 'wx' });

    const artifact = JSON.parse(fs.readFileSync(ARTIFACT_PATH, 'utf8'));
    assert(artifact.rawV4Output === providerResponse.content, 'Persisted V4 output differs from provider output');
    const reread = parseSemanticV4ModelOutput(artifact.rawV4Output);
    assert(reread.diagnostics.schemaValid && reread.diagnostics.failure === null, 'Persisted output cannot be parsed');

    const adapted = adaptSemanticV4ToCore(reread.semantic);
    const repository = createHighFidelityReadOnlyRepositoryForTest();
    const resolver = createBlindShadowResolver(repository);
    assert(typeof resolver.resolve === 'function', 'High-fidelity resolver has no resolve method');
    const producer = replayProducer(reread.semantic, providerDiagnostics);
    const input = {
        legacy: { route: 'read' as const, interpretation: {} as any, objective: null },
        request: { ...request, dialogue: null },
        dialogue: null,
        actorUserId: ACTOR,
        dialogueScopeKey: 'm7-v4-end-to-end-smoke',
        producer,
        resolver,
    };
    const first = await runSemanticV4CoreShadow(input);
    const second = await runSemanticV4CoreShadow(input);
    assert(first.failure === null, `Core shadow failed: ${first.failure}`);
    assert(second.failure === null, `Offline replay failed: ${second.failure}`);
    assert(first.core.planShape !== null, 'Core plan was not reached');
    assert(stableTelemetry(first) === stableTelemetry(second), 'Offline replay result is not deterministic');
    assert(adapted.semanticV2.kind === 'read_request' || adapted.semanticV2.kind === 'unknown', 'Adapter did not return a Core semantic projection');

    console.log(JSON.stringify({
        END_TO_END_SMOKE: 'PASS',
        OPENAI_CALLS: 1,
        MODEL,
        SCHEMA_VALID: true,
        V4_OUTPUT_PERSISTED: true,
        ARTIFACT_PATH,
        OFFLINE_REPLAY: 'PASS',
        ADAPTER: 'PASS',
        CORE_RESOLVER: 'PASS',
        DISPOSITION_REACHED: first.core.disposition !== null,
        PLAN_REACHED: first.core.planShape !== null,
        SHADOW_FAILURES: 0,
        SIDE_EFFECTS: first.sideEffects,
    }));
}

main().catch((error) => {
    console.error(JSON.stringify({ END_TO_END_SMOKE: 'FAIL', message: error instanceof Error ? error.message : 'unknown' }));
    process.exitCode = 1;
});
