import { describe, expect, it, vi, beforeEach } from 'vitest';

vi.mock('../src/services/agentOrchestrator.service', () => ({
    runAgent: vi.fn(),
}));

import * as orchestrator from '../src/services/agentOrchestrator.service';
import { respond } from '../src/controllers/agent.controller';
import { AppError } from '../src/utils/AppError';

const mockRunAgent = vi.mocked(orchestrator.runAgent);

function createResponse() {
    const response: any = {};
    response.status = vi.fn(() => response);
    response.json = vi.fn(() => response);
    return response;
}

function fakeAgentResponse(overrides: Partial<Record<string, any>> = {}) {
    return {
        status: 'answered', answer: 'Tienes un compromiso pendiente.',
        claims: [{ text: 'x', sourceRefs: [{ sourceType: 'commitment', sourceId: 'cm1' }] }],
        citations: [{ sourceType: 'commitment', sourceId: 'cm1' }],
        diagnostics: { synthesizerUsed: 'llm', model: 'gpt-4o-mini', durationMs: 120, sourceCount: 1, contextBuildMs: 50, synthesisMs: 70, totalMs: 120 },
        ...overrides,
    };
}

beforeEach(() => {
    mockRunAgent.mockReset();
});

describe('M-1F: POST /agent/respond — controller', () => {
    it('lee actorUserId de req.user.id, nunca del body', async () => {
        mockRunAgent.mockResolvedValue(fakeAgentResponse() as any);
        const req: any = { user: { id: 'real-user-id' }, body: { input: 'x', userId: 'spoofed-id', actorUserId: 'also-spoofed' } };
        const res = createResponse();

        await respond(req, res);

        expect(mockRunAgent).toHaveBeenCalledWith(expect.objectContaining({ actorUserId: 'real-user-id' }));
        const calledWith = mockRunAgent.mock.calls[0][0] as any;
        expect(calledWith.actorUserId).not.toBe('spoofed-id');
        expect(calledWith).not.toHaveProperty('userId');
    });

    it('request válida -> 200 con la forma pública (sin diagnostics/claims internos)', async () => {
        mockRunAgent.mockResolvedValue(fakeAgentResponse() as any);
        const req: any = { user: { id: 'u1' }, body: { input: '¿Qué le prometí a Laura?' } };
        const res = createResponse();

        await respond(req, res);

        expect(res.status).toHaveBeenCalledWith(200);
        const payload = res.json.mock.calls[0][0];
        expect(payload).toEqual({
            status: 'answered',
            answer: 'Tienes un compromiso pendiente.',
            citations: [{ sourceType: 'commitment', sourceId: 'cm1' }],
            followUp: undefined,
        });
        expect(payload).not.toHaveProperty('diagnostics');
        expect(payload).not.toHaveProperty('claims');
    });

    it('status no_evidence -> HTTP 200, nunca un error', async () => {
        mockRunAgent.mockResolvedValue(fakeAgentResponse({ status: 'no_evidence', answer: 'No encontré nada.', citations: [] }) as any);
        const req: any = { user: { id: 'u1' }, body: { input: 'x' } };
        const res = createResponse();

        await respond(req, res);
        expect(res.status).toHaveBeenCalledWith(200);
        expect(res.json.mock.calls[0][0].status).toBe('no_evidence');
    });

    it('status capability_gap -> HTTP 200, nunca un error', async () => {
        mockRunAgent.mockResolvedValue(fakeAgentResponse({ status: 'capability_gap', answer: 'Todavía no puedo buscar eso así.', citations: [] }) as any);
        const req: any = { user: { id: 'u1' }, body: { input: 'x' } };
        const res = createResponse();

        await respond(req, res);
        expect(res.status).toHaveBeenCalledWith(200);
        expect(res.json.mock.calls[0][0].status).toBe('capability_gap');
    });

    it('status needs_clarification -> HTTP 200 con followUp', async () => {
        mockRunAgent.mockResolvedValue(fakeAgentResponse({
            status: 'needs_clarification', answer: '¿A cuál Laura te refieres?', citations: [],
            followUp: { type: 'clarify_person', question: '¿A cuál Laura te refieres?', options: [{ id: 'p1', label: 'Laura Gómez' }, { id: 'p2', label: 'Laura Pérez' }] },
        }) as any);
        const req: any = { user: { id: 'u1' }, body: { input: 'x' } };
        const res = createResponse();

        await respond(req, res);
        expect(res.status).toHaveBeenCalledWith(200);
        const payload = res.json.mock.calls[0][0];
        expect(payload.status).toBe('needs_clarification');
        expect(payload.followUp.options).toHaveLength(2);
    });

    it('un 403 de autorización (conversationId ajeno) se propaga como 403 con mensaje seguro', async () => {
        mockRunAgent.mockRejectedValue(new AppError('You are not a participant of this conversation', 403));
        const req: any = { user: { id: 'outsider' }, body: { input: 'x', conversationId: 'conv-ajeno' } };
        const res = createResponse();

        await respond(req, res);
        expect(res.status).toHaveBeenCalledWith(403);
        expect(res.json.mock.calls[0][0].error).toBe('You are not a participant of this conversation');
    });

    it('un error inesperado (no AppError) -> 500 con mensaje genérico, nunca detalle del proveedor', async () => {
        mockRunAgent.mockRejectedValue(new Error('OpenAI API key abc123 rejected by upstream at model gpt-4o-mini'));
        const req: any = { user: { id: 'u1' }, body: { input: 'x' } };
        const res = createResponse();

        await respond(req, res);
        expect(res.status).toHaveBeenCalledWith(500);
        const payload = res.json.mock.calls[0][0];
        expect(payload.error).not.toContain('OpenAI');
        expect(payload.error).not.toContain('gpt-4o-mini');
        expect(payload.error).not.toContain('abc123');
    });

    it('nunca filtra diagnostics internos (model/durations/retrieval plan) en ninguna respuesta', async () => {
        mockRunAgent.mockResolvedValue(fakeAgentResponse() as any);
        const req: any = { user: { id: 'u1' }, body: { input: 'x' } };
        const res = createResponse();

        await respond(req, res);
        const payload = JSON.stringify(res.json.mock.calls[0][0]);
        expect(payload).not.toContain('gpt-4o-mini');
        expect(payload).not.toContain('contextBuildMs');
        expect(payload).not.toContain('synthesizerUsed');
    });
});
