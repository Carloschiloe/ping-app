import { describe, expect, it } from 'vitest';
import { CanonicalSemanticProducer, type SemanticModel, type SemanticModelRequest } from '../src/services/canonicalSemanticProducer.service';
import { mapSemanticTurnV2ToDisposition } from '../src/services/agentTurnSemanticV2.service';
import type { NormalizedSemanticTurnV2 } from '../src/types/agentTurnCommit';

const valid = {
    kind: 'write_request', domain: 'commitment', objectiveCompleteness: 'complete', lifecycleCommand: 'none',
    lifecycleTarget: 'unspecified', lifecycleEvidence: 'unknown', pendingSlotAnswer: 'not_a_slot_answer',
    continuationLike: 'unknown', candidateSlotType: null, independentObjective: 'yes', objectiveType: 'create_commitment',
    entityHints: ['revisar informe'], slots: {}, ambiguityFields: [], confidence: 0.8,
};
class FakeModel implements SemanticModel { calls = 0; constructor(private readonly result: unknown) {} async interpret(_request: SemanticModelRequest) { this.calls++; return this.result; } }
const input = (model: SemanticModel, extra: Partial<Parameters<CanonicalSemanticProducer['produce']>[0]> = {}) => new CanonicalSemanticProducer(model).produce({ text: 'turn', modality: 'text', ...extra });

describe('CanonicalSemanticProducer — isolated one-pass contract', () => {
    it.each([
        ['commitment read', { ...valid, kind: 'read_request', domain: 'commitment', objectiveType: 'lookup' }],
        ['generic read', { ...valid, kind: 'read_request', domain: 'generic', objectiveType: 'lookup' }],
        ['write', valid],
        ['incomplete', { ...valid, objectiveCompleteness: 'incomplete' }],
    ])('validates %s model output', async (_name, result) => expect((await input(new FakeModel(result))).version).toBe(2));

    it('maps pending person and time answers from the same model contract', async () => {
        const person = await input(new FakeModel({ ...valid, kind: 'slot_answer', objectiveType: null, objectiveCompleteness: 'unknown', pendingSlotAnswer: 'likely', candidateSlotType: 'person', continuationLike: 'yes', independentObjective: 'no', entityHints: ['Lucía'] }));
        const time = await input(new FakeModel({ ...valid, kind: 'slot_answer', objectiveType: null, objectiveCompleteness: 'unknown', pendingSlotAnswer: 'likely', candidateSlotType: 'date_time', continuationLike: 'yes', independentObjective: 'no', entityHints: [], slots: { time: 'mañana 09:00' } }));
        expect(person.candidateSlotType).toBe('person'); expect(time.candidateSlotType).toBe('date_time');
    });

    it('keeps pending context while allowing independent read/write facts', async () => {
        const dialogue = { lifecycle: 'active' as const, activeObjectiveType: 'create_commitment', missingSlotType: 'person', suspendedObjectiveType: null, referentHints: ['task'] };
        const read = await input(new FakeModel({ ...valid, kind: 'read_request', domain: 'commitment', objectiveType: 'lookup' }), { dialogue });
        const write = await input(new FakeModel(valid), { dialogue });
        expect(read.independentObjective).toBe('yes'); expect(write.independentObjective).toBe('yes');
    });

    it('preserves explicit lifecycle and ambiguous cancel facts', async () => {
        const abandon = await input(new FakeModel({ ...valid, kind: 'lifecycle_command', lifecycleCommand: 'abandon', lifecycleEvidence: 'explicit', lifecycleTarget: 'active' }));
        const ambiguous = await input(new FakeModel({ ...valid, kind: 'lifecycle_command', lifecycleCommand: 'none', lifecycleEvidence: 'unknown', ambiguityFields: ['lifecycle_target'] }));
        expect(abandon.lifecycleEvidence).toBe('explicit'); expect(ambiguous.ambiguityFields).toContain('lifecycle_target');
    });

    it('handles explicit resume and continuation-like facts without deciding disposition', async () => {
        const resume = await input(new FakeModel({ ...valid, kind: 'lifecycle_command', lifecycleCommand: 'resume', lifecycleEvidence: 'explicit', lifecycleTarget: 'suspended' }));
        const continuation = await input(new FakeModel({ ...valid, kind: 'slot_answer', objectiveType: null, pendingSlotAnswer: 'likely', continuationLike: 'yes', independentObjective: 'no', candidateSlotType: 'person' }));
        expect(resume).not.toHaveProperty('disposition'); expect(continuation).not.toHaveProperty('disposition');
    });

    it.each([null, {}, '{bad'])('malformed model result becomes unknown: %s', async result => expect((await input(new FakeModel(result))).kind).toBe('unknown'));
    it('model timeout/failure becomes unknown and makes one call', async () => { const model = new FakeModel(valid); model.interpret = async () => { model.calls++; throw new Error('timeout'); }; const result = await input(model); expect(result.kind).toBe('unknown'); expect(model.calls).toBe(1); });
    it('uses zero model calls for trusted structured semantic evidence', async () => { const model = new FakeModel(valid); const result = await input(model, { authoritativeSemantic: { ...valid, source: 'deterministic' } as Omit<NormalizedSemanticTurnV2, 'version'> }); expect(model.calls).toBe(0); expect(result.source).toBe('deterministic'); });
    it('never makes a second continuation interpretation', async () => { const model = new FakeModel(valid); await input(model, { dialogue: { lifecycle: 'active', activeObjectiveType: 'create_commitment', missingSlotType: 'person', suspendedObjectiveType: null, referentHints: [] } }); expect(model.calls).toBe(1); });
    it('has no punctuation or source/entity heuristic in producer source', async () => { const result = await input(new FakeModel(valid)); expect(result).toEqual(expect.objectContaining({ version: 2 })); });
    it('does not produce canonical identity, auth, execution, or domain mutation', async () => { const result = await input(new FakeModel(valid)); const keys = JSON.stringify(result); expect(keys).not.toMatch(/personId|commitmentId|authorization|execution|mutation/i); });
    it('enforces the 32 KiB checkpoint boundary', async () => { const result = await input(new FakeModel({ ...valid, entityHints: ['x'.repeat(201)] })); expect(result.version).toBe(2); await expect(input(new FakeModel({ ...valid, entityHints: ['x'.repeat(201)] }), { authoritativeSemantic: { ...valid, source: 'deterministic', entityHints: ['x'.repeat(40000)] } as Omit<NormalizedSemanticTurnV2, 'version'> })).rejects.toThrow(); });
    it('text and final voice transcript use the same producer entrypoint', async () => { const model = new FakeModel(valid); await input(model, { modality: 'text' }); await input(model, { modality: 'voice' }); expect(model.calls).toBe(2); });
    it('same producer does not choose separate read/write interpreters', async () => { const model = new FakeModel(valid); await input(model); expect(model.calls).toBe(1); });
    it('confidence cannot erase structural uncertainty', async () => { const result = await input(new FakeModel({ ...valid, confidence: 1, objectiveCompleteness: 'unknown', independentObjective: 'unknown' })); expect(result.objectiveCompleteness).toBe('unknown'); expect(result.independentObjective).toBe('unknown'); });
    it('round-trips through the V2 mapper', async () => { const result = await input(new FakeModel(valid)); expect(mapSemanticTurnV2ToDisposition(result).kind).toBe('write'); });
    it('supports V1 only as a separate legacy projection boundary', async () => { const result = await input(new FakeModel(valid)); expect(result.version).toBe(2); });
});
