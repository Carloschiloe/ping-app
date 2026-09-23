#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const BATTERY_PATH = resolve(ROOT, 'certification/m7-written-language-battery.v1.json');
const EXPECTED_SHA256 = '5fda1888b7c37ca04348a966161ed89424f1f719a4b3d80935dd0a87c4c40168';
const ACTOR = '00000000-0000-0000-0000-000000000001';
const CONVERSATION = '00000000-0000-0000-0000-000000000777';
const MODEL_NAME = 'gpt-4o-mini';
const mode = process.argv.includes('--mode') ? process.argv[process.argv.indexOf('--mode') + 1] : 'all';
const reportPath = process.env.M7_CERT_REPORT_PATH || resolve(ROOT, 'certification/m7-certification-report.json');

// The certification never connects to Supabase and never executes writers.
// These non-secret placeholders allow the real Core modules to load while
// making accidental use of a real database impossible in the harness.
process.env.SUPABASE_URL = 'https://supabase-cert.invalid';
process.env.SUPABASE_ANON_KEY = 'certification-placeholder-not-a-secret';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'certification-placeholder-not-a-secret';
process.env.ENCRYPTION_KEY = 'certification-placeholder-not-a-secret';
process.env.PING_ENVIRONMENT = 'certification';
process.env.ENABLE_AUTOMATIONS = 'false';
process.env.RUN_CRON_JOBS = 'false';

function loadBattery() {
  const bytes = readFileSync(BATTERY_PATH);
  const sha256 = createHash('sha256').update(bytes).digest('hex');
  const battery = JSON.parse(bytes.toString('utf8'));
  if (!battery.frozen || battery.cases.length !== 150 || sha256 !== EXPECTED_SHA256) {
    throw new Error(`Frozen battery integrity check failed: frozen=${battery.frozen}, count=${battery.cases.length}, sha256=${sha256}`);
  }
  return { battery, sha256 };
}

function loadCore() {
  const semantic = require(resolve(ROOT, 'dist/services/agentSemanticInterpreter.service.js'));
  const input = require(resolve(ROOT, 'dist/services/agentInputInterpreter.service.js'));
  const objective = require(resolve(ROOT, 'dist/services/agentObjectiveInterpreter.service.js'));
  const planner = require(resolve(ROOT, 'dist/services/agentPlanner.service.js'));
  return { semantic, input, objective, planner };
}

function sourceOf(result) {
  return {
    input: result?.interpretation?.source ?? null,
    objective: result?.objective?.source ?? null,
    fallbackReason: result?.interpretation?.fallbackReason ?? result?.objective?.fallbackReason ?? null,
    model: result?.interpretation?.modelUsed ?? result?.objective?.modelUsed ?? null,
  };
}

function isFallback(result) {
  const source = sourceOf(result);
  return source.input === 'llm_fallback' || source.objective === 'llm_fallback';
}

function publicResult(result) {
  if (!result) return result;
  const { _semantic, _secondSemantic, ...safe } = result;
  return safe;
}

function safeError(error) {
  const message = error instanceof Error ? error.message : String(error);
  return message
    .replace(/sk-[A-Za-z0-9_-]+/g, '[redacted-key]')
    .replace(/Bearer\s+\S+/gi, 'Bearer [redacted]');
}

function isProviderFailure(error) {
  const message = safeError(error).toLowerCase();
  return /api key|api_error|api connection|fetch failed|econn|enotfound|etimedout|timeout|rate.?limit|429|401|403|quota|openai/.test(message);
}

function expectedMatches(item, result) {
  const expected = item.expected;
  const observedObjective = result.objective?.objectiveType ?? null;
  const routeOk = result.route === expected.route;
  const intentOk = !expected.intent || result.interpretation?.intent === expected.intent;
  const objectiveOk = !expected.objective || observedObjective === expected.objective;
  return { ok: routeOk && intentOk && objectiveOk, routeOk, intentOk, objectiveOk, observedObjective };
}

function priorSummary(result) {
  if (result.route !== 'read') return null;
  return {
    kind: 'commitment_query',
    referentCount: 1,
    uniqueReferent: true,
    entityTypes: ['commitment'],
    hasTimeRange: Boolean(result.interpretation?.timeExpression),
  };
}

function safeCommitment(title) {
  return {
    id: `cert-${createHash('sha1').update(title).digest('hex').slice(0, 12)}`,
    title: title || 'certification target',
    status: 'accepted',
    ownerId: ACTOR,
    dueAt: '2030-01-15T12:00:00.000Z',
    createdAt: '2026-09-23T12:00:00.000Z',
    entityType: 'commitment',
    sourceRef: `cert-source-${createHash('sha1').update(title || 'target').digest('hex').slice(0, 8)}`,
    participants: [],
  };
}

async function runSemanticCase(item, core, deterministic = false) {
  const options = deterministic
    ? {
        inputInterpreter: new core.input.DeterministicInputInterpreter(),
        objectiveInterpreter: new core.objective.DeterministicObjectiveInterpreter(),
      }
    : {};
  const context = { actorUserId: ACTOR, conversationId: CONVERSATION };
  const firstText = item.mode === 'multi' ? item.turns[0] : item.utterance;
  const first = await core.semantic.interpretAgentSemanticTurn(firstText, context, options);
  if (item.mode !== 'multi') {
    const match = expectedMatches(item, first);
    return {
      id: item.id,
      mode: item.mode,
      ...sourceOf(first),
      ...match,
      route: first.route,
      intent: first.interpretation?.intent ?? null,
      fallbackUsed: isFallback(first),
      _semantic: first,
    };
  }
  const second = await core.semantic.interpretAgentSemanticTurn(item.turns[1], {
    ...context,
    priorReadSummary: priorSummary(first),
  }, options);
  const secondRouteOk = second.route === item.expected.secondRoute;
  const attribute = second.interpretation?.followUpAttribute ?? null;
  const reference = second.interpretation?.priorReferenceIntent ?? null;
  const attributeOk = !item.expected.attribute || item.expected.attribute === 'confirmation' || attribute === item.expected.attribute;
  const referenceOk = item.expected.reference === 'new_topic' || item.expected.reference === 'new_person' || item.expected.reference === 'new_scope' || item.expected.reference === 'changed_source'
    ? reference === null
    : Boolean(reference);
  const firstMatch = first.route === item.expected.firstRoute;
  return {
    id: item.id,
    mode: item.mode,
    ...sourceOf(second),
    ok: firstMatch && secondRouteOk && attributeOk && referenceOk,
    firstRoute: first.route,
    secondRoute: second.route,
    firstIntent: first.interpretation?.intent ?? null,
    secondIntent: second.interpretation?.intent ?? null,
    attribute,
    reference,
    firstSource: sourceOf(first),
    fallbackUsed: isFallback(first) || isFallback(second),
    _semantic: first,
    _secondSemantic: second,
  };
}

async function runCoreDryRun(item, result, core) {
  if (result.route === 'read') return { status: 'read_admission', executed: true, writerCalled: false };
  const objectiveType = result.objective?.objectiveType;
  const plannerSafeTypes = new Set([
    'create_personal_commitment', 'remember_fact', 'cancel_existing_commitment',
    'complete_existing_commitment', 'reschedule_existing_commitment',
    'respond_to_existing_proposal', 'unsupported',
  ]);
  if (!plannerSafeTypes.has(objectiveType)) {
    return { status: 'not_run_data_dependency', executed: false, writerCalled: false };
  }
  const titleHint = result.objective?.targetEntities?.entityHints?.[0] || item.utterance || item.turns?.[0] || 'certification target';
  try {
    const draft = await core.planner.planObjective({
      objective: result.objective,
      actorUserId: ACTOR,
      conversationId: CONVERSATION,
      now: new Date('2026-09-23T12:00:00.000Z'),
      timezone: 'America/Santiago',
      preloadedCommitments: [safeCommitment(titleHint)],
    });
    return {
      status: draft.failureMode ? 'failure' : draft.blockingAmbiguities?.length ? 'needs_clarification' : 'planned',
      executed: true,
      writerCalled: false,
      stepCount: draft.steps?.length ?? 0,
      failureMode: draft.failureMode ?? null,
      ambiguityCount: draft.blockingAmbiguities?.length ?? 0,
    };
  } catch (error) {
    return { status: 'core_error', executed: true, writerCalled: false, error: error instanceof Error ? error.message : String(error) };
  }
}

function summarize(results) {
  const counts = {};
  for (const result of results) {
    const key = result.providerUnavailable ? 'provider_unavailable' : result.ok ? 'pass' : result.ambiguity ? 'legitimate_ambiguity' : 'semantic_fail';
    counts[key] = (counts[key] || 0) + 1;
  }
  return { total: results.length, counts, fallbackUsed: results.filter((r) => r.fallbackUsed).length };
}

async function providerProbe(core) {
  const model = new core.input.OpenAiAgentInputModel();
  try {
    const raw = await model.interpret({ input: '¿Qué tengo pendiente esta semana?', context: {} });
    const parsed = JSON.parse(raw);
    return { ok: true, provider: 'OpenAI', model: model.modelName, structuredJson: Boolean(parsed && typeof parsed === 'object') };
  } catch (error) {
    return { ok: false, provider: 'OpenAI', model: model.modelName, error: safeError(error) };
  }
}

async function main() {
  const { battery, sha256 } = loadBattery();
  const core = loadCore();
  const report = {
    battery: { id: battery.batteryId, count: battery.cases.length, sha256, frozen: battery.frozen },
    providerProbe: null,
    llm: null,
    core: null,
    multivuelta: null,
    fallback: null,
  };

  if (mode !== 'fallback') {
    report.providerProbe = await providerProbe(core);
    if (!report.providerProbe.ok) {
      report.llm = { status: 'infrastructure_fail', reason: report.providerProbe.error, executed: 0 };
    } else {
      const llmResults = [];
      for (const item of battery.cases) {
        try {
          const result = await runSemanticCase(item, core, false);
          llmResults.push({ ...result, providerUnavailable: result.fallbackUsed === true });
        } catch (error) {
          llmResults.push({
            id: item.id,
            ok: false,
            providerUnavailable: isProviderFailure(error),
            errorKind: isProviderFailure(error) ? 'provider_unavailable' : 'semantic_or_contract_error',
            error: safeError(error),
          });
        }
      }
      report.llm = { status: 'executed', ...summarize(llmResults), failures: llmResults.filter((r) => !r.ok).slice(0, 30) };
      const coreResults = [];
      for (let i = 0; i < battery.cases.length; i += 1) {
        const item = battery.cases[i];
        const semantic = llmResults[i];
        if (semantic.providerUnavailable || semantic.error) {
          coreResults.push({ id: item.id, status: 'not_run_provider_unavailable', executed: false, writerCalled: false });
          continue;
        }
        try {
          const fresh = semantic._semantic;
          if (!fresh) {
            coreResults.push({ id: item.id, status: 'not_run_missing_interpretation', executed: false, writerCalled: false });
            continue;
          }
          coreResults.push({ id: item.id, ...(await runCoreDryRun(item, fresh, core)) });
        } catch (error) {
          coreResults.push({ id: item.id, status: 'core_error', executed: true, writerCalled: false, error: safeError(error) });
        }
      }
      report.core = {
        total: coreResults.length,
        executed: coreResults.filter((r) => r.executed).length,
        notRun: coreResults.filter((r) => !r.executed).length,
        writerCalls: coreResults.filter((r) => r.writerCalled).length,
        statuses: Object.fromEntries([...new Set(coreResults.map((r) => r.status))].map((status) => [status, coreResults.filter((r) => r.status === status).length])),
        failures: coreResults.filter((r) => r.status === 'core_error').slice(0, 30),
      };
      const multiIds = new Set(battery.cases.filter((item) => item.mode === 'multi').map((item) => item.id));
      report.multivuelta = {
        status: 'executed',
        ...summarize(llmResults.filter((result) => multiIds.has(result.id))),
        failures: llmResults.filter((result) => multiIds.has(result.id) && !result.ok).slice(0, 30).map(publicResult),
      };
      report.llm.failures = report.llm.failures.map(publicResult);
    }
  }

  if (mode === 'fallback' || mode === 'all') {
    const fallbackResults = [];
    for (const item of battery.cases) {
      try {
        const result = await runSemanticCase(item, core, true);
        fallbackResults.push({ ...result, providerUnavailable: false });
      } catch (error) {
        fallbackResults.push({ id: item.id, ok: false, errorKind: 'fallback_error', error: safeError(error) });
      }
    }
    report.fallback = { status: 'executed', ...summarize(fallbackResults), failures: fallbackResults.filter((r) => !r.ok).slice(0, 30).map(publicResult) };
    report.fallbackMultivuelta = {
      status: 'executed',
      ...summarize(fallbackResults.filter((result) => battery.cases.find((item) => item.id === result.id)?.mode === 'multi')),
    };
  }

  mkdirSync(dirname(reportPath), { recursive: true });
  writeFileSync(reportPath, JSON.stringify(report, null, 2), { encoding: 'utf8', flag: 'w' });
  console.log(JSON.stringify({ battery: report.battery, providerProbe: report.providerProbe, llm: report.llm && { status: report.llm.status, total: report.llm.total ?? 0, counts: report.llm.counts ?? {} }, core: report.core && { total: report.core.total, executed: report.core.executed, notRun: report.core.notRun, writerCalls: report.core.writerCalls }, multivuelta: report.multivuelta && { status: report.multivuelta.status }, fallback: report.fallback && { total: report.fallback.total, counts: report.fallback.counts } }));
  if (mode !== 'fallback') {
    if (report.providerProbe && !report.providerProbe.ok) {
      process.exitCode = 2;
    } else if (report.llm?.counts?.provider_unavailable) {
      process.exitCode = 2;
    } else if (report.llm?.counts?.semantic_fail || report.core?.failures?.length) {
      process.exitCode = 4;
    }
  }
}

main().catch((error) => {
  console.error(JSON.stringify({ status: 'harness_error', message: error instanceof Error ? error.message : String(error) }));
  process.exitCode = 3;
});
