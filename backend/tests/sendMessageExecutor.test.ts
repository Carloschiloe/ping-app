import { describe, it, expect, vi, beforeEach } from 'vitest';

// M-4 P1 GAP CLOSED — sendMessageExecutor had ZERO dedicated test coverage
// (confirmed via repo-wide grep before writing this file), despite being
// the executor for the tool most likely to run on every real conversation
// turn. Covers: the TOCTOU conversation-membership re-check at execution
// time, idempotent replay (same idempotencyKey -> same message, no second
// send), and verification-before-success against the canonically re-read
// row (never an optimistic in-memory object).
vi.mock('../src/services/messagingApplication.service', () => ({
    persistUserMessage: vi.fn(),
}));
vi.mock('../src/utils/authz', () => ({
    assertConversationParticipant: vi.fn(),
}));

import { sendMessageExecutor } from '../src/services/toolExecutors/sendMessageExecutor';
import { persistUserMessage } from '../src/services/messagingApplication.service';
import { assertConversationParticipant } from '../src/utils/authz';
import { AppError } from '../src/utils/AppError';

const mockPersistUserMessage = vi.mocked(persistUserMessage);
const mockAssertConversationParticipant = vi.mocked(assertConversationParticipant);

function ctx() {
    return { actorUserId: 'actor-1', idempotencyKey: 'idem-key-1' };
}

beforeEach(() => {
    mockPersistUserMessage.mockReset();
    mockAssertConversationParticipant.mockReset().mockResolvedValue(undefined as any);
});

describe('sendMessageExecutor — TOCTOU / idempotency / verification (M-4 sección 43)', () => {
    it('entity_changed: el actor ya NO es participante de la conversación en el momento de ejecutar (TOCTOU real, nunca confía en el snapshot de planificación)', async () => {
        mockAssertConversationParticipant.mockRejectedValueOnce(new AppError('not a participant', 403));

        const outcome = await sendMessageExecutor.execute(ctx(), { conversationId: 'conv-1', content: 'hola' });

        expect(outcome).toEqual({ status: 'failed_terminal', failureCode: 'entity_changed', verified: false });
        expect(mockPersistUserMessage).not.toHaveBeenCalled();
    });

    it('un error inesperado (no AppError) del chequeo de participación se relanza, nunca se traga', async () => {
        mockAssertConversationParticipant.mockRejectedValueOnce(new TypeError('boom'));
        await expect(sendMessageExecutor.execute(ctx(), { conversationId: 'conv-1', content: 'hola' })).rejects.toThrow(TypeError);
    });

    it('éxito: el mensaje persistido coincide exactamente con lo autorizado (conversationId/sender/content) -- succeeded, verified:true, messageSent:true', async () => {
        mockPersistUserMessage.mockResolvedValueOnce({
            message: { id: 'msg-1', conversation_id: 'conv-1', sender_id: 'actor-1', content: 'hola' },
            idempotentReplay: false,
        } as any);

        const outcome = await sendMessageExecutor.execute(ctx(), { conversationId: 'conv-1', content: 'hola' });

        expect(outcome).toEqual({
            status: 'succeeded', verified: true, messageSent: true,
            resultRef: { messageId: 'msg-1', idempotentReplay: false },
            createdEntityRefs: [{ entityType: 'message', entityId: 'msg-1' }],
        });
        expect(mockPersistUserMessage).toHaveBeenCalledWith({
            actorUserId: 'actor-1', conversationId: 'conv-1', content: 'hola', clientMessageId: 'idem-key-1',
        });
    });

    it('idempotentReplay:true (mismo idempotencyKey ya usado antes) -- succeeded, pero createdEntityRefs vacío, nunca un segundo "created" para el mismo mensaje', async () => {
        mockPersistUserMessage.mockResolvedValueOnce({
            message: { id: 'msg-1', conversation_id: 'conv-1', sender_id: 'actor-1', content: 'hola' },
            idempotentReplay: true,
        } as any);

        const outcome = await sendMessageExecutor.execute(ctx(), { conversationId: 'conv-1', content: 'hola' });

        expect(outcome.status).toBe('succeeded');
        expect(outcome.resultRef).toEqual({ messageId: 'msg-1', idempotentReplay: true });
        expect(outcome.createdEntityRefs).toEqual([]);
    });

    it('la fila canónica re-leída NO coincide con lo autorizado (contenido/remitente/conversación distintos) -- verification_failed, nunca succeeded pese a que persistUserMessage no lanzó', async () => {
        mockPersistUserMessage.mockResolvedValueOnce({
            message: { id: 'msg-1', conversation_id: 'conv-1', sender_id: 'someone-else', content: 'hola' }, // sender no coincide
            idempotentReplay: false,
        } as any);

        const outcome = await sendMessageExecutor.execute(ctx(), { conversationId: 'conv-1', content: 'hola' });

        expect(outcome).toEqual({ status: 'failed_terminal', failureCode: 'verification_failed', verified: false, resultRef: { messageId: 'msg-1' } });
    });

    it('content frozen: el contenido citado en la respuesta es exactamente el de los argumentos autorizados, nunca re-derivado', async () => {
        mockPersistUserMessage.mockResolvedValueOnce({
            message: { id: 'msg-1', conversation_id: 'conv-1', sender_id: 'actor-1', content: 'llegaré tarde' },
            idempotentReplay: false,
        } as any);

        await sendMessageExecutor.execute(ctx(), { conversationId: 'conv-1', content: 'llegaré tarde' });
        expect(mockPersistUserMessage).toHaveBeenCalledWith(expect.objectContaining({ content: 'llegaré tarde' }));
    });
});
