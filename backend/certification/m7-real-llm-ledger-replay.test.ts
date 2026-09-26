import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';

process.env.NODE_ENV = 'test';
process.env.PING_ENVIRONMENT = 'local';
process.env.PING_SEMANTIC_V4_SHADOW = 'true';
process.env.PING_SEMANTIC_V4_CORE_SHADOW = 'true';

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
vi.mock('../src/services/memory.service', () => ({ retrieveMemory: vi.fn(async () => []), ingestMemoryFromEvent: vi.fn(async () => undefined) }));
vi.mock('../src/lib/supabaseAdmin', () => ({ supabaseAdmin: { from: vi.fn() } }));

const ACTOR = '00000000-0000-4000-8000-000000000001';
const TIMEZONE = 'America/Santiago';
const NOW = new Date('2026-09-26T15:00:00.000Z');
const ROOT = path.resolve(process.env.M7_REAL_LLM_LEDGER_REPLAY_ARTIFACT_ROOT || path.join(process.cwd(), '.m7-smoke-artifacts', 'real-llm-ledger-20260926-v2'));
const RAW_PATH = path.join(ROOT, 'm7-real-llm-ledger.raw.ndjson');
const RESULTS_PATH = path.join(ROOT, 'm7-real-llm-ledger.core-results.ndjson');

function id(index: number): string { return `00000000-0000-4000-8000-0000000000${String(index + 40).padStart(2, '0')}`; }
function commitment(commitmentId: string, title: string, conversationId: string): any {
    return { id: commitmentId, entityType: 'commitment', title, description: null, status: 'accepted', type: 'task', priority: null,
        dueAt: '2026-09-29T20:00:00.000Z', proposedDueAt: null, expectedResult: null, resolvedAt: null,
        resolutionResult: null, rejectionReason: null, ownerUserId: ACTOR, assignedToUserId: null,
        counterpartyContactId: null, conversationId, messageId: null, createdAt: '2026-09-26T10:00:00.000Z',
        provenance: { sourceType: 'commitment', sourceId: commitmentId }, authorizedActorUserIds: [ACTOR] };
}
function rows(): any {
    return { commitments: [
        commitment('00000000-0000-4000-8000-000000000040', 'revisar el informe del cliente', id(0)),
        commitment('00000000-0000-4000-8000-000000000041', 'llamar por el despacho', id(1)),
    ], people: [
        { actorUserId: ACTOR, person: { kind: 'contact', id: '00000000-0000-4000-8000-000000000042', displayName: 'Paula' } },
        { actorUserId: ACTOR, person: { kind: 'user', id: '00000000-0000-4000-8000-000000000043', displayName: 'Pedro' } },
    ] };
}
function context(service: any, conversationId: string): any {
    const state = service.getSnapshot(ACTOR, conversationId);
    return { lifecycle: state?.lifecycle === 'idle' || !state ? 'none' : 'active', activeObjectiveType: state?.openObjective?.objectiveType ?? null,
        missingSlotType: state?.pendingClarification?.field ?? null, suspendedObjectiveType: null,
        referentHints: state?.referents?.map((item: any) => item.rawText).slice(-5) ?? [] };
}
function stable(result: any, telemetry: any, state: any): any {
    return { resultKind: result?.kind ?? null, planStatus: result?.kind === 'plan' ? result.plan?.status ?? null : null,
        disposition: telemetry?.core?.disposition ?? null, resolution: telemetry?.core?.resolution ?? null,
        planShape: telemetry?.core?.planShape ?? null, lifecycle: state?.lifecycle ?? null,
        turnSequence: state?.lastTurnSequence ?? 0, openObjectiveType: state?.openObjective?.objectiveType ?? null };
}
function stateSnapshot(state: any): any {
    return { lifecycle: state?.lifecycle ?? null, turnSequence: state?.lastTurnSequence ?? 0,
        openObjective: state?.openObjective ?? null, pendingClarification: state?.pendingClarification ?? null,
        referents: state?.referents ?? [] };
}

describe('M-7 real LLM ledger offline replay', () => {
    it('replays the ten persisted ledger turns twice without OpenAI or external side effects', async () => {
        const raw = fs.readFileSync(RAW_PATH, 'utf8').trim().split('\n').filter(Boolean).map(line => JSON.parse(line));
        const records = fs.readFileSync(RESULTS_PATH, 'utf8').trim().split('\n').filter(Boolean).map(line => JSON.parse(line));
        expect(raw).toHaveLength(10);
        expect(records).toHaveLength(10);
        expect(records.map((record: any) => `${record.conversationId}:${record.turnIndex}`)).toEqual(raw.map((record: any) => `${record.conversationId}:${record.turnIndex}`));
        expect(records.every((record: any) => record.normalizationError === null)).toBe(true);

        const { runAgentTurn } = await import('../src/services/agentTurn.service');
        const { DeterministicInputInterpreter } = await import('../src/services/agentInputInterpreter.service');
        const { DeterministicObjectiveInterpreter } = await import('../src/services/agentObjectiveInterpreter.service');
        const { AgentDialogueStateService, clearAgentDialogueStateForTests } = await import('../src/services/agentDialogueState.service');
        const { AgentSemanticV4HighFidelityReadOnlyResolver, createHighFidelityReadOnlyRepositoryForTest } = await import('../src/services/agentSemanticV4HighFidelityReadOnly.service');
        const repository = createHighFidelityReadOnlyRepositoryForTest(rows());

        async function replayPass() {
            clearAgentDialogueStateForTests();
            const replay: any[] = [];
            let externalSideEffects = 0;
            for (const conversationId of [...new Set(records.map((record: any) => record.conversationId))]) {
                const dialogueService = new AgentDialogueStateService();
                const resolver = new AgentSemanticV4HighFidelityReadOnlyResolver(repository);
                for (const record of records.filter((item: any) => item.conversationId === conversationId)) {
                    const telemetry: any[] = [];
                    const result = await runAgentTurn({ actorUserId: ACTOR, conversationId, channel: 'mobile_text', locale: 'es-CL', timezone: TIMEZONE, now: NOW, input: record.utterance }, {
                        dialogueService,
                        inputInterpreter: new DeterministicInputInterpreter(),
                        objectiveInterpreter: new DeterministicObjectiveInterpreter(),
                        precomputedSemanticV4: { semantic: record.semantic, diagnostics: record.diagnostics },
                        semanticV4CoreShadowResolver: resolver,
                        semanticV4CoreShadowObserver: value => telemetry.push(value),
                    });
                    const shadow = telemetry.at(-1);
                    expect(shadow?.failure ?? null).toBeNull();
                    if (shadow?.sideEffects?.toolsExecuted || shadow?.sideEffects?.persistenceWrites !== 0) externalSideEffects += 1;
                    const state = dialogueService.getSnapshot(ACTOR, conversationId);
                    replay.push({ conversationId, turnIndex: record.turnIndex, resultSnapshot: stable(result, shadow, state), stateSnapshot: stateSnapshot(state) });
                }
            }
            return { replay, externalSideEffects };
        }

        const first = await replayPass();
        const second = await replayPass();
        expect(first.replay.map(item => `${item.conversationId}:${item.turnIndex}`)).toEqual(records.map((record: any) => `${record.conversationId}:${record.turnIndex}`));
        expect(second.replay).toEqual(first.replay);
        expect(first.externalSideEffects).toBe(0);
        expect(second.externalSideEffects).toBe(0);
    });
});
