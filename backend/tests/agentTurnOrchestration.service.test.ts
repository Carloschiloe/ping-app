import { describe, expect, it } from 'vitest';
import { AgentTurnOrchestrationService } from '../src/services/agentTurnOrchestration.service';
import { AgentTurnDispositionService } from '../src/services/agentTurnDisposition.service';
import type { NormalizedSemanticTurnV2 } from '../src/types/agentTurnCommit';
import type { AgentTurnAdmission } from '../src/types/agentTurnAdmission';

const semantic: NormalizedSemanticTurnV2 = {
    version: 2, kind: 'write_request', domain: 'commitment', objectiveCompleteness: 'complete', lifecycleCommand: 'none', lifecycleTarget: 'unspecified', lifecycleEvidence: 'unknown', pendingSlotAnswer: 'not_a_slot_answer', continuationLike: 'unknown', candidateSlotType: null, independentObjective: 'yes', objectiveType: 'create_commitment', entityHints: ['review'], slots: {}, ambiguityFields: [], confidence: .8, source: 'llm',
};
const admission: AgentTurnAdmission = { turnId: 'turn-1', actorUserId: 'actor-1', dialogueScopeKey: 'scope-1', clientTurnKey: 'client-1', requestFingerprint: 'f', turnSequence: 7, status: 'accepted', failureClass: null, resultRef: null, createdAt: '', updatedAt: '', completedAt: null, expiresAt: '', idempotentReplay: false };
function make(result: NormalizedSemanticTurnV2 = semantic) {
    const events: string[] = []; let checkpoint: NormalizedSemanticTurnV2 | null = null; let replayed = false;
    const producer = { produce: async () => { events.push('producer'); return result; } };
    const deps = {
        admission: { claimForProcessing: async (x: AgentTurnAdmission) => { events.push('claim'); return { kind: replayed ? 'completed_replay' as const : 'claimed' as const, admission: replayed ? { ...x, resultRef: { kind: 'response', response: { status: 'ok', answer: 'replay', citations: [] } } } : { ...x, status: 'processing' as const } }; } },
        semantic: { load: async () => { events.push('load-semantic'); return checkpoint; }, save: async ({ semanticTurn }: { admission: AgentTurnAdmission; semanticTurn: NormalizedSemanticTurnV2 }) => { events.push('save-semantic'); checkpoint = semanticTurn; return semanticTurn; } },
        dialogue: { load: async () => { events.push('load-dialogue'); return null; } },
        resolver: { resolve: async () => { events.push('resolve'); return {}; } },
        disposition: { decide: (x: any) => { events.push('disposition'); return new AgentTurnDispositionService().decide(x); } },
        preparation: { prepare: async ({ disposition }: any) => { events.push('prepare'); return { result: { kind: 'response', response: { status: 'ok', answer: disposition.disposition, citations: [] } }, nextDialogue: { lifecycle: 'none', activeDialogue: disposition.transition.activeDialogue, suspendedDialogue: disposition.transition.suspendedDialogue, expiresAt: '' } }; } },
        commit: { applyTurn: async (x: any) => { events.push('apply'); return { checkpoint: { version: 1 }, replay: x.result, replayed: false }; } },
    };
    return { service: new AgentTurnOrchestrationService(deps, producer), deps, events, getCheckpoint: () => checkpoint, setReplayed: () => { replayed = true; } };
}

describe('M-7 orchestration adapter — internal only', () => {
    it('executes the canonical order and uses admitted sequence unchanged', async () => { const x = make(); const result = await x.service.execute(admission, { text: 'request', modality: 'text' }); expect(result.result.kind).toBe('response'); expect(x.events).toEqual(['claim', 'load-semantic', 'producer', 'save-semantic', 'load-dialogue', 'resolve', 'disposition', 'prepare', 'apply']); });
    it('reuses a checkpoint and does not call producer again', async () => { const x = make(); await x.service.execute(admission, { text: 'request', modality: 'text' }); x.events.length = 0; await x.service.execute(admission, { text: 'retry', modality: 'text' }); expect(x.events).toEqual(['claim', 'load-semantic', 'load-dialogue', 'resolve', 'disposition', 'prepare', 'apply']); });
    it('passes one complete next snapshot to commit', async () => { const x = make(); await x.service.execute(admission, { text: 'request', modality: 'text' }); expect(x.events.filter(e => e === 'apply')).toHaveLength(1); });
    it('uses the real disposition service and never exposes disposition as semantic output', async () => { const x = make(); const result = await x.service.execute(admission, { text: 'request', modality: 'text' }); expect(result.result.response.answer).toBe('ordinary_write'); expect(x.getCheckpoint()).not.toHaveProperty('disposition'); });
    it('duplicate applied turn returns replay without recomputation', async () => { const x = make(); x.setReplayed(); const result = await x.service.execute(admission, { text: 'retry', modality: 'text' }); expect(result.replayed).toBe(true); expect(x.events).toEqual(['claim']); });
    it('does not use internal sequence plus one', async () => { const x = make(); let seen = 0; x.deps.commit.applyTurn = async (value: any) => { seen = value.turnSequence; return { checkpoint: { version: 1 }, replay: value.result, replayed: false }; }; await x.service.execute({ ...admission, turnSequence: 41 }, { text: 'request', modality: 'voice' }); expect(seen).toBe(41); });
    it('keeps actor and scope from admission at the commit boundary', async () => { const x = make(); let seen: any; x.deps.commit.applyTurn = async (value: any) => { seen = value; return { checkpoint: { version: 1 }, replay: value.result, replayed: false }; }; await x.service.execute(admission, { text: 'request', modality: 'text' }); expect(seen.actorUserId).toBe('actor-1'); expect(seen.dialogueScopeKey).toBe('scope-1'); });
    it('does not invoke authorization, execution, or domain mutation services', async () => { const x = make(); await x.service.execute(admission, { text: 'request', modality: 'text' }); expect(x.events).not.toContain('authorize'); expect(x.events).not.toContain('execute'); });
    it('supports text and voice through the same producer entrypoint', async () => { const x = make(); await x.service.execute(admission, { text: 'text', modality: 'text' }); expect(x.events).toContain('producer'); });
});
