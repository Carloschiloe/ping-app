import { describe, expect, it } from 'vitest';
import { mapSemanticTurnV2ToDisposition, readSemanticCheckpoint } from '../src/services/agentTurnSemanticV2.service';
import type { NormalizedSemanticTurnV2 } from '../src/types/agentTurnCommit';

const base: NormalizedSemanticTurnV2 = {
    version: 2, kind: 'write_request', domain: 'commitment', objectiveCompleteness: 'complete',
    lifecycleCommand: 'none', lifecycleTarget: 'unspecified', lifecycleEvidence: 'unknown',
    pendingSlotAnswer: 'not_a_slot_answer', continuationLike: 'unknown', candidateSlotType: null,
    independentObjective: 'yes', objectiveType: 'create_commitment', entityHints: [], slots: {},
    ambiguityFields: [], confidence: 0.9, source: 'llm',
};

describe('M-7 Semantic Turn V2 contract', () => {
    it.each([
        ['read', { ...base, kind: 'read_request', domain: 'historical_read', objectiveType: 'lookup', objectiveCompleteness: 'complete' }],
        ['write', base], ['slot answer', { ...base, kind: 'slot_answer', objectiveType: null, objectiveCompleteness: 'unknown' }],
        ['unknown', { ...base, kind: 'unknown', objectiveType: null, objectiveCompleteness: 'unknown' }],
    ])('maps %s without policy fields', (_name, value) => expect(mapSemanticTurnV2ToDisposition(value as NormalizedSemanticTurnV2).kind).toBe(_name === 'read' ? 'read' : _name === 'write' ? 'write' : _name === 'slot answer' ? 'slot_answer' : 'unknown'));

    it('maps lifecycle facts and ambiguous target conservatively', () => {
        const result = mapSemanticTurnV2ToDisposition({ ...base, kind: 'lifecycle_command', lifecycleCommand: 'resume', lifecycleEvidence: 'explicit' });
        expect(result.lifecycleCommand).toBe('resume'); expect(result.lifecycleTarget).toBe('ambiguous'); expect(result.explicitLifecycleCommand).toBe(true);
    });
    it('maps explicit abandon for active and suspended targets', () => {
        for (const lifecycleTarget of ['active', 'suspended'] as const) expect(mapSemanticTurnV2ToDisposition({ ...base, kind: 'lifecycle_command', lifecycleCommand: 'abandon', lifecycleEvidence: 'explicit', lifecycleTarget }).lifecycleTarget).toBe(lifecycleTarget);
    });
    it('derives structural resume only from explicit semantic facts', () => {
        expect(mapSemanticTurnV2ToDisposition({ ...base, kind: 'slot_answer', objectiveType: null, continuationLike: 'yes', pendingSlotAnswer: 'likely', independentObjective: 'no', candidateSlotType: 'person' }).structurallyUnambiguousResume).toBe(true);
        expect(mapSemanticTurnV2ToDisposition({ ...base, kind: 'slot_answer', objectiveType: null, continuationLike: 'unknown', pendingSlotAnswer: 'likely', independentObjective: 'no', candidateSlotType: 'person' }).structurallyUnambiguousResume).toBe(false);
    });
    it.each(['unknown', 'incomplete'] as const)('does not claim incomplete objective is complete: %s', objectiveCompleteness => expect(mapSemanticTurnV2ToDisposition({ ...base, objectiveCompleteness }).objective?.complete).toBe(false));
    it('preserves slots and never creates canonical identity', () => { const x = mapSemanticTurnV2ToDisposition({ ...base, slots: { title: 'x' }, entityHints: ['hint'] }); expect(x.objective?.slots).toEqual({ title: 'x' }); expect(x.objective).not.toHaveProperty('personEntityId'); });
    it('rejects legacy/unsupported versions without reinterpretation', () => { expect(() => readSemanticCheckpoint(1, base)).toThrow('unsupported'); expect(() => readSemanticCheckpoint(3, base)).toThrow('unsupported'); });
    it('rejects malformed version 2', () => expect(() => readSemanticCheckpoint(2, { ...base, kind: 'not-real' })).toThrow('malformed'));
    it('does not expose a direct disposition field', () => expect(base).not.toHaveProperty('disposition'));
    it('contains no raw utterance, prompt, provider response, authorization, or execution fields', () => { const keys = Object.keys(base).join(' '); expect(keys).not.toMatch(/utterance|prompt|token|authorization|execution|response/i); });
    it('keeps unknown lifecycle evidence non-explicit', () => expect(mapSemanticTurnV2ToDisposition({ ...base, kind: 'lifecycle_command', lifecycleCommand: 'resume', lifecycleEvidence: 'unknown' }).explicitLifecycleCommand).toBe(false));
    it('keeps none lifecycle command null', () => expect(mapSemanticTurnV2ToDisposition(base).lifecycleCommand).toBeNull());
    it('does not infer objective from entity hints', () => expect(mapSemanticTurnV2ToDisposition({ ...base, kind: 'unknown', objectiveType: null, entityHints: ['someone'] }).objective).toBeNull());
    it('keeps null optional semantic values intact', () => expect(mapSemanticTurnV2ToDisposition({ ...base, objectiveType: null }).objective).toBeNull());
});
