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
const ROOT = path.resolve(process.env.M7_REAL_LLM_REPLAY_ARTIFACT_ROOT || path.join(process.cwd(), '.m7-smoke-artifacts', 'real-llm-multiturn-20260926-network-ok-v2'));
const RAW_PATH = path.join(ROOT, 'm7-real-llm-multiturn.raw.ndjson');
const RESULT_PATH = path.join(ROOT, 'm7-real-llm-multiturn.core-results.ndjson');

function conversationId(index: number): string { return `00000000-0000-4000-8000-0000000000${String(index + 10).padStart(2, '0')}`; }

function commitment(id: string, title: string, conversationIdValue: string): any {
    return { id, entityType: 'commitment', title, description: null, status: 'accepted', type: 'task', priority: null,
        dueAt: '2026-09-29T20:00:00.000Z', proposedDueAt: null, expectedResult: null, resolvedAt: null,
        resolutionResult: null, rejectionReason: null, ownerUserId: ACTOR, assignedToUserId: null,
        counterpartyContactId: null, conversationId: conversationIdValue, messageId: null,
        createdAt: '2026-09-26T10:00:00.000Z', provenance: { sourceType: 'commitment', sourceId: id }, authorizedActorUserIds: [ACTOR] };
}

function rows(): any {
    return {
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
    };
}

function dialogueContext(service: any, id: string): any {
    const state = service.getSnapshot(ACTOR, id);
    return { lifecycle: state?.lifecycle === 'idle' || !state ? 'none' : 'active', activeObjectiveType: state?.openObjective?.objectiveType ?? null,
        missingSlotType: state?.pendingClarification?.field ?? null, suspendedObjectiveType: null,
        referentHints: state?.referents?.map((item: any) => item.rawText).slice(-5) ?? [] };
}

function stableResult(result: any, telemetry: any, state: any): any {
    return { resultKind: result?.kind ?? null, planStatus: result?.kind === 'plan' ? result.plan?.status ?? null : null,
        responseStatus: result?.kind === 'response' ? result.response?.status ?? null : null,
        disposition: telemetry?.core?.disposition ?? null, resolution: telemetry?.core?.resolution ?? null,
        planShape: telemetry?.core?.planShape ?? null, lifecycle: state?.lifecycle ?? null,
        turnSequence: state?.lastTurnSequence ?? 0, openObjectiveType: state?.openObjective?.objectiveType ?? null };
}

describe('M-7 real LLM multi-turn offline replay', () => {
    it('replays the persisted 53 V4 outputs twice without OpenAI or side effects', async () => {
        const records = fs.readFileSync(RAW_PATH, 'utf8').trim().split('\n').filter(Boolean).map(line => JSON.parse(line));
        expect(records).toHaveLength(53);
        const { runAgentTurn } = await import('../src/services/agentTurn.service');
        const { DeterministicInputInterpreter } = await import('../src/services/agentInputInterpreter.service');
        const { DeterministicObjectiveInterpreter } = await import('../src/services/agentObjectiveInterpreter.service');
        const { AgentDialogueStateService, clearAgentDialogueStateForTests } = await import('../src/services/agentDialogueState.service');
        const { AgentSemanticV4HighFidelityReadOnlyResolver, createHighFidelityReadOnlyRepositoryForTest } = await import('../src/services/agentSemanticV4HighFidelityReadOnly.service');
        const repository = createHighFidelityReadOnlyRepositoryForTest(rows());
        const inputInterpreter = new DeterministicInputInterpreter();
        const objectiveInterpreter = new DeterministicObjectiveInterpreter();

        async function replayPass() {
            clearAgentDialogueStateForTests();
            const results: any[] = [];
            let sideEffects = 0;
            for (const id of [...new Set(records.map(record => record.conversationId))]) {
                const dialogueService = new AgentDialogueStateService();
                const resolver = new AgentSemanticV4HighFidelityReadOnlyResolver(repository);
                for (const record of records.filter(item => item.conversationId === id)) {
                    const telemetry: any[] = [];
                    const result = await runAgentTurn({ actorUserId: ACTOR, conversationId: id, channel: 'mobile_text', locale: 'es-CL', timezone: TIMEZONE, now: NOW, input: record.utterance }, {
                        dialogueService, inputInterpreter, objectiveInterpreter,
                        precomputedSemanticV4: { semantic: record.semantic, diagnostics: record.diagnostics },
                        semanticV4CoreShadowResolver: resolver, semanticV4CoreShadowObserver: value => telemetry.push(value),
                    });
                    const shadow = telemetry.at(-1);
                    expect(shadow?.failure ?? null).toBeNull();
                    if (shadow?.sideEffects?.toolsExecuted || shadow?.sideEffects?.persistenceWrites !== 0 || shadow?.sideEffects?.dialogueStateMutated) sideEffects += 1;
                    results.push({ key: `${record.conversationId}:${record.turnIndex}`, result: stableResult(result, shadow, dialogueService.getSnapshot(ACTOR, id)) });
                }
            }
            return { results, sideEffects };
        }

        const first = await replayPass();
        const second = await replayPass();
        expect(first.results).toEqual(second.results);
        expect(first.sideEffects).toBe(0);
        expect(second.sideEffects).toBe(0);
        if (fs.existsSync(RESULT_PATH)) {
            const stored = fs.readFileSync(RESULT_PATH, 'utf8').trim().split('\n').filter(Boolean).map(line => JSON.parse(line));
            expect(stored).toHaveLength(53);
            expect(first.results.map(item => item.result)).toEqual(stored.map(item => item.firstPass));
        }
    });
});
