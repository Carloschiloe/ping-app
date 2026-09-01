import { describe, it, expect, vi } from 'vitest';
import { createSupabaseAdminMock, setSupabaseAdminMock, supabaseAdminMockModule } from './helpers/supabaseMock';

vi.mock('../src/lib/supabaseAdmin', () => supabaseAdminMockModule());

// processUserMessage dispara analyzeAndSuggestTask en segundo plano (no
// bloqueante). Se mockea ai.service para no llamar nunca a OpenAI desde los
// tests unitarios, incluso en ese camino en segundo plano.
const aiMocks = vi.hoisted(() => ({
    extractCommitment: vi.fn(async () => ({ hasCommitment: false, title: null, dueAt: null, replyText: null, assignedToName: null, type: 'task' })),
    transcribeAudio: vi.fn(async () => null as string | null),
}));
vi.mock('../src/services/ai.service', () => aiMocks);

const trustedMediaMocks = vi.hoisted(() => ({
    downloadTrustedStorageFile: vi.fn(async () => undefined),
    removeTemporaryFile: vi.fn(async () => undefined),
}));
vi.mock('../src/utils/trustedMedia', () => trustedMediaMocks);

const { wakeAudioTranscriptionWorker } = vi.hoisted(() => ({
    wakeAudioTranscriptionWorker: vi.fn(),
}));
vi.mock('../src/services/audioTranscriptionWorker.service', () => ({
    wakeAudioTranscriptionWorker,
}));

describe('processUserMessage (mensaje humano)', () => {
    it('el insert de un mensaje humano incluye sender_id', async () => {
        const mock = createSupabaseAdminMock({
            conversation_participants: [{ data: { conversation_id: 'c1', role: 'member' }, error: null }],
            messages: [{ data: { id: 'm1', conversation_id: 'c1', content: 'hola', sender_id: 'u1' }, error: null }],
            'rpc:persist_message_with_attachment': [{ data: [{ message_id: 'm1', idempotent_replay: false }], error: null }],
        });
        setSupabaseAdminMock(mock);

        const { processUserMessage } = await import('../src/services/message.service');
        await processUserMessage('u1', 'hola', 'c1');

        expect(mock.getRpcCalls()[0].args.p_actor_user_id).toBe('u1');
    });

    it('el insert de un mensaje humano NO incluye la columna user_id (eliminada en V2)', async () => {
        const mock = createSupabaseAdminMock({
            conversation_participants: [{ data: { conversation_id: 'c1', role: 'member' }, error: null }],
            messages: [{ data: { id: 'm1', conversation_id: 'c1', content: 'hola', sender_id: 'u1' }, error: null }],
            'rpc:persist_message_with_attachment': [{ data: [{ message_id: 'm1', idempotent_replay: false }], error: null }],
        });
        setSupabaseAdminMock(mock);

        const { processUserMessage } = await import('../src/services/message.service');
        await processUserMessage('u1', 'hola', 'c1');

        const rpcArgs = mock.getRpcCalls()[0].args;
        expect(rpcArgs).not.toHaveProperty('p_user_id');
        expect(rpcArgs.p_content).toBe('hola');
    });

    it('la respuesta expone un alias "text" ademas de "content" (compatibilidad temporal con mobile)', async () => {
        const mock = createSupabaseAdminMock({
            conversation_participants: [{ data: { conversation_id: 'c1', role: 'member' }, error: null }],
            messages: [{ data: { id: 'm1', conversation_id: 'c1', content: 'hola', metadata: {}, sender_id: 'u1' }, error: null }],
            'rpc:persist_message_with_attachment': [{ data: [{ message_id: 'm1', idempotent_replay: false }], error: null }],
        });
        setSupabaseAdminMock(mock);

        const { processUserMessage } = await import('../src/services/message.service');
        const result = await processUserMessage('u1', 'hola', 'c1');

        expect(result.message.text).toBe('hola');
    });

    it('persiste de inmediato una sugerencia determinista sin esperar a OpenAI', async () => {
        const mock = createSupabaseAdminMock({
            conversation_participants: [{ data: { conversation_id: 'c1', role: 'member' }, error: null }],
            messages: [{
                    data: {
                        id: 'm-fast',
                        conversation_id: 'c1',
                        content: 'Mañana a las 12:00 llamar a Alejandra',
                        sender_id: 'u1',
                    },
                    error: null,
                }],
            'rpc:persist_message_with_attachment': [{ data: [{ message_id: 'm-fast', idempotent_replay: false }], error: null }],
        });
        setSupabaseAdminMock(mock);

        const { processUserMessage } = await import('../src/services/message.service');
        await processUserMessage('u1', 'Mañana a las 12:00 llamar a Alejandra', 'c1');

        const rpcMetadata = mock.getRpcCalls()[0].args.p_metadata;
        expect(rpcMetadata.suggestedTask).toEqual(expect.objectContaining({
            replyText: 'Agendar',
            type: 'meeting',
        }));
        expect(rpcMetadata.suggestedTask.dueAt).toBeTruthy();
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

    it('returns the existing message when a client_message_id is retried', async () => {
        const clientMessageId = '33333333-3333-4333-8333-333333333333';
        const mock = createSupabaseAdminMock({
            conversation_participants: [{ data: { conversation_id: 'c1', role: 'member' }, error: null }],
            messages: [{
                data: {
                    id: 'm-existing',
                    conversation_id: 'c1',
                    sender_id: 'u1',
                    content: 'hola',
                    client_message_id: clientMessageId,
                },
                error: null,
            }],
            'rpc:persist_message_with_attachment': [{ data: [{ message_id: 'm-existing', idempotent_replay: true }], error: null }],
        });
        setSupabaseAdminMock(mock);

        const { processUserMessage } = await import('../src/services/message.service');
        const result = await processUserMessage(
            'u1', 'hola', 'c1', undefined, undefined, undefined, clientMessageId
        );

        expect(result.idempotentReplay).toBe(true);
        expect(result.message.id).toBe('m-existing');
        expect(mock.getInsertCalls('messages')).toHaveLength(0);
        expect(mock.getRpcCalls()[0].args.p_client_message_id).toBe(clientMessageId);
    });

    it('persiste audio canonico y despierta el worker sin esperar transcripcion', async () => {
        wakeAudioTranscriptionWorker.mockClear();
        aiMocks.transcribeAudio.mockClear();
        const mock = createSupabaseAdminMock({
            conversation_participants: [{ data: { conversation_id: 'c1', role: 'member' }, error: null }],
            messages: [{
                data: {
                    id: 'm-audio',
                    conversation_id: 'c1',
                    sender_id: 'u1',
                    content: 'Audio',
                    metadata: {},
                    attachments: [{
                        id: 'a1', kind: 'audio', mime_type: 'audio/m4a', duration_ms: 4200,
                        lifecycle_status: 'attached',
                    }],
                },
                error: null,
            }],
            'rpc:persist_message_with_attachment': [{ data: [{ message_id: 'm-audio', idempotent_replay: false }], error: null }],
        });
        setSupabaseAdminMock(mock);

        const { processUserMessage } = await import('../src/services/message.service');
        const result = await processUserMessage(
            'u1', 'Audio', 'c1', undefined, undefined, undefined,
            '55555555-5555-4555-8555-555555555555', undefined, 'a1',
        );

        expect(result.message.content).toBe('Audio');
        expect(result.message.attachment.durationMs).toBe(4200);
        expect(aiMocks.transcribeAudio).not.toHaveBeenCalled();
        await vi.waitFor(() => expect(wakeAudioTranscriptionWorker).toHaveBeenCalledTimes(1));
    });

    it('mantiene el adapter historico [audio]URL mediante trustedMedia', async () => {
        aiMocks.transcribeAudio.mockResolvedValueOnce('Texto historico');
        trustedMediaMocks.downloadTrustedStorageFile.mockClear();
        const mock = createSupabaseAdminMock({
            conversation_participants: [{ data: { conversation_id: 'c1', role: 'member' }, error: null }],
            messages: [{ data: { id: 'm-legacy', conversation_id: 'c1', content: '[audio]https://legacy.invalid/a.m4a', sender_id: 'u1' }, error: null }],
            'rpc:persist_message_with_attachment': [{ data: [{ message_id: 'm-legacy', idempotent_replay: false }], error: null }],
        });
        setSupabaseAdminMock(mock);

        const { processUserMessage } = await import('../src/services/message.service');
        await processUserMessage('u1', '[audio]https://legacy.invalid/a.m4a', 'c1');

        expect(trustedMediaMocks.downloadTrustedStorageFile).toHaveBeenCalledTimes(1);
        expect(aiMocks.transcribeAudio).toHaveBeenCalledTimes(1);
        expect(mock.getRpcCalls()[0].args.p_metadata.transcript).toBe('Texto historico');
    });

    it('persists client_message_id on the first confirmed send', async () => {
        const clientMessageId = '44444444-4444-4444-8444-444444444444';
        const mock = createSupabaseAdminMock({
            conversation_participants: [{ data: { conversation_id: 'c1', role: 'member' }, error: null }],
            messages: [{ data: { id: 'm-new', conversation_id: 'c1', sender_id: 'u1', content: 'hola' }, error: null }],
            'rpc:persist_message_with_attachment': [{ data: [{ message_id: 'm-new', idempotent_replay: false }], error: null }],
        });
        setSupabaseAdminMock(mock);

        const { processUserMessage } = await import('../src/services/message.service');
        await processUserMessage('u1', 'hola', 'c1', undefined, undefined, undefined, clientMessageId);
        expect(mock.getRpcCalls()[0].args.p_client_message_id).toBe(clientMessageId);
    });
});

describe('audio-derived suggestion parity', () => {
    it('usa el mismo analizador de texto y no crea compromiso ni persiste fuera del merge atomico', async () => {
        const mock = createSupabaseAdminMock({});
        setSupabaseAdminMock(mock);

        const { analyzeAndSuggestTask } = await import('../src/services/message.service');
        const suggestion = await analyzeAndSuggestTask(
            'm-audio',
            'Mañana llamar a Juan',
            undefined,
            undefined,
            'c1',
            { persist: false },
        );

        expect(suggestion).toEqual(expect.objectContaining({
            title: expect.any(String),
            dueAt: expect.any(String),
            replyText: 'Agendar',
        }));
        expect(mock.getRpcCalls()).toHaveLength(0);
        expect(mock.getInsertCalls('commitments')).toHaveLength(0);
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
