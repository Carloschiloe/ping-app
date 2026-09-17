import type { AgentReadTargetResolutionInput, ReadTargetResolutionResult } from '../types/agentReadTargetResolution';
import type { CanonicalReadQuery, CanonicalReadScope } from '../types/agentReadQuery';
import type { NormalizedSemanticTurnV4, SemanticReadRelationshipV4, SemanticReadTargetShapeV4 } from '../types/agentTurnCommit';
import type { RetrievalSourceType, RetrievalTimeRange } from '../types/retrieval';
import type { TemporalCoreResult } from './temporalCore.service';

export type AgentReadQueryPlannerInput = {
    semanticTurn: NormalizedSemanticTurnV4;
    targetResolution: ReadTargetResolutionResult;
    temporal: TemporalCoreResult;
    authorizedScope: CanonicalReadScope;
};

export type AgentReadQueryPlannerResult =
    | { status: 'planned'; query: CanonicalReadQuery }
    | { status: 'clarification_required'; reason: 'target_resolution' | 'temporal_context'; targetResolution?: ReadTargetResolutionResult; temporal?: TemporalCoreResult }
    | { status: 'unsupported'; reason: string }
    | { status: 'invalid'; reason: string };

function cardinalityFor(shape: 'focused' | 'collection' | 'count') {
    return shape === 'focused' ? 'focused_lookup' : shape === 'collection' ? 'exhaustive_list' : 'count';
}

function hasAuthorizedScope(scope: CanonicalReadScope): boolean {
    return Boolean(scope.conversationId || scope.personId || scope.contactId || scope.approvedTextQuery || scope.timeRange || scope.sourceTypes?.length || scope.statuses?.length);
}

function hasConversationScope(scope: CanonicalReadScope): boolean {
    return Boolean(scope.conversationId);
}

function sourceTypesFor(relationship: SemanticReadRelationshipV4): RetrievalSourceType[] {
    switch (relationship.kind) {
        case 'lifecycle_transition': return ['commitment', 'commitment_event'];
        case 'proposal_focus': return ['commitment_proposal'];
        case 'person_relationship': return ['person'];
        case 'message_relationship': return ['message'];
        case 'attachment_content': return ['attachment'];
        case 'transcription_content': return ['transcription'];
        case 'current_state':
        case 'general_recall': return ['commitment'];
    }
}

function scopeCopy(scope: CanonicalReadScope): CanonicalReadScope {
    return {
        ...(scope.conversationId ? { conversationId: scope.conversationId } : {}),
        ...(scope.personId ? { personId: scope.personId } : {}),
        ...(scope.contactId ? { contactId: scope.contactId } : {}),
        ...(scope.approvedTextQuery ? { approvedTextQuery: scope.approvedTextQuery } : {}),
        ...(scope.timeRange ? { timeRange: { ...scope.timeRange } as RetrievalTimeRange } : {}),
        ...(scope.sourceTypes ? { sourceTypes: [...scope.sourceTypes] } : {}),
        ...(scope.statuses ? { statuses: [...scope.statuses] } : {}),
        ...(scope.orderByOverdueFirst !== undefined ? { orderByOverdueFirst: scope.orderByOverdueFirst } : {}),
    };
}

function targetRequired(targetShape: SemanticReadTargetShapeV4, cardinality: ReturnType<typeof cardinalityFor>): boolean {
    if (cardinality !== 'focused_lookup') return false;
    return targetShape === 'person' || targetShape === 'commitment' || targetShape === 'proposal' || targetShape === 'conversation' || targetShape === 'message' || targetShape === 'attachment' || targetShape === 'transcription';
}

function relationshipCompatible(input: AgentReadQueryPlannerInput, cardinality: ReturnType<typeof cardinalityFor>): AgentReadQueryPlannerResult | null {
    const meaning = input.semanticTurn.readMeaning!;
    const targetShape = meaning.targetShape;
    const relationship = meaning.relationship;
    if (relationship.kind === 'lifecycle_transition' && targetShape !== 'commitment' && targetShape !== 'proposal') return { status: 'invalid', reason: 'lifecycle_requires_commitment_or_proposal_target' };
    if (relationship.kind === 'proposal_focus' && targetShape !== 'proposal' && targetShape !== 'none') return { status: 'invalid', reason: 'proposal_focus_target_mismatch' };
    if (relationship.kind === 'person_relationship' && targetShape !== 'person') return { status: 'invalid', reason: 'person_relationship_requires_person_target' };
    if (relationship.kind === 'attachment_content' && targetShape !== 'attachment') {
        if (!(cardinality !== 'focused_lookup' && targetShape === 'none')) return { status: 'invalid', reason: 'attachment_relationship_target_mismatch' };
    }
    if (relationship.kind === 'transcription_content' && targetShape !== 'transcription') {
        if (!(cardinality !== 'focused_lookup' && targetShape === 'none')) return { status: 'invalid', reason: 'transcription_relationship_target_mismatch' };
    }
    if (relationship.kind === 'message_relationship' && relationship.relationship !== 'content' && relationship.relationship !== 'conversation_context' && targetShape !== 'person' && !input.authorizedScope.personId && !input.authorizedScope.contactId) return { status: 'invalid', reason: 'message_person_relationship_requires_person_scope' };
    return null;
}

function temporalConstraint(input: AgentReadQueryPlannerInput): AgentReadQueryPlannerResult | CanonicalReadQuery['temporal'] {
    const role = input.semanticTurn.readMeaning!.temporalRole;
    if (role === 'none') return input.temporal.status === 'not_applicable' ? { role, value: null } : { status: 'invalid', reason: 'temporal_value_present_for_none_role' };
    if (input.temporal.status === 'resolved') return { role, value: input.temporal.value };
    if (input.temporal.status === 'ambiguous' || input.temporal.status === 'nonexistent_local_time' || input.temporal.status === 'insufficient') return { status: 'clarification_required', reason: 'temporal_context', temporal: input.temporal };
    if (input.temporal.status === 'unsupported') return { status: 'unsupported', reason: 'temporal_shape' };
    return { status: 'invalid', reason: 'temporal_resolution_invalid' };
}

export class AgentReadQueryPlanner {
    public plan(input: AgentReadQueryPlannerInput): AgentReadQueryPlannerResult {
        const meaning = input.semanticTurn.readMeaning;
        if (!meaning) return { status: 'invalid', reason: 'read_meaning_missing' };
        if (input.semanticTurn.kind !== 'read_request' && input.semanticTurn.kind !== 'slot_answer') return { status: 'invalid', reason: 'not_a_read_turn' };
        if (input.semanticTurn.domain === 'unknown') return { status: 'unsupported', reason: 'unknown_read_domain' };

        const cardinality = cardinalityFor(meaning.queryShape);
        const targetResolution = input.targetResolution;
        if (targetRequired(meaning.targetShape, cardinality)) {
            if (targetResolution.status === 'ambiguous' || targetResolution.status === 'zero_match') return { status: 'clarification_required', reason: 'target_resolution', targetResolution };
            if (targetResolution.status !== 'resolved') return targetResolution.status === 'unsupported' ? targetResolution : { status: 'invalid', reason: 'target_resolution_not_resolved' };
        } else if (targetResolution.status === 'ambiguous' || targetResolution.status === 'zero_match') {
            return { status: 'clarification_required', reason: 'target_resolution', targetResolution };
        }

        const relationshipResult = relationshipCompatible(input, cardinality);
        if (relationshipResult) return relationshipResult;
        const temporal = temporalConstraint(input);
        if ('status' in temporal) return temporal;
        if (!hasAuthorizedScope(input.authorizedScope)) return { status: 'unsupported', reason: 'authorized_read_scope_missing' };

        if (meaning.targetShape === 'message' && cardinality === 'focused_lookup') return { status: 'unsupported', reason: 'message_target_resolution_unsupported' };
        if (meaning.targetShape === 'attachment' && cardinality === 'focused_lookup') return { status: 'unsupported', reason: 'attachment_target_resolution_unsupported' };
        if (meaning.targetShape === 'transcription' && cardinality === 'focused_lookup') return { status: 'unsupported', reason: 'transcription_target_resolution_unsupported' };
        if (meaning.targetShape === 'conversation' && !input.authorizedScope.conversationId) return { status: 'unsupported', reason: 'conversation_scope_missing' };
        if ((meaning.targetShape === 'attachment' || meaning.targetShape === 'transcription') && cardinality !== 'focused_lookup' && !hasConversationScope(input.authorizedScope)) return { status: 'unsupported', reason: 'conversation_scope_required_for_collection' };
        if (meaning.targetShape === 'topic' && !input.authorizedScope.approvedTextQuery) return { status: 'unsupported', reason: 'topic_constraint_missing' };

        const target = targetResolution.status === 'resolved' ? targetResolution.target : null;
        const sourceTypes = sourceTypesFor(meaning.relationship);
        const statuses = meaning.commitmentStatus === 'pending'
            ? ['proposed', 'accepted', 'counter_proposal']
            : input.authorizedScope.statuses;
        return {
            status: 'planned',
            query: {
                domain: input.semanticTurn.domain,
                cardinality,
                target,
                relationship: meaning.relationship,
                temporal,
                authorizedScope: { ...scopeCopy(input.authorizedScope), ...(statuses ? { statuses } : {}) },
                evidenceRequirement: { relationship: meaning.relationship, sourceTypes },
            },
        };
    }
}

export const agentReadQueryPlanner = new AgentReadQueryPlanner();
