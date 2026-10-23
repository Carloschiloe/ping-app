// M-6 — Agent Turn Controller. Single unified entry point for mobile.
// Mirrors agent.controller.ts discipline: reads req.user.id, delegates to service,
// maps result to discriminated union, maps known errors to HTTP.
import { Request, Response } from 'express';
import { runAgentTurn } from '../services/agentTurn.service';
import { AppError } from '../utils/AppError';
import { generateTraceId } from '../utils/overdueTrace';
import { runExactCommitmentCountV4 } from '../services/agentTurnReadV4Boundary.service';
import { isDurableGeneralAgentTurnEnabled, runDurableAgentTurn } from '../services/agentTurnDurableBoundary.service';
import {
    isAgentConversationTurnPersistenceEnabled,
    loadLatestAgentReadContext,
    persistAgentConversationTurn,
} from '../services/agentConversationTurn.service';
import { getOrCreateSelfConversationId } from '../services/conversation.service';
import { resolveAgentRequestInput, resolveTextSurface } from '../services/agentInputEnvelope.service';
import { buildDialogueScopeKey, getAgentDialogueReadContextSnapshot } from '../services/agentDialogueState.service';

type PersistTurnInput = Parameters<typeof persistAgentConversationTurn>[0];

/**
 * History improves continuity but must not turn a valid answer into a generic
 * 500 while the process-local fallback is active. Durable action turns stay
 * strict because their commit is part of their correctness contract.
 */
async function persistTurnWithRuntimePolicy(input: PersistTurnInput, required: boolean): Promise<void> {
    try {
        await persistAgentConversationTurn(input);
    } catch (error: any) {
        if (required) throw error;
        console.warn('[AgentTurn] Conversation history persistence degraded; answer preserved.', {
            message: error?.message ?? String(error),
            resultKind: input.result.kind,
        });
    }
}

/**
 * The main Ping surface intentionally has no chat route parameter. When
 * conversation-event persistence is enabled, still give those turns a
 * canonical, actor-owned conversation scope so restart/device continuity is
 * durable. The self-chat RPC is idempotent (`reuse_existing=true`); failure
 * remains best-effort here so a history outage cannot turn a valid answer
 * into a generic Agent error.
 */
async function resolveHistoryConversationId(input: {
    actorUserId: string;
    explicitConversationId?: string;
}): Promise<string | undefined> {
    const explicit = input.explicitConversationId?.trim();
    if (explicit) return explicit;
    try {
        return await getOrCreateSelfConversationId(input.actorUserId);
    } catch (error: any) {
        console.warn('[AgentTurn] Self conversation unavailable; continuing without persisted history.', error?.message ?? error);
        return undefined;
    }
}

export async function turn(req: Request, res: Response): Promise<void> {
    try {
        const actorUserId = req.user!.id;
        const traceId = generateTraceId();

        const idempotencyKey = req.get('Idempotency-Key');
        if (req.body.readCapability !== undefined) {
            if (!idempotencyKey) throw new AppError('Idempotency-Key is required for READ V4', 400);
            const result = await runExactCommitmentCountV4({
                actorUserId, input: req.body.input, idempotencyKey,
                readCapability: req.body.readCapability, conversationId: req.body.conversationId,
                locale: req.body.locale, timezone: req.body.timezone,
            });
            const historyConversationId = isAgentConversationTurnPersistenceEnabled()
                ? await resolveHistoryConversationId({ actorUserId, explicitConversationId: req.body.conversationId })
                : undefined;
            if (historyConversationId) {
                await persistTurnWithRuntimePolicy({
                    actorUserId,
                    conversationId: historyConversationId,
                    clientTurnKey: idempotencyKey,
                    inputText: req.body.input,
                    inputMode: 'text',
                    result,
                }, false);
            }
            res.status(200).json(result);
            return;
        }

        const durableEnabled = isDurableGeneralAgentTurnEnabled();
        if (durableEnabled && !idempotencyKey) {
            throw new AppError('Idempotency-Key is required for durable Agent Turn', 400);
        }

        const turnInput = {
            actorUserId,
            input: req.body.input,
            voiceInputToken: req.body.voiceInputToken,
            reviewedVoiceInputToken: req.body.reviewedVoiceInputToken,
            conversationId: req.body.conversationId,
            channel: req.body.channel,
            locale: req.body.locale,
            timezone: req.body.timezone,
            traceId,
        };
        // Resolve once at the HTTP boundary when history is enabled. For voice
        // and reviewed voice, the signed envelope is the only authoritative
        // source of conversationId and transcript text; never trust a client
        // copy for durable provenance.
        const historyInput = isAgentConversationTurnPersistenceEnabled()
            ? resolveAgentRequestInput({ actorUserId, body: req.body, traceId })
            : null;
        const historyConversationId = isAgentConversationTurnPersistenceEnabled()
            ? await resolveHistoryConversationId({
                actorUserId,
                explicitConversationId: historyInput?.envelope.conversationId ?? req.body.conversationId,
            })
            : undefined;
        // Storage scope and Core dialogue scope are intentionally separate for
        // the main Ping surface: its events live in the actor self-chat, but
        // semantic continuity remains `agent:mobile` when no conversation was
        // supplied by the client.
        const dialogueConversationId = historyInput?.envelope.conversationId ?? req.body.conversationId;
        const localReadContext = !durableEnabled && historyConversationId && isAgentConversationTurnPersistenceEnabled()
            ? getAgentDialogueReadContextSnapshot(
                actorUserId,
                buildDialogueScopeKey({
                    conversationId: dialogueConversationId,
                    surface: historyInput?.envelope.surface ?? resolveTextSurface(req.body.channel),
                }),
            )
            : null;
        const fallbackReadContext = !durableEnabled && historyConversationId && isAgentConversationTurnPersistenceEnabled() && !localReadContext
            ? await loadLatestAgentReadContext(actorUserId, historyConversationId).catch((error) => {
                console.warn('[AgentTurn] Persisted read context unavailable; continuing without fallback.', error?.message ?? error);
                return null;
            })
            : null;
        const result = durableEnabled
            ? await runDurableAgentTurn(turnInput, { fallbackReadContext }, idempotencyKey!)
            : await runAgentTurn(turnInput, { fallbackReadContext });

        if (isAgentConversationTurnPersistenceEnabled() && historyConversationId && historyInput?.envelope.content) {
            await persistTurnWithRuntimePolicy({
                actorUserId,
                conversationId: historyConversationId,
                clientTurnKey: idempotencyKey ?? traceId,
                inputText: historyInput.envelope.content,
                inputMode: req.body.reviewedVoiceInputToken
                    ? 'reviewed_voice_text'
                    : req.body.voiceInputToken
                        ? 'voice'
                        : 'text',
                result,
            }, durableEnabled);
        }

        // All valid turn results are HTTP 200 — the kind discriminator tells mobile what to render
        res.status(200).json(result);
    } catch (error: any) {
        const statusCode = error instanceof AppError ? error.statusCode : 500;
        res.status(statusCode).json({
            error: statusCode === 500 ? 'The agent could not process your request right now.' : error.message,
        });
    }
}
