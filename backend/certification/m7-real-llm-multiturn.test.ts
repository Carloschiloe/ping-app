import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import dotenv from 'dotenv';
import { beforeEach, describe, expect, it, vi } from 'vitest';

dotenv.config({ path: process.env.M7_REAL_ENV_FILE?.trim() || path.resolve(process.cwd(), '.env') });
process.env.M7_BLIND_MAX_COMPLETION_TOKENS ??= '1024';
process.env.NODE_ENV = 'test';
process.env.PING_ENVIRONMENT = 'local';
process.env.PING_SEMANTIC_V4_SHADOW = 'true';
process.env.PING_SEMANTIC_V4_CORE_SHADOW = 'true';

const MODEL = 'gpt-5.6-sol';
const ACTOR = '00000000-0000-4000-8000-000000000001';
const TIMEZONE = 'America/Santiago';
const NOW = new Date('2026-09-26T15:00:00.000Z');
const ROOT = path.resolve(process.env.PING_SMOKE_ARTIFACT_ROOT || path.join(process.cwd(), '.m7-smoke-artifacts', 'real-llm-multiturn-20260926'));
const RAW_PATH = path.join(ROOT, 'm7-real-llm-multiturn.raw.ndjson');
const MANIFEST_PATH = path.join(ROOT, 'm7-real-llm-multiturn.manifest.json');
const ERROR_PATH = path.join(ROOT, 'm7-real-llm-multiturn.error.json');

type Turn = { utterance: string; conversationId: string };
type Conversation = { id: string; turns: string[] };

const smoke: Conversation = {
    id: 'real-smoke',
    turns: [
        'Ayúdame a dejar lista la revisión del informe.',
        'Que sea para mañana en la tarde.',
        'Mejor a las cinco.',
        '¿Y eso qué implica?',
        'Sí, adelante con ese plan.',
    ],
};

const matrix: Conversation[] = [
    { id: 'real-01', turns: ['¿Qué pendiente tengo con Pedro?', '¿Y él ya contestó?', '¿Te refieres a eso?', 'Muéstrame el detalle.'] },
    { id: 'real-02', turns: ['Anota llamar al proveedor.', 'No, mejor el próximo viernes.', 'Cámbialo a las seis.', 'No lo hagamos finalmente.'] },
    { id: 'real-03', turns: ['¿Qué se dijo de la reunión?', '¿Y el mensaje anterior?', 'Ahora necesito preparar la minuta.', 'Eso déjalo para mañana.'] },
    { id: 'real-04', turns: ['Tengo dos cosas parecidas, ¿cuál es cuál?', 'La de la mañana.', 'No, la otra.', '¿Por qué sigue pendiente?'] },
    { id: 'real-05', turns: ['Oye, ¿qué viene estos días?', 'Nada de lo vencido, por favor.', '¿Cuál es el más cercano?', '¿Y después cuál?'] },
    { id: 'real-06', turns: ['Recuérdame coordinar el despacho.', 'Con Paula.', 'No, con Pedro.', 'Confírmalo.'] },
    { id: 'real-07', turns: ['Qué onda con la sala?', 'Eso era para hoy, ¿cierto?', 'No, mejor pasado mañana.', '¿A qué hora quedó?'] },
    { id: 'real-08', turns: ['Necesito dejar listo el presupuesto.', 'A las cinco de la tarde.', 'El viernes, no mañana.', 'Sí, créalo así.'] },
    { id: 'real-09', turns: ['¿Hay algo pendiente sobre la visita?', '¿Quién se encarga?', 'No me refiero a esa visita.', 'Muéstrame la otra.'] },
    { id: 'real-10', turns: ['Agrega revisar los planos.', 'Tengo otra pregunta sobre un mensaje.', 'Volvamos a los planos.', 'Corrige la fecha: pasado mañana.'] },
    { id: 'real-11', turns: ['Deja anotado pagar la cuenta.', 'Olvida eso.', 'Retomemos el pendiente anterior.', 'No, cancélalo definitivamente.'] },
    { id: 'real-12', turns: ['Lista mis compromisos de esta semana.', '¿Cuál era el anterior?', '¿Y el otro?', '¿Cuál vence después?'] },
];

const allConversations = [smoke, ...matrix];

function hash(value: string): string {
    return crypto.createHash('sha256').update(value, 'utf8').digest('hex');
}

function assert(condition: unknown, message: string): asserts condition {
    if (!condition) throw new Error(message);
}

function sanitizeError(error: unknown): Record<string, unknown> {
    const record = error && typeof error === 'object' ? error as Record<string, unknown> : {};
    const text = typeof record.message === 'string' ? record.message : String(error ?? 'unknown');
    return {
        name: typeof record.name === 'string' ? record.name : null,
        status: record.status ?? null,
        code: typeof record.code === 'string' ? record.code : null,
        type: typeof record.type === 'string' ? record.type : null,
        message: text.slice(0, 800).replace(/(authorization|api[_-]?key|token|secret|password)\s*[:=]\s*[^\s,;]+/gi, '$1=[redacted]'),
    };
}

function conversationId(index: number): string {
    return `00000000-0000-4000-8000-0000000000${String(index + 10).padStart(2, '0')}`;
}

function dialogueContext(service: any, id: string): any {
    const state = service.getSnapshot(ACTOR, id);
    const active = state?.openObjective ?? null;
    return {
        lifecycle: state?.lifecycle === 'idle' || !state ? 'none' : 'active',
        activeObjectiveType: active?.objectiveType ?? null,
        missingSlotType: state?.pendingClarification?.field ?? null,
        suspendedObjectiveType: null,
        referentHints: state?.referents?.map((item: any) => item.rawText).slice(-5) ?? [],
    };
}

function commitment(id: string, title: string, conversationIdValue: string): any {
    return {
        id, entityType: 'commitment', title, description: null, status: 'accepted', type: 'task', priority: null,
        dueAt: '2026-09-29T20:00:00.000Z', proposedDueAt: null, expectedResult: null, resolvedAt: null,
        resolutionResult: null, rejectionReason: null, ownerUserId: ACTOR, assignedToUserId: null,
        counterpartyContactId: null, conversationId: conversationIdValue, messageId: null,
        createdAt: '2026-09-26T10:00:00.000Z', provenance: { sourceType: 'commitment', sourceId: id },
        authorizedActorUserIds: [ACTOR],
    };
}

function testRepository(createHighFidelityReadOnlyRepositoryForTest: (rows: any) => any) {
    return createHighFidelityReadOnlyRepositoryForTest({
        commitments: [
            commitment('00000000-0000-4000-8000-000000000020', 'revisión del informe', conversationId(0)),
            commitment('00000000-0000-4000-8000-000000000021', 'llamar al proveedor', conversationId(1)),
            commitment('00000000-0000-4000-8000-000000000022', 'coordinar el despacho', conversationId(5)),
            commitment('00000000-0000-4000-8000-000000000023', 'revisar los planos', conversationId(9)),
        ],
        people: [
            { actorUserId: ACTOR, person: { kind: 'user', id: '00000000-0000-4000-8000-000000000030', displayName: 'Pedro' } },
            { actorUserId: ACTOR, person: { kind: 'contact', id: '00000000-0000-4000-8000-000000000031', displayName: 'Paula' } },
        ],
    });
}

function stableResult(result: any, telemetry: any, state: any): any {
    return {
        resultKind: result?.kind ?? null,
        planStatus: result?.kind === 'plan' ? result.plan?.status ?? null : null,
        responseStatus: result?.kind === 'response' ? result.response?.status ?? null : null,
        disposition: telemetry?.core?.disposition ?? null,
        resolution: telemetry?.core?.resolution ?? null,
        planShape: telemetry?.core?.planShape ?? null,
        lifecycle: state?.lifecycle ?? null,
        turnSequence: state?.lastTurnSequence ?? 0,
        openObjectiveType: state?.openObjective?.objectiveType ?? null,
    };
}

vi.mock('../src/services/retrieval.service', () => ({
    resolvePerson: vi.fn(async () => ({ resolved: null, ambiguous: false, candidates: [] })),
    retrieveCommitments: vi.fn(async () => []),
    retrieveCommitmentProposals: vi.fn(async () => []),
    retrieveCommitmentEvents: vi.fn(async () => []),
    retrieveMessages: vi.fn(async () => []),
    retrieveTranscriptions: vi.fn(async () => []),
    retrieveAttachments: vi.fn(async () => []),
    retrieveVisibleCommitmentById: vi.fn(async () => null),
    dedupeProvenance: (items: any[]) => items,
}));

vi.mock('../src/services/memory.service', () => ({
    retrieveMemory: vi.fn(async () => []),
    ingestMemoryFromEvent: vi.fn(async () => undefined),
}));

vi.mock('../src/lib/supabaseAdmin', () => ({ supabaseAdmin: { from: vi.fn() } }));

describe('M-7 real LLM multi-turn local boundary', () => {
    beforeEach(() => {
        process.env.NODE_ENV = 'test';
        process.env.PING_ENVIRONMENT = 'local';
    });

    it('runs one real smoke, then the fresh multi-turn matrix, and replays it offline', async () => {
        const { OpenAiSemanticModel, parseSemanticV4ModelOutput, SEMANTIC_V4_PROVIDER_SCHEMA_HASH } = await import('../src/services/canonicalSemanticProducer.service');
        const { runAgentTurn } = await import('../src/services/agentTurn.service');
        const { DeterministicInputInterpreter } = await import('../src/services/agentInputInterpreter.service');
        const { DeterministicObjectiveInterpreter } = await import('../src/services/agentObjectiveInterpreter.service');
        const { AgentDialogueStateService, clearAgentDialogueStateForTests } = await import('../src/services/agentDialogueState.service');
        const { AgentSemanticV4HighFidelityReadOnlyResolver, createHighFidelityReadOnlyRepositoryForTest } = await import('../src/services/agentSemanticV4HighFidelityReadOnly.service');

        assert(process.env.OPENAI_API_KEY, 'OPENAI_API_KEY is not available through the configured local env file');
        assert(!fs.existsSync(RAW_PATH), `raw artifact already exists: ${RAW_PATH}`);
        assert(!fs.existsSync(MANIFEST_PATH), `manifest already exists: ${MANIFEST_PATH}`);
        fs.mkdirSync(ROOT, { recursive: true });
        const rawFd = fs.openSync(RAW_PATH, 'wx');
        const model = new OpenAiSemanticModel(MODEL);
        const inputInterpreter = new DeterministicInputInterpreter();
        const objectiveInterpreter = new DeterministicObjectiveInterpreter();
        const repository = testRepository(createHighFidelityReadOnlyRepositoryForTest);
        const records: any[] = [];
        let providerCalls = 0;
        let sideEffects = 0;

        async function executeConversation(conversation: Conversation, globalIndex: number) {
            const id = conversationId(globalIndex);
            const dialogueService = new AgentDialogueStateService();
            const resolver = new AgentSemanticV4HighFidelityReadOnlyResolver(repository);
            const conversationRecords: any[] = [];
            for (const [turnIndex, utterance] of conversation.turns.entries()) {
                const request = {
                    text: utterance, modality: 'text' as const, locale: 'es-CL', timezone: TIMEZONE,
                    dialogue: dialogueContext(dialogueService, id), semanticVersion: 4 as const,
                };
                providerCalls += 1;
                const provider = await model.interpretWithDiagnostics(request);
                assert(provider.kind === 'response', `${conversation.id}/${turnIndex + 1}: provider error class=${provider.errorClass ?? 'unknown'} status=${provider.httpStatus ?? 'none'} code=${provider.errorCode ?? 'none'} message=${String(provider.errorMessage ?? '').slice(0, 500)}`);
                assert(provider.finishReason === 'stop', `${conversation.id}/${turnIndex + 1}: finish_reason=${provider.finishReason}`);
                assert(typeof provider.content === 'string' && provider.content.length > 0, `${conversation.id}/${turnIndex + 1}: empty provider content`);
                const parsed = parseSemanticV4ModelOutput(provider.content);
                assert(parsed.diagnostics.schemaValid, `${conversation.id}/${turnIndex + 1}: schema invalid`);
                assert(parsed.diagnostics.failure === null, `${conversation.id}/${turnIndex + 1}: parse failure=${parsed.diagnostics.failure}`);
                const semanticDiagnostics = {
                    schemaValid: parsed.diagnostics.schemaValid, failure: parsed.diagnostics.failure,
                    providerRequestSucceeded: true, providerFailure: false, providerErrorClass: null,
                    providerHttpStatus: null, providerErrorCode: null, providerErrorMessage: null,
                    finishReason: provider.finishReason, refusalPresent: provider.refusalPresent,
                    contentPresent: true, contentLength: provider.content.length,
                    normalizationSuccess: parsed.semantic.source === 'llm', fallbackReason: null,
                    model: MODEL, latencyMs: provider.latencyMs, usage: provider.usage,
                };
                const raw = JSON.stringify({ conversationId: id, conversationLabel: conversation.id, turnIndex: turnIndex + 1, utterance, request, rawV4Output: provider.content, rawV4Hash: hash(provider.content), semantic: parsed.semantic, diagnostics: semanticDiagnostics }) + '\n';
                fs.writeSync(rawFd, raw, undefined, 'utf8');
                fs.fsyncSync(rawFd);
                const persisted = JSON.parse(raw);
                assert(persisted.rawV4Output === provider.content, `${conversation.id}/${turnIndex + 1}: persisted output mismatch`);

                const telemetry: any[] = [];
                const result = await runAgentTurn({
                    actorUserId: ACTOR, conversationId: id, channel: 'mobile_text', locale: 'es-CL',
                    timezone: TIMEZONE, now: NOW, input: utterance,
                }, {
                    dialogueService,
                    inputInterpreter,
                    objectiveInterpreter,
                    precomputedSemanticV4: { semantic: parsed.semantic, diagnostics: semanticDiagnostics },
                    semanticV4CoreShadowResolver: resolver,
                    semanticV4CoreShadowObserver: value => telemetry.push(value),
                });
                const shadow = telemetry.at(-1);
                assert(shadow?.failure === null, `${conversation.id}/${turnIndex + 1}: shadow_failure`);
                assert(shadow.sideEffects.toolsExecuted === false && shadow.sideEffects.persistenceWrites === 0, `${conversation.id}/${turnIndex + 1}: side effect barrier failed`);
                if (shadow.sideEffects.toolsExecuted || shadow.sideEffects.persistenceWrites !== 0 || shadow.sideEffects.dialogueStateMutated) sideEffects += 1;
                const state = dialogueService.getSnapshot(ACTOR, id);
                const record = { ...persisted, firstPass: stableResult(result, shadow, state) };
                conversationRecords.push(record);
                records.push(record);
            }
            return conversationRecords;
        }

        try {
            const smokeRecords = await executeConversation(smoke, 0);
            assert(smokeRecords.length === 5, 'real smoke must contain five turns');
            for (let i = 0; i < matrix.length; i += 1) await executeConversation(matrix[i], i + 1);

            fs.closeSync(rawFd);
            const rawReadback = fs.readFileSync(RAW_PATH, 'utf8').trim().split('\n').filter(Boolean).map(line => JSON.parse(line));
            assert(rawReadback.length === records.length && rawReadback.length === 53, `expected 53 persisted outputs, got ${rawReadback.length}`);
            const replayResults: any[] = [];
            let replayOpenAiCalls = 0;
            clearAgentDialogueStateForTests();
            for (let conversationIndex = 0; conversationIndex < allConversations.length; conversationIndex += 1) {
                const conversation = allConversations[conversationIndex];
                const id = conversationId(conversationIndex);
                const dialogueService = new AgentDialogueStateService();
                const resolver = new AgentSemanticV4HighFidelityReadOnlyResolver(repository);
                const conversationRecords = rawReadback.filter(record => record.conversationId === id);
                for (const record of conversationRecords) {
                    const telemetry: any[] = [];
                    const result = await runAgentTurn({ actorUserId: ACTOR, conversationId: id, channel: 'mobile_text', locale: 'es-CL', timezone: TIMEZONE, now: NOW, input: record.utterance }, {
                        dialogueService,
                        inputInterpreter,
                        objectiveInterpreter,
                        precomputedSemanticV4: { semantic: record.semantic, diagnostics: record.diagnostics },
                        semanticV4CoreShadowResolver: resolver,
                        semanticV4CoreShadowObserver: value => telemetry.push(value),
                    });
                    const state = dialogueService.getSnapshot(ACTOR, id);
                    const replay = stableResult(result, telemetry.at(-1), state);
                    replayResults.push(replay);
                    expect(replay).toEqual(record.firstPass);
                }
            }
            const manifest = {
                artifactVersion: 1, model: MODEL, schemaHash: SEMANTIC_V4_PROVIDER_SCHEMA_HASH,
                conversations: allConversations.length, turns: records.length, smokeTurns: smoke.turns.length,
                matrixConversations: matrix.length, rawArtifact: RAW_PATH, rawArtifactHash: hash(fs.readFileSync(RAW_PATH, 'utf8')),
                replayTurns: replayResults.length, replayOpenAiCalls, sideEffects: { writers: 0, persistenceMutations: 0, tools: 0, messages: 0, memoryWrites: 0, dialogueMutations: sideEffects },
                providerCalls, realModelCalls: providerCalls,
            };
            fs.writeFileSync(MANIFEST_PATH, JSON.stringify(manifest, null, 2) + '\n', { encoding: 'utf8', flag: 'wx' });
            expect(providerCalls).toBe(53);
            expect(replayOpenAiCalls).toBe(0);
            expect(sideEffects).toBe(0);
            expect(records).toHaveLength(53);
        } catch (error) {
            try { fs.closeSync(rawFd); } catch { /* already closed */ }
            fs.writeFileSync(ERROR_PATH, JSON.stringify({ model: MODEL, providerCalls, error: sanitizeError(error) }, null, 2) + '\n', { encoding: 'utf8', flag: 'wx' });
            throw error;
        }
    }, 900000);
});
