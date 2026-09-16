import { describe, expect, it, vi } from 'vitest';
import { AgentReadV4DurableOrchestrationService } from '../src/services/agentReadV4DurableOrchestration.service';
import type { AgentTurnAdmission } from '../src/types/agentTurnAdmission';
import type { NormalizedSemanticTurnV4 } from '../src/types/agentTurnCommit';
import type { ReadExecutionResult } from '../src/types/agentReadExecution';

const admission: AgentTurnAdmission = { turnId: 'turn-1', actorUserId: 'actor-1', dialogueScopeKey: 'scope-1', clientTurnKey: 'client-1', requestFingerprint: 'f'.repeat(64), turnSequence: 4, status: 'accepted', failureClass: null, resultRef: null, createdAt: '', updatedAt: '', completedAt: null, expiresAt: '2030-01-01T00:00:00Z', idempotentReplay: false };
const semantic = { version: 4, kind: 'read_request', domain: 'commitment', objectiveCompleteness: 'complete', lifecycleCommand: 'none', lifecycleTarget: 'unspecified', lifecycleEvidence: 'unknown', pendingSlotAnswer: 'not_a_slot_answer', continuationLike: 'unknown', candidateSlotType: null, independentObjective: 'yes', objectiveType: 'lookup', entityHints: [], slots: {}, ambiguityFields: [], confidence: 1, source: 'deterministic', readMeaning: { queryShape: 'count', explicitCollection: false, targetShape: 'none', relationship: { kind: 'general_recall' }, temporalRole: 'none' } } as NormalizedSemanticTurnV4;
const execution: ReadExecutionResult = { status: 'completed', queryKey: 'q', completeness: 'complete', conclusion: 'count', count: { value: 0, universe: 'authorized_commitments', queryKey: 'q', provenance: { kind: 'count_operation', operation: 'count_visible_commitments', queryKey: 'q' } } };
const readQuery = { domain: 'commitment', cardinality: 'count', target: null, relationship: { kind: 'general_recall' }, temporal: { role: 'none', value: null }, authorizedScope: { sourceTypes: ['commitment'] }, evidenceRequirement: { relationship: { kind: 'general_recall' }, sourceTypes: ['commitment'] } } as any;
const baseInput = { admission, semanticInput: { text: 'ignored', modality: 'text' as const, authoritativeSemanticV4: semantic }, queryKey: 'q', person: null, temporal: { status: 'not_applicable' as const }, authorizedScope: { sourceTypes: ['commitment'] as any } };

function make(overrides: Record<string, any> = {}) {
    const events: string[] = [];
    const deps = {
        admission: { claimForProcessing: vi.fn(async (value: AgentTurnAdmission) => { events.push('claim'); return { kind: 'claimed' as const, admission: { ...value, status: 'processing' as const } }; }) },
        semantic: { loadSemanticCheckpointV4: vi.fn(async () => { events.push('load-semantic'); return { status: 'not_found' as const }; }), saveSemanticCheckpointV4: vi.fn(async ({ semanticTurn }: any) => { events.push('save-semantic'); return semanticTurn; }) },
        dialogue: { loadDialogueCheckpoint: vi.fn(async () => { events.push('load-dialogue'); return { status: 'not_found' as const }; }) },
        read: { execute: vi.fn(async () => { events.push('read'); return { status: 'executed' as const, query: readQuery, result: execution }; }) },
        adapt: vi.fn(() => { events.push('adapt'); return { kind: 'read' as const, execution, scopeFingerprint: 'a'.repeat(64), constraintsFingerprint: 'b'.repeat(64) }; }),
        commit: { applyTurn: vi.fn(async (value: any) => { events.push('commit'); return { checkpoint: {}, replay: value.result, replayed: false }; }), reconcileApplication: vi.fn(async () => ({ status: 'not_applied' as const, resultRef: null })) },
        ...overrides,
    };
    return { service: new AgentReadV4DurableOrchestrationService(deps as any, { produceV4: vi.fn(async () => { events.push('produce'); return semantic; }) }), deps, events };
}

describe('M-7 isolated durable READ V4 orchestration', () => {
    it('runs admission, V4 checkpoint, READ, adapter and atomic commit in order', async () => {
        const x = make();
        const output = await x.service.execute(baseInput);
        expect(output.result.kind).toBe('read');
        expect(x.events).toEqual(['claim', 'load-dialogue', 'load-semantic', 'produce', 'save-semantic', 'read', 'adapt', 'commit']);
    });

    it('does not produce semantic meaning again when V4 checkpoint exists', async () => {
        const x = make();
        x.deps.semantic.loadSemanticCheckpointV4.mockResolvedValue({ status: 'found', semanticTurn: semantic, turnSequence: 4, fingerprint: 'f'.repeat(64), version: 4 });
        await x.service.execute(baseInput);
        expect(x.events).not.toContain('produce');
        expect(x.events).not.toContain('save-semantic');
    });

    it('replays a completed turn without invoking READ execution', async () => {
        const x = make({ admission: { claimForProcessing: vi.fn(async () => ({ kind: 'completed_replay' as const, admission: { ...admission, status: 'completed' as const, resultRef: { kind: 'read', execution, scopeFingerprint: 'a'.repeat(64), constraintsFingerprint: 'b'.repeat(64) } } })) } });
        const output = await x.service.execute(baseInput);
        expect(output.replayed).toBe(true);
        expect(x.deps.read.execute).not.toHaveBeenCalled();
        expect(x.events).toEqual([]);
    });

    it('reconciles an uncertain commit and never returns uncommitted success', async () => {
        const x = make({ commit: { applyTurn: vi.fn(async () => { throw new Error('connection lost'); }), reconcileApplication: vi.fn(async () => ({ status: 'retryable_recovery' as const, resultRef: { kind: 'reconciliation_retryable' } })) } });
        await expect(x.service.execute(baseInput)).rejects.toThrow('connection lost');
        expect(x.deps.commit.reconcileApplication).toHaveBeenCalledOnce();
    });

    it('returns the canonical replay when reconciliation proves the commit completed', async () => {
        const replay = { kind: 'read', execution, scopeFingerprint: 'a'.repeat(64), constraintsFingerprint: 'b'.repeat(64) };
        const x = make({ commit: { applyTurn: vi.fn(async () => { throw new Error('ambiguous transport'); }), reconcileApplication: vi.fn(async () => ({ status: 'committed' as const, resultRef: replay })) } });
        const output = await x.service.execute(baseInput);
        expect(output).toMatchObject({ committed: true, replayed: true, result: replay });
    });
});
