// M-7 read-only follow-up adapter. Keeps the original Agent Core unchanged;
// only the precisely supported follow-up is resolved to a scoped canonical
// title, then routed through the exact same authorization-aware Core.
export * from './agentTurnCore.service';
import { runAgentTurn as runCoreAgentTurn } from './agentTurnCore.service';
import {
    forgetReadFollowupReferent,
    rememberVerifiedReadReferent,
    resolveVerifiedReadFollowup,
} from './agentReadFollowupReferent.service';
import {
    clearReadClarificationsForTests,
    forgetReadClarification,
    rememberReadClarification,
    resolveReadClarification,
} from './agentReadClarification.service';
import type { AgentTurnInput, AgentTurnResult } from '../types/agentTurn';
import type { RunAgentTurnOptions } from './agentTurnCore.service';

export async function runAgentTurn(
    input: AgentTurnInput,
    options: RunAgentTurnOptions = {},
): Promise<AgentTurnResult> {
    const content = input.input ?? '';
    // A voice token is resolved by Core itself; never replace its envelope.
    const followup = input.voiceInputToken ? null : await resolveVerifiedReadFollowup({
        actorUserId: input.actorUserId,
        conversationId: input.conversationId,
        utterance: content,
        preserveOnIneligible: true,
    });
    const clarificationSelection = input.voiceInputToken ? { kind: 'none' as const } : resolveReadClarification({
        actorUserId: input.actorUserId,
        conversationId: input.conversationId,
        answer: content,
    });
    const selectedReadCandidate = clarificationSelection.kind === 'resolved'
        ? clarificationSelection
        : null;
    const rememberReadContext: NonNullable<RunAgentTurnOptions['onReadContext']> = (readContext) => {
        rememberVerifiedReadReferent({
            ...readContext,
            actorUserId: input.actorUserId,
            conversationId: input.conversationId,
        });
        options.onReadContext?.(readContext);
    };
    const coreOptions = selectedReadCandidate
        ? { ...options, authorizedCommitmentReferentId: selectedReadCandidate.sourceId, responseInput: content, onReadContext: rememberReadContext }
        : followup
            ? { ...options, authorizedCommitmentReferentId: followup.sourceId, responseInput: content, onReadContext: rememberReadContext }
            : { ...options, onReadContext: rememberReadContext };
    const result = await runCoreAgentTurn(
        followup
            ? { ...input, input: followup.query }
            : selectedReadCandidate
                ? { ...input, input: selectedReadCandidate.query }
                : input,
        coreOptions,
    );

    if (followup) {
        // An old citation can NEVER authorize an answer; the Core just
        // re-queried canonical data using the current actor and conversation.
        forgetReadFollowupReferent(input.actorUserId, input.conversationId);
        if (result.kind === 'response' && result.response.status === 'answered'
            && !result.response.citations.some((citation) =>
                citation.sourceType === 'commitment' && citation.sourceId === followup.sourceId)) {
            return {
                ...result,
                response: {
                    status: 'no_evidence',
                    answer: 'No encontré evidencia verificable de ese compromiso.',
                    citations: [],
                },
            };
        }
        return result;
    }

    if (selectedReadCandidate) {
        // Selection is only a hint. The response must cite the same entity
        // after the Core re-queries it under the current actor's visibility.
        if (result.kind === 'response' && result.response.status === 'answered'
            && !result.response.citations.some((citation) =>
                citation.sourceType === 'commitment' && citation.sourceId === selectedReadCandidate.sourceId)) {
            return {
                ...result,
                response: {
                    status: 'no_evidence',
                    answer: 'No encontré evidencia verificable de ese compromiso.',
                    citations: [],
                },
            };
        }
        return result;
    }

    if (result.kind === 'clarification') {
        const entityQuestion = result.questions.find((question) => question.field === 'entity_ambiguous');
        if (input.conversationId && entityQuestion?.options && entityQuestion.options.length > 1) {
            rememberReadClarification({
                actorUserId: input.actorUserId,
                conversationId: input.conversationId,
                originalQuery: content,
                candidates: entityQuestion.options,
            });
        }
    } else if (clarificationSelection.kind === 'unmatched') {
        // resolveReadClarification already removed the old state. This branch
        // documents the intentional escape: the current turn is independent.
        forgetReadClarification(input.actorUserId, input.conversationId);
    }

    return result;
}

// Kept as a narrow test seam; production callers never clear conversational
// state. It also prevents the two bounded stores from leaking across tests.
export function clearReadConversationStateForTests(): void {
    clearReadClarificationsForTests();
}
