import { describe, it, expect, vi } from 'vitest';
import { createSupabaseAdminMock, setSupabaseAdminMock, supabaseAdminMockModule } from './helpers/supabaseMock';

vi.mock('../src/lib/supabaseAdmin', () => supabaseAdminMockModule());

// processUserMessage dispara analyzeAndSuggestTask en segundo plano (no
// bloqueante). Se mockea ai.service para no llamar nunca a OpenAI desde los
// tests unitarios, incluso en ese camino en segundo plano.
vi.mock('../src/services/ai.service', () => ({
    extractCommitment: vi.fn(async () => ({ hasCommitment: false, title: null, dueAt: null, replyText: null, assignedToName: null, type: 'task' })),
    transcribeAudio: vi.fn(async () => null),
}));

describe('processUserMessage (mensaje humano)', () => {
    it('el insert de un mensaje humano incluye sender_id', async () => {
        const mock = createSupabaseAdminMock({
            conversation_participants: [{ data: { conversation_id: 'c1', role: 'member' }, error: null }],
            messages: [
                { data: { id: 'm1', conversation_id: 'c1' }, error: null },
                { data: { id: 'm1', conversation_id: 'c1', content: 'hola', sender_id: 'u1' }, error: null },
            ],
        });
        setSupabaseAdminMock(mock);

        const { processUserMessage } = await import('../src/services/message.service');
        await processUserMessage('u1', 'hola', 'c1');

        const insertPayload = mock.getInsertCalls('messages')[0];
        expect(insertPayload.sender_id).toBe('u1');
    });

    it('el insert de un mensaje humano NO incluye la columna user_id (eliminada en V2)', async () => {
        const mock = createSupabaseAdminMock({
            conversation_participants: [{ data: { conversation_id: 'c1', role: 'member' }, error: null }],
            messages: [
                { data: { id: 'm1', conversation_id: 'c1' }, error: null },
                { data: { id: 'm1', conversation_id: 'c1', content: 'hola', sender_id: 'u1' }, error: null },
            ],
        });
        setSupabaseAdminMock(mock);

        const { processUserMessage } = await import('../src/services/message.service');
        await processUserMessage('u1', 'hola', 'c1');

        const insertPayload = mock.getInsertCalls('messages')[0];
        expect(insertPayload).not.toHaveProperty('user_id');
        expect(insertPayload.content).toBe('hola');
    });

    it('la respuesta expone un alias "text" ademas de "content" (compatibilidad temporal con mobile)', async () => {
        const mock = createSupabaseAdminMock({
            conversation_participants: [{ data: { conversation_id: 'c1', role: 'member' }, error: null }],
            messages: [
                { data: { id: 'm1', conversation_id: 'c1' }, error: null },
                { data: { id: 'm1', conversation_id: 'c1', content: 'hola', metadata: {}, sender_id: 'u1' }, error: null },
            ],
        });
        setSupabaseAdminMock(mock);

        const { processUserMessage } = await import('../src/services/message.service');
        const result = await processUserMessage('u1', 'hola', 'c1');

        expect(result.message.text).toBe('hola');
    });

    it('rechaza una respuesta cuyo mensaje origen no pertenece a la conversación', async () => {
        const mock = createSupabaseAdminMock({
            conversation_participants: [{ data: { conversation_id: 'c1', role: 'member' }, error: null }],
            messages: [{ data: null, error: null }],
        });
        setSupabaseAdminMock(mock);

        const { processUserMessage } = await import('../src/services/message.service');
        await expect(processUserMessage('u1', 'respuesta', 'c1', 'm-otra'))
            .rejects.toThrow('Message not found in this conversation');

        expect(mock.getInsertCalls('messages')).toHaveLength(0);
        expect(mock.getEqCalls('messages')).toEqual([
            ['id', 'm-otra'],
            ['conversation_id', 'c1'],
        ]);
    });

    it('permite mencionar sólo a una persona participante de la conversación', async () => {
        const mock = createSupabaseAdminMock({
            conversation_participants: [
                { data: { conversation_id: 'c1', role: 'member' }, error: null },
                { data: null, error: null },
            ],
        });
        setSupabaseAdminMock(mock);

        const { processUserMessage } = await import('../src/services/message.service');
        await expect(processUserMessage('u1', 'hola @otro', 'c1', undefined, 'u-ajeno'))
            .rejects.toThrow('Referenced user is not a participant in this conversation');

        expect(mock.getInsertCalls('messages')).toHaveLength(0);
    });
});

describe('insertSystemMessage', () => {
    it('mensaje de sistema con actor conocido: sender_id = userId y system_event_type presente', async () => {
        const mock = createSupabaseAdminMock({
            messages: [{ data: { id: 'm2' }, error: null }],
        });
        setSupabaseAdminMock(mock);

        const { insertSystemMessage } = await import('../src/services/message.service');
        await insertSystemMessage('c1', 'texto de sistema', 'u1', {}, 'commitment_created');

        const insertPayload = mock.getInsertCalls('messages')[0];
        expect(insertPayload.sender_id).toBe('u1');
        expect(insertPayload.system_event_type).toBe('commitment_created');
    });

    it('mensaje de sistema sin actor: permite sender_id null, pero exige system_event_type', async () => {
        const mock = createSupabaseAdminMock({
            messages: [{ data: { id: 'm3' }, error: null }],
        });
        setSupabaseAdminMock(mock);

        const { insertSystemMessage } = await import('../src/services/message.service');
        await insertSystemMessage('c1', 'resumen matutino', undefined, {}, 'morning_summary');

        const insertPayload = mock.getInsertCalls('messages')[0];
        expect(insertPayload.sender_id).toBeNull();
        expect(insertPayload.system_event_type).toBe('morning_summary');
    });

    it('system_event_type tiene un default no vacio incluso si el llamador no lo especifica (compatibilidad con llamadores existentes)', async () => {
        const mock = createSupabaseAdminMock({
            messages: [{ data: { id: 'm4' }, error: null }],
        });
        setSupabaseAdminMock(mock);

        const { insertSystemMessage } = await import('../src/services/message.service');
        await insertSystemMessage('c1', 'texto', 'u1');

        const insertPayload = mock.getInsertCalls('messages')[0];
        expect(insertPayload.system_event_type).toBeTruthy();
    });
});
