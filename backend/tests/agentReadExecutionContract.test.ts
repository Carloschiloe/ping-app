import { describe, expect, it } from 'vitest';
import { assertReadExecutionResult } from '../src/types/agentReadExecution';
import type { RetrievalResult } from '../src/types/retrieval';

const emptyFacts: RetrievalResult = {
    query: null,
    scope: { actorUserId: 'actor', conversationId: null, personId: null, contactId: null },
    people: [], commitments: [], events: [], messages: [], transcriptions: [], attachments: [], provenance: [],
};

describe('M-7 READ execution contract', () => {
    const countProvenance = { kind: 'count_operation' as const, operation: 'count_authorized_commitments', queryKey: 'q-count' };

    it('represents exact zero and positive counts separately from RetrievalResult', () => {
        const zero = assertReadExecutionResult({ status: 'completed', queryKey: 'q-count', completeness: 'complete', conclusion: 'count', count: { value: 0, universe: 'authorized_commitments', queryKey: 'q-count', provenance: countProvenance } });
        const positive = assertReadExecutionResult({ status: 'completed', queryKey: 'q-count', completeness: 'complete', conclusion: 'count', count: { value: 3, universe: 'authorized_commitments', queryKey: 'q-count', provenance: countProvenance } });
        expect(zero).toMatchObject({ conclusion: 'count', count: { value: 0 } });
        expect(positive).toMatchObject({ conclusion: 'count', count: { value: 3 } });
        expect(zero).not.toHaveProperty('facts');
        expect(positive).not.toHaveProperty('facts');
    });

    it('rejects negative, fractional, or query-unbound exact counts', () => {
        const valid = { status: 'completed' as const, queryKey: 'q-count', completeness: 'complete' as const, conclusion: 'count' as const, count: { value: 1, universe: 'authorized_commitments' as const, queryKey: 'q-count', provenance: countProvenance } };
        expect(() => assertReadExecutionResult({ ...valid, count: { ...valid.count, value: -1 } })).toThrow();
        expect(() => assertReadExecutionResult({ ...valid, count: { ...valid.count, value: 1.5 } })).toThrow();
        expect(() => assertReadExecutionResult({ ...valid, count: { ...valid.count, queryKey: 'other' } })).toThrow();
    });

    it('represents partial or unknown counts as inconclusive, never as zero', () => {
        const result = assertReadExecutionResult({ status: 'completed', queryKey: 'q-count', completeness: 'partial', conclusion: 'inconclusive', count: { observedValue: 0, universe: 'authorized_commitments', queryKey: 'q-count', provenance: countProvenance } });
        expect(result).toMatchObject({ completeness: 'partial', conclusion: 'inconclusive', count: { observedValue: 0 } });
        expect(result).not.toMatchObject({ conclusion: 'count' });
    });

    it('rejects runtime-shaped count results that also carry facts', () => {
        expect(() => assertReadExecutionResult({ status: 'completed', queryKey: 'q-count', completeness: 'complete', conclusion: 'count', count: { value: 2, universe: 'authorized_commitments', queryKey: 'q-count', provenance: countProvenance }, facts: emptyFacts } as any)).toThrow();
    });

    it('keeps unsupported and failed count executions free of facts and count values', () => {
        expect(assertReadExecutionResult({ status: 'unsupported', queryKey: 'q-count', reason: 'exact_count_unavailable' })).not.toHaveProperty('count');
        expect(assertReadExecutionResult({ status: 'failed', queryKey: 'q-count', retryable: true, reason: 'timeout' })).not.toHaveProperty('count');
    });

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
