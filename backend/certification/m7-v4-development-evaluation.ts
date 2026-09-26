import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import dotenv from 'dotenv';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });
process.env.M7_BLIND_MAX_COMPLETION_TOKENS ??= '1024';
process.env.NODE_ENV = 'test';
process.env.PING_ENVIRONMENT = 'local';
process.env.PING_SEMANTIC_V4_CORE_SHADOW = 'true';

const {
  OpenAiSemanticModel,
  parseSemanticV4ModelOutput,
} = require('../src/services/canonicalSemanticProducer.service');
const {
  runSemanticV4CoreShadow,
} = require('../src/services/agentSemanticV4CoreShadow.service');
const {
  createHighFidelityReadOnlyRepositoryForTest,
} = require('../src/services/agentSemanticV4HighFidelityReadOnly.service');
const { createBlindShadowResolver } = require('./m7-blind-shadow-harness');

type DevelopmentCase = {
  id: string;
  family: string;
  text: string;
  dialogue?: {
    lifecycle: 'none' | 'active' | 'suspended' | 'active_and_suspended';
    activeObjectiveType: string | null;
    missingSlotType: string | null;
    suspendedObjectiveType: string | null;
    referentHints: string[];
  };
};

const MODEL = 'gpt-5.6-sol';
const root = path.resolve(process.env.PING_SMOKE_ARTIFACT_ROOT || path.join(process.cwd(), '.m7-smoke-artifacts'));
const batteryPath = path.resolve(__dirname, 'm7-v4-development-battery.v1.json');
const outputPath = path.join(root, 'm7-v4-development-evaluation.v1.json');
const rawOutputPath = path.join(root, 'm7-v4-development-raw.v1.ndjson');
const battery = JSON.parse(fs.readFileSync(batteryPath, 'utf8')) as { cases: DevelopmentCase[] };

function sha256(value: string): string {
  return crypto.createHash('sha256').update(value, 'utf8').digest('hex');
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

async function main() {
  assert(process.env.OPENAI_API_KEY, 'OPENAI_API_KEY is not available through backend/.env');
  assert(battery.cases.length === 12, 'Unexpected development battery size');
  assert(!fs.existsSync(outputPath), `Development artifact already exists: ${outputPath}`);

  fs.mkdirSync(root, { recursive: true });
  assert(!fs.existsSync(rawOutputPath), `Development raw artifact already exists: ${rawOutputPath}`);
  const model = new OpenAiSemanticModel(MODEL);
  const repository = createHighFidelityReadOnlyRepositoryForTest();
  const resolver = createBlindShadowResolver(repository);
  const results: unknown[] = [];

  for (const testCase of battery.cases) {
    const request = {
      text: testCase.text,
      modality: 'text' as const,
      locale: 'es-CL',
      timezone: 'America/Santiago',
      dialogue: testCase.dialogue ?? null,
      semanticVersion: 4 as const,
    };
    const provider = await model.interpretWithDiagnostics(request);
    assert(provider.kind === 'response', `Provider failed for ${testCase.id}: ${provider.errorClass}`);
    assert(typeof provider.content === 'string' && provider.content.length > 0, `Provider returned no content for ${testCase.id}`);
    fs.appendFileSync(rawOutputPath, JSON.stringify({ id: testCase.id, rawV4Output: provider.content }) + '\n', { encoding: 'utf8' });
    const parsed = parseSemanticV4ModelOutput(provider.content);
    const produced = {
      semantic: parsed.semantic,
      diagnostics: {
        schemaValid: parsed.diagnostics.schemaValid,
        failure: parsed.diagnostics.failure,
        providerRequestSucceeded: true,
        providerFailure: false,
        providerErrorClass: null,
        providerHttpStatus: null,
        providerErrorCode: null,
        providerErrorMessage: null,
        finishReason: provider.finishReason,
        refusalPresent: provider.refusalPresent,
        contentPresent: true,
        contentLength: provider.content.length,
        normalizationSuccess: parsed.semantic.source === 'llm',
        fallbackReason: parsed.diagnostics.failure,
        model: MODEL,
        latencyMs: provider.latencyMs,
        usage: provider.usage,
      },
    };
    const raw = provider.content;
    const shadow = await runSemanticV4CoreShadow({
      legacy: { route: produced.semantic.kind === 'write_request' ? 'write' : 'read', interpretation: {} as any, objective: null },
      request,
      dialogue: null,
      actorUserId: '00000000-0000-4000-8000-000000000001',
      dialogueScopeKey: `m7-development-${testCase.id}`,
      producer: {
        modelName: MODEL,
        produceV4WithDiagnostics: async () => produced,
      },
      resolver,
    });
    results.push({
      id: testCase.id,
      family: testCase.family,
      text: testCase.text,
      semantic: produced.semantic,
      diagnostics: produced.diagnostics,
      shadow,
      rawSemanticHash: sha256(raw),
    });
  }

  const artifact = {
    artifactVersion: 1,
    model: MODEL,
    batteryPath,
    batterySha256: sha256(fs.readFileSync(batteryPath, 'utf8')),
    caseCount: battery.cases.length,
    results,
    sideEffects: { writers: 0, persistenceMutations: 0, tools: 0, messages: 0, memoryWrites: 0 },
  };
  const serialized = JSON.stringify(artifact, null, 2) + '\n';
  fs.writeFileSync(outputPath, serialized, { encoding: 'utf8', flag: 'wx' });
  const pass = (results as Array<any>).filter(item => item.diagnostics.normalizationSuccess && item.shadow.failure === null).length;
  const failures = (results as Array<any>).filter(item => !item.diagnostics.normalizationSuccess || item.shadow.failure !== null);
  console.log(JSON.stringify({
    DEVELOPMENT_EVALUATION_COMPLETE: true,
    model: MODEL,
    cases: battery.cases.length,
    normalized: pass,
    failures: failures.map(item => ({ id: item.id, family: item.family, failure: item.shadow.failure, fallback: item.diagnostics.fallbackReason })),
    artifactPath: outputPath,
    artifactHash: sha256(serialized),
    sideEffects: artifact.sideEffects,
  }));
}

main().catch(error => {
  console.error(JSON.stringify({ DEVELOPMENT_EVALUATION_COMPLETE: false, error: error instanceof Error ? error.message : 'unknown' }));
  process.exitCode = 1;
});
