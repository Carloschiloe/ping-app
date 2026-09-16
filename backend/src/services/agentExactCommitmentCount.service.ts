import { countVisibleCommitments } from './retrieval.service';
import { assertReadExecutionResult, type ReadExecutionResult } from '../types/agentReadExecution';
import type { ReadExecutionRequest } from '../types/agentReadExecution';
import type { CanonicalReadQuery } from '../types/agentReadQuery';
import type { CanonicalCommitmentStatus } from '../utils/commitmentStatus';

const canonicalStatuses = new Set<CanonicalCommitmentStatus>(['proposed', 'accepted', 'counter_proposal', 'rejected', 'resolved', 'cancelled']);

export type ExactCommitmentCountInput = ReadExecutionRequest & { actorUserId: string };

function unsupported(queryKey: string, reason: string): ReadExecutionResult {
    return { status: 'unsupported', queryKey, reason };
}

function supportedQuery(query: CanonicalReadQuery): string | null {
    if (query.domain !== 'commitment') return 'commitment_count_domain_unsupported';
    if (query.cardinality !== 'count') return 'count_cardinality_required';
    if (query.target !== null) return 'count_target_unsupported';
    if (query.relationship.kind !== 'general_recall' && query.relationship.kind !== 'current_state') return 'count_relationship_unsupported';
    if (query.evidenceRequirement.sourceTypes.length !== 1 || query.evidenceRequirement.sourceTypes[0] !== 'commitment') return 'count_source_scope_unsupported';
    if (query.authorizedScope.sourceTypes?.some(sourceType => sourceType !== 'commitment')) return 'count_source_scope_unsupported';
    if (query.temporal.role !== 'none' && query.temporal.role !== 'filter_range') return 'count_temporal_role_unsupported';
    if (query.temporal.role === 'filter_range' && (!query.temporal.value || !query.authorizedScope.timeRange)) return 'count_temporal_range_missing';
    if (query.temporal.role === 'filter_range' && query.temporal.value && !['civil_date', 'civil_datetime'].includes(query.temporal.value.kind)) return 'count_temporal_range_unsupported';
    if (query.authorizedScope.statuses?.some(status => !canonicalStatuses.has(status as CanonicalCommitmentStatus))) return 'count_status_filter_unsupported';
    return null;
}

function safeRetrievalInput(input: ExactCommitmentCountInput): Parameters<typeof countVisibleCommitments>[0] {
    const query = input.query;
    return {
        actorUserId: input.actorUserId,
        conversationId: query.authorizedScope.conversationId,
        personId: query.authorizedScope.personId,
        contactId: query.authorizedScope.contactId,
        query: query.authorizedScope.approvedTextQuery,
        timeRange: query.authorizedScope.timeRange,
        statuses: query.authorizedScope.statuses as CanonicalCommitmentStatus[] | undefined,
    };
}

export async function executeExactCommitmentCount(input: ExactCommitmentCountInput): Promise<ReadExecutionResult> {
    if (!input.queryKey.trim()) return unsupported(input.queryKey, 'query_key_required');
    if (!input.actorUserId.trim()) return unsupported(input.queryKey, 'actor_required');
    const reason = supportedQuery(input.query);
    if (reason) return unsupported(input.queryKey, reason);
    try {
        const value = await countVisibleCommitments(safeRetrievalInput(input));
        return assertReadExecutionResult({
            status: 'completed',
            queryKey: input.queryKey,
            completeness: 'complete',
            conclusion: 'count',
            count: {
                value,
                universe: 'authorized_commitments',
                queryKey: input.queryKey,
                provenance: { kind: 'count_operation', operation: 'count_visible_commitments', queryKey: input.queryKey },
            },
        });
    } catch {
        return { status: 'failed', queryKey: input.queryKey, retryable: true, reason: 'commitment_count_failed' };
    }
}
