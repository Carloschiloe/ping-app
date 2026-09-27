import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';

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

const ACTOR = '00000000-0000-4000-8000-000000000001';
const TIMEZONE = 'America/Santiago';
const NOW = new Date('2026-09-26T15:00:00.000Z');
const ROOT = path.resolve(process.env.M7_REAL_LLM_LEDGER_REPLAY_ARTIFACT_ROOT || path.join(process.cwd(), '.m7-smoke-artifacts', 'real-llm-ledger-20260926-v2'));

function commitment(commitmentId: string, title: string, conversationId: string): any {
    return { id: commitmentId, entityType: 'commitment', title, description: null, status: 'accepted', type: 'task', priority: null,
        dueAt: '2026-09-29T20:00:00.000Z', proposedDueAt: null, expectedResult: null, resolvedAt: null,
        resolutionResult: null, rejectionReason: null, ownerUserId: ACTOR, assignedToUserId: null,
        conversationId, messageId: null,
        createdAt: '2026-09-26T10:00:00.000Z', provenance: { sourceType: 'commitment', sourceId: commitmentId }, authorizedActorUserIds: [ACTOR] };
}
function rows(): any {
    return { commitments: [
        commitment('00000000-0000-4000-8000-000000000040', 'revisar el informe del cliente', '00000000-0000-4000-8000-000000000040'),
        commitment('00000000-0000-4000-8000-000000000041', 'llamar por el despacho', '00000000-0000-4000-8000-000000000041'),
    ], people: [
        { actorUserId: ACTOR, person: { kind: 'contact', id: '00000000-0000-4000-8000-000000000042', displayName: 'Paula' } },
        { actorUserId: ACTOR, person: { kind: 'user', id: '00000000-0000-4000-8000-000000000043', displayName: 'Pedro' } },
    ] };
}
function snapshot(state: any): any {
    return { lifecycle: state?.lifecycle ?? null, turnSequence: state?.lastTurnSequence ?? 0,
        openObjective: state?.openObjective ?? null, pendingClarification: state?.pendingClarification ?? null,
        referents: state?.referents ?? [] };
}
function stable(result: any, telemetry: any, state: any): any {
    return { resultKind: result?.kind ?? null, planStatus: result?.kind === 'plan' ? result.plan?.status ?? null : null,
        disposition: telemetry?.core?.disposition ?? null, resolution: telemetry?.core?.resolution ?? null,
        planShape: telemetry?.core?.planShape ?? null, lifecycle: state?.lifecycle ?? null,
        turnSequence: state?.lastTurnSequence ?? 0, openObjectiveType: state?.openObjective?.objectiveType ?? null };
}

describe('M-7 real LLM ledger forensic divergence', () => {
    it('locates the first persisted-vs-replay state divergence without OpenAI', async () => {
        const raw = fs.readFileSync(path.join(ROOT, 'm7-real-llm-ledger.raw.ndjson'), 'utf8').trim().split('\n').filter(Boolean).map(line => JSON.parse(line));
        const records = fs.readFileSync(path.join(ROOT, 'm7-real-llm-ledger.core-results.ndjson'), 'utf8').trim().split('\n').filter(Boolean).map(line => JSON.parse(line));
        expect(raw).toHaveLength(10);
        expect(records).toHaveLength(10);

        const { runAgentTurn } = await import('../src/services/agentTurn.service');
        const { DeterministicInputInterpreter } = await import('../src/services/agentInputInterpreter.service');
        const { DeterministicObjectiveInterpreter } = await import('../src/services/agentObjectiveInterpreter.service');
        const { AgentDialogueStateService, clearAgentDialogueStateForTests } = await import('../src/services/agentDialogueState.service');
        const { AgentSemanticV4HighFidelityReadOnlyResolver, createHighFidelityReadOnlyRepositoryForTest } = await import('../src/services/agentSemanticV4HighFidelityReadOnly.service');
        const repository = createHighFidelityReadOnlyRepositoryForTest(rows());
        clearAgentDialogueStateForTests();
        let firstDivergence: any = null;
        for (const conversationId of [...new Set(records.map((record: any) => record.conversationId))]) {
            const dialogueService = new AgentDialogueStateService();
            const resolver = new AgentSemanticV4HighFidelityReadOnlyResolver(repository);
            for (const record of records.filter((item: any) => item.conversationId === conversationId)) {
                const before = snapshot(dialogueService.getSnapshot(ACTOR, conversationId));
                const telemetry: any[] = [];
                const result = await runAgentTurn({ actorUserId: ACTOR, conversationId, channel: 'mobile_text', locale: 'es-CL', timezone: TIMEZONE, now: NOW, input: record.utterance }, {
                    dialogueService, inputInterpreter: new DeterministicInputInterpreter(), objectiveInterpreter: new DeterministicObjectiveInterpreter(),
                    precomputedSemanticV4: { semantic: record.semantic, diagnostics: record.diagnostics },
                    semanticV4CoreShadowResolver: resolver, semanticV4CoreShadowObserver: value => telemetry.push(value),
                });
                const afterState = dialogueService.getSnapshot(ACTOR, conversationId);
                const after = snapshot(afterState);
                const actualResult = stable(result, telemetry.at(-1), afterState);
                const expectedState = record.stateSnapshot;
                const expectedResult = record.resultSnapshot;
                const mismatch = JSON.stringify(after) !== JSON.stringify(expectedState) || JSON.stringify(actualResult) !== JSON.stringify(expectedResult);
                if (mismatch && !firstDivergence) {
                    firstDivergence = {
                        conversationId, turnIndex: record.turnIndex, utterance: record.utterance,
                        stateBefore: before, semanticV4Input: record.semantic,
                        objective: afterState?.openObjective ?? null, referent: afterState?.referents ?? [],
                        slots: record.semantic?.slots ?? null, temporalFact: record.semantic?.temporalFact ?? null,
                        ledgerBefore: before, mutation: { actualResult, shadow: telemetry.at(-1) ?? null }, ledgerAfter: after,
                        currentVersion: afterState?.version ?? afterState?.dialogueVersion ?? afterState?.lastAppliedTurnSequence ?? null,
                        pendingConfirmationTarget: afterState?.openObjective?.confirmationTarget ?? null,
                        persistedSnapshot: { resultSnapshot: expectedResult, stateSnapshot: expectedState },
                        expectedState, actualState: after,
                    };
                }
            }
        }
        expect(firstDivergence).toMatchObject({
            conversationId: '00000000-0000-4000-8000-000000000040',
            turnIndex: 3,
        });
        console.log(`M7_LEDGER_FIRST_DIVERGENCE ${JSON.stringify(firstDivergence)}`);
    });
});
