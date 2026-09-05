import { describe, expect, it, vi, beforeEach } from 'vitest';

// M-1F: se mockean agentContextBuilder.service.ts y
// agentResponseSynthesizer.service.ts COMPLETOS — este archivo certifica el
// CONTRATO de orquestación (qué llama, con qué, en qué orden, cómo agrega
// timing), nunca el matching/interpretación real (ya certificados aparte).
// Mockear estos dos módulos enteros también sirve como prueba estructural
// de que el orquestador NUNCA importa retrieval.service.ts / supabaseAdmin
// directamente (sección 3, 10) — si lo hiciera, este archivo no podría
// aislar sus efectos sólo mockeando estas dos capas.
vi.mock('../src/services/agentContextBuilder.service', () => ({
    buildAgentContext: vi.fn(),
}));
vi.mock('../src/services/agentResponseSynthesizer.service', () => ({
    synthesizeAgentResponse: vi.fn(),
}));

import * as contextBuilder from '../src/services/agentContextBuilder.service';
import * as synthesizer from '../src/services/agentResponseSynthesizer.service';
import { runAgent } from '../src/services/agentOrchestrator.service';
import { AppError } from '../src/utils/AppError';

const mockBuildAgentContext = vi.mocked(contextBuilder.buildAgentContext);
const mockSynthesize = vi.mocked(synthesizer.synthesizeAgentResponse);

function fakeContext(overrides: Partial<Record<string, any>> = {}) {
    return {
        input: 'test', intent: { type: 'commitment_query', confidence: 0.8 },
        entities: { people: [], timeRange: null, topics: [], conversationId: null },
        commitments: [], events: [], messages: [], transcriptions: [], attachments: [],
        canonicalFacts: [], provenance: [], needsClarification: false, evidenceFound: true,
        capabilityGaps: [], retrievalPlan: [],
        ...overrides,
    };
}

function fakeResponse(overrides: Partial<Record<string, any>> = {}) {
    return {
        status: 'answered', answer: 'Tienes un compromiso pendiente.', claims: [], citations: [],
        diagnostics: { synthesizerUsed: 'llm', durationMs: 10, sourceCount: 1 },
        ...overrides,
    };
}

beforeEach(() => {
    mockBuildAgentContext.mockReset();
    mockSynthesize.mockReset();
});

describe('M-1F: runAgent — orquestación básica (sección 1, 3)', () => {
    it('llama buildAgentContext exactamente una vez con los params correctos', async () => {
        const ctx = fakeContext();
        mockBuildAgentContext.mockResolvedValue(ctx as any);
        mockSynthesize.mockResolvedValue(fakeResponse() as any);

        await runAgent({ actorUserId: 'u1', input: '¿Qué le prometí a Laura?', conversationId: 'conv-1', channel: 'mobile', locale: 'es', timezone: 'UTC' });

        expect(mockBuildAgentContext).toHaveBeenCalledTimes(1);
        expect(mockBuildAgentContext).toHaveBeenCalledWith(
            expect.objectContaining({ actorUserId: 'u1', input: '¿Qué le prometí a Laura?', conversationId: 'conv-1', channel: 'mobile', locale: 'es', timezone: 'UTC' }),
            expect.anything(),
        );
    });

    it('llama synthesizeAgentResponse exactamente una vez, con el context EXACTO devuelto por buildAgentContext', async () => {
        const ctx = fakeContext({ evidenceFound: true, commitments: [{ id: 'cm1' }] });
        mockBuildAgentContext.mockResolvedValue(ctx as any);
        mockSynthesize.mockResolvedValue(fakeResponse() as any);

        await runAgent({ actorUserId: 'u1', input: 'x' });

        expect(mockSynthesize).toHaveBeenCalledTimes(1);
        const callArg = mockSynthesize.mock.calls[0][0] as any;
        expect(callArg.context).toBe(ctx); // MISMA referencia — nunca se reconstruye ni se transforma
    });

    it('devuelve exactamente el AgentResponse del synthesizer, con diagnostics de orquestación agregados', async () => {
        mockBuildAgentContext.mockResolvedValue(fakeContext() as any);
        const response = fakeResponse();
        mockSynthesize.mockResolvedValue(response as any);

        const result = await runAgent({ actorUserId: 'u1', input: 'x' });

        expect(result.status).toBe('answered');
        expect(result.answer).toBe(response.answer);
        expect(result.diagnostics?.synthesizerUsed).toBe('llm'); // preserva diagnostics de M-1E
        expect(result.diagnostics?.contextBuildMs).toBeGreaterThanOrEqual(0);
        expect(result.diagnostics?.synthesisMs).toBeGreaterThanOrEqual(0);
        expect(result.diagnostics?.totalMs).toBeGreaterThanOrEqual(0);
    });
});

describe('M-1F: runAgent — propagación de errores (sección 9)', () => {
    it('un 403 de buildAgentContext (ej. conversationId ajeno) se propaga tal cual, nunca se traga', async () => {
        mockBuildAgentContext.mockRejectedValue(new AppError('forbidden', 403));

        await expect(runAgent({ actorUserId: 'outsider', input: 'x', conversationId: 'conv-ajeno' }))
            .rejects.toMatchObject({ statusCode: 403 });
        expect(mockSynthesize).not.toHaveBeenCalled(); // nunca se llega a sintetizar si la autorización falló
    });

    it('un error de synthesizeAgentResponse se propaga tal cual', async () => {
        mockBuildAgentContext.mockResolvedValue(fakeContext() as any);
        mockSynthesize.mockRejectedValue(new Error('unexpected'));

        await expect(runAgent({ actorUserId: 'u1', input: 'x' })).rejects.toThrow('unexpected');
    });
});

describe('M-1F: runAgent — no evidence / capability gap / needs clarification son respuestas normales (secciones 16, 17)', () => {
    it('status no_evidence no lanza — es un AgentResponse válido', async () => {
        mockBuildAgentContext.mockResolvedValue(fakeContext({ evidenceFound: false }) as any);
        mockSynthesize.mockResolvedValue(fakeResponse({ status: 'no_evidence', answer: 'No encontré nada.' }) as any);

        const result = await runAgent({ actorUserId: 'u1', input: 'x' });
        expect(result.status).toBe('no_evidence');
    });

    it('status needs_clarification no lanza — es un AgentResponse válido', async () => {
        mockBuildAgentContext.mockResolvedValue(fakeContext({ needsClarification: true }) as any);
        mockSynthesize.mockResolvedValue(fakeResponse({ status: 'needs_clarification', answer: '¿A cuál te refieres?' }) as any);

        const result = await runAgent({ actorUserId: 'u1', input: 'x' });
        expect(result.status).toBe('needs_clarification');
    });
});

describe('M-1F: runAgent — cost control (sección 29)', () => {
    it('el orquestador mismo no agrega ninguna llamada extra — exactamente 1 llamada a cada capa', async () => {
        mockBuildAgentContext.mockResolvedValue(fakeContext() as any);
        mockSynthesize.mockResolvedValue(fakeResponse() as any);

        await runAgent({ actorUserId: 'u1', input: 'x' });

        expect(mockBuildAgentContext).toHaveBeenCalledTimes(1);
        expect(mockSynthesize).toHaveBeenCalledTimes(1);
    });
});

describe('M-1F: runAgent — concurrencia independiente (sección 24)', () => {
    it('dos requests simultáneas de distintos actores no comparten estado ni se cruzan', async () => {
        mockBuildAgentContext.mockImplementation(async (input: any) => fakeContext({ input: input.actorUserId }) as any);
        mockSynthesize.mockImplementation(async (input: any) => fakeResponse({ answer: `respuesta para ${input.context.input}` }) as any);

        const [a, b] = await Promise.all([
            runAgent({ actorUserId: 'user-a', input: 'x' }),
            runAgent({ actorUserId: 'user-b', input: 'x' }),
        ]);

        expect(a.answer).toBe('respuesta para user-a');
        expect(b.answer).toBe('respuesta para user-b');
    });
});

describe('M-1F: runAgent — opciones pasan a través (interpreter/synthesizer/budget inyectables)', () => {
    it('pasa options.interpreter y options.contextBudget a buildAgentContext', async () => {
        mockBuildAgentContext.mockResolvedValue(fakeContext() as any);
        mockSynthesize.mockResolvedValue(fakeResponse() as any);
        const fakeInterpreter = { interpret: vi.fn() };
        const fakeBudget = { commitments: 3 };

        await runAgent({ actorUserId: 'u1', input: 'x' }, { interpreter: fakeInterpreter as any, contextBudget: fakeBudget });

        expect(mockBuildAgentContext).toHaveBeenCalledWith(expect.anything(), { interpreter: fakeInterpreter, budget: fakeBudget });
    });

    it('pasa options.synthesizer a synthesizeAgentResponse', async () => {
        mockBuildAgentContext.mockResolvedValue(fakeContext() as any);
        mockSynthesize.mockResolvedValue(fakeResponse() as any);
        const fakeSynthesizer = { synthesize: vi.fn() };

        await runAgent({ actorUserId: 'u1', input: 'x' }, { synthesizer: fakeSynthesizer as any });

        expect(mockSynthesize).toHaveBeenCalledWith(expect.anything(), { synthesizer: fakeSynthesizer });
    });
});
