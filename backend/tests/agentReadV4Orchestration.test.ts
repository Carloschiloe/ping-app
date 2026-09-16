import { describe, expect, it, vi } from 'vitest';
import type { NormalizedSemanticTurnV4 } from '../src/types/agentTurnCommit';
import type { CanonicalReadQuery } from '../src/types/agentReadQuery';

const executeReadExecution = vi.fn();
vi.mock('../src/services/agentReadExecution.service', () => ({ executeReadExecution }));

const { AgentReadV4OrchestrationService } = await import('../src/services/agentReadV4Orchestration.service');

const semantic = {
    version: 4, kind: 'read_request', domain: 'commitment', objectiveCompleteness: 'complete', lifecycleCommand: 'none', lifecycleTarget: 'unspecified', lifecycleEvidence: 'unknown', pendingSlotAnswer: 'not_a_slot_answer', continuationLike: 'unknown', candidateSlotType: null, independentObjective: 'yes', objectiveType: 'lookup', entityHints: [], slots: {}, ambiguityFields: [], confidence: .9, source: 'deterministic',
    readMeaning: { queryShape: 'count', explicitCollection: false, targetShape: 'none', relationship: { kind: 'general_recall' }, temporalRole: 'none' },
} as unknown as NormalizedSemanticTurnV4;

const temporal = { status: 'not_applicable' as const };

describe('READ V4 orchestration', () => {
    it('resolves, plans, and executes one canonical count without rewriting it', async () => {
        const result = { status: 'completed', queryKey: 'q1', completeness: 'complete', conclusion: 'count', count: { value: 2 } };
        executeReadExecution.mockResolvedValue(result);
        const authorizedScope = { personId: 'actor', sourceTypes: ['commitment'] as const };
        const response = await new AgentReadV4OrchestrationService().execute({ actorUserId: 'actor', queryKey: 'q1', semanticTurn: semantic, person: null, temporal, authorizedScope });
        expect(response).toMatchObject({ status: 'executed', query: { cardinality: 'count', target: null, authorizedScope }, result });
        expect(executeReadExecution).toHaveBeenCalledWith(expect.objectContaining({ actorUserId: 'actor', queryKey: 'q1', query: expect.objectContaining({ cardinality: 'count', authorizedScope }) }));
    });

    it('does not execute when planning returns a clarification or unsupported result', async () => {
        executeReadExecution.mockClear();
        const service = new AgentReadV4OrchestrationService();
        const ambiguous = { ...semantic, readMeaning: { ...semantic.readMeaning!, targetShape: 'person' } } as NormalizedSemanticTurnV4;
        const result = await service.execute({ actorUserId: 'actor', queryKey: 'q2', semanticTurn: ambiguous, person: { resolved: null, ambiguous: true, candidates: [{ id: 'u1', displayName: 'One', kind: 'user' }] }, temporal, authorizedScope: { personId: 'u1', sourceTypes: ['person'] } });
        expect(result.status).toBe('clarification_required');
        expect(executeReadExecution).not.toHaveBeenCalled();
    });
});
