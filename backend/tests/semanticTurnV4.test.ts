import { describe, expect, it, vi } from 'vitest';
import { CanonicalSemanticProducer } from '../src/services/canonicalSemanticProducer.service';
import { normalizeSemanticTurnV4 } from '../src/services/agentTurnSemanticV4.service';
import { AgentTurnCommitService } from '../src/services/agentTurnCommit.service';

const readMeaning = { queryShape: 'focused' as const, explicitCollection: false, targetShape: 'commitment' as const, relationship: { kind: 'lifecycle_transition' as const, transition: 'resolved' as const }, temporalRole: 'occurrence_time' as const };
const v4 = { kind: 'read_request' as const, domain: 'historical_read' as const, objectiveCompleteness: 'complete' as const, lifecycleCommand: 'none' as const, lifecycleTarget: 'unspecified' as const, lifecycleEvidence: 'unknown' as const, pendingSlotAnswer: 'not_a_slot_answer' as const, continuationLike: 'unknown' as const, candidateSlotType: null, independentObjective: 'yes' as const, objectiveType: 'lookup', entityHints: ['contrato'], slots: {}, ambiguityFields: [], confidence: .9, source: 'deterministic' as const, temporalFact: undefined, readMeaning };

describe('M-7 SemanticTurn V4 READ meaning', () => {
    it('preserves query meaning without canonical identity or evidence', () => {
        const normalized = normalizeSemanticTurnV4({ version: 4, ...v4 });
        expect(normalized.readMeaning).toEqual(readMeaning);
        expect(normalized).not.toHaveProperty('commitmentId');
        expect(normalized).not.toHaveProperty('provenance');
    });

    it('rejects read turns without read meaning and rejects malformed relationships', () => {
        expect(() => normalizeSemanticTurnV4({ version: 4, ...v4, readMeaning: null })).toThrow();
        expect(() => normalizeSemanticTurnV4({ version: 4, ...v4, readMeaning: { ...readMeaning, relationship: { kind: 'lifecycle_transition', transition: 'invented' } } as any })).toThrow();
    });

    it('uses one model interpretation and authoritative structured input uses zero calls', async () => {
        const { source: _source, temporalFact: _temporalFact, ...modelPayload } = v4;
        const model = { modelName: 'test', interpret: vi.fn().mockResolvedValue(modelPayload) };
        const producer = new CanonicalSemanticProducer(model);
        const produced = await producer.produceV4({ text: 'ignored', modality: 'text' });
        expect(model.interpret).toHaveBeenCalledTimes(1);
        expect(produced.readMeaning).toEqual(readMeaning);
        model.interpret.mockClear();
        await producer.produceV4({ text: 'ignored', modality: 'text', authoritativeSemanticV4: v4 });
        expect(model.interpret).not.toHaveBeenCalled();
    });

    it('keeps older semantic versions distinct; malformed V4 fails conservatively', async () => {
        const { source: _source, temporalFact: _temporalFact, ...modelPayload } = v4;
        const model = { modelName: 'test', interpret: vi.fn().mockResolvedValue({ ...modelPayload, readMeaning: { ...readMeaning, queryShape: 'invalid' } }) };
        const produced = await new CanonicalSemanticProducer(model).produceV4({ text: 'x', modality: 'text' });
        expect(produced.version).toBe(4);
        expect(produced.kind).toBe('unknown');
        expect(() => normalizeSemanticTurnV4({ ...v4, version: 3, readMeaning } as any)).toThrow();
    });

    it('saves and loads V4 through the existing versioned checkpoint RPC without upgrading older versions', async () => {
        const rpc = vi.fn().mockResolvedValue({ data: { semantic_turn: { version: 4, ...v4 } }, error: null });
        const tableClient = { from: () => ({ select: () => ({ eq: function(this: any) { return this; }, maybeSingle: async () => ({ data: { actor_user_id: 'actor', dialogue_scope_key: 'scope', turn_sequence: 3, semantic_version: 4, semantic_fingerprint: 'fp', semantic_turn: { version: 4, ...v4 } }, error: null }) }) }) };
        const service = new AgentTurnCommitService({ rpc }, tableClient);
        await service.saveSemanticCheckpointV4({ turnId: 'turn', actorUserId: 'actor', dialogueScopeKey: 'scope', turnSequence: 3, semanticTurn: { version: 4, ...v4 } });
        const loaded = await service.loadSemanticCheckpointV4({ turnId: 'turn', actorUserId: 'actor', dialogueScopeKey: 'scope', turnSequence: 3 });
        expect(loaded).toMatchObject({ status: 'found', version: 4, semanticTurn: { readMeaning } });
        expect(rpc).toHaveBeenCalledWith('save_agent_turn_semantic_checkpoint', expect.objectContaining({ p_semantic_version: 4 }));
    });
});
