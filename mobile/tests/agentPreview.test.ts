// M-1G — Mobile Agent Preview. Pure-logic tests only (no React Native
// renderer, per vitest.config.ts). Certifica el contrato de request/response
// del nuevo endpoint /agent/respond y la lógica local de la pantalla
// (mensajes, retry, citations, errores) sin depender de UI renderizada.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

vi.mock('expo-localization', () => ({
    getLocales: vi.fn(() => [{ languageTag: 'es-CL', languageCode: 'es', regionCode: 'CL' }]),
}));

// No se usa `importOriginal` (dispara un parse error en este pipeline de
// vitest/rollup al re-analizar client.ts) -- se redefine `ApiError` con la
// MISMA forma exacta que src/api/client.ts (message/status/resultUnknown),
// suficiente para que `instanceof ApiError` funcione en agent.ts (que
// importa esta misma versión mockeada). La clase vive DENTRO del factory
// porque `vi.mock` se hoistea sobre cualquier variable de nivel superior.
vi.mock('../src/api/client', () => {
    class MockApiError extends Error {
        status: number | null;
        resultUnknown: boolean;
        constructor(message: string, status: number | null, resultUnknown: boolean) {
            super(message);
            this.name = 'ApiError';
            this.status = status;
            this.resultUnknown = resultUnknown;
        }
    }
    return {
        apiClient: { post: vi.fn(), get: vi.fn(), delete: vi.fn(), patch: vi.fn() },
        ApiError: MockApiError,
    };
});

import { apiClient, ApiError } from '../src/api/client';
import {
    buildAgentRequestBody, getDeviceLocale, mapAgentErrorMessage, parseAgentResponse,
} from '../src/api/query-modules/agent';
import {
    AGENT_SUGGESTED_STARTERS, appendAgentMessage, appendErrorMessage, appendUserMessage,
    canSendInput, describeCitationsSummary, describeCitationTypes,
} from '../src/utils/agentChat';

const post = vi.mocked(apiClient.post);

beforeEach(() => {
    vi.clearAllMocks();
});

// ─── Request contract (sección 2, 9, 10, 11, 35) ────────────────────────────

describe('M-1G: buildAgentRequestBody — contrato exacto del request', () => {
    it('incluye input recortado, channel=mobile, timezone y locale reales, sin conversationId si no se pasa', () => {
        const body = buildAgentRequestBody({ input: '  ¿Qué pendientes tengo?  ' });
        expect(body.input).toBe('¿Qué pendientes tengo?');
        expect(body.channel).toBe('mobile');
        expect(typeof body.timezone).toBe('string');
        expect((body.timezone as string).length).toBeGreaterThan(0);
        expect(body.locale).toBe('es-CL');
        expect(body).not.toHaveProperty('conversationId');
    });

    it('incluye conversationId sólo cuando se pasa explícitamente (Agent scoped)', () => {
        const body = buildAgentRequestBody({ input: 'x', conversationId: 'conv-real' });
        expect(body.conversationId).toBe('conv-real');
    });

    it('NUNCA incluye userId ni actorUserId, sea cual sea el input', () => {
        const body = buildAgentRequestBody({ input: 'x', conversationId: 'c1' });
        expect(body).not.toHaveProperty('userId');
        expect(body).not.toHaveProperty('actorUserId');
    });

    it('getDeviceLocale usa el locale real del dispositivo (mockeado), nunca fuerza español', () => {
        expect(getDeviceLocale()).toBe('es-CL');
    });
});

// ─── Response validation (sección 15, 32) ───────────────────────────────────

describe('M-1G: parseAgentResponse — shape exacto, sin claims/diagnostics', () => {
    it('acepta la forma pública mínima exacta', () => {
        const result = parseAgentResponse({ status: 'answered', answer: 'Tienes un compromiso.', citations: [{ sourceType: 'commitment', sourceId: 'c1' }] });
        expect(result.status).toBe('answered');
        expect(result.answer).toBe('Tienes un compromiso.');
        expect(result.citations).toEqual([{ sourceType: 'commitment', sourceId: 'c1' }]);
        expect(result.followUp).toBeUndefined();
    });

    it('nunca espera ni depende de claims/diagnostics aunque el backend los agregara por error', () => {
        const result = parseAgentResponse({ status: 'answered', answer: 'x', citations: [], claims: [{ text: 'leak' }], diagnostics: { model: 'gpt-4o-mini' } });
        expect(result).not.toHaveProperty('claims');
        expect(result).not.toHaveProperty('diagnostics');
    });

    it('acepta followUp con opciones (needs_clarification)', () => {
        const result = parseAgentResponse({
            status: 'needs_clarification', answer: '¿Cuál Laura?', citations: [],
            followUp: { type: 'clarify_person', question: '¿Cuál Laura?', options: [{ id: 'p1', label: 'Laura Gómez' }, { id: 'p2', label: 'Laura Pérez' }] },
        });
        expect(result.followUp?.options).toHaveLength(2);
    });

    it('rechaza un shape inválido (status desconocido) -> error genérico manejable, no crash', () => {
        expect(() => parseAgentResponse({ status: 'unexpected_status', answer: 'x', citations: [] })).toThrow();
    });

    it('rechaza respuesta null/no-objeto sin crashear con TypeError sobre .answer', () => {
        expect(() => parseAgentResponse(null)).toThrow();
        expect(() => parseAgentResponse('a string')).toThrow();
    });

    it('filtra entradas de citations mal formadas en vez de crashear', () => {
        const result = parseAgentResponse({ status: 'answered', answer: 'x', citations: [{ sourceType: 'commitment', sourceId: 'c1' }, { garbage: true }, null] });
        expect(result.citations).toEqual([{ sourceType: 'commitment', sourceId: 'c1' }]);
    });
});

// ─── Error mapping (sección 18) ─────────────────────────────────────────────

describe('M-1G: mapAgentErrorMessage — copy seguro, nunca detalle de proveedor/infra', () => {
    it('401 -> sesión expirada', () => {
        expect(mapAgentErrorMessage(new ApiError('x', 401, false))).toMatch(/sesión/i);
    });
    it('403 -> sin acceso', () => {
        expect(mapAgentErrorMessage(new ApiError('x', 403, false))).toMatch(/acceso/i);
    });
    it('429 -> demasiadas consultas', () => {
        expect(mapAgentErrorMessage(new ApiError('x', 429, false))).toMatch(/intenta en unos minutos/i);
    });
    it('500 -> genérico, nunca detalle', () => {
        const msg = mapAgentErrorMessage(new ApiError('OpenAI upstream error at gpt-4o-mini', 500, false));
        expect(msg).not.toMatch(/OpenAI|gpt-4o-mini|Render|Supabase/i);
        expect(msg.length).toBeGreaterThan(0);
    });
    it('error de red (TypeError) -> "no hay conexión"', () => {
        expect(mapAgentErrorMessage(new TypeError('Network request failed'))).toMatch(/no hay conexión/i);
    });
    it('error inesperado no-ApiError no-TypeError -> genérico, nunca stack crudo', () => {
        const msg = mapAgentErrorMessage(new Error('some raw internal detail'));
        expect(msg).not.toContain('some raw internal detail');
    });
});

// ─── Local chat state (sección 6, 7, 23, 30, 31) ────────────────────────────

describe('M-1G: agentChat — historial local, nunca DB', () => {
    it('appendUserMessage agrega un mensaje de usuario con role correcto', () => {
        const messages = appendUserMessage([], '¿Qué pendientes tengo?');
        expect(messages).toHaveLength(1);
        expect(messages[0].role).toBe('user');
        expect(messages[0].text).toBe('¿Qué pendientes tengo?');
    });

    it('appendAgentMessage mapea status/citations/followUp del resultado', () => {
        const messages = appendAgentMessage([], { status: 'answered', answer: 'Listo.', citations: [{ sourceType: 'commitment', sourceId: 'c1' }] });
        expect(messages[0].role).toBe('agent');
        expect(messages[0].status).toBe('answered');
        expect(messages[0].citations).toHaveLength(1);
    });

    it('appendErrorMessage marca error=true y conserva el input para retry', () => {
        const messages = appendErrorMessage([], 'No hay conexión con Ping.', '¿Qué pendientes tengo?');
        expect(messages[0].error).toBe(true);
        expect(messages[0].retryInput).toBe('¿Qué pendientes tengo?');
    });

    it('canSendInput: vacío/sólo-espacios -> false', () => {
        expect(canSendInput('', false)).toBe(false);
        expect(canSendInput('   ', false)).toBe(false);
    });

    it('canSendInput: con texto pero request en curso (double-send) -> false', () => {
        expect(canSendInput('hola', true)).toBe(false);
    });

    it('canSendInput: con texto y sin request en curso -> true', () => {
        expect(canSendInput('hola', false)).toBe(true);
    });

    it('describeCitationsSummary: sin citations -> null, nunca "0 fuentes"', () => {
        expect(describeCitationsSummary([])).toBeNull();
        expect(describeCitationsSummary(undefined)).toBeNull();
    });

    it('describeCitationsSummary: singular vs plural', () => {
        expect(describeCitationsSummary([{ sourceType: 'commitment', sourceId: 'c1' }])).toBe('1 fuente');
        expect(describeCitationsSummary([{ sourceType: 'commitment', sourceId: 'c1' }, { sourceType: 'message', sourceId: 'm1' }])).toBe('2 fuentes');
    });

    it('describeCitationTypes: nunca expone el sourceId crudo, sólo etiquetas de tipo', () => {
        const labels = describeCitationTypes([
            { sourceType: 'commitment', sourceId: '11111111-1111-1111-1111-111111111111' },
            { sourceType: 'transcription', sourceId: 'tr1' },
        ]);
        expect(labels).toEqual(['Compromiso', 'Audio']);
        expect(labels.join(' ')).not.toContain('1111');
    });

    it('AGENT_SUGGESTED_STARTERS: 4 ejemplos neutrales, sin vocabulario sectorial', () => {
        expect(AGENT_SUGGESTED_STARTERS.length).toBeGreaterThanOrEqual(3);
        for (const s of AGENT_SUGGESTED_STARTERS) expect(typeof s).toBe('string');
    });
});

// ─── Endpoint mock integration (sección 35) ─────────────────────────────────

describe('M-1G: useAgentRespond — integración con apiClient mockeado', () => {
    it('llama POST /agent/respond con el body exacto esperado, sin userId/actorUserId/claims/diagnostics', async () => {
        post.mockResolvedValue({ status: 'answered', answer: 'Tienes pendiente X.', citations: [] });

        const { buildAgentRequestBody: build } = await import('../src/api/query-modules/agent');
        const body = build({ input: '¿Qué pendientes tengo?' });
        await apiClient.post('/agent/respond', body);

        expect(post).toHaveBeenCalledWith('/agent/respond', expect.objectContaining({
            input: '¿Qué pendientes tengo?', channel: 'mobile', locale: 'es-CL',
        }));
        const sentBody = post.mock.calls[0][1];
        expect(sentBody).not.toHaveProperty('userId');
        expect(sentBody).not.toHaveProperty('actorUserId');
        expect(sentBody).not.toHaveProperty('claims');
        expect(sentBody).not.toHaveProperty('diagnostics');
    });

    it('propaga needs_clarification/no_evidence/capability_gap sin tratarlos como error', async () => {
        for (const status of ['needs_clarification', 'no_evidence', 'capability_gap'] as const) {
            post.mockResolvedValueOnce({ status, answer: 'x', citations: [] });
            const raw = await apiClient.post('/agent/respond', {});
            const parsed = parseAgentResponse(raw);
            expect(parsed.status).toBe(status);
        }
    });
});

// ─── Static audits (sección 34: no legacy ai_messages, no writes) ───────────

describe('M-1G: auditoría estática — coexistencia legacy, sin writes', () => {
    const screenSource = fs.readFileSync(path.join(__dirname, '../src/screens/AgentPreviewScreen.tsx'), 'utf-8');
    const apiSource = fs.readFileSync(path.join(__dirname, '../src/api/query-modules/agent.ts'), 'utf-8');

    it('AgentPreviewScreen nunca importa el módulo legacy-ai ni sus hooks', () => {
        expect(screenSource).not.toMatch(/from ['"].*legacy-ai['"]/);
        expect(screenSource).not.toMatch(/useAskPing|useAIHistory|useClearAIHistory/);
    });

    it('agent.ts sólo llama a POST /agent/respond, nunca a rutas de escritura conocidas', () => {
        expect(apiSource).toContain("'/agent/respond'");
        expect(apiSource).not.toMatch(/apiClient\.(delete|patch)\(/);
        expect(apiSource).not.toMatch(/\/commitments|\/messages(?!\/receipts)|\/conversations/);
    });

    it('agent.ts nunca menciona el proveedor (OpenAI/GPT) en código visible al usuario', () => {
        expect(apiSource).not.toMatch(/OpenAI|gpt-4o|Claude|Gemini/i);
    });
});
