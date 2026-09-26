import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import dotenv from 'dotenv';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });
process.env.M7_BLIND_MAX_COMPLETION_TOKENS ??= '1024';
process.env.NODE_ENV = 'test';
process.env.PING_ENVIRONMENT = 'local';
process.env.PING_SEMANTIC_V4_CORE_SHADOW = 'true';

const { OpenAiSemanticModel, parseSemanticV4ModelOutput } = require('../src/services/canonicalSemanticProducer.service');
const { interpretAgentSemanticTurn } = require('../src/services/agentSemanticInterpreter.service');
const { runSemanticV4CoreShadow } = require('../src/services/agentSemanticV4CoreShadow.service');
const { createHighFidelityReadOnlyRepositoryForTest } = require('../src/services/agentSemanticV4HighFidelityReadOnly.service');
const { createBlindShadowResolver } = require('./m7-blind-shadow-harness');

type DevelopmentCase = {
  id: string;
  family: string;
  text: string;
  dialogue?: Record<string, unknown>;
};

const MODEL = 'gpt-5.6-sol';
const batteryPath = path.resolve(__dirname, 'm7-v4-development-battery.v2.json');
const selectedIds = new Set(['V2-13', 'V2-14', 'V2-15', 'V2-16', 'V2-17', 'V2-18', 'V2-19', 'V2-20', 'V2-21', 'V2-22', 'V2-23', 'V2-24']);
const root = path.resolve(process.env.PING_SMOKE_ARTIFACT_ROOT || path.join(process.cwd(), '.m7-smoke-artifacts', 'development-v3-20260925'));
const outputPath = path.join(root, 'm7-v4-development-evaluation.v2.json');
const rawOutputPath = path.join(root, 'm7-v4-development-raw.v2.ndjson');
const battery = JSON.parse(fs.readFileSync(batteryPath, 'utf8')) as { cases: DevelopmentCase[] };
const cases = battery.cases.filter(item => selectedIds.has(item.id));

function sha256(value: string): string { return crypto.createHash('sha256').update(value, 'utf8').digest('hex'); }
function assert(condition: unknown, message: string): asserts condition { if (!condition) throw new Error(message); }

function dispositionDialogue(input: Record<string, unknown> | undefined): Record<string, unknown> | null {
  if (!input) return null;
  const lifecycle = input.lifecycle === 'none' ? 'idle' : input.lifecycle;
  const active = input.activeObjectiveType ? {
    objectiveType: input.activeObjectiveType,
    ...(input.missingSlotType ? { pendingField: input.missingSlotType } : {}),
    referentHints: input.referentHints ?? [],
  } : null;
  return { lifecycle, activeDialogue: active, suspendedDialogue: null, version: 1, lastAppliedTurnId: null, lastAppliedTurnSequence: 1 };
}

const ACTOR = '00000000-0000-4000-8000-000000000001';
const commitment = (id: string, title: string, type = 'commitment') => ({
  id, entityType: type, title, authorizedActorUserIds: [ACTOR], description: null,
  status: type === 'commitment' ? 'accepted' : 'proposed', type: 'personal', priority: null,
  dueAt: '2026-09-29T15:00:00.000Z', proposedDueAt: null, expectedResult: null,
  resolvedAt: null, resolutionResult: null, rejectionReason: null, ownerUserId: ACTOR,
  assignedToUserId: null, counterpartyContactId: null, conversationId: null, messageId: null,
  createdAt: '2026-09-25T12:00:00.000Z', provenance: { sourceType: type, sourceId: id },
});

async function main() {
  assert(process.env.OPENAI_API_KEY, 'OPENAI_API_KEY is not available through backend/.env');
  assert(cases.length === 12, 'Expected exactly 12 fresh development cases');
  assert(!fs.existsSync(outputPath), `Development artifact already exists: ${outputPath}`);
  fs.mkdirSync(root, { recursive: true });
  assert(!fs.existsSync(rawOutputPath), `Development raw artifact already exists: ${rawOutputPath}`);

  const repository = createHighFidelityReadOnlyRepositoryForTest({
    commitments: [
      commitment('00000000-0000-4000-8000-000000000020', 'revisar la bodega'),
      commitment('00000000-0000-4000-8000-000000000021', 'comprar filtros'),
      commitment('00000000-0000-4000-8000-000000000022', 'capacitación'),
      commitment('00000000-0000-4000-8000-000000000023', 'mensaje a Diego', 'commitment_proposal'),
    ] as any,
    people: [{ actorUserId: ACTOR, person: { kind: 'user', id: '00000000-0000-4000-8000-000000000010', displayName: 'Daniela' }, aliases: ['Dani'] }],
  });
  const resolver = createBlindShadowResolver(repository);
  const model = new OpenAiSemanticModel(MODEL);
  const results: unknown[] = [];

  for (const testCase of cases) {
    const request = {
      text: testCase.text, modality: 'text' as const, locale: 'es-CL', timezone: 'America/Santiago',
      dialogue: (testCase.dialogue ?? null) as any, semanticVersion: 4 as const,
    };
    const provider = await model.interpretWithDiagnostics(request);
    assert(provider.kind === 'response', `V4 provider failed for ${testCase.id}: ${provider.errorClass}`);
    assert(typeof provider.content === 'string' && provider.content.length > 0, `V4 empty content for ${testCase.id}`);
    // The raw provider output is durable before parsing or Core evaluation.
    fs.appendFileSync(rawOutputPath, JSON.stringify({ id: testCase.id, rawV4Output: provider.content }) + '\n', 'utf8');
    const parsed = parseSemanticV4ModelOutput(provider.content);
    assert(parsed.diagnostics.schemaValid, `V4 schema invalid for ${testCase.id}`);
    const legacy = await interpretAgentSemanticTurn(testCase.text, { actorUserId: ACTOR, channel: 'mobile' });
    const produced = {
      semantic: parsed.semantic,
      diagnostics: {
        schemaValid: parsed.diagnostics.schemaValid, failure: parsed.diagnostics.failure,
        providerRequestSucceeded: true, providerFailure: false, providerErrorClass: null,
        providerHttpStatus: null, providerErrorCode: null, providerErrorMessage: null,
        finishReason: provider.finishReason, refusalPresent: provider.refusalPresent,
        contentPresent: true, contentLength: provider.content.length,
        normalizationSuccess: parsed.semantic.source === 'llm', fallbackReason: null,
        model: MODEL, latencyMs: provider.latencyMs, usage: provider.usage,
      },
    };
    const coreDialogue = dispositionDialogue(testCase.dialogue);
    const shadow = await runSemanticV4CoreShadow({
      legacy,
      request,
      dialogue: coreDialogue,
      actorUserId: ACTOR,
      dialogueScopeKey: `m7-development-v2-${testCase.id}`,
      producer: { modelName: MODEL, produceV4WithDiagnostics: async () => produced },
      resolver,
    });
    results.push({
      id: testCase.id, family: testCase.family, text: testCase.text,
      v4: { semantic: produced.semantic, diagnostics: produced.diagnostics },
      legacy: { route: legacy.route, objectiveType: legacy.objective?.objectiveType ?? null, source: legacy.interpretation.source, fallbackReason: legacy.interpretation.fallbackReason ?? null },
      shadow,
      rawSemanticHash: sha256(provider.content),
    });
  }

  const artifact = {
    artifactVersion: 2, model: MODEL, legacyModel: 'gpt-4o-mini', batteryPath,
    batterySha256: sha256(fs.readFileSync(batteryPath, 'utf8')), caseCount: cases.length,
    results, sideEffects: { writers: 0, persistenceMutations: 0, tools: 0, messages: 0, memoryWrites: 0 },
  };
  const serialized = JSON.stringify(artifact, null, 2) + '\n';
  fs.writeFileSync(outputPath, serialized, { encoding: 'utf8', flag: 'wx' });
  const typedResults = results as Array<any>;
  console.log(JSON.stringify({
    DEVELOPMENT_EVALUATION_V2_COMPLETE: true,
    model: MODEL, legacyModel: 'gpt-4o-mini', cases: cases.length,
    v4ProviderFailures: typedResults.filter(item => item.v4.diagnostics.providerFailure).length,
    v4Normalized: typedResults.filter(item => item.v4.diagnostics.normalizationSuccess).length,
    shadowFailures: typedResults.filter(item => item.shadow.failure !== null).length,
    legacyFallbacks: typedResults.filter(item => item.legacy.source !== 'llm').length,
    routeDifferences: typedResults.filter(item => item.legacy.route !== (item.v4.semantic.kind === 'read_request' ? 'read' : 'write')).length,
    artifactPath: outputPath, artifactHash: sha256(serialized),
    rawOutputPath: rawOutputPath, rawOutputHash: sha256(fs.readFileSync(rawOutputPath, 'utf8')),
    sideEffects: artifact.sideEffects,
  }));
}

main().catch(error => {
  console.error(JSON.stringify({ DEVELOPMENT_EVALUATION_V2_COMPLETE: false, error: error instanceof Error ? error.message : 'unknown' }));
  process.exitCode = 1;
});
