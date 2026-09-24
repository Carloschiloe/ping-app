import type { AgentResponse } from '../types/agentResponse';
import type { AgentContext } from '../types/agentContext';
import type {
    AgentReadContext,
    AgentReadContextEntityType,
    AgentReadContextEvidence,
} from '../types/agentDialogueState';
import type { RetrievalProvenance, RetrievalSourceType } from '../types/retrieval';

function evidenceType(sourceType: RetrievalSourceType): AgentReadContextEntityType {
    return sourceType;
}

function key(sourceType: RetrievalSourceType, sourceId: string): string {
    return `${sourceType}:${sourceId}`;
}

function addIfCited(
    evidence: Map<string, AgentReadContextEvidence>,
    citations: Set<string>,
    provenance: RetrievalProvenance | undefined,
    rawText: string | null | undefined,
): void {
    if (!provenance || !citations.has(key(provenance.sourceType, provenance.sourceId))) return;
    const evidenceKey = key(provenance.sourceType, provenance.sourceId);
    if (evidence.has(evidenceKey)) return;
    evidence.set(evidenceKey, {
        sourceType: provenance.sourceType,
        sourceId: provenance.sourceId,
        entityType: evidenceType(provenance.sourceType),
        canonicalId: provenance.sourceId,
        rawText: rawText ?? null,
    });
}

function scopeSourceTypes(context: AgentContext, evidence: AgentReadContextEvidence[]): RetrievalSourceType[] {
    const types = new Set<RetrievalSourceType>(evidence.map((item) => item.sourceType));
    if (types.size === 0) {
        if (context.intent?.type === 'commitment_query') {
            types.add('commitment');
            types.add('commitment_proposal');
        }
        if (context.intent?.type === 'message_search' || context.intent?.type === 'recall' || context.intent?.type === 'person_query') types.add('message');
        if (context.intent?.type === 'document_search') types.add('attachment');
    }
    return Array.from(types);
}

/**
 * Project only evidence exposed by the answer into bounded conversational
 * state. The retrieval window is never copied wholesale. Empty answers keep
 * a typed scope, but never manufacture an entity or canonical ID.
 */
export function buildReadContextFromAnswer(
    context: AgentContext,
    response: AgentResponse,
    sourceTurnId: string,
): AgentReadContext {
    const citations = response.status === 'answered'
        ? new Set(response.citations.map((citation) => key(citation.sourceType, citation.sourceId)))
        : new Set<string>();
    const evidence = new Map<string, AgentReadContextEvidence>();

    for (const commitment of context.commitments ?? []) addIfCited(evidence, citations, commitment.provenance, commitment.title);
    for (const message of context.messages ?? []) addIfCited(evidence, citations, message.provenance, message.content);
    for (const event of context.events ?? []) addIfCited(evidence, citations, event.provenance, event.eventType);
    for (const transcription of context.transcriptions ?? []) addIfCited(evidence, citations, transcription.provenance, transcription.transcriptText);
    for (const attachment of context.attachments ?? []) addIfCited(evidence, citations, attachment.provenance, attachment.originalFilename);
    for (const person of context.entities?.people ?? []) {
        if (person.resolved) addIfCited(evidence, citations, { sourceType: 'person', sourceId: person.resolved.id }, person.resolved.displayName);
    }
    for (const fact of context.canonicalFacts ?? []) {
        addIfCited(evidence, citations, { sourceType: 'person', sourceId: fact.personId }, fact.displayName);
    }

    const evidenceItems = Array.from(evidence.values());
    const uniqueKeys = new Set(evidenceItems.map((item) => key(item.sourceType, item.canonicalId)));
    const cardinality = uniqueKeys.size === 0
        ? 'empty_scope' as const
        : uniqueKeys.size === 1
            ? 'unique_entity' as const
            : 'result_set' as const;
    const commitmentEvidence = evidenceItems.filter((item) => item.entityType === 'commitment' || item.entityType === 'commitment_proposal');
    const commitmentByKey = new Map(context.commitments.map((item) => [key(item.provenance.sourceType, item.provenance.sourceId), item]));
    const personIds = (context.entities?.people ?? []).flatMap((person) => person.resolved ? [person.resolved.id] : []);

    return {
        kind: context.intent.type,
        cardinality,
        sourceTurnId,
        scope: {
            timeRange: context.entities?.timeRange ?? null,
            personIds,
            sourceTypes: scopeSourceTypes(context, evidenceItems),
        },
        evidence: evidenceItems,
        timeRange: context.entities?.timeRange ?? null,
        commitmentReferents: commitmentEvidence.map((item) => ({
            rawText: item.rawText ?? '',
            entityType: item.entityType as 'commitment' | 'commitment_proposal',
            canonicalId: item.canonicalId,
        })),
        statuses: commitmentEvidence
            .map((item) => commitmentByKey.get(key(item.sourceType, item.sourceId))?.status)
            .filter((status): status is NonNullable<typeof status> => !!status)
            .filter((status, index, statuses) => statuses.indexOf(status) === index),
    };
}

export function getUniqueReadEvidence(context: AgentReadContext | null | undefined): AgentReadContextEvidence | null {
    if (!context) return null;
    const evidence = context.evidence ?? [];
    if (context.cardinality === 'unique_entity' && evidence.length === 1) return evidence[0];
    const legacy = context.commitmentReferents ?? [];
    if (evidence.length === 0 && legacy.length === 1) {
        return {
            sourceType: legacy[0].entityType,
            sourceId: legacy[0].canonicalId,
            entityType: legacy[0].entityType,
            canonicalId: legacy[0].canonicalId,
            rawText: legacy[0].rawText,
        };
    }
    return null;
}
