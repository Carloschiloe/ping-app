// Agent Turn Controller. Single entry point for every Ping surface: text,
// reviewed dictation and live voice all reach the same assistant, which keeps
// its dialogue memory inside the persisted turn.
import { Request, Response } from 'express';
import { AppError } from '../utils/AppError';
import { generateTraceId } from '../utils/overdueTrace';
import {
    isAgentConversationTurnPersistenceEnabled,
    persistAgentConversationTurn,
} from '../services/agentConversationTurn.service';
import { getOrCreateSelfConversationId } from '../services/conversation.service';
import { resolveAgentRequestInput } from '../services/agentInputEnvelope.service';
import { runAssistantModeTurn } from '../services/assistant/assistantTurn.service';
import { isM8VoiceTranscriptionPromptEcho } from '../services/m8VoiceTranscriptionPrompt';

type PersistTurnInput = Parameters<typeof persistAgentConversationTurn>[0];

/**
 * History improves continuity but must not turn a valid answer into a generic
 * 500: the next turn already reads this memory from the in-process cache.
 */
async function persistTurn(input: PersistTurnInput): Promise<void> {
    try {
        await persistAgentConversationTurn(input);
    } catch (error: any) {
        console.warn('[AgentTurn] Conversation history persistence degraded; answer preserved.', {
            message: error?.message ?? String(error),
            errorCode: typeof error?.code === 'string' ? error.code : null,
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
    const traceId = generateTraceId();
    let phase = 'start';
    try {
        const actorUserId = req.user!.id;
        const idempotencyKey = req.get('Idempotency-Key');

        // Dictation arrives as a signed voice token. Its envelope is the only
        // authoritative source of the transcript and conversation; a token the
        // user did not review can be answered but never confirms an action.
        phase = 'resolve_input';
        const { envelope } = resolveAgentRequestInput({ actorUserId, body: req.body, traceId });
        const inputText = envelope.content.trim();
        if (!inputText) throw new AppError('Agent input is required', 400);
        const explicitConversationId = envelope.conversationId ?? undefined;
        const inputMode = req.body.reviewedVoiceInputToken
            ? 'reviewed_voice_text' as const
            : req.body.voiceInputToken
                ? 'voice' as const
                : 'text' as const;

        // A live-voice turn whose text is the transcription model echoing its
        // own prompt is not something the user said: ask again without
        // running the assistant or recording a turn.
        if (req.body.channel === 'mobile_voice' && isM8VoiceTranscriptionPromptEcho(inputText)) {
            res.status(200).json({
                kind: 'response',
                response: { status: 'answered', answer: 'No te escuché bien. ¿Puedes repetirlo?', citations: [] },
            });
            return;
        }

        const historyConversationId = isAgentConversationTurnPersistenceEnabled()
            ? await resolveHistoryConversationId({ actorUserId, explicitConversationId })
            : undefined;
        // The main Ping tab and the chat with Ping are one conversation: the
        // self-chat. Its memory lives in one dialogue scope, whichever way the
        // user came in, so a proposal made in one is answered from the other.
        const dialogueConversationId = explicitConversationId ?? historyConversationId;
        phase = 'assistant_turn';
        const { result, memory } = await runAssistantModeTurn({
            actorUserId, text: inputText, timezone: envelope.timeZone ?? req.body.timezone,
            historyConversationId, dialogueConversationId, traceId,
            channel: req.body.channel === 'mobile_voice' ? 'voice' : 'text',
            userWordsHeard: inputMode !== 'voice' && req.body.voiceInputSource !== 'provider',
            actionDecision: req.body.actionDecision,
        });
        // The answer goes out before the history row is written: the next
        // turn reads this memory from the in-process cache.
        res.status(200).json(result);
        if (historyConversationId) {
            phase = 'persist_conversation_event';
            await persistTurn({
                actorUserId,
                conversationId: historyConversationId,
                dialogueConversationId,
                clientTurnKey: idempotencyKey ?? traceId,
                inputText,
                inputMode,
                result,
                assistant: memory,
            });
        }
    } catch (error: any) {
        const statusCode = error instanceof AppError ? error.statusCode : 500;
        console.error('[AgentTurn] request failed', {
            traceId,
            phase,
            statusCode,
            errorName: error?.name ?? 'UnknownError',
            errorCode: typeof error?.code === 'string' ? error.code : null,
            errorMessage: typeof error?.message === 'string' ? error.message.slice(0, 300) : String(error).slice(0, 300),
        });
        if (res.headersSent) return;
        res.status(statusCode).json({
            error: statusCode === 500 ? 'The agent could not process your request right now.' : error.message,
        });
    }
}
