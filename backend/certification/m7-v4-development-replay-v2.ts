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

const root = path.resolve(process.env.PING_SMOKE_ARTIFACT_ROOT || path.join(process.cwd(), '.m7-smoke-artifacts', 'development-v3-20260925'));
const batteryPath = path.resolve(__dirname, 'm7-v4-development-battery.v2.json');
const rawPath = path.join(root, 'm7-v4-development-raw.v2.ndjson');
const evaluationPath = path.join(root, 'm7-v4-development-evaluation.v2.json');

function stable(value: any): string {
  return JSON.stringify({ failure: value.failure, providerFailure: value.providerFailure, timeout: value.timeout, schemaValid: value.schemaValid, fallbackReason: value.fallbackReason, v4: value.v4, core: value.core, differences: value.differences, sideEffects: value.sideEffects });
}

function dispositionDialogue(input: Record<string, unknown> | undefined): Record<string, unknown> | null {
  if (!input) return null;
  const lifecycle = input.lifecycle === 'none' ? 'idle' : input.lifecycle;
  const active = input.activeObjectiveType ? { objectiveType: input.activeObjectiveType, ...(input.missingSlotType ? { pendingField: input.missingSlotType } : {}), referentHints: input.referentHints ?? [] } : null;
  return { lifecycle, activeDialogue: active, suspendedDialogue: null, version: 1, lastAppliedTurnId: null, lastAppliedTurnSequence: 1 };
}

async function main() {
  const rawLines = fs.readFileSync(rawPath, 'utf8').trim().split(/\r?\n/).filter(Boolean).map(line => JSON.parse(line) as { id: string; rawV4Output: string });
  const original = JSON.parse(fs.readFileSync(evaluationPath, 'utf8')) as { results: Array<{ id: string; shadow: unknown }> };
  if (rawLines.length !== 12 || original.results.length !== 12) throw new Error('Development V2 replay artifacts are incomplete');
  const battery = JSON.parse(fs.readFileSync(batteryPath, 'utf8')) as { cases: Array<{ id: string; text: string; dialogue?: unknown }> };
  const cases = battery.cases.filter(item => rawLines.some(raw => raw.id === item.id));
  const byId = new Map(original.results.map(item => [item.id, item]));
  const repository = createHighFidelityReadOnlyRepositoryForTest({
    commitments: [
      { id: '00000000-0000-4000-8000-000000000020', entityType: 'commitment', title: 'revisar la bodega', authorizedActorUserIds: ['00000000-0000-4000-8000-000000000001'], status: 'accepted', type: 'personal', dueAt: '2026-09-29T15:00:00.000Z' },
      { id: '00000000-0000-4000-8000-000000000021', entityType: 'commitment', title: 'comprar filtros', authorizedActorUserIds: ['00000000-0000-4000-8000-000000000001'], status: 'accepted', type: 'personal', dueAt: '2026-09-29T15:00:00.000Z' },
      { id: '00000000-0000-4000-8000-000000000022', entityType: 'commitment', title: 'capacitación', authorizedActorUserIds: ['00000000-0000-4000-8000-000000000001'], status: 'accepted', type: 'personal', dueAt: '2026-09-29T15:00:00.000Z' },
      { id: '00000000-0000-4000-8000-000000000023', entityType: 'commitment_proposal', title: 'mensaje a Diego', authorizedActorUserIds: ['00000000-0000-4000-8000-000000000001'], status: 'proposed', type: 'personal', dueAt: '2026-09-29T15:00:00.000Z' },
    ] as any,
    people: [{ actorUserId: '00000000-0000-4000-8000-000000000001', person: { kind: 'user', id: '00000000-0000-4000-8000-000000000010', displayName: 'Daniela' }, aliases: ['Dani'] }],
  });
  const resolver = createBlindShadowResolver(repository);
  const mismatches: string[] = [];
  for (const testCase of cases) {
    const raw = rawLines.find(item => item.id === testCase.id)!;
    const parsed = parseSemanticV4ModelOutput(raw.rawV4Output);
    if (!parsed.diagnostics.schemaValid || parsed.diagnostics.failure) throw new Error(`Persisted output invalid for ${testCase.id}`);
    const originalLegacy = (byId.get(testCase.id) as any)?.legacy;
    const replayLegacy = {
      route: originalLegacy?.route ?? (parsed.semantic.kind === 'read_request' ? 'read' : 'write'),
      interpretation: {} as any,
      objective: originalLegacy?.objectiveType ? { objectiveType: originalLegacy.objectiveType } as any : null,
    };
    const replay = await runSemanticV4CoreShadow({
      legacy: replayLegacy,
      request: { text: testCase.text, modality: 'text', locale: 'es-CL', timezone: 'America/Santiago', dialogue: (testCase.dialogue ?? null) as any },
      dialogue: dispositionDialogue(testCase.dialogue as Record<string, unknown> | undefined), actorUserId: '00000000-0000-4000-8000-000000000001', dialogueScopeKey: `m7-development-v2-${testCase.id}`,
      producer: { modelName: 'gpt-5.6-sol', produceV4WithDiagnostics: async () => ({ semantic: parsed.semantic, diagnostics: { schemaValid: true, failure: null, providerRequestSucceeded: true, providerFailure: false, providerErrorClass: null, providerHttpStatus: null, providerErrorCode: null, providerErrorMessage: null, finishReason: 'stop', refusalPresent: false, contentPresent: true, contentLength: raw.rawV4Output.length, normalizationSuccess: true, fallbackReason: null, model: 'gpt-5.6-sol', latencyMs: 0, usage: { inputTokens: 0, outputTokens: 0, totalTokens: 0, reasoningTokens: 0 } } }) }, resolver,
    });
    if (stable(replay) !== stable(byId.get(testCase.id)?.shadow)) mismatches.push(testCase.id);
  }
  console.log(JSON.stringify({ DEVELOPMENT_REPLAY_V2: mismatches.length === 0 ? 'PASS' : 'FAIL', cases: cases.length, mismatches, OPENAI_CALLS: 0, sideEffects: 0 }));
  if (mismatches.length > 0) process.exitCode = 1;
}

main().catch(error => { console.error(JSON.stringify({ DEVELOPMENT_REPLAY_V2: 'FAIL', message: error instanceof Error ? error.message : 'unknown', OPENAI_CALLS: 0 })); process.exitCode = 1; });
