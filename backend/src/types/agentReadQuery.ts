import type {
    NormalizedSemanticTurnV4,
    SemanticReadRelationshipV4,
    SemanticReadTemporalRoleV4,
} from './agentTurnCommit';
import type { CanonicalReadTarget } from './agentReadTargetResolution';
import type { RetrievalSourceType, RetrievalTimeRange } from './retrieval';
import type { TemporalCoreValue } from '../services/temporalCore.service';

export type CanonicalReadCardinality = 'focused_lookup' | 'exhaustive_list' | 'count';

export type CanonicalReadScope = {
    conversationId?: string;
    personId?: string;
    contactId?: string;
    approvedTextQuery?: string;
    timeRange?: RetrievalTimeRange;
    sourceTypes?: RetrievalSourceType[];
    statuses?: string[];
    orderByOverdueFirst?: boolean;
};

export type CanonicalReadTemporalConstraint = {
    role: SemanticReadTemporalRoleV4;
    value: TemporalCoreValue | null;
};

export type CanonicalReadEvidenceRequirement = {
    relationship: SemanticReadRelationshipV4;
    sourceTypes: RetrievalSourceType[];
};

export interface CanonicalReadQuery {
    domain: NormalizedSemanticTurnV4['domain'];
    cardinality: CanonicalReadCardinality;
    target: CanonicalReadTarget | null;
    relationship: SemanticReadRelationshipV4;
    temporal: CanonicalReadTemporalConstraint;
    authorizedScope: CanonicalReadScope;
    evidenceRequirement: CanonicalReadEvidenceRequirement;
}
