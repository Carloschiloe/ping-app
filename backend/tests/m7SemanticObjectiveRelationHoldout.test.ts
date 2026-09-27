import { describe, expect, it } from 'vitest';
import {
    HOLDOUT_CASES_SHA256,
    loadHoldoutCases,
    evaluateHoldoutCase,
} from '../certification/m7-semantic-objective-relation-holdout';

describe('M7 semantic objective relation holdout', () => {
    it('loads the frozen holdout with its declared integrity', () => {
        const cases = loadHoldoutCases();
        expect(cases).toHaveLength(12);
        expect(HOLDOUT_CASES_SHA256).toBe('1258eb01aa9f2c945570a864e79912f845c08ff39e1c71f34fab9cae9ef363ac');
        expect(new Set(cases.map(testCase => testCase.id)).size).toBe(12);
    });

    it('evaluates a provider payload without invoking the provider', () => {
        const testCase = loadHoldoutCases()[0];
        const raw = JSON.stringify({ turn: {
            kind: 'slot_answer', domain: 'commitment', objectiveCompleteness: 'incomplete',
            lifecycleCommand: 'none', lifecycleTarget: 'unspecified', lifecycleEvidence: 'unknown',
            pendingSlotAnswer: 'likely', continuationLike: 'no', candidateSlotType: 'title',
            independentObjective: 'no', objectiveType: 'create_personal_commitment', entityHints: [],
            slots: [{ key: 'title', value: 'coordinar la inspección' }], ambiguityFields: [], confidence: 0.9,
            temporalFact: null, openObjectiveRelation: 'answers_pending_slot', readMeaning: null,
        } });
        const result = evaluateHoldoutCase(testCase, raw);
        expect(result.pass).toBe(true);
        expect(result.schemaInvalid).toBe(false);
        expect(result.failure).toBeNull();
    });
});
