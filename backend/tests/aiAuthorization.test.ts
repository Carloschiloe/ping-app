import { describe, expect, it, vi } from 'vitest';
import { createSupabaseAdminMock, setSupabaseAdminMock, supabaseAdminMockModule } from './helpers/supabaseMock';

vi.mock('../src/lib/supabaseAdmin', () => supabaseAdminMockModule());
vi.mock('../src/services/synthesis.service', () => ({
    askPing: vi.fn(),
    summarizeConversation: vi.fn(),
}));
vi.mock('../src/services/message.service', () => ({
    analyzeAndSuggestTask: vi.fn(),
}));
vi.mock('../src/services/transcription.service', () => ({
    transcribeAudio: vi.fn(),
}));

function responseMock() {
    const res: any = {
        status: vi.fn(() => res),
        json: vi.fn(() => res),
    };
    return res;
}

describe('AI route authorization', () => {
    it('no resume una conversación ajena', async () => {
        setSupabaseAdminMock(createSupabaseAdminMock({
            conversation_participants: [{ data: null, error: null }],
        }));
        const { summarize } = await import('../src/controllers/ai.controller');
        const req: any = { user: { id: 'intruder' }, body: { conversationId: 'c1' } };
        const res = responseMock();
        const next = vi.fn();

        await summarize(req, res, next);

        expect(next).toHaveBeenCalledTimes(1);
        expect((next.mock.calls[0][0] as Error).message).toBe('You do not have access to this conversation');
    });

    it('permite resumir al participante autorizado', async () => {
        const messages = [{ id: 'm1', content: 'contenido autorizado' }];
        setSupabaseAdminMock(createSupabaseAdminMock({
            conversation_participants: [{ data: { conversation_id: 'c1', role: 'member' }, error: null }],
            messages: [{ data: messages, error: null }],
        }));
        const synthesis = await import('../src/services/synthesis.service');
        vi.mocked(synthesis.summarizeConversation).mockResolvedValue('resumen autorizado');
        const { summarize } = await import('../src/controllers/ai.controller');
        const req: any = { user: { id: 'participant' }, body: { conversationId: 'c1' } };
        const res = responseMock();
        const next = vi.fn();

        await summarize(req, res, next);

        expect(next).not.toHaveBeenCalled();
        expect(synthesis.summarizeConversation).toHaveBeenCalledWith(messages);
        expect(res.status).toHaveBeenCalledWith(200);
        expect(res.json).toHaveBeenCalledWith({ summary: 'resumen autorizado' });
    });

    it('no analiza un mensaje de una conversación ajena', async () => {
        setSupabaseAdminMock(createSupabaseAdminMock({
            messages: [{ data: { id: 'm1', conversation_id: 'c1', content: 'privado' }, error: null }],
            conversation_participants: [{ data: null, error: null }],
        }));
        const { analyzeMessage } = await import('../src/controllers/ai.controller');
        const req: any = { user: { id: 'intruder' }, params: { id: 'm1' } };
        const res = responseMock();
        const next = vi.fn();

        await analyzeMessage(req, res, next);

        expect(next).toHaveBeenCalledTimes(1);
        expect((next.mock.calls[0][0] as Error).message).toBe('You do not have access to this conversation');
    });
});
