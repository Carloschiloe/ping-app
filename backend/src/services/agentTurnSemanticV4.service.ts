import { AppError } from '../utils/AppError';
import type { NormalizedSemanticTurnV4, SemanticReadMeaningV4 } from '../types/agentTurnCommit';
import { normalizeSemanticTurnV2 } from './agentTurnSemanticV2.service';

const QUERY_SHAPES = new Set(['focused', 'collection', 'count']);
const TARGET_SHAPES = new Set(['none', 'person', 'commitment', 'proposal', 'message', 'conversation', 'attachment', 'transcription', 'topic']);
const TEMPORAL_ROLES = new Set(['none', 'filter_range', 'occurrence_time', 'target_date', 'elapsed', 'duration']);
const RELATIONSHIP_KINDS = new Set(['general_recall', 'current_state', 'lifecycle_transition', 'proposal_focus', 'person_relationship', 'message_relationship', 'attachment_content', 'transcription_content']);
const LIFECYCLE_TRANSITIONS = new Set(['action_completed', 'resolved', 'cancelled', 'rejected', 'reopened', 'reassigned', 'accepted']);
const PROPOSAL_FOCI = new Set(['waiting_for_others', 'needs_my_response', 'pending_response_from_person']);
const MESSAGE_RELATIONSHIPS = new Set(['content', 'conversation_context', 'sender', 'participant']);

function validRelationship(value: unknown): value is SemanticReadMeaningV4['relationship'] {
    if (!value || typeof value !== 'object') return false;
    const relationship = value as Record<string, unknown>;
    if (typeof relationship.kind !== 'string' || !RELATIONSHIP_KINDS.has(relationship.kind)) return false;
    if (relationship.kind === 'lifecycle_transition') return typeof relationship.transition === 'string' && LIFECYCLE_TRANSITIONS.has(relationship.transition);
    if (relationship.kind === 'proposal_focus') return typeof relationship.focus === 'string' && PROPOSAL_FOCI.has(relationship.focus);
    if (relationship.kind === 'message_relationship') return typeof relationship.relationship === 'string' && MESSAGE_RELATIONSHIPS.has(relationship.relationship);
    return Object.keys(relationship).every(key => key === 'kind');
}

export function normalizeSemanticTurnV4(input: NormalizedSemanticTurnV4): NormalizedSemanticTurnV4 {
    const value = input as Partial<NormalizedSemanticTurnV4>;
    const bytes = Buffer.byteLength(JSON.stringify(input), 'utf8');
    const meaning = value.readMeaning;
    const validMeaning = meaning === null || (
        !!meaning && typeof meaning === 'object'
        && QUERY_SHAPES.has(meaning.queryShape)
        && typeof meaning.explicitCollection === 'boolean'
        && TARGET_SHAPES.has(meaning.targetShape)
        && TEMPORAL_ROLES.has(meaning.temporalRole)
        && validRelationship(meaning.relationship)
    );
    if (bytes > 32 * 1024 || value.version !== 4 || !validMeaning) throw new AppError('Unsupported or malformed semantic V4 checkpoint', 409);
    if (value.kind === 'read_request' && meaning === null) throw new AppError('Semantic V4 read meaning is required', 409);
    if (value.kind !== 'read_request' && meaning !== null) throw new AppError('Semantic V4 read meaning is only valid for reads', 409);
    const base = normalizeSemanticTurnV2({ ...input, version: 2 } as any);
    return JSON.parse(JSON.stringify({ ...base, version: 4, readMeaning: meaning })) as NormalizedSemanticTurnV4;
}
