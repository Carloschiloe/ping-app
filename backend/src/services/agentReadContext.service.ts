import type { AgentResponse } from '../types/agentResponse';
import type { AgentContext } from '../types/agentContext';
import type { AgentReadContext } from '../types/agentDialogueState';

/**
 * Derive bounded conversational read state from the answer that Core
 * actually produced.
 *
 * Retrieval may contain a budgeted window, while the answer may cite only a
 * subset of that window.  The subset of citations is the only safe bridge to
 * the next turn: provenance was already checked against authorized evidence
 * by the response pipeline, and the next turn still re-authorizes the stored
 * canonical references before using them.
 */
export function buildReadContextFromAnswer(
    context: AgentContext,
    response: AgentResponse,
    sourceTurnId: string,
): AgentReadContext | null {
    if (response.status !== 'answered') return null;

    const citedKeys = new Set(
        response.citations
            .filter((citation) => citation.sourceType === 'commitment' || citation.sourceType === 'commitment_proposal')
            .map((citation) => `${citation.sourceType}:${citation.sourceId}`),
    );
    const citedCommitments = context.commitments.filter((commitment) =>
        citedKeys.has(`${commitment.provenance.sourceType}:${commitment.provenance.sourceId}`),
    );
    if (citedCommitments.length === 0) return null;

    return {
        kind: 'commitment_query',
        timeRange: context.entities?.timeRange ?? null,
        sourceTurnId,
        commitmentReferents: citedCommitments.map((commitment) => ({
            rawText: commitment.title,
            entityType: commitment.entityType,
            canonicalId: commitment.id,
        })),
        statuses: Array.from(new Set(citedCommitments.map((commitment) => commitment.status))),
    };
}
