import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { CanonicalReadQuery } from '../src/types/agentReadQuery';

const countQuery: CanonicalReadQuery = {
    domain: 'commitment', cardinality: 'count', target: null,
    relationship: { kind: 'general_recall' },
    temporal: { role: 'none', value: null },
    authorizedScope: { personId: 'actor', sourceTypes: ['commitment'], statuses: ['accepted'] },
    evidenceRequirement: { relationship: { kind: 'general_recall' }, sourceTypes: ['commitment'] },
};

vi.mock('../src/services/retrieval.service', () => ({ countVisibleCommitments: vi.fn() }));

const { executeExactCommitmentCount } = await import('../src/services/agentExactCommitmentCount.service');
const { countVisibleCommitments } = await import('../src/services/retrieval.service');

describe('exact commitment count execution', () => {
    beforeEach(() => vi.mocked(countVisibleCommitments).mockReset());

    it('returns an exact complete count without RetrievalResult facts', async () => {
        vi.mocked(countVisibleCommitments).mockResolvedValue(4);
        const result = await executeExactCommitmentCount({ queryKey: 'q1', query: countQuery, actorUserId: 'actor' });
        expect(result).toMatchObject({ status: 'completed', completeness: 'complete', conclusion: 'count', count: { value: 4, universe: 'authorized_commitments', queryKey: 'q1' } });
        expect(result).not.toHaveProperty('facts');
        expect(countVisibleCommitments).toHaveBeenCalledWith(expect.objectContaining({ actorUserId: 'actor', personId: 'actor', statuses: ['accepted'] }));
    });

    it('preserves an exact zero and does not reinterpret it as failure', async () => {
        vi.mocked(countVisibleCommitments).mockResolvedValue(0);
        await expect(executeExactCommitmentCount({ queryKey: 'q-zero', query: countQuery, actorUserId: 'actor' })).resolves.toMatchObject({ conclusion: 'count', count: { value: 0 } });
    });

    it('returns failed rather than zero when the count operation cannot produce a valid PostgreSQL count', async () => {
        vi.mocked(countVisibleCommitments).mockResolvedValue(Number.NaN);
        await expect(executeExactCommitmentCount({ queryKey: 'q-fail', query: countQuery, actorUserId: 'actor' })).resolves.toMatchObject({ status: 'failed', retryable: true });
    });

    it.each([
        ['proposal_focus', { ...countQuery, relationship: { kind: 'proposal_focus', focus: 'waiting_for_others' } }],
        ['target', { ...countQuery, target: { kind: 'commitment', id: 'c1' } }],
        ['lifecycle', { ...countQuery, relationship: { kind: 'lifecycle_transition', transition: 'cancelled' } }],
        ['unsupported source', { ...countQuery, authorizedScope: { ...countQuery.authorizedScope, sourceTypes: ['commitment', 'message'] } }],
    ] as const)('returns unsupported for %s instead of dropping a restriction', async (_name, query) => {
        const result = await executeExactCommitmentCount({ queryKey: 'q-unsupported', query: query as CanonicalReadQuery, actorUserId: 'actor' });
        expect(result).toMatchObject({ status: 'unsupported' });
        expect(countVisibleCommitments).not.toHaveBeenCalled();
    });
});
