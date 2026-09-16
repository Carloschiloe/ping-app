import { describe, expect, it, vi } from 'vitest';
import type { CanonicalReadQuery } from '../src/types/agentReadQuery';

const executeExactCommitmentCount = vi.fn();
vi.mock('../src/services/agentExactCommitmentCount.service', () => ({ executeExactCommitmentCount }));

const { executeReadExecution } = await import('../src/services/agentReadExecution.service');

const countQuery: CanonicalReadQuery = {
    domain: 'commitment', cardinality: 'count', target: null,
    relationship: { kind: 'general_recall' },
    temporal: { role: 'none', value: null },
    authorizedScope: { personId: 'actor', sourceTypes: ['commitment'], statuses: ['accepted'] },
    evidenceRequirement: { relationship: { kind: 'general_recall' }, sourceTypes: ['commitment'] },
};

describe('Core READ execution boundary', () => {
    it('dispatches canonical commitment count without rewriting the request', async () => {
        const delegated = { status: 'completed', queryKey: 'q1', completeness: 'complete', conclusion: 'count', count: { value: 4 } };
        executeExactCommitmentCount.mockResolvedValue(delegated);
        const input = { queryKey: 'q1', query: countQuery, actorUserId: 'actor' };
        await expect(executeReadExecution(input)).resolves.toBe(delegated);
        expect(executeExactCommitmentCount).toHaveBeenCalledWith(input);
    });

    it.each([
        ['commitment collection', { ...countQuery, cardinality: 'exhaustive_list' }],
        ['proposal count', { ...countQuery, domain: 'proposal' }],
    ] as const)('returns unsupported for %s without delegating to commitment count', async (_name, query) => {
        executeExactCommitmentCount.mockClear();
        await expect(executeReadExecution({ queryKey: 'q-unsupported', query: query as CanonicalReadQuery, actorUserId: 'actor' })).resolves.toMatchObject({ status: 'unsupported', queryKey: 'q-unsupported' });
        expect(executeExactCommitmentCount).not.toHaveBeenCalled();
    });
});
