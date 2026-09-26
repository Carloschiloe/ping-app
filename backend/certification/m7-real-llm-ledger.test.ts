import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import dotenv from 'dotenv';
import { describe, expect, it, vi } from 'vitest';

dotenv.config({ path: process.env.M7_REAL_ENV_FILE?.trim() || path.resolve(process.cwd(), '.env') });
process.env.M7_BLIND_MAX_COMPLETION_TOKENS ??= '1024';
process.env.NODE_ENV = 'test';
process.env.PING_ENVIRONMENT = 'local';
process.env.PING_SEMANTIC_V4_SHADOW = 'true';
process.env.PING_SEMANTIC_V4_CORE_SHADOW = 'true';

vi.mock('../src/services/retrieval.service', () => ({
    resolvePerson: vi.fn(async () => ({ resolved: null, ambiguous: false, candidates: [] })),
    retrieveCommitments: vi.fn(async () => []), retrieveCommitmentProposals: vi.fn(async () => []),
    retrieveCommitmentEvents: vi.fn(async () => []), retrieveMessages: vi.fn(async () => []),
    retrieveTranscriptions: vi.fn(async () => []), retrieveAttachments: vi.fn(async () => []),
    retrieveVisibleCommitmentById: vi.fn(async () => null), dedupeProvenance: (items: any[]) => items,
}));
vi.mock('../src/services/memory.service', () => ({ retrieveMemory: vi.fn(async () => []), ingestMemoryFromEvent: vi.fn(async () => undefined) }));
vi.mock('../src/lib/supabaseAdmin', () => ({ supabaseAdmin: { from: vi.fn() } }));

const MODEL = 'gpt-5.6-sol';
const ACTOR = '00000000-0000-4000-8000-000000000001';
const TIMEZONE = 'America/Santiago';
const NOW = new Date('2026-09-26T15:00:00.000Z');
const ROOT = path.resolve(process.env.PING_LEDGER_ARTIFACT_ROOT || path.join(process.cwd(), '.m7-smoke-artifacts', 'real-llm-ledger-20260926'));
const RAW_PATH = path.join(ROOT, 'm7-real-llm-ledger.raw.ndjson');
const RESULTS_PATH = path.join(ROOT, 'm7-real-llm-ledger.core-results.ndjson');
const MANIFEST_PATH = path.join(ROOT, 'm7-real-llm-ledger.manifest.json');
const ERROR_PATH = path.join(ROOT, 'm7-real-llm-ledger.error.json');

const conversations = [
    { id: 'ledger-a', turns: ['Anota revisar el informe del cliente.', 'Ponlo para mañana a las diez.', 'Que sea con Paula.', 'Mejor el jueves a las cuatro.', 'Sí, confirma esa versión.'] },
    { id: 'ledger-b', turns: ['Deja pendiente llamar a Pedro por el despacho.', 'Cámbialo a Paula.', 'Ahora volvamos al informe.', 'A ese informe ponle el viernes.', 'Confírmalo.'] },
];

function id(index: number): string { return `00000000-0000-4000-8000-0000000000${String(index + 40).padStart(2, '0')}`; }
function hash(value: string): string { return crypto.createHash('sha256').update(value, 'utf8').digest('hex'); }
function fallback(): any { return { version: 4, kind: 'unknown', domain: 'unknown', objectiveCompleteness: 'unknown', lifecycleCommand: 'none', lifecycleTarget: 'unspecified', lifecycleEvidence: 'unknown', pendingSlotAnswer: 'unknown', continuationLike: 'unknown', candidateSlotType: null, independentObjective: 'unknown', objectiveType: null, entityHints: [], slots: {}, ambiguityFields: ['semantic_interpretation'], confidence: 0, source: 'fallback', readMeaning: null }; }
function sanitize(error: unknown): Record<string, unknown> { const record = error && typeof error === 'object' ? error as Record<string, unknown> : {}; return { name: record.name ?? null, status: record.status ?? null, code: record.code ?? null, message: String(record.message ?? error ?? 'unknown').slice(0, 500) }; }
function commitment(commitmentId: string, title: string, conversationId: string): any { return { id: commitmentId, entityType: 'commitment', title, description: null, status: 'accepted', type: 'task', priority: null, dueAt: '2026-09-29T20:00:00.000Z', proposedDueAt: null, expectedResult: null, resolvedAt: null, resolutionResult: null, rejectionReason: null, ownerUserId: ACTOR, assignedToUserId: null, counterpartyContactId: null, conversationId, messageId: null, createdAt: '2026-09-26T10:00:00.000Z', provenance: { sourceType: 'commitment', sourceId: commitmentId }, authorizedActorUserIds: [ACTOR] }; }
function repository(create: (rows: any) => any): any { return create({ commitments: [commitment('00000000-0000-4000-8000-000000000040', 'revisar el informe del cliente', id(0)), commitment('00000000-0000-4000-8000-000000000041', 'llamar por el despacho', id(1))], people: [{ actorUserId: ACTOR, person: { kind: 'contact', id: '00000000-0000-4000-8000-000000000042', displayName: 'Paula' } }, { actorUserId: ACTOR, person: { kind: 'user', id: '00000000-0000-4000-8000-000000000043', displayName: 'Pedro' } }] }); }
function context(service: any, conversationId: string): any { const state = service.getSnapshot(ACTOR, conversationId); return { lifecycle: state?.lifecycle === 'idle' || !state ? 'none' : 'active', activeObjectiveType: state?.openObjective?.objectiveType ?? null, missingSlotType: state?.pendingClarification?.field ?? null, suspendedObjectiveType: null, referentHints: state?.referents?.map((item: any) => item.rawText).slice(-5) ?? [] }; }
function stable(result: any, telemetry: any, state: any): any { return { resultKind: result?.kind ?? null, planStatus: result?.kind === 'plan' ? result.plan?.status ?? null : null, disposition: telemetry?.core?.disposition ?? null, resolution: telemetry?.core?.resolution ?? null, planShape: telemetry?.core?.planShape ?? null, lifecycle: state?.lifecycle ?? null, turnSequence: state?.lastTurnSequence ?? 0, openObjectiveType: state?.openObjective?.objectiveType ?? null }; }
function stateSnapshot(state: any): any { return { lifecycle: state?.lifecycle ?? null, turnSequence: state?.lastTurnSequence ?? 0, openObjective: state?.openObjective ?? null, pendingClarification: state?.pendingClarification ?? null, referents: state?.referents ?? [] }; }

describe('M-7 real LLM ledger deep validation', () => {
    it('validates two correction/return/confirmation sequences with no writers', async () => {
        const { OpenAiSemanticModel, parseSemanticV4ModelOutput, SEMANTIC_V4_PROVIDER_SCHEMA_HASH } = await import('../src/services/canonicalSemanticProducer.service');
        const { runAgentTurn } = await import('../src/services/agentTurn.service');
        const { DeterministicInputInterpreter } = await import('../src/services/agentInputInterpreter.service');
        const { DeterministicObjectiveInterpreter } = await import('../src/services/agentObjectiveInterpreter.service');
        const { AgentDialogueStateService } = await import('../src/services/agentDialogueState.service');
        const { AgentSemanticV4HighFidelityReadOnlyResolver, createHighFidelityReadOnlyRepositoryForTest } = await import('../src/services/agentSemanticV4HighFidelityReadOnly.service');
        expect(process.env.OPENAI_API_KEY).toBeTruthy();
        fs.mkdirSync(ROOT, { recursive: true });
        const rawFd = fs.openSync(RAW_PATH, 'wx');
        const resultFd = fs.openSync(RESULTS_PATH, 'wx');
        const model = new OpenAiSemanticModel(MODEL);
        const inputInterpreter = new DeterministicInputInterpreter();
        const objectiveInterpreter = new DeterministicObjectiveInterpreter();
        const repo = repository(createHighFidelityReadOnlyRepositoryForTest);
        const firstPass: any[] = [];
        let calls = 0;
        let sideEffects = 0;
        try {
            for (const [conversationIndex, conversation] of conversations.entries()) {
                const conversationId = id(conversationIndex);
                const dialogueService = new AgentDialogueStateService();
                const resolver = new AgentSemanticV4HighFidelityReadOnlyResolver(repo);
                for (const [turnIndex, utterance] of conversation.turns.entries()) {
                    const request = { text: utterance, modality: 'text' as const, locale: 'es-CL', timezone: TIMEZONE, dialogue: context(dialogueService, conversationId), semanticVersion: 4 as const };
                    calls += 1;
                    const provider = await model.interpretWithDiagnostics(request);
                    if (provider.kind !== 'response') throw new Error(`provider failure ${JSON.stringify(sanitize(provider))}`);
                    const providerRaw = JSON.stringify({ conversationId, turnIndex: turnIndex + 1, utterance, request, rawV4Output: provider.content, rawV4Hash: hash(provider.content), finishReason: provider.finishReason, usage: provider.usage }) + '\n';
                    fs.writeSync(rawFd, providerRaw, undefined, 'utf8'); fs.fsyncSync(rawFd);
                    if (provider.finishReason !== 'stop') throw new Error(`finish_reason=${provider.finishReason}`);
                    let parsed: any; let normalizationError: any = null;
                    try { parsed = parseSemanticV4ModelOutput(provider.content); } catch (error) { normalizationError = sanitize(error); parsed = { semantic: fallback(), diagnostics: { schemaValid: true, failure: null } }; }
                    const diagnostics = { schemaValid: parsed.diagnostics.schemaValid, failure: parsed.diagnostics.failure, providerRequestSucceeded: true, providerFailure: false, providerErrorClass: null, providerHttpStatus: null, providerErrorCode: null, providerErrorMessage: null, finishReason: provider.finishReason, refusalPresent: provider.refusalPresent, contentPresent: true, contentLength: provider.content.length, normalizationSuccess: normalizationError === null && parsed.semantic.source === 'llm', fallbackReason: normalizationError ? 'normalization_error' : null, model: MODEL, latencyMs: provider.latencyMs, usage: provider.usage };
                    const telemetry: any[] = [];
                    const result = await runAgentTurn({ actorUserId: ACTOR, conversationId, channel: 'mobile_text', locale: 'es-CL', timezone: TIMEZONE, now: NOW, input: utterance }, { dialogueService, inputInterpreter, objectiveInterpreter, precomputedSemanticV4: { semantic: parsed.semantic, diagnostics }, semanticV4CoreShadowResolver: resolver, semanticV4CoreShadowObserver: value => telemetry.push(value) });
                    const shadow = telemetry.at(-1);
                    expect(shadow?.failure ?? null).toBeNull();
                    // Dialogue-state mutation is the required in-memory continuity
                    // mechanism for this test. It is not an external side effect.
                    // Only writers/tools/persistence are forbidden in the ledger run.
                    if (shadow?.sideEffects?.toolsExecuted || shadow?.sideEffects?.persistenceWrites !== 0) sideEffects += 1;
                    const currentState = dialogueService.getSnapshot(ACTOR, conversationId);
                    const resultSnapshot = stable(result, shadow, currentState);
                    const record = { conversationId, turnIndex: turnIndex + 1, utterance, rawV4Hash: hash(provider.content), semantic: parsed.semantic, diagnostics, normalizationError, resultSnapshot, stateSnapshot: stateSnapshot(currentState) };
                    fs.writeSync(resultFd, JSON.stringify(record) + '\n', undefined, 'utf8'); fs.fsyncSync(resultFd);
                    firstPass.push(record);
                }
            }
        } catch (error) {
            fs.writeFileSync(ERROR_PATH, JSON.stringify({ model: MODEL, providerCalls: calls, error: sanitize(error) }, null, 2) + '\n', { encoding: 'utf8', flag: 'wx' });
            throw error;
        } finally { fs.closeSync(rawFd); fs.closeSync(resultFd); }
        expect(calls).toBe(10);
        expect(firstPass).toHaveLength(10);
        expect(sideEffects).toBe(0);
        async function replayPass() {
            const { runAgentTurn } = await import('../src/services/agentTurn.service');
            const { DeterministicInputInterpreter } = await import('../src/services/agentInputInterpreter.service');
            const { DeterministicObjectiveInterpreter } = await import('../src/services/agentObjectiveInterpreter.service');
            const { AgentDialogueStateService } = await import('../src/services/agentDialogueState.service');
            const { AgentSemanticV4HighFidelityReadOnlyResolver } = await import('../src/services/agentSemanticV4HighFidelityReadOnly.service');
            const inputInterpreter = new DeterministicInputInterpreter();
            const objectiveInterpreter = new DeterministicObjectiveInterpreter();
            const replay: any[] = [];
            for (const conversation of conversations) {
                const conversationId = id(conversations.indexOf(conversation));
                const dialogueService = new AgentDialogueStateService();
                const resolver = new AgentSemanticV4HighFidelityReadOnlyResolver(repo);
                for (const record of firstPass.filter(item => item.conversationId === conversationId)) {
                    const telemetry: any[] = [];
                    const result = await runAgentTurn({ actorUserId: ACTOR, conversationId, channel: 'mobile_text', locale: 'es-CL', timezone: TIMEZONE, now: NOW, input: record.utterance }, { dialogueService, inputInterpreter, objectiveInterpreter, precomputedSemanticV4: { semantic: record.semantic, diagnostics: record.diagnostics }, semanticV4CoreShadowResolver: resolver, semanticV4CoreShadowObserver: value => telemetry.push(value) });
                    const shadow = telemetry.at(-1);
                    expect(shadow?.failure ?? null).toBeNull();
                    replay.push({ conversationId, turnIndex: record.turnIndex, resultSnapshot: stable(result, shadow, dialogueService.getSnapshot(ACTOR, conversationId)), stateSnapshot: stateSnapshot(dialogueService.getSnapshot(ACTOR, conversationId)) });
                }
            }
            return replay;
        }
        const replayOne = await replayPass();
        const replayTwo = await replayPass();
        const expectedReplay = firstPass.map(record => ({ conversationId: record.conversationId, turnIndex: record.turnIndex, resultSnapshot: record.resultSnapshot, stateSnapshot: record.stateSnapshot }));
        expect(replayOne).toEqual(expectedReplay);
        expect(replayTwo).toEqual(replayOne);
        fs.writeFileSync(MANIFEST_PATH, JSON.stringify({ artifactVersion: 1, model: MODEL, schemaHash: SEMANTIC_V4_PROVIDER_SCHEMA_HASH, conversations: 2, turns: 10, providerCalls: calls, replayOpenAiCalls: 0, replayIdentical: true, sideEffects: { writers: 0, persistenceMutations: 0, tools: 0, memoryWrites: 0, dialogueStateMutations: 'expected_internal_continuity' } }, null, 2) + '\n', { encoding: 'utf8', flag: 'wx' });
    }, 900000);
});
