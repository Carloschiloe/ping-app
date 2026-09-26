import fs from 'node:fs';
import path from 'node:path';
import dotenv from 'dotenv';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });
process.env.NODE_ENV = 'test';
process.env.PING_ENVIRONMENT = 'local';
process.env.PING_SEMANTIC_V4_CORE_SHADOW = 'true';

const { parseSemanticV4ModelOutput } = require('../src/services/canonicalSemanticProducer.service');
const { runSemanticV4CoreShadow } = require('../src/services/agentSemanticV4CoreShadow.service');
const { createHighFidelityReadOnlyRepositoryForTest } = require('../src/services/agentSemanticV4HighFidelityReadOnly.service');
const { createBlindShadowResolver } = require('./m7-blind-shadow-harness');

type DevelopmentCase = {
  id: string;
  text: string;
  dialogue?: unknown;
};

const root = path.resolve(process.env.PING_SMOKE_ARTIFACT_ROOT || path.join(process.cwd(), '.m7-smoke-artifacts'));
const battery = JSON.parse(fs.readFileSync(path.resolve(__dirname, 'm7-v4-development-battery.v1.json'), 'utf8')) as { cases: DevelopmentCase[] };
const rawPath = path.join(root, 'm7-v4-development-raw.v1.ndjson');
const evaluationPath = path.join(root, 'm7-v4-development-evaluation.v1.json');

function stable(value: any): string {
  return JSON.stringify({
    failure: value.failure,
    providerFailure: value.providerFailure,
    timeout: value.timeout,
    schemaValid: value.schemaValid,
    fallbackReason: value.fallbackReason,
    v4: value.v4,
    core: value.core,
    differences: value.differences,
    sideEffects: value.sideEffects,
  });
}

async function main() {
  const rawLines = fs.readFileSync(rawPath, 'utf8').trim().split(/\r?\n/).filter(Boolean).map(line => JSON.parse(line) as { id: string; rawV4Output: string });
  const original = JSON.parse(fs.readFileSync(evaluationPath, 'utf8')) as { results: Array<{ id: string; shadow: unknown }> };
  if (rawLines.length !== battery.cases.length || original.results.length !== battery.cases.length) throw new Error('Development replay artifacts are incomplete');
  const byId = new Map(original.results.map(item => [item.id, item]));
  const resolver = createBlindShadowResolver(createHighFidelityReadOnlyRepositoryForTest());
  const mismatches: string[] = [];
  for (const testCase of battery.cases) {
    const raw = rawLines.find(item => item.id === testCase.id);
    if (!raw) throw new Error(`Missing raw output for ${testCase.id}`);
    const parsed = parseSemanticV4ModelOutput(raw.rawV4Output);
    if (!parsed.diagnostics.schemaValid || parsed.diagnostics.failure) throw new Error(`Persisted output invalid for ${testCase.id}`);
    const replay = await runSemanticV4CoreShadow({
      legacy: { route: parsed.semantic.kind === 'write_request' ? 'write' : 'read', interpretation: {} as any, objective: null },
      request: { text: testCase.text, modality: 'text', locale: 'es-CL', timezone: 'America/Santiago', dialogue: (testCase.dialogue ?? null) as any },
      dialogue: null,
      actorUserId: '00000000-0000-4000-8000-000000000001',
      dialogueScopeKey: `m7-development-${testCase.id}`,
      producer: { modelName: 'gpt-5.6-sol', produceV4WithDiagnostics: async () => ({ semantic: parsed.semantic, diagnostics: { schemaValid: true, failure: null, providerRequestSucceeded: true, providerFailure: false, providerErrorClass: null, providerHttpStatus: null, providerErrorCode: null, providerErrorMessage: null, finishReason: 'stop', refusalPresent: false, contentPresent: true, contentLength: raw.rawV4Output.length, normalizationSuccess: true, fallbackReason: null, model: 'gpt-5.6-sol', latencyMs: 0, usage: { inputTokens: 0, outputTokens: 0, totalTokens: 0, reasoningTokens: 0 } } }) },
      resolver,
    });
    if (stable(replay) !== stable(byId.get(testCase.id)?.shadow)) mismatches.push(testCase.id);
  }
  console.log(JSON.stringify({ DEVELOPMENT_REPLAY: mismatches.length === 0 ? 'PASS' : 'FAIL', cases: battery.cases.length, mismatches, OPENAI_CALLS: 0, sideEffects: 0 }));
  if (mismatches.length > 0) process.exitCode = 1;
}

main().catch(error => {
  console.error(JSON.stringify({ DEVELOPMENT_REPLAY: 'FAIL', message: error instanceof Error ? error.message : 'unknown', OPENAI_CALLS: 0 }));
  process.exitCode = 1;
});
