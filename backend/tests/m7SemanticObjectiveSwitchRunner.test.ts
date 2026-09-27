import { describe, expect, it } from 'vitest';
import { evaluateSemanticObjectiveCase, type CaseDefinition } from '../certification/m7-semantic-objective-switch-validation';

const common = {
    domain: 'commitment',
    objectiveCompleteness: 'complete',
    lifecycleCommand: 'none',
    lifecycleTarget: 'unspecified',
    lifecycleEvidence: 'unknown',
    pendingSlotAnswer: 'not_a_slot_answer',
    continuationLike: 'no',
    candidateSlotType: null,
    independentObjective: 'yes',
    objectiveType: 'review_commitments',
    entityHints: [],
    slots: [],
    ambiguityFields: [],
    confidence: 0.9,
    temporalFact: null,
};

const testCase = (id: string, expected: CaseDefinition['expected']): CaseDefinition => ({
    id,
    utterance: `prueba ${id}`,
    dialogue: null,
    expected,
    purpose: 'runner continuation regression',
});

function raw(kind: 'read_request' | 'write_request', relation: string): string {
    return JSON.stringify({
        turn: {
            ...common,
            kind,
            openObjectiveRelation: relation,
            readMeaning: kind === 'read_request' ? {
                queryShape: 'focused', explicitCollection: false, targetShape: 'commitment',
                relationship: { kind: 'general_recall' }, temporalRole: 'none', commitmentStatus: null,
            } : null,
        },
    });
}

describe('Semantic objective switch certification runner', () => {
    it('records an invalid case and still evaluates the following case', () => {
        const invalid = evaluateSemanticObjectiveCase(testCase('N', ['unrelated']), raw('read_request', 'replaces'));
        const following = evaluateSemanticObjectiveCase(testCase('N+1', ['replaces']), raw('write_request', 'replaces'));

        expect(invalid.pass).toBe(false);
        expect(invalid.schemaInvalid).toBe(true);
        expect(invalid.failure).toBe('normalization_error');
        expect(following.pass).toBe(true);
        expect(following.schemaInvalid).toBe(false);
    });
});
