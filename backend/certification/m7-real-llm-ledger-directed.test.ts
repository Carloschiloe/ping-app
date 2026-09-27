import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import dotenv from 'dotenv';
import { describe, expect, it, vi } from 'vitest';
import type { RetrievalCommitment } from '../src/types/retrieval';

vi.mock('../src/services/retrieval.service', () => ({
    resolvePerson: vi.fn(async () => ({ resolved: null, ambiguous: false, candidates: [] })),
    retrieveCommitments: vi.fn(async () => [] as RetrievalCommitment[]),
    retrieveCommitmentProposals: vi.fn(async () => []),
    retrieveCommitmentEvents: vi.fn(async () => []),
    retrieveMessages: vi.fn(async () => []),
    retrieveTranscriptions: vi.fn(async () => []),
    retrieveAttachments: vi.fn(async () => []),
    retrieveVisibleCommitmentById: vi.fn(async () => null),
    dedupeProvenance: (items: any[]) => items,
}));
vi.mock('../src/services/memory.service', () => ({ retrieveMemory: vi.fn(async () => []), ingestMemoryFromEvent: vi.fn(async () => undefined) }));
vi.mock('../src/lib/supabaseAdmin', () => ({ supabaseAdmin: { from: vi.fn() } }));
import {
    LlmInputInterpreter,
    OpenAiAgentInputModel,
    type AgentInputModel,
    type AgentInputModelRequest,
    type Interpretation,
} from '../src/services/agentInputInterpreter.service';
import {
    LlmObjectiveInterpreter,
    OpenAiAgentObjectiveModel,
    type AgentObjective,
    type AgentObjectiveModel,
    type AgentObjectiveModelRequest,
} from '../src/services/agentObjectiveInterpreter.service';
import { OpenAiSemanticModel, parseSemanticV4ModelOutput, type SemanticModelRequest } from '../src/services/canonicalSemanticProducer.service';
import { interpretAgentSemanticTurn, type AgentSemanticInterpretation } from '../src/services/agentSemanticInterpreter.service';
import { runAgentTurn } from '../src/services/agentTurn.service';
import { AgentDialogueStateService, clearAgentDialogueStateForTests } from '../src/services/agentDialogueState.service';
import { AgentSemanticV4HighFidelityReadOnlyResolver, createHighFidelityReadOnlyRepositoryForTest } from '../src/services/agentSemanticV4HighFidelityReadOnly.service';
import { createLedgerEnvelope, completeLedgerEnvelope, readLedgerEnvelope, stableLedgerProjection, writeLedgerEnvelope, NOT_USED } from './m7-ledger-capture';
import { classifyShadowObservation } from './m7-ledger-harness-metrics';

dotenv.config({ path: process.env.M7_REAL_ENV_FILE?.trim() || path.resolve(process.cwd(), '.env') });
process.env.M7_BLIND_MAX_COMPLETION_TOKENS ??= '2048';
process.env.NODE_ENV = 'test';
process.env.PING_ENVIRONMENT = 'local';
process.env.PING_SEMANTIC_V4_SHADOW = 'true';
process.env.PING_SEMANTIC_V4_CORE_SHADOW = 'true';

const ACTOR = '00000000-0000-4000-8000-000000000001';
const TIMEZONE = 'America/Santiago';
const CLOCK = new Date('2026-09-27T15:00:00.000Z');
const MODEL = 'gpt-5.6-sol';
const ROOT = path.resolve(process.env.PING_DIRECTED_LEDGER_ARTIFACT_ROOT || path.join(process.cwd(), '.m7-smoke-artifacts', 'real-ledger-directed-20260927'));

const CONVERSATIONS = [
    { id: 'directed-a', turns: [
        'Quiero dejar anotado revisar la bomba el miércoles por la mañana.',
        'En realidad que sea el jueves a las cuatro.',
        'Y que lo revise Paula conmigo.',
        'Mejor el viernes a las nueve.',
        'Sí, confirma esa versión.',
    ] },
    { id: 'directed-b', turns: [
        'Necesito ocuparme de llamar al proveedor esta semana.',
        'Cambiemos eso por revisar el inventario.',
        'Volvamos a lo de llamar al proveedor.',
        'Para eso, déjalo el martes después de almuerzo.',
        'Confirma la llamada al proveedor.',
    ] },
    { id: 'directed-c', turns: [
        'Coordina una visita con Alex para el lunes.',
        'También agenda una visita con Alex para el martes.',
        '¿Cuál de las dos visitas dices?',
        'La segunda.',
        'Sí, confirma esa.',
    ] },
] as const;

function sha(value: string): string { return crypto.createHash('sha256').update(value, 'utf8').digest('hex'); }
function id(index: number): string { return `00000000-0000-4000-8000-0000000001${String(index).padStart(2, '0')}`; }
function sanitizeError(error: unknown): Record<string, unknown> {
    const record = error && typeof error === 'object' ? error as Record<string, unknown> : {};
    return { name: record.name ?? null, status: record.status ?? null, code: record.code ?? null, message: String(record.message ?? error ?? 'unknown').slice(0, 500) };
}

function commitment(commitmentId: string, title: string, conversationId: string): any {
    return { id: commitmentId, entityType: 'commitment', title, description: null, status: 'accepted', type: 'task', priority: null,
        dueAt: '2026-10-01T20:00:00.000Z', proposedDueAt: null, expectedResult: null, resolvedAt: null, resolutionResult: null,
        rejectionReason: null, ownerUserId: ACTOR, assignedToUserId: null, counterpartyContactId: null, conversationId, messageId: null,
        createdAt: '2026-09-27T10:00:00.000Z', provenance: { sourceType: 'commitment', sourceId: commitmentId }, authorizedActorUserIds: [ACTOR] };
}

function repository(): any {
    return createHighFidelityReadOnlyRepositoryForTest({
        commitments: [commitment(id(1), 'revisar la bomba', 'directed-a'), commitment(id(2), 'llamar al proveedor', 'directed-b')],
        people: [
            { actorUserId: ACTOR, person: { kind: 'contact', id: id(3), displayName: 'Paula' } },
            { actorUserId: ACTOR, person: { kind: 'user', id: id(4), displayName: 'Alex' } },
            { actorUserId: ACTOR, person: { kind: 'user', id: id(5), displayName: 'Alex' } },
        ],
    });
}

class RecordingInputModel implements AgentInputModel {
    readonly modelName: string;
    readonly calls: Array<{ request: AgentInputModelRequest; raw: string }> = [];
    constructor(private readonly delegate = new OpenAiAgentInputModel()) { this.modelName = delegate.modelName; }
    async interpret(request: AgentInputModelRequest): Promise<string> {
        const raw = await this.delegate.interpret(request);
        this.calls.push({ request, raw });
        return raw;
    }
}

class RecordingObjectiveModel implements AgentObjectiveModel {
    readonly modelName: string;
    readonly calls: Array<{ request: AgentObjectiveModelRequest; raw: string }> = [];
    constructor(private readonly delegate = new OpenAiAgentObjectiveModel()) { this.modelName = delegate.modelName; }
    async interpret(request: AgentObjectiveModelRequest): Promise<string> {
        const raw = await this.delegate.interpret(request);
        this.calls.push({ request, raw });
        return raw;
    }
}

function priorReadSummary(dialogue: AgentDialogueStateService, conversationId: string): any {
    const state: any = dialogue.getSnapshot(ACTOR, conversationId);
    const context = state?.lastReadContext ?? null;
    return context ? {
        kind: context.kind, referentCount: context.commitmentReferents?.length ?? 0,
        uniqueReferent: (context.commitmentReferents?.length ?? 0) === 1,
        entityTypes: Array.from(new Set((context.commitmentReferents ?? []).map((r: any) => r.entityType))),
        hasTimeRange: context.timeRange !== null,
    } : null;
}

function stateSnapshot(state: any): any {
    return state ? { lifecycle: state.lifecycle, openObjective: state.openObjective, pendingClarification: state.pendingClarification,
        referents: state.referents, lastReadContext: state.lastReadContext, currentPlanDigestRef: state.currentPlanDigestRef,
        currentAuthorizationIdRef: state.currentAuthorizationIdRef, version: state.version, lastTurnSequence: state.lastTurnSequence } : null;
}

async function executeTurn(input: {
    conversationId: string; turnIndex: number; utterance: string; dialogue: AgentDialogueStateService;
    v4Model: OpenAiSemanticModel; inputInterpreter: LlmInputInterpreter; objectiveInterpreter: LlmObjectiveInterpreter;
    resolver: AgentSemanticV4HighFidelityReadOnlyResolver; inputModel: RecordingInputModel; objectiveModel: RecordingObjectiveModel;
}) {
    const { conversationId, turnIndex, utterance, dialogue, v4Model, inputInterpreter, objectiveInterpreter, resolver, inputModel, objectiveModel } = input;
    const semanticRequest: SemanticModelRequest = {
        text: utterance, modality: 'text', locale: 'es-CL', timezone: TIMEZONE, semanticVersion: 4,
        dialogue: { lifecycle: dialogue.getSnapshot(ACTOR, conversationId)?.lifecycle ?? 'none', activeObjectiveType: dialogue.getSnapshot(ACTOR, conversationId)?.openObjective?.objectiveType ?? null,
            missingSlotType: dialogue.getSnapshot(ACTOR, conversationId)?.pendingClarification?.field ?? null, suspendedObjectiveType: null,
            referentHints: dialogue.getSnapshot(ACTOR, conversationId)?.referents.map((r) => r.rawText).slice(-3) ?? [] },
    };
    const legacyBefore = { input: inputModel.calls.length, objective: objectiveModel.calls.length };
    const legacySemantic = await interpretAgentSemanticTurn(utterance, {
        actorUserId: ACTOR, conversationId, channel: 'mobile_text', priorReadSummary: priorReadSummary(dialogue, conversationId),
    }, { inputInterpreter, objectiveInterpreter });
    const v4Provider = await v4Model.interpretWithDiagnostics(semanticRequest);
    if (v4Provider.kind !== 'response') throw new Error(`V4_PROVIDER_FAILURE=${JSON.stringify(sanitizeError(v4Provider))}`);
    if (v4Provider.finishReason !== 'stop') throw new Error(`V4_FINISH_REASON=${v4Provider.finishReason}`);
    const parsed = parseSemanticV4ModelOutput(v4Provider.content);
    if (!parsed.diagnostics.schemaValid || parsed.diagnostics.failure) throw new Error(`V4_SCHEMA_INVALID=${parsed.diagnostics.failure}`);
    const inputCalls = inputModel.calls.slice(legacyBefore.input);
    const objectiveCalls = objectiveModel.calls.slice(legacyBefore.objective);
    const stateBefore = stateSnapshot(dialogue.getSnapshot(ACTOR, conversationId));
    const envelope = createLedgerEnvelope({
        conversationId, turnIndex, humanUtterance: utterance,
        runtimeFingerprint: { model: MODEL, legacyInputModel: inputModel.modelName, legacyObjectiveModel: objectiveModel.modelName, schema: 'runtime', clock: CLOCK.toISOString(), timezone: TIMEZONE, externalReplay: 'disabled' },
        clock: CLOCK.toISOString(), timezone: TIMEZONE, dialogueStateBefore: stateBefore, ledgerStateBefore: stateBefore,
        semanticV4Raw: { content: v4Provider.content, finishReason: v4Provider.finishReason, usage: v4Provider.usage, hash: sha(v4Provider.content) },
        semanticV4Normalized: parsed.semantic, legacySemanticRaw: { input: inputCalls, objective: objectiveCalls }, legacySemanticNormalized: legacySemantic,
        objectiveInterpreterInput: objectiveCalls.length ? objectiveCalls.map((call) => call.request) : NOT_USED('legacy objective interpreter did not run'),
        objectiveInterpreterOutput: legacySemantic.objective ?? NOT_USED('legacy semantic route was read'),
        temporalInputs: { referenceInstant: CLOCK.toISOString(), timezone: TIMEZONE }, temporalOutputs: NOT_USED('temporal resolution remains Core-owned'),
        entityResolverInputs: { entityHints: parsed.semantic.entityHints, actorUserId: ACTOR }, entityResolverOutputs: NOT_USED('resolver executes after capture'),
        featureFlags: { semanticV4: true, coreShadow: true, externalProviders: false, writers: false },
        coreInput: { request: semanticRequest, legacySemantic },
    });
    const prePath = writeLedgerEnvelope(ROOT, `conversation-${conversationId}-turn-${turnIndex}.pre.json`, envelope);
    const inputReplay: AgentInputModel = { modelName: inputModel.modelName, interpret: async () => { throw new Error('UNRECORDED_NONDETERMINISM=legacy_input_replay'); } };
    const objectiveReplay: any = { interpret: async () => { throw new Error('UNRECORDED_NONDETERMINISM=legacy_objective_replay'); } };
    const telemetry: any[] = [];
    const result = await runAgentTurn({ actorUserId: ACTOR, conversationId, channel: 'mobile_text', locale: 'es-CL', timezone: TIMEZONE, now: CLOCK, input: utterance }, {
        dialogueService: dialogue, inputInterpreter: { interpret: async () => legacySemantic.interpretation }, objectiveInterpreter: { interpret: async () => legacySemantic.objective ?? objectiveReplay },
        precomputedSemanticV4: { semantic: parsed.semantic, diagnostics: { ...parsed.diagnostics, providerRequestSucceeded: true, providerFailure: false, providerErrorClass: null, providerHttpStatus: null, providerErrorCode: null, providerErrorMessage: null, finishReason: v4Provider.finishReason, refusalPresent: v4Provider.refusalPresent, contentPresent: true, contentLength: v4Provider.content.length, normalizationSuccess: true, fallbackReason: null, model: MODEL, latencyMs: v4Provider.latencyMs, usage: v4Provider.usage } as any },
        semanticV4CoreShadowResolver: resolver, semanticV4CoreShadowObserver: value => telemetry.push(value),
    });
    const shadow = telemetry.at(-1);
    const after = stateSnapshot(dialogue.getSnapshot(ACTOR, conversationId));
    const completed = completeLedgerEnvelope(envelope, {
        dialogueStateAfter: after, ledgerStateAfter: after, currentObjective: after?.openObjective?.objectiveType ?? null,
        currentVersion: after?.version ?? null, pendingConfirmationTarget: after?.currentPlanDigestRef ?? null,
        disposition: shadow?.core?.disposition ?? null, planShape: shadow?.core?.planShape ?? null,
    });
    const finalPath = writeLedgerEnvelope(ROOT, `conversation-${conversationId}-turn-${turnIndex}.final.json`, completed);
    return { completed, result, shadow, prePath, finalPath };
}

describe('M-7 directed real ledger validation', () => {
    it('captures three fresh conversations before Core and leaves replayable artifacts', async () => {
        if (!process.env.OPENAI_API_KEY?.trim()) throw new Error('OPENAI_API_KEY_REQUIRED');
        fs.mkdirSync(ROOT, { recursive: true });
        const batteryHash = sha(JSON.stringify(CONVERSATIONS));
        fs.writeFileSync(path.join(ROOT, 'm7-directed-ledger.battery.json'), `${JSON.stringify({ conversations: CONVERSATIONS, sha256: batteryHash }, null, 2)}\n`, { flag: 'wx' });
        const v4Model = new OpenAiSemanticModel(MODEL);
        const inputModel = new RecordingInputModel();
        const objectiveModel = new RecordingObjectiveModel();
        const inputInterpreter = new LlmInputInterpreter({ model: inputModel });
        const objectiveInterpreter = new LlmObjectiveInterpreter({ model: objectiveModel });
        const replayRecords: any[] = [];
        let actualSideEffects = 0;
        let observerReached = 0;
        let observerNotReached = 0;
        let observerFailures = 0;
        let openAiCalls = 0;
        try {
            for (const [conversationIndex, conversation] of CONVERSATIONS.entries()) {
                const conversationId = id(conversationIndex + 10);
                const dialogue = new AgentDialogueStateService();
                const resolver = new AgentSemanticV4HighFidelityReadOnlyResolver(repository());
                for (const [turnIndex, utterance] of conversation.turns.entries()) {
                    const beforeInput = inputModel.calls.length;
                    const beforeObjective = objectiveModel.calls.length;
                    const item = await executeTurn({ conversationId, turnIndex: turnIndex + 1, utterance, dialogue, v4Model, inputInterpreter, objectiveInterpreter, resolver, inputModel, objectiveModel });
                    openAiCalls += 1 + (inputModel.calls.length - beforeInput) + (objectiveModel.calls.length - beforeObjective);
                    const observation = classifyShadowObservation(item.shadow);
                    if (observation.outcome === 'OBSERVER_REACHED') observerReached += 1;
                    if (observation.outcome === 'OBSERVER_NOT_REACHED') observerNotReached += 1;
                    if (observation.outcome === 'OBSERVER_FAILURE') observerFailures += 1;
                    if (observation.actualSideEffect) actualSideEffects += 1;
                    replayRecords.push(item);
                }
            }
        } catch (error) {
            fs.writeFileSync(path.join(ROOT, 'm7-directed-ledger.error.json'), `${JSON.stringify({ openAiCalls, error: sanitizeError(error) }, null, 2)}\n`, { flag: 'wx' });
            throw error;
        }
        expect(replayRecords).toHaveLength(15);
        expect(actualSideEffects).toBe(0);
        expect(openAiCalls).toBeGreaterThanOrEqual(15);
        const manifest = { version: 2, batteryHash, conversations: 3, turns: 15, model: MODEL, openAiCalls,
            observerReached, observerNotReached, observerFailures, actualSideEffects,
            capturedFiles: replayRecords.flatMap((r) => [r.prePath, r.finalPath]) };
        fs.writeFileSync(path.join(ROOT, 'm7-directed-ledger.manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`, { flag: 'wx' });
        console.log(`M7_DIRECTED_LEDGER_CAPTURE ${JSON.stringify(manifest)}`);
    }, 1800000);
});
