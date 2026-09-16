import { describe, expect, it } from 'vitest';
import { adaptAgentReadV4Result } from '../src/services/agentReadResultAdapter.service';
import { toAgentTurnReplayV2, toAgentTurnReplayV1 } from '../src/services/agentTurnCommit.service';
import type { CanonicalReadQuery } from '../src/types/agentReadQuery';
import type { ReadExecutionResult } from '../src/types/agentReadExecution';

const query: CanonicalReadQuery = {
    domain: 'commitment', cardinality: 'count', target: null,
    relationship: { kind: 'general_recall' },
    temporal: { role: 'none', value: null },
    authorizedScope: { sourceTypes: ['commitment'], statuses: ['accepted'], approvedTextQuery: 'canonical filter' },
    evidenceRequirement: { relationship: { kind: 'general_recall' }, sourceTypes: ['commitment'] },
};

const result = (value: number): ReadExecutionResult => ({
    status: 'completed', queryKey: 'q-count', completeness: 'complete', conclusion: 'count',
    count: {
        value, universe: 'authorized_commitments', queryKey: 'q-count',
        provenance: { kind: 'count_operation', operation: 'count_visible_commitments', queryKey: 'q-count' },
    },
});

describe('M-7 READ V4 result adapter', () => {
    it.each([0, 7])('preserves exact count %s and derives canonical audit bindings', (value) => {
        const adapted = adaptAgentReadV4Result({ actorUserId: 'actor-1', query, result: result(value) });
        expect(adapted).toMatchObject({
            kind: 'read',
            execution: { conclusion: 'count', count: { value, queryKey: 'q-count', universe: 'authorized_commitments' } },
        });
        expect(adapted.scopeFingerprint).toMatch(/^[a-f0-9]{64}$/);
        expect(adapted.constraintsFingerprint).toMatch(/^[a-f0-9]{64}$/);
        expect(JSON.stringify(adapted)).not.toContain('canonical filter');
    });

    it.each([
        { status: 'unsupported', queryKey: 'q-count', reason: 'constraint_not_supported' },
        { status: 'failed', queryKey: 'q-count', retryable: true, reason: 'timeout' },
        { status: 'completed', queryKey: 'q-count', completeness: 'unknown', conclusion: 'inconclusive', count: { observedValue: 2, universe: 'authorized_commitments', queryKey: 'q-count', provenance: { kind: 'count_operation', operation: 'count_visible_commitments', queryKey: 'q-count' } } },
    ] as ReadExecutionResult[])('preserves non-definitive result state: $status', (execution) => {
        expect(adaptAgentReadV4Result({ actorUserId: 'actor-1', query, result: execution }).execution).toEqual(execution);
    });

    it('round-trips through durable V2 and remains incompatible with V1', () => {
        const adapted = adaptAgentReadV4Result({ actorUserId: 'actor-1', query, result: result(0) });
        const replay = toAgentTurnReplayV2(adapted);
        expect(replay).toEqual({ kind: 'read', execution: adapted.execution, scopeFingerprint: adapted.scopeFingerprint, constraintsFingerprint: adapted.constraintsFingerprint });
        expect(() => toAgentTurnReplayV1(adapted)).toThrow(/version 2/);
    });

    it('changes bindings when canonical actor or constraints change without reinterpreting execution', () => {
        const first = adaptAgentReadV4Result({ actorUserId: 'actor-1', query, result: result(3) });
        const otherActor = adaptAgentReadV4Result({ actorUserId: 'actor-2', query, result: result(3) });
        const otherQuery = { ...query, cardinality: 'exhaustive_list' } as CanonicalReadQuery;
        const otherConstraints = adaptAgentReadV4Result({ actorUserId: 'actor-1', query: otherQuery, result: result(3) });
        expect(otherActor.scopeFingerprint).not.toBe(first.scopeFingerprint);
        expect(otherConstraints.constraintsFingerprint).not.toBe(first.constraintsFingerprint);
        expect(otherConstraints.execution).toEqual(first.execution);
    });
});
