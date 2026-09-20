// M-7 read-only follow-up adapter. Keeps the original Agent Core unchanged;
// only the precisely supported follow-up is resolved to a scoped canonical
// title, then routed through the exact same authorization-aware Core.
export * from './agentTurnCore.service';
import { runAgentTurn as runCoreAgentTurn } from './agentTurnCore.service';
import { buildAgentContext } from './agentContextBuilder.service';
import {
    forgetReadFollowupReferent,
    rememberVerifiedReadReferent,
    resolveVerifiedReadFollowup,
} from './agentReadFollowupReferent.service';
import type { AgentTurnInput, AgentTurnResult } from '../types/agentTurn';
import type { RunAgentTurnOptions } from './agentTurnCore.service';

const TARGETED_FIRST_READ = /^¿?\s*qu[eé]\s+pas[oó]\s+con\s+\S.+\??$/iu;

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
    });
    const result = await runCoreAgentTurn(
        followup ? { ...input, input: followup.query } : input,
        options,
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

    // Keep only one evidence-verified read referent for this actor+conversation.
    // Do not infer one from an LLM answer, a plain user title or an old date.
    // This exceptional, narrow first-turn check adds one canonical read;
    // every other turn retains the existing one-build Core behavior.
    if (!input.voiceInputToken && input.conversationId
        && TARGETED_FIRST_READ.test(content.trim())
        && result.kind === 'response' && result.response.status === 'answered'
        && result.response.citations.length === 1
        && result.response.citations[0].sourceType === 'commitment') {
        try {
            const context = await buildAgentContext({
                actorUserId: input.actorUserId,
                input: content,
                conversationId: input.conversationId,
                channel: input.channel,
                locale: input.locale,
                timezone: input.timezone,
                now: (options.now ?? input.now ?? new Date()).toISOString(),
                traceId: input.traceId,
            }, {});
            rememberVerifiedReadReferent({
                actorUserId: input.actorUserId,
                conversationId: input.conversationId,
                status: result.response.status,
                commitments: context.evidenceFound ? context.commitments.map((item) => ({
                    id: item.id,
                    title: item.title,
                })) : [],
                citations: result.response.citations,
            });
        } catch {
            // Caching must never interrupt a completed, source-backed read.
            forgetReadFollowupReferent(input.actorUserId, input.conversationId);
        }
    }
    return result;
}
