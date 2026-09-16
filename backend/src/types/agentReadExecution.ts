import type { CanonicalReadQuery } from './agentReadQuery';
import type { RetrievalResult } from './retrieval';

export type ReadExecutionCapability =
    | 'commitment_by_id'
    | 'commitment_collection'
    | 'commitment_count'
    | 'proposal_by_id'
    | 'proposal_collection'
    | 'proposal_count'
    | 'proposal_focus'
    | 'commitment_event_by_type'
    | 'person_by_id'
    | 'conversation_validation'
    | 'message_by_id'
    | 'message_collection'
    | 'attachment_by_id'
    | 'attachment_collection'
    | 'transcription_by_id'
    | 'transcription_collection'
    | 'temporal_filter_range'
    | 'temporal_occurrence'
    | 'temporal_elapsed_or_duration'
    | 'approved_text_search';

export type ReadExecutionCompleteness = 'complete' | 'partial' | 'unknown';

export type ReadExecutionOperation = {
    capability: ReadExecutionCapability;
    preserves: ReadonlyArray<'cardinality' | 'target' | 'relationship' | 'temporal' | 'scope' | 'provenance'>;
};

export interface ReadExecutionRequest {
    queryKey: string;
    query: CanonicalReadQuery;
}

export interface ReadExecutionPlan {
    queryKey: string;
    operations: ReadonlyArray<ReadExecutionOperation>;
    expectedCompleteness: 'complete' | 'may_be_partial';
}

export interface ReadCountProvenance {
    kind: 'count_operation';
    operation: string;
    queryKey: string;
}

export interface ExactReadCount {
    value: number;
    universe: 'authorized_commitments';
    queryKey: string;
    provenance: ReadCountProvenance;
}

export interface InconclusiveReadCount {
    observedValue?: number;
    universe: 'authorized_commitments';
    queryKey: string;
    provenance: ReadCountProvenance;
}

export type ReadExecutionResult =
    | {
        status: 'completed';
        queryKey: string;
        completeness: 'complete';
        conclusion: 'facts' | 'no_matching_fact';
        facts: RetrievalResult;
    }
    | {
        status: 'completed';
        queryKey: string;
        completeness: 'complete';
        conclusion: 'count';
        count: ExactReadCount;
    }
    | {
        status: 'completed';
        queryKey: string;
        completeness: 'partial' | 'unknown';
        conclusion: 'inconclusive';
        facts: RetrievalResult;
        count?: never;
        continuation?: { cursor: string };
    }
    | {
        status: 'completed';
        queryKey: string;
        completeness: 'partial' | 'unknown';
        conclusion: 'inconclusive';
        count: InconclusiveReadCount;
        facts?: never;
        continuation?: { cursor: string };
    }
    | {
        status: 'unsupported';
        queryKey: string;
        reason: string;
    }
    | {
        status: 'failed';
        queryKey: string;
        retryable: boolean;
        reason: string;
    };

export function assertReadExecutionResult(result: ReadExecutionResult): ReadExecutionResult {
    if (result.status === 'unsupported' || result.status === 'failed') return result;
    if (result.conclusion === 'count') {
        if ('facts' in result) throw new Error('count results cannot contain RetrievalResult facts');
        if (!Number.isInteger(result.count.value) || result.count.value < 0) throw new Error('exact count must be a non-negative integer');
        if (result.count.queryKey !== result.queryKey) throw new Error('count provenance must bind to the executed query');
        if (result.count.provenance.kind !== 'count_operation' || result.count.provenance.queryKey !== result.queryKey) throw new Error('count provenance is invalid');
        return result;
    }
    if (result.completeness === 'complete' && result.conclusion === 'no_matching_fact' && result.facts.provenance.length > 0) {
        throw new Error('no_matching_fact cannot contain positive provenance');
    }
    if (result.completeness !== 'complete' && result.conclusion !== 'inconclusive') {
        throw new Error('partial or unknown execution cannot have a definitive conclusion');
    }
    if (result.completeness !== 'complete' && 'count' in result && result.count && (result.count.queryKey !== result.queryKey || result.count.provenance.queryKey !== result.queryKey)) throw new Error('inconclusive count provenance must bind to the executed query');
    return result;
}
