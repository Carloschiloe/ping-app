// M-4 — send_message executor (sección 43). Preconditions re-checked live
// (TOCTOU, sección 17/18): actor must still be a real participant of the
// conversation at execution time, never assumed unchanged since planning.
// Content is frozen (sección 40) — read verbatim from the authorized
// step's arguments, never re-derived or touched by a model.
import { persistUserMessage } from '../messagingApplication.service';
import { assertConversationParticipant } from '../../utils/authz';
import { AppError } from '../../utils/AppError';
import type { ToolExecutor, ToolExecutionContext, ToolExecutionOutcome } from '../../types/agentExecution';

export const sendMessageExecutor: ToolExecutor = {
    toolId: 'send_message',
    version: 1,

    async execute(context: ToolExecutionContext, args: Record<string, unknown>): Promise<ToolExecutionOutcome> {
        const conversationId = String(args.conversationId);
        const content = String(args.content);

        try {
            await assertConversationParticipant(context.actorUserId, conversationId);
        } catch (err) {
            if (err instanceof AppError) {
                return { status: 'failed_terminal', failureCode: 'entity_changed', verified: false };
            }
            throw err;
        }

        const { message, idempotentReplay } = await persistUserMessage({
            actorUserId: context.actorUserId,
            conversationId,
            content,
            clientMessageId: context.idempotencyKey,
        });

        // Sección 29: verificación desde la fuente canónica -- persistUserMessage
        // ya re-lee la fila real tras el insert (MESSAGE_API_SELECT), nunca un
        // objeto optimista construido en memoria; se re-verifica aquí que
        // coincide exactamente con lo autorizado, nunca se asume.
        const verified = message.conversation_id === conversationId
            && message.sender_id === context.actorUserId
            && message.content === content;

        if (!verified) {
            return { status: 'failed_terminal', failureCode: 'verification_failed', verified: false, resultRef: { messageId: message.id } };
        }

        return {
            status: 'succeeded',
            verified: true,
            messageSent: true,
            resultRef: { messageId: message.id, idempotentReplay },
            createdEntityRefs: idempotentReplay ? [] : [{ entityType: 'message', entityId: message.id }],
        };
    },
};
