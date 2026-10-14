// M-6 — Agent Turn Controller. Single unified entry point for mobile.
// Mirrors agent.controller.ts discipline: reads req.user.id, delegates to service,
// maps result to discriminated union, maps known errors to HTTP.
import { Request, Response } from 'express';
import { runAgentTurn } from '../services/agentTurn.service';
import { runCanonicalAgentTurn } from '../services/agentConversationRuntime.service';
import { AppError } from '../utils/AppError';
import { generateTraceId } from '../utils/overdueTrace';
import { runExactCommitmentCountV4 } from '../services/agentTurnReadV4Boundary.service';
import { isDurableGeneralAgentTurnEnabled } from '../services/agentTurnDurableBoundary.service';
import {
    isAgentConversationTurnPersistenceEnabled,
    persistAgentConversationTurn,
} from '../services/agentConversationTurn.service';
import { resolveAgentRequestInput } from '../services/agentInputEnvelope.service';

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
            if (isAgentConversationTurnPersistenceEnabled() && req.body.conversationId) {
                await persistAgentConversationTurn({
                    actorUserId,
                    conversationId: req.body.conversationId,
                    clientTurnKey: idempotencyKey,
                    inputText: req.body.input,
                    inputMode: 'text',
                    result,
                });
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
        // When durable history is enabled, signed voice envelopes are the
        // authoritative source for the conversation and transcript. Never
        // persist client copies of those values.
        const historyInput = isAgentConversationTurnPersistenceEnabled()
            ? resolveAgentRequestInput({ actorUserId, body: req.body, traceId })
            : null;
        const result = durableEnabled
            ? await runCanonicalAgentTurn(turnInput, {}, idempotencyKey!)
            : await runAgentTurn(turnInput);

        const historyConversationId = historyInput?.envelope.conversationId ?? req.body.conversationId;
        if (isAgentConversationTurnPersistenceEnabled() && historyConversationId && historyInput?.envelope.content) {
            await persistAgentConversationTurn({
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
            });
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
