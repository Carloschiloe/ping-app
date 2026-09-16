import { describe, expect, it } from 'vitest';
import { assertReadExecutionResult } from '../src/types/agentReadExecution';
import type { RetrievalResult } from '../src/types/retrieval';

const emptyFacts: RetrievalResult = {
    query: null,
    scope: { actorUserId: 'actor', conversationId: null, personId: null, contactId: null },
    people: [], commitments: [], events: [], messages: [], transcriptions: [], attachments: [], provenance: [],
};

describe('M-7 READ execution contract', () => {
    it('allows no_matching_fact only for complete execution with no provenance', () => {
        expect(assertReadExecutionResult({ status: 'completed', queryKey: 'q1', completeness: 'complete', conclusion: 'no_matching_fact', facts: emptyFacts })).toMatchObject({ conclusion: 'no_matching_fact' });
        expect(() => assertReadExecutionResult({ status: 'completed', queryKey: 'q1', completeness: 'complete', conclusion: 'no_matching_fact', facts: { ...emptyFacts, provenance: [{ sourceType: 'message', sourceId: 'm1' }] } })).toThrow();
    });

    it('forbids definitive absence after partial or unknown execution', () => {
        expect(assertReadExecutionResult({ status: 'completed', queryKey: 'q1', completeness: 'partial', conclusion: 'inconclusive', facts: emptyFacts })).toMatchObject({ completeness: 'partial' });
        expect(() => assertReadExecutionResult({ status: 'completed', queryKey: 'q1', completeness: 'partial', conclusion: 'no_matching_fact', facts: emptyFacts } as any)).toThrow();
    });

    it('keeps unsupported and failed results free of facts', () => {
        expect(assertReadExecutionResult({ status: 'unsupported', queryKey: 'q1', reason: 'exact_count_unavailable' })).not.toHaveProperty('facts');
        expect(assertReadExecutionResult({ status: 'failed', queryKey: 'q1', retryable: true, reason: 'timeout' })).not.toHaveProperty('facts');
    });

    it('models a partial result as inconclusive even when Retrieval returned no rows', () => {
        const result = assertReadExecutionResult({ status: 'completed', queryKey: 'q1', completeness: 'unknown', conclusion: 'inconclusive', facts: emptyFacts });
        expect(result).toMatchObject({ completeness: 'unknown', conclusion: 'inconclusive' });
    });
});
