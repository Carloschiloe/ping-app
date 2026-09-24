#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import Module from 'node:module';

const require = createRequire(import.meta.url);
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const BATTERY_PATH = resolve(ROOT, 'certification/m7-written-language-battery.v1.json');
const EXPECTED_SHA256 = '5fda1888b7c37ca04348a966161ed89424f1f719a4b3d80935dd0a87c4c40168';
const ACTOR = '00000000-0000-0000-0000-000000000001';
const CONVERSATION = '00000000-0000-0000-0000-000000000777';
const MODEL_NAME = 'gpt-4o-mini';
const mode = process.argv.includes('--mode') ? process.argv[process.argv.indexOf('--mode') + 1] : 'all';
const reportPath = process.env.M7_CERT_REPORT_PATH || resolve(ROOT, 'certification/m7-certification-report.json');
const CERT_NOW = new Date('2026-09-23T12:00:00.000Z');
const CERT_TIMEZONE = 'America/Santiago';

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

function loadCore(fixtureAdapter) {
  // The real Core imports retrieval through CommonJS. The certification
  // replaces only that I/O boundary with an in-memory, actor-scoped fixture;
  // the semantic, context, planner, dialogue and response stages remain the
  // compiled production modules. No production source is changed and no
  // Supabase client is loaded by this process.
  const originalLoad = Module._load;
  Module._load = function certificationModuleLoad(request, parent, isMain) {
    let resolved = null;
    try {
      resolved = Module._resolveFilename(request, parent, isMain);
    } catch {
      // Let Node produce the original error for unknown modules.
    }
    const normalized = resolved ? resolved.replaceAll('\\\\', '/') : '';
    if (normalized.endsWith('/services/retrieval.service.js')) return fixtureAdapter.retrieval;
    if (normalized.endsWith('/services/memory.service.js')) return fixtureAdapter.memory;
    return originalLoad.call(this, request, parent, isMain);
  };
  try {
    const semantic = require(resolve(ROOT, 'dist/services/agentSemanticInterpreter.service.js'));
    const input = require(resolve(ROOT, 'dist/services/agentInputInterpreter.service.js'));
    const objective = require(resolve(ROOT, 'dist/services/agentObjectiveInterpreter.service.js'));
    const planner = require(resolve(ROOT, 'dist/services/agentPlanner.service.js'));
    const turn = require(resolve(ROOT, 'dist/services/agentTurnCore.service.js'));
    const dialogue = require(resolve(ROOT, 'dist/services/agentDialogueState.service.js'));
    const interpretationSchema = require(resolve(ROOT, 'dist/schemas/agentInterpretation.schema.js'));
    const objectiveSchema = require(resolve(ROOT, 'dist/schemas/agentObjectiveInterpretation.schema.js'));
    return { semantic, input, objective, planner, turn, dialogue, interpretationSchema, objectiveSchema };
  } finally {
    Module._load = originalLoad;
  }
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

function sanitize(value) {
  return String(value ?? '')
    .replace(/sk-[A-Za-z0-9_-]+/g, '[redacted-key]')
    .replace(/Bearer\s+\S+/gi, 'Bearer [redacted]')
    .replace(/(api[_-]?key|authorization|token|secret)\s*[:=]\s*[^,;\s]+/gi, '$1=[redacted]');
}

function safeError(error, stage = 'unknown', caseId = null) {
  if (error && typeof error === 'object' && !(error instanceof Error)) {
    const code = error.code ?? error.type ?? error.name ?? null;
    const status = error.status ?? error.statusCode ?? error.response?.status ?? null;
    const message = sanitize(error.message ?? error.error?.message ?? error.toString?.() ?? 'Unknown error');
    return {
      type: error.name ?? typeof error,
      code: code ? sanitize(code) : null,
      status: Number.isInteger(status) ? status : null,
      stage,
      caseId,
      message,
      cause: error.cause ? sanitize(error.cause.message ?? error.cause) : null,
    };
  }
  const message = sanitize(error instanceof Error ? error.message : error);
  return {
    type: error?.constructor?.name ?? 'Error',
    code: error?.code ? sanitize(error.code) : null,
    status: Number.isInteger(error?.status) ? error.status : null,
    stage,
    caseId,
    message,
    cause: error?.cause ? sanitize(error.cause.message ?? error.cause) : null,
  };
}

function errorText(error) {
  return sanitize(error?.message ?? error?.error?.message ?? error ?? '').toLowerCase();
}

function classifyProviderError(error) {
  const text = errorText(error);
  if (/timeout|etimedout|timed out/.test(text)) return 'timeout';
  if (/enotfound|econn|fetch failed|network|dns|socket|api connection/.test(text)) return 'provider_unavailable';
  if (/401|403|429|4\d\d|5\d\d|rate.?limit|quota|api key|api_error|openai/.test(text)) return 'provider_http_error';
  return 'provider_http_error';
}

function zodIssueSummary(schema, raw) {
  if (!raw || !schema) return [];
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return [];
  }
  const result = schema.safeParse(parsed);
  if (result.success) return [];
  return result.error.issues.map((issue) => ({
    path: issue.path,
    code: issue.code ?? null,
    expected: issue.expected ?? null,
    received: issue.received ?? null,
    message: sanitize(issue.message),
  }));
}

class RecordingModel {
  constructor(delegate, schema, stage) {
    this.delegate = delegate;
    this.schema = schema;
    this.stage = stage;
    this.modelName = delegate.modelName;
    this.observations = [];
  }

  async interpret(request) {
    try {
      const raw = await this.delegate.interpret(request);
      this.observations.push({
        stage: this.stage,
        model: this.modelName,
        providerResponse: true,
        schemaIssues: zodIssueSummary(this.schema, raw),
      });
      return raw;
    } catch (error) {
      const diagnostic = safeError(error, this.stage);
      this.observations.push({
        stage: this.stage,
        model: this.modelName,
        providerResponse: false,
        error: diagnostic,
        failureKind: classifyProviderError(error),
      });
      throw error;
    }
  }
}

function createObservedSemanticOptions(core) {
  const inputModel = new RecordingModel(
    new core.input.OpenAiAgentInputModel(),
    core.interpretationSchema.agentInterpretationPayloadSchema,
    'input_interpreter',
  );
  const objectiveModel = new RecordingModel(
    new core.objective.OpenAiAgentObjectiveModel(),
    core.objectiveSchema.agentObjectiveInterpretationPayloadSchema,
    'objective_interpreter',
  );
  return {
    options: {
      inputInterpreter: new core.input.LlmInputInterpreter({ model: inputModel }),
      objectiveInterpreter: new core.objective.LlmObjectiveInterpreter({ model: objectiveModel }),
    },
    captures: { inputModel, objectiveModel },
  };
}

function failureKindFor(result, captures) {
  const source = sourceOf(result);
  if (!isFallback(result)) return null;
  const reason = source.fallbackReason;
  if (reason === 'schema_invalid') return 'schema_invalid';
  if (reason === 'timeout') return 'timeout';
  if (reason === 'invalid_json') return 'invalid_json';
  const observations = [...captures.inputModel.observations, ...captures.objectiveModel.observations];
  const lastError = [...observations].reverse().find((entry) => entry.error)?.error;
  return lastError?.failureKind ?? (reason === 'api_error' ? 'provider_http_error' : 'fallback_used');
}

function contractDiagnosticsFor(result, captures) {
  const source = sourceOf(result);
  if (source.fallbackReason !== 'schema_invalid') return [];
  return [...captures.inputModel.observations, ...captures.objectiveModel.observations]
    .flatMap((entry) => entry.schemaIssues ?? [])
    .slice(0, 20);
}

function observedResult(result, captures, caseId, turn) {
  const source = sourceOf(result);
  const failureKind = failureKindFor(result, captures);
  return {
    turn,
    route: result.route ?? null,
    intent: result.interpretation?.intent ?? null,
    objective: result.objective?.objectiveType ?? null,
    source,
    fallbackUsed: isFallback(result),
    failureKind,
    contractIssues: contractDiagnosticsFor(result, captures),
    providerObservations: [...captures.inputModel.observations, ...captures.objectiveModel.observations],
    error: failureKind && failureKind !== 'schema_invalid' ? safeError({ message: failureKind }, 'semantic', caseId) : null,
  };
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
    entityType: 'commitment',
    description: null,
    status: 'accepted',
    type: 'personal',
    priority: null,
    dueAt: '2026-09-24T14:00:00.000Z',
    proposedDueAt: null,
    expectedResult: null,
    resolvedAt: null,
    resolutionResult: null,
    rejectionReason: null,
    ownerUserId: ACTOR,
    assignedToUserId: ACTOR,
    counterpartyContactId: null,
    conversationId: CONVERSATION,
    messageId: null,
    createdAt: '2026-09-23T12:00:00.000Z',
    provenance: {
      sourceType: 'commitment',
      sourceId: `cert-source-${createHash('sha1').update(title || 'target').digest('hex').slice(0, 8)}`,
      conversationId: CONVERSATION,
    },
  };
}

function safeProposal(title) {
  return {
    ...safeCommitment(title),
    id: `proposal-${createHash('sha1').update(title).digest('hex').slice(0, 12)}`,
    entityType: 'commitment_proposal',
    status: 'proposed',
    provenance: {
      sourceType: 'commitment_proposal',
      sourceId: `proposal-source-${createHash('sha1').update(title).digest('hex').slice(0, 8)}`,
      conversationId: CONVERSATION,
    },
    actorHasApproved: false,
    actorCanRespond: true,
    pendingResponderNamesSafe: [],
    pendingResponderIds: [],
    isFullyApproved: false,
    proposalDatePassed: false,
  };
}

function createFixtureAdapter() {
  let current = { commitments: [], proposals: [], people: [] };
  const normalize = (value) => String(value ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  const matchesQuery = (row, query) => {
    if (!query?.trim()) return true;
    const haystack = normalize(`${row.title ?? ''} ${row.description ?? ''}`);
    return normalize(query).split(/\s+/).filter(Boolean).some((token) => haystack.includes(token));
  };
  const visible = (row, actorUserId) => row.ownerUserId === actorUserId || row.assignedToUserId === actorUserId;
  const filterRows = (rows, input, limit) => rows
    .filter((row) => visible(row, input.actorUserId))
    .filter((row) => !input.conversationId || row.conversationId === input.conversationId)
    .filter((row) => !input.personId || row.ownerUserId === input.personId || row.assignedToUserId === input.personId)
    .filter((row) => !input.statuses?.length || input.statuses.includes(row.status))
    .filter((row) => !input.timeRange?.from || !row.dueAt || row.dueAt >= input.timeRange.from)
    .filter((row) => !input.timeRange?.to || !row.dueAt || row.dueAt <= input.timeRange.to)
    .filter((row) => matchesQuery(row, input.query))
    .slice(0, limit ?? 50);
  const people = {
    resolvePerson: async (actorUserId, input) => {
      const hint = normalize(input.name);
      const candidates = current.people.filter((person) => person.id === actorUserId || normalize(person.displayName).includes(hint));
      return candidates.length === 1
        ? { resolved: candidates[0], ambiguous: false, candidates: [] }
        : { resolved: null, ambiguous: candidates.length > 1, candidates };
    },
    resolveDirectConversation: async () => ({ conversationId: CONVERSATION, ambiguous: false, candidateCount: 1 }),
  };
  const retrieval = {
    ...people,
    retrieveCommitments: async (input, limit) => filterRows(current.commitments, input, limit),
    countVisibleCommitments: async (input) => filterRows(current.commitments, input, Number.MAX_SAFE_INTEGER).length,
    retrieveVisibleCommitmentById: async (actorUserId, id) => {
      const row = [...current.commitments, ...current.proposals].find((candidate) => candidate.id === id);
      return row && visible(row, actorUserId) ? row : null;
    },
    retrieveCommitmentProposals: async (input, limit) => filterRows(current.proposals, input, limit),
    retrieveCommitmentEvents: async () => [],
    retrieveMessages: async (input, limit) => current.messages?.filter((row) => matchesQuery(row, input.query)).slice(0, limit ?? 50) ?? [],
    retrieveTranscriptions: async () => [],
    retrieveTranscriptionForAttachment: async () => null,
    retrieveAttachments: async () => [],
    retrieveContext: async () => ({ commitments: current.commitments, proposals: current.proposals, messages: current.messages ?? [] }),
  };
  return {
    setCaseFixture() {
      const commitmentTitles = ['revisar el medidor', 'visita del galpon', 'revisar el pozo', 'pagar la patente', 'ordenar la bodega'];
      current = {
        commitments: commitmentTitles.map((title, index) => ({
          ...safeCommitment(title),
          id: `cert-commitment-${index + 1}`,
          dueAt: new Date(CERT_NOW.getTime() + (index + 1) * 24 * 60 * 60 * 1000).toISOString(),
          provenance: { sourceType: 'commitment', sourceId: `cert-commitment-${index + 1}`, conversationId: CONVERSATION },
        })),
        proposals: [safeProposal('visita del viernes')],
        people: ['Paula', 'Rodrigo', 'Camila', 'Diego', 'Marcela', 'Felipe'].map((displayName, index) => ({
          kind: 'contact', id: `cert-person-${index + 1}`, displayName,
        })),
        messages: [{
          id: 'cert-message-1', conversationId: CONVERSATION, senderId: 'cert-person-1',
          content: 'Conversación de certificación aislada', isSystem: false,
          createdAt: CERT_NOW.toISOString(), provenance: { sourceType: 'message', sourceId: 'cert-message-1', conversationId: CONVERSATION },
        }],
      };
    },
    retrieval,
    memory: { retrieveMemory: async () => [] },
  };
}

async function runSemanticCase(item, core, deterministic = false) {
  const observed = deterministic
    ? { options: {
        inputInterpreter: new core.input.DeterministicInputInterpreter(),
        objectiveInterpreter: new core.objective.DeterministicObjectiveInterpreter(),
      }, captures: { inputModel: { observations: [] }, objectiveModel: { observations: [] } } }
    : createObservedSemanticOptions(core);
  const options = observed.options;
  const context = { actorUserId: ACTOR, conversationId: CONVERSATION };
  const firstText = item.mode === 'multi' ? item.turns[0] : item.utterance;
  const first = await core.semantic.interpretAgentSemanticTurn(firstText, context, options);
  const firstObserved = observedResult(first, observed.captures, item.id, 1);
  if (item.mode !== 'multi') {
    const match = expectedMatches(item, first);
    return {
      id: item.id,
      mode: item.mode,
      ...match,
      input: item.utterance,
      expected: item.expected,
      observed: firstObserved,
      status: match.ok ? 'pass' : firstObserved.failureKind ?? 'semantic_fail',
      _semantic: first,
    };
  }
  // The semantic-only view deliberately does not fabricate priorReferenceIntent
  // or a canonical referent. Multiturn adjudication is performed by the real
  // Core runner below; these two interpreter observations remain diagnostic
  // evidence, never a continuity score.
  const secondObservedRun = deterministic
    ? { options: {
        inputInterpreter: new core.input.DeterministicInputInterpreter(),
        objectiveInterpreter: new core.objective.DeterministicObjectiveInterpreter(),
      }, captures: { inputModel: { observations: [] }, objectiveModel: { observations: [] } } }
    : createObservedSemanticOptions(core);
  const second = await core.semantic.interpretAgentSemanticTurn(item.turns[1], context, secondObservedRun.options);
  const secondObserved = observedResult(second, secondObservedRun.captures, item.id, 2);
  return {
    id: item.id,
    mode: item.mode,
    input: item.turns,
    expected: item.expected,
    status: 'not_scored_multivuelta',
    first: firstObserved,
    second: secondObserved,
    fallbackUsed: isFallback(first) || isFallback(second),
    failureKind: firstObserved.failureKind ?? secondObserved.failureKind,
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
      coverage: 'planner_dry_run',
      executed: true,
      writerCalled: false,
      stepCount: draft.steps?.length ?? 0,
      failureMode: draft.failureMode ?? null,
      ambiguityCount: draft.blockingAmbiguities?.length ?? 0,
    };
  } catch (error) {
    return { status: 'core_error', coverage: 'planner_dry_run', executed: true, writerCalled: false, error: safeError(error, 'planner', item.id) };
  }
}

function publicCoreTurn(result) {
  if (!result) return { kind: null };
  if (result.kind === 'response') {
    return {
      kind: result.kind,
      responseStatus: result.response?.status ?? null,
      citationIds: (result.response?.citations ?? []).map((citation) => `${citation.sourceType}:${citation.sourceId}`),
      answerPreview: sanitize(result.response?.answer ?? '').slice(0, 300),
    };
  }
  if (result.kind === 'plan') {
    return {
      kind: result.kind,
      objectiveType: result.plan?.objective?.objectiveType ?? result.plan?.objectiveType ?? null,
      status: result.plan?.status ?? null,
      stepToolIds: (result.plan?.steps ?? []).map((step) => step.toolId),
      canExecute: result.plan?.canExecute ?? false,
    };
  }
  return {
    kind: result.kind,
    reason: sanitize(result.reason ?? result.questions?.[0]?.field ?? '').slice(0, 160),
  };
}

async function runRealCoreCase(item, core, fixtureAdapter) {
  fixtureAdapter.setCaseFixture();
  const dialogueService = new core.dialogue.AgentDialogueStateService();
  const turns = item.mode === 'multi' ? item.turns : [item.utterance];
  const turnResults = [];
  const stateSnapshots = [];
  let writerCalls = 0;
  for (let index = 0; index < turns.length; index += 1) {
    const observed = createObservedSemanticOptions(core);
    try {
      const result = await core.turn.runAgentTurn({
        actorUserId: ACTOR,
        input: turns[index],
        conversationId: CONVERSATION,
        channel: 'mobile',
        locale: 'es-CL',
        timezone: CERT_TIMEZONE,
        now: CERT_NOW,
        traceId: `m7-cert-${item.id}-${index + 1}`,
      }, {
        dialogueService,
        inputInterpreter: observed.options.inputInterpreter,
      });
      // runAgentTurn only produces a plan; authorization/execution is not
      // called by this harness. Keep this invariant explicit in every record.
      if (result.kind === 'execution') writerCalls += 1;
      turnResults.push({ turn: index + 1, result: publicCoreTurn(result), providerObservations: observed.captures.inputModel.observations });
      const turnScope = core.dialogue.buildDialogueScopeKey({ conversationId: CONVERSATION, surface: 'mobile_voice' });
      const turnSnapshot = dialogueService.getSnapshot(ACTOR, turnScope);
      stateSnapshots.push(turnSnapshot ? {
        turn: index + 1,
        lifecycle: turnSnapshot.lifecycle,
        referentIds: (turnSnapshot.lastReadContext?.commitmentReferents ?? []).map((referent) => referent.canonicalEntityId),
        referentCount: turnSnapshot.lastReadContext?.commitmentReferents?.length ?? 0,
      } : { turn: index + 1, lifecycle: null, referentIds: [], referentCount: 0 });
    } catch (error) {
      turnResults.push({
        turn: index + 1,
        result: { kind: 'core_error' },
        error: safeError(error, 'agent_turn_core', item.id),
        providerObservations: observed.captures.inputModel.observations,
      });
    }
  }
  const scopeKey = core.dialogue.buildDialogueScopeKey({ conversationId: CONVERSATION, surface: 'mobile_voice' });
  const snapshot = dialogueService.getSnapshot(ACTOR, scopeKey);
  const first = turnResults[0]?.result ?? { kind: null };
  const second = turnResults[1]?.result ?? null;
  const expectedRoute = item.expected.route ?? item.expected.firstRoute;
  const observedFirstRoute = first.kind === 'plan' ? 'write' : 'read';
  const observedSecondRoute = second ? (second.kind === 'plan' ? 'write' : 'read') : null;
  const firstState = stateSnapshots[0] ?? null;
  const secondState = stateSnapshots[1] ?? null;
  const secondCitationIds = new Set(second?.citationIds ?? []);
  const sameCanonicalReferent = firstState?.referentIds?.length === 1
    ? secondCitationIds.has(`commitment:${firstState.referentIds[0]}`)
    : null;
  const routePass = (expectedRoute ? observedFirstRoute === expectedRoute : true)
    && (item.expected.secondRoute ? observedSecondRoute === item.expected.secondRoute : true);
  const continuityPass = item.mode !== 'multi'
    ? null
    : ['same_unique_entity', 'same_entity', 'same_context', 'same_time_scope'].includes(item.expected.reference)
      ? sameCanonicalReferent === true
      : true;
  return {
    id: item.id,
    mode: item.mode,
    expected: item.expected,
    coverage: 'real_agent_turn_core_with_isolated_retrieval',
    status: turnResults.some((turn) => turn.result.kind === 'core_error') ? 'core_error' : routePass && continuityPass !== false ? 'pass' : 'semantic_fail',
    firstRoute: observedFirstRoute,
    secondRoute: observedSecondRoute,
    firstRouteMatches: expectedRoute ? observedFirstRoute === expectedRoute : null,
    secondRouteMatches: item.expected.secondRoute ? observedSecondRoute === item.expected.secondRoute : null,
    continuityPass,
    turns: turnResults,
    stateSnapshots,
    dialogueState: snapshot ? {
      lifecycle: snapshot.lifecycle,
      lastReadReferentIds: (snapshot.lastReadContext?.commitmentReferents ?? []).map((referent) => referent.canonicalEntityId),
      lastReadReferentCount: snapshot.lastReadContext?.commitmentReferents?.length ?? 0,
      turnSequence: snapshot.lastTurnSequence ?? null,
    } : null,
    writerCalls,
    writerInvariant: writerCalls === 0,
  };
}

function summarize(results) {
  const counts = {};
  for (const result of results) {
    const key = result.status
      ?? (result.ok ? 'pass' : result.failureKind ?? (result.ambiguity ? 'legitimate_ambiguity' : 'semantic_fail'));
    counts[key] = (counts[key] || 0) + 1;
  }
  return {
    total: results.length,
    counts,
    fallbackUsed: results.filter((r) => r.fallbackUsed).length,
    providerUnavailable: results.filter((r) => r.failureKind === 'provider_unavailable').length,
  };
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

function runHarnessSmoke(battery) {
  const structured = safeError({ name: 'ZodError', code: 'invalid_type', message: 'invalid_type' }, 'schema', 'SMOKE');
  if (structured.message === '[object Object]' || !structured.stage || structured.caseId !== 'SMOKE') {
    throw new Error('structured error serialization failed');
  }
  if (classifyProviderError({ message: 'schema_invalid' }) === 'provider_unavailable') {
    throw new Error('schema_invalid was classified as provider_unavailable');
  }
  if (battery.cases.length !== 150 || !battery.frozen) {
    throw new Error('frozen battery was not loaded');
  }
  const schema = require(resolve(ROOT, 'dist/schemas/agentInterpretation.schema.js')).agentInterpretationPayloadSchema;
  const schemaIssues = zodIssueSummary(schema, JSON.stringify({ intent: 'not-a-real-intent' }));
  if (schemaIssues.length === 0 || !schemaIssues[0].path || !schemaIssues[0].code) {
    throw new Error('schema issue diagnostics failed');
  }
  const coreError = safeError({ name: 'AppError', code: 'fixture_missing_field', message: 'fixture missing canonical field' }, 'agent_turn_core', 'SMOKE');
  return {
    status: 'pass',
    checks: {
      completeResults: true,
      structuredErrors: true,
      schemaAndProviderSeparated: true,
      schemaIssueExample: schemaIssues[0],
      coreErrorExample: coreError,
      frozenBattery: true,
      writers: 0,
    },
  };
}

async function main() {
  const { battery, sha256 } = loadBattery();
  if (mode === 'smoke') {
    const smoke = runHarnessSmoke(battery);
    console.log(JSON.stringify({ battery: { count: battery.cases.length, sha256 }, smoke }));
    return;
  }

  const fixtureAdapter = createFixtureAdapter();
  const core = loadCore(fixtureAdapter);
  if (mode === 'core-smoke') {
    fixtureAdapter.setCaseFixture();
    const item = battery.cases.find((candidate) => candidate.id === 'W001') ?? battery.cases[0];
    const synthetic = {
      route: 'write',
      objective: {
        objectiveType: 'create_personal_commitment',
        targetEntities: { personHints: [], entityHints: ['revisar el medidor'] },
        constraints: {},
        desiredOutcome: 'crear un compromiso aislado',
        timeConstraints: { rawHint: '2026-09-24' },
        actor: ACTOR,
        sourceUtterance: 'Revisar el medidor mañana',
        confidence: 1,
        ambiguities: [],
        source: 'deterministic',
      },
    };
    const coreSmoke = await runCoreDryRun(item, synthetic, core);
    if (coreSmoke.status === 'core_error' || coreSmoke.writerCalled) throw new Error(JSON.stringify(coreSmoke));
    console.log(JSON.stringify({ battery: { count: battery.cases.length, sha256 }, coreSmoke }));
    return;
  }
  const report = {
    schemaVersion: 2,
    battery: { id: battery.batteryId, count: battery.cases.length, sha256, frozen: battery.frozen },
    execution: { writers: 0, persistentData: false, production: false, staging: false },
    providerProbe: null,
    llm: null,
    core: null,
    multivuelta: null,
    fallback: null,
  };

  if (mode !== 'fallback') {
    report.providerProbe = await providerProbe(core);
    if (!report.providerProbe.ok) {
      report.llm = {
        status: 'infrastructure_fail',
        total: battery.cases.length,
        scored: 0,
        counts: { provider_unavailable: battery.cases.length },
        results: battery.cases.map((item) => ({ id: item.id, expected: item.expected, status: 'provider_unavailable', executed: false })),
        failures: [],
      };
      report.core = {
        status: 'not_run_provider_unavailable',
        total: battery.cases.length,
        executed: 0,
        notRun: battery.cases.length,
        writerCalls: 0,
        results: battery.cases.map((item) => ({ id: item.id, status: 'not_run_provider_unavailable', executed: false, writerCalled: false })),
        failures: [],
      };
      report.multivuelta = { status: 'not_run_provider_unavailable', total: 30, results: [] };
    } else {
      const llmResults = [];
      for (const item of battery.cases) {
        try {
          llmResults.push(await runSemanticCase(item, core, false));
        } catch (error) {
          llmResults.push({
            id: item.id,
            mode: item.mode,
            input: item.mode === 'multi' ? item.turns : item.utterance,
            expected: item.expected,
            status: classifyProviderError(error),
            failureKind: classifyProviderError(error),
            fallbackUsed: false,
            error: safeError(error, 'semantic', item.id),
          });
        }
      }
      const scoredLlm = llmResults.filter((result) => result.status !== 'not_scored_multivuelta');
      const llmSummary = summarize(scoredLlm);
      report.llm = {
        status: 'executed',
        total: llmResults.length,
        scored: scoredLlm.length,
        counts: llmSummary.counts,
        fallbackUsed: llmSummary.fallbackUsed,
        providerUnavailable: llmSummary.providerUnavailable,
        results: llmResults.map(publicResult),
        failures: llmResults.filter((result) => result.status !== 'pass' && result.status !== 'not_scored_multivuelta').map(publicResult),
      };

      const coreResults = [];
      for (const item of battery.cases) {
        try {
          coreResults.push(await runRealCoreCase(item, core, fixtureAdapter));
        } catch (error) {
          coreResults.push({
            id: item.id,
            mode: item.mode,
            expected: item.expected,
            status: 'core_error',
            coverage: 'real_agent_turn_core_with_isolated_retrieval',
            writerCalls: 0,
            writerInvariant: true,
            error: safeError(error, 'agent_turn_core', item.id),
          });
        }
      }
      report.core = {
        status: 'executed',
        total: coreResults.length,
        executed: coreResults.filter((result) => result.status !== 'core_error').length,
        notRun: 0,
        writerCalls: coreResults.reduce((sum, result) => sum + (result.writerCalls ?? 0), 0),
        statuses: summarize(coreResults).counts,
        results: coreResults,
        failures: coreResults.filter((result) => result.status === 'core_error' || result.status === 'semantic_fail'),
      };
      const multiResults = coreResults.filter((result) => result.mode === 'multi');
      report.multivuelta = {
        status: 'executed',
        total: multiResults.length,
        ...summarize(multiResults),
        results: multiResults,
        failures: multiResults.filter((result) => result.status !== 'pass'),
      };
    }
  }

  if (mode === 'fallback' || mode === 'all') {
    const fallbackResults = [];
    for (const item of battery.cases) {
      try {
        fallbackResults.push(await runSemanticCase(item, core, true));
      } catch (error) {
        fallbackResults.push({ id: item.id, expected: item.expected, status: 'fallback_error', error: safeError(error, 'deterministic_fallback', item.id) });
      }
    }
    const scoredFallback = fallbackResults.filter((result) => result.status !== 'not_scored_multivuelta');
    const fallbackSummary = summarize(scoredFallback);
    report.fallback = {
      status: 'executed',
      total: fallbackResults.length,
      scored: scoredFallback.length,
      counts: fallbackSummary.counts,
      fallbackUsed: fallbackSummary.fallbackUsed,
      providerUnavailable: fallbackSummary.providerUnavailable,
      results: fallbackResults.map(publicResult),
      failures: fallbackResults.filter((result) => result.status !== 'pass' && result.status !== 'not_scored_multivuelta').map(publicResult),
    };
    report.fallbackMultivuelta = {
      status: 'not_scored_without_core',
      total: fallbackResults.filter((result) => result.mode === 'multi').length,
      results: fallbackResults.filter((result) => result.mode === 'multi').map(publicResult),
    };
  }

  mkdirSync(dirname(reportPath), { recursive: true });
  writeFileSync(reportPath, JSON.stringify(report, null, 2), { encoding: 'utf8', flag: 'w' });
  console.log(JSON.stringify({
    battery: report.battery,
    providerProbe: report.providerProbe,
    llm: report.llm && { status: report.llm.status, total: report.llm.total ?? 0, scored: report.llm.scored ?? 0, counts: report.llm.counts ?? {} },
    core: report.core && { status: report.core.status, total: report.core.total, executed: report.core.executed, writerCalls: report.core.writerCalls, statuses: report.core.statuses },
    multivuelta: report.multivuelta && { status: report.multivuelta.status, total: report.multivuelta.total, counts: report.multivuelta.counts ?? {} },
    fallback: report.fallback && { total: report.fallback.total, scored: report.fallback.scored, counts: report.fallback.counts },
  }));
  if (mode !== 'fallback') {
    if (report.providerProbe && !report.providerProbe.ok) process.exitCode = 2;
    else if (report.llm?.counts?.provider_unavailable || report.llm?.counts?.schema_invalid || report.llm?.counts?.timeout) process.exitCode = 2;
    else if (report.llm?.counts?.semantic_fail || report.core?.failures?.length) process.exitCode = 4;
  }
}

main().catch((error) => {
  console.error(JSON.stringify({ status: 'harness_error', message: error instanceof Error ? error.message : String(error) }));
  process.exitCode = 3;
});
