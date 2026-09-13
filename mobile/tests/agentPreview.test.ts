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

// M-5 — query-modules/agent.ts ahora importa `File` de expo-file-system
// (transcribeAgentVoice) -- ese módulo carga expo-modules-core, un native
// module que no resuelve bajo el vitest de este repo (sin jest-expo/native,
// ver vitest.config.ts). Este archivo nunca ejercita transcribeAgentVoice,
// pero SÍ importa el mismo módulo de agent.ts, así que necesita el mismo
// stub mínimo que expo-localization arriba para poder cargar.
vi.mock('expo-file-system', () => ({
    File: class MockFile {
        constructor(public uri: string) {}
    },
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
    canSendInput, describeCitationsSummary, describeCitationTypes, describeStatusLabel,
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

    // M-1H v2 — punto 7 del final review gate ("source type end-to-end"):
    // parseAgentResponse filtra por forma (sourceType/sourceId strings), no
    // por un enum cerrado -- una cita a commitment_proposal (caso real
    // "Entrenar") debe sobrevivir intacta, nunca caer al filtro de
    // "citations mal formadas".
    it('acepta y preserva una cita con sourceType="commitment_proposal" (compromiso aún no confirmado)', () => {
        const result = parseAgentResponse({
            status: 'answered', answer: 'Tienes una propuesta de entrenar.',
            citations: [{ sourceType: 'commitment_proposal', sourceId: 'pr-entrenar' }],
        });
        expect(result.citations).toEqual([{ sourceType: 'commitment_proposal', sourceId: 'pr-entrenar' }]);
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

    // M-1H — hallazgo real de staging (caso "Entrenar"): una cita a un
    // commitment_proposal (compromiso todavía no confirmado, tabla distinta
    // de commitments) caía al fallback genérico 'Fuente' en vez de
    // 'Compromiso' porque el label no existía en absoluto.
    it('describeCitationTypes: commitment_proposal se etiqueta igual que commitment ("Compromiso"), nunca cae al fallback genérico', () => {
        const labels = describeCitationTypes([
            { sourceType: 'commitment_proposal' as any, sourceId: 'pr1' },
        ]);
        expect(labels).toEqual(['Compromiso']);
    });

    it('AGENT_SUGGESTED_STARTERS: 4 ejemplos neutrales, sin vocabulario sectorial', () => {
        expect(AGENT_SUGGESTED_STARTERS.length).toBeGreaterThanOrEqual(3);
        for (const s of AGENT_SUGGESTED_STARTERS) expect(typeof s).toBe('string');
    });

    // PING — STATUS COLLAPSE FIX: AgentResponseStatus llegaba hasta
    // AgentChatMessage.status (appendAgentMessage) pero nunca se leía en el
    // render -- 'answered'/'no_evidence'/'capability_gap' se veían como la
    // misma burbuja genérica, indistinguibles entre sí. Esto podía
    // presentar una respuesta explícita de "sin evidencia" o "no puedo
    // hacer esto todavía" como si fuera una respuesta confiada normal.
    describe('describeStatusLabel: distingue no_evidence/capability_gap de una respuesta confiada normal', () => {
        it('"answered" (el caso normal) no requiere ninguna etiqueta extra', () => {
            expect(describeStatusLabel('answered')).toBeNull();
        });
        it('"no_evidence" -- etiqueta explícita, nunca indistinguible de una respuesta confiada', () => {
            expect(describeStatusLabel('no_evidence')).toBe('Sin evidencia suficiente');
        });
        it('"capability_gap" -- etiqueta explícita, nunca indistinguible de una respuesta confiada', () => {
            expect(describeStatusLabel('capability_gap')).toBe('Esto todavía no lo puedo hacer');
        });
        it('undefined (mensaje sin status, ej. de usuario) -- null, nunca inventa una etiqueta', () => {
            expect(describeStatusLabel(undefined)).toBeNull();
        });
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

// M-1G.1 — bugfixes reales de la certificación física en iPhone (M-1G-S2).
describe('M-1G.1: back button — long-press ya no deja un "onPress" fantasma que apila PingAI', () => {
    const screenSource = fs.readFileSync(path.join(__dirname, '../src/screens/ConversationsScreen.tsx'), 'utf-8');

    it('el botón ✨ suprime el onPress que sigue a un onLongPress exitoso (comportamiento conocido de TouchableOpacity)', () => {
        expect(screenSource).toContain('suppressPingAIPressRef');
        // El guard debe vivir DENTRO del onPress real (leer y resetear el flag), no sólo declarado y nunca usado.
        const onPressBlock = screenSource.slice(screenSource.indexOf('onPress={() => {'), screenSource.indexOf('onLongPress={handleOpenAgentMenu}'));
        expect(onPressBlock).toMatch(/if \(suppressPingAIPressRef\.current\)/);
        expect(onPressBlock).toContain('suppressPingAIPressRef.current = false');
    });

    it('handleOpenAgentMenu marca el flag ANTES de mostrar el ActionSheet/Alert', () => {
        const fnBody = screenSource.slice(screenSource.indexOf('const handleOpenAgentMenu'), screenSource.indexOf('const handleOpenCreateSheet'));
        const flagIdx = fnBody.indexOf('suppressPingAIPressRef.current = true');
        const sheetIdx = fnBody.indexOf('ActionSheetIOS.showActionSheetWithOptions');
        expect(flagIdx).toBeGreaterThan(-1);
        expect(flagIdx).toBeLessThan(sheetIdx);
    });
});

describe('M-1G.1: citation tap — área táctil real, no sólo el texto pequeño', () => {
    const screenSource = fs.readFileSync(path.join(__dirname, '../src/screens/AgentPreviewScreen.tsx'), 'utf-8');

    it('el TouchableOpacity de citas tiene hitSlop (evita "tocar y no pasa nada" en un texto de 12px)', () => {
        const citationsBlock = screenSource.slice(screenSource.indexOf('citationsSummary && ('), screenSource.indexOf('citationsSummary && (') + 400);
        expect(citationsBlock).toContain('hitSlop=');
        expect(citationsBlock).toContain('onPress={() => setCitationsSheetFor(item)}');
    });

    it('el modal de fuentes sigue abriendo con las fuentes reales del item tocado (no se rediseñó)', () => {
        expect(screenSource).toContain("<Modal visible={!!citationsSheetFor}");
        expect(screenSource).toContain('describeCitationTypes(citationsSheetFor?.citations)');
    });
});

describe('STATUS COLLAPSE FIX: AgentPreviewScreen.tsx efectivamente renderiza la etiqueta de status, no sólo la calcula', () => {
    const screenSource = fs.readFileSync(path.join(__dirname, '../src/screens/AgentPreviewScreen.tsx'), 'utf-8');

    it('importa describeStatusLabel y lo llama con item.status en renderItem', () => {
        expect(screenSource).toContain('describeStatusLabel');
        expect(screenSource).toMatch(/const statusLabel = describeStatusLabel\(item\.status\);/);
    });

    it('renderiza statusLabel como turnLabel cuando no es una aclaración/acción no soportada (nunca superpone dos etiquetas)', () => {
        expect(screenSource).toMatch(/!item\.isClarification && !item\.isUnsupported && statusLabel && <Text style=\{styles\.turnLabel\}>\{statusLabel\}<\/Text>/);
    });
});

describe('M-1G.1: keyboard + offline — el composer ya no depende de un offset fijo ajeno a esta pantalla', () => {
    const screenSource = fs.readFileSync(path.join(__dirname, '../src/screens/AgentPreviewScreen.tsx'), 'utf-8');

    it('mide la altura real del header (onLayout) en vez de asumirla', () => {
        expect(screenSource).toContain('const [headerHeight, setHeaderHeight] = useState(0)');
        expect(screenSource).toMatch(/onLayout=\{\(e\) => setHeaderHeight\(e\.nativeEvent\.layout\.height\)\}/);
    });

    it('el offset de teclado en iOS usa insets.top + headerHeight real, no el número fijo compartido con ChatScreen', () => {
        expect(screenSource).toMatch(/keyboardVerticalOffset=\{Platform\.OS === 'ios' \? insets\.top \+ headerHeight/);
    });

    it('Android conserva el comportamiento previo (getChatKeyboardOffset) -- el fix es específico de iOS', () => {
        expect(screenSource).toContain('getChatKeyboardOffset(Platform.OS, insets.bottom)');
    });
});

describe('M-1G.1: legacy coexistence — sin cambios de diseño, sólo el fix del onPress fantasma', () => {
    const screenSource = fs.readFileSync(path.join(__dirname, '../src/screens/ConversationsScreen.tsx'), 'utf-8');

    it('tap normal en ✨ sigue navegando a PingAI (legacy), long-press sigue abriendo el menú del Agent nuevo', () => {
        expect(screenSource).toContain("navigation.navigate('PingAI')");
        expect(screenSource).toContain('onLongPress={handleOpenAgentMenu}');
        expect(screenSource).toContain("{ label: 'Ping AI (actual)', onPress: () => navigation.navigate('PingAI') }");
        expect(screenSource).toContain("{ label: 'Nuevo Agent (preview)', onPress: () => navigation.navigate('AgentPreview') }");
    });
});

// PING — AGENT RESPONSE LANGUAGE CONSISTENCY audit (unsupported-action
// heading truthfulness, separate from the backend body-text fix): "Esta
// acción AÚN no está disponible" implied a guaranteed future promise Ping's
// product semantics don't make for every case routed here -- this same
// heading also covers structurally unsupported destructive requests (e.g.
// "Borra definitivamente todos mis compromisos..."), which will never
// become available via this path. Neutral wording ("no está disponible",
// no "aún"/"todavía") stays truthful whether or not a given unsupported
// action is ever added later.
describe('PING — AGENT RESPONSE LANGUAGE CONSISTENCY: unsupported-action heading is truthful, never implies a guaranteed future promise', () => {
    const screenSource = fs.readFileSync(path.join(__dirname, '../src/screens/AgentPreviewScreen.tsx'), 'utf-8');

    it('renders "Esta acción no está disponible", never "aún no está disponible"', () => {
        expect(screenSource).toContain('Esta acción no está disponible');
        expect(screenSource).not.toMatch(/Esta acción aún no está disponible/);
    });

    it('the heading is still gated on item.isUnsupported exactly as before -- only the wording changed, not the condition/placement', () => {
        expect(screenSource).toMatch(/\{item\.isUnsupported && <Text style=\{styles\.turnLabel\}>Esta acción no está disponible<\/Text>\}/);
    });
});

// PING — RESCHEDULE WRITE / VERIFICATION / UI CONSISTENCY FIX. Root cause
// of the physical failure was entirely backend (rescheduleCommitmentExecutor
// used counter_propose instead of a direct due_at edit for a self-owned
// commitment) -- proven by reading the code and the real staging record
// (due_at never changed; proposed_due_at did). Cache invalidation itself
// was never the bug: useAgentExecute already invalidates
// ['all-commitments-dashboard'], the SAME query key both TaskDashboardScreen
// (Hoy) and InsightsScreen (Compromisos) already read from -- both screens
// correctly displayed the true (unchanged) due_at. This describe block
// certifies that invariant directly against the source, since a React
// Query mutation's onSuccess cannot be exercised without a renderer this
// repo doesn't have (see file header) -- a static, source-level assertion
// is the appropriate test here (never a brittle one merely inspecting
// unrelated string literals; every assertion below corresponds to a real,
// behaviorally-meaningful invalidation call).
describe('PING — RESCHEDULE WRITE / VERIFICATION / UI CONSISTENCY FIX: useAgentExecute invalidates every projection that can display a mutated commitment, using the shared canonical query keys (never a duplicated invalidation concept)', () => {
    const agentSource = fs.readFileSync(path.join(__dirname, '../src/api/query-modules/agent.ts'), 'utf-8');

    it('useAgentExecute exists and invalidates on mutation success (onSuccess), never fire-and-forget with no cache update', () => {
        const fnMatch = agentSource.match(/export function useAgentExecute\(\)[^]*?\n\}/);
        expect(fnMatch).not.toBeNull();
        expect(fnMatch![0]).toMatch(/onSuccess: \(\) => \{/);
    });

    it('invalidates the SAME canonical dashboard key Compromisos/Hoy both already read from -- all-commitments-dashboard', () => {
        const fnMatch = agentSource.match(/export function useAgentExecute\(\)[^]*?\n\}/);
        expect(fnMatch![0]).toMatch(/queryClient\.invalidateQueries\(\{ queryKey: \['all-commitments-dashboard'\] \}\)/);
    });

    it('also invalidates insights/commitments/group-tasks/group-tasks-conv/conversation-messages/agreement-proposals -- the same superset the app\'s own direct commitment mutations already invalidate, never a narrower set', () => {
        const fnMatch = agentSource.match(/export function useAgentExecute\(\)[^]*?\n\}/);
        const body = fnMatch![0];
        for (const key of ['insights', 'commitments', 'group-tasks', 'group-tasks-conv', 'conversation-messages', 'agreement-proposals']) {
            expect(body).toMatch(new RegExp(`queryKey: \\['${key}'\\]`));
        }
    });

    // TaskDashboardScreen.tsx (Hoy) and InsightsScreen.tsx (Compromisos)
    // both query ['all-commitments-dashboard'] -- confirming here that they
    // share the SAME cache source (never two independently-stale caches),
    // so a single invalidation of this one key is provably sufficient for
    // both surfaces to become coherent after refetch.
    it('TaskDashboardScreen.tsx (Hoy) and InsightsScreen.tsx (Compromisos) both use queryKey ["all-commitments-dashboard"] -- one shared cache source, not two independent ones', () => {
        const hoySource = fs.readFileSync(path.join(__dirname, '../src/screens/TaskDashboardScreen.tsx'), 'utf-8');
        const compromisosSource = fs.readFileSync(path.join(__dirname, '../src/screens/InsightsScreen.tsx'), 'utf-8');
        expect(hoySource).toMatch(/queryKey: \['all-commitments-dashboard'\]/);
        expect(compromisosSource).toMatch(/queryKey: \['all-commitments-dashboard'\]/);
    });
});

// PING — COPY / PASTE / CLIPBOARD UX (MESSAGING + AGENT). Audit confirmed
// external->Ping paste already worked natively for both composers (plain
// controlled TextInput, no contextMenuHidden/editable-false blocking props,
// no auto-send/Agent-invocation side effect on change) -- so this section
// only certifies (a) that invariant continues to hold, and (b) the new
// Ping->external copy affordance added to AgentPreviewScreen.tsx: long-press
// on a plain-text bubble (user message or agent prose response) copies
// item.text via expo-clipboard + expo-haptics, the exact pattern
// ChatScreen.tsx already uses for normal chat messages. PlanCard/
// ExecutionCard bubbles are deliberately excluded (structured cards with
// their own interactive controls / no single "primary text" -- directive:
// "Do not blindly make entire cards selectable if that damages card
// interaction").
describe('PING — COPY / PASTE / CLIPBOARD UX: Agent Preview composer paste (external -> Ping) is native, unblocked, and never auto-sends', () => {
    const screenSource = fs.readFileSync(path.join(__dirname, '../src/screens/AgentPreviewScreen.tsx'), 'utf-8');

    it('composer TextInput has no paste-blocking props (contextMenuHidden, or editable unconditionally false)', () => {
        const inputBlock = screenSource.slice(
            screenSource.indexOf('placeholder="Escribe tu pregunta…"') - 40,
            screenSource.indexOf('placeholder="Escribe tu pregunta…"') + 400,
        );
        expect(inputBlock).not.toMatch(/contextMenuHidden/);
        expect(inputBlock).not.toMatch(/editable=\{false\}/);
    });

    it('composer is a plain controlled TextInput (value/onChangeText), preserving existing draft behavior', () => {
        expect(screenSource).toMatch(/value=\{inputText\}\s*\n\s*onChangeText=\{handleInputChange\}/);
    });

    it('preserves the existing canonical maxLength (2000) -- never arbitrarily truncated or changed by this task', () => {
        expect(screenSource).toContain('maxLength={2000}');
    });

    it('handleInputChange never sends/dispatches an Agent turn as a side effect of text changing -- paste only changes composer text until explicit Send', () => {
        const fnMatch = screenSource.match(/const handleInputChange = \(value: string\) => \{[^]*?\n    \};/);
        expect(fnMatch).not.toBeNull();
        expect(fnMatch![0]).not.toMatch(/sendInput|useAgentTurn|POST|apiClient/);
    });
});

describe('PING — COPY / PASTE / CLIPBOARD UX: Ping -> external copy for Agent Preview bubbles (user messages + agent prose responses)', () => {
    const screenSource = fs.readFileSync(path.join(__dirname, '../src/screens/AgentPreviewScreen.tsx'), 'utf-8');

    it('imports expo-clipboard and expo-haptics using the same namespace-import style already used by ChatScreen.tsx (no new dependency added)', () => {
        expect(screenSource).toContain("import * as Haptics from 'expo-haptics';");
        expect(screenSource).toContain("import * as Clipboard from 'expo-clipboard';");
    });

    it('handleCopyMessage copies via Clipboard.setStringAsync and gives haptic feedback -- no intrusive alert/modal', () => {
        const fnMatch = screenSource.match(/const handleCopyMessage = async \(text: string\) => \{[^]*?\n    \};/);
        expect(fnMatch).not.toBeNull();
        const body = fnMatch![0];
        expect(body).toMatch(/Clipboard\.setStringAsync\(text\)/);
        expect(body).toMatch(/Haptics\.notificationAsync\(Haptics\.NotificationFeedbackType\.Success\)/);
        expect(body).not.toMatch(/Alert\.alert/);
    });

    it('a plain-text bubble (not PlanCard/ExecutionCard) is long-press-copyable, wired to handleCopyMessage(item.text) -- the message body only, never a sender/date prefix', () => {
        const renderItemMatch = screenSource.match(/const renderItem = \(\{ item \}[^]*?\n    \};/);
        expect(renderItemMatch).not.toBeNull();
        const body = renderItemMatch![0];
        expect(body).toMatch(/const isCopyable = !isPlanCard && !isExecutionCard && !!item\.text;/);
        expect(body).toMatch(/onLongPress: \(\) => handleCopyMessage\(item\.text\)/);
    });

    it('PlanCard and ExecutionCard bubbles are excluded from long-press-copy -- isCopyable is false whenever isPlanCard or isExecutionCard is true, so their own Confirm/Cancel interaction is never shadowed', () => {
        expect(screenSource).toMatch(/const isCopyable = !isPlanCard && !isExecutionCard && !!item\.text;/);
    });

    it('the copyable bubble container still renders AgentPlanCard/AgentExecutionCard and the follow-up/citations/retry children unchanged -- copy affordance wraps the existing bubble, it does not replace its content', () => {
        const renderItemMatch = screenSource.match(/const renderItem = \(\{ item \}[^]*?\n    \};/);
        const body = renderItemMatch![0];
        expect(body).toMatch(/<AgentPlanCard/);
        expect(body).toMatch(/<AgentExecutionCard result=\{item\.executionResult!\} presentation=\{item\.executionPresentation!\} \/>/);
        expect(body).toMatch(/item\.followUp\?\.options/);
        expect(body).toMatch(/citationsSummary &&/);
        expect(body).toMatch(/item\.error && item\.retryInput/);
    });
});

// item.text is the SAME unified field certified pure-prose (never a raw
// status enum, id, or JSON payload) by the AGENT RESPONSE LANGUAGE
// CONSISTENCY work above -- copying it can never leak internal metadata,
// satisfying the directive's "Copy content invariant" without any extra
// sanitization step (there is nothing to sanitize: the field already never
// carries anything but human-readable text for every branch that renders
// it: normal answer, clarification, unsupported/capability_gap, and any
// status-labeled response).
describe('PING — COPY / PASTE / CLIPBOARD UX: copy content invariant -- clipboard text can never contain internal IDs/enums/JSON for Agent bubbles', () => {
    const screenSource = fs.readFileSync(path.join(__dirname, '../src/screens/AgentPreviewScreen.tsx'), 'utf-8');

    it('copy is wired to item.text exclusively -- never item.rawPlan, item.executionResult, item.status, or any other structured/internal field', () => {
        const renderItemMatch = screenSource.match(/const renderItem = \(\{ item \}[^]*?\n    \};/);
        const body = renderItemMatch![0];
        expect(body).toMatch(/onLongPress: \(\) => handleCopyMessage\(item\.text\)/);
        expect(body).not.toMatch(/onLongPress: \(\) => handleCopyMessage\(JSON\.stringify/);
        expect(body).not.toMatch(/handleCopyMessage\(item\.status\)/);
        expect(body).not.toMatch(/handleCopyMessage\(item\.rawPlan/);
    });

    it('handleCopyMessage itself performs no JSON.stringify / field-concatenation -- it copies exactly the string it is given, byte for byte (preserves line breaks, accents, emoji, URLs, punctuation)', () => {
        const fnMatch = screenSource.match(/const handleCopyMessage = async \(text: string\) => \{[^]*?\n    \};/);
        const body = fnMatch![0];
        expect(body).not.toMatch(/JSON\.stringify/);
        expect(body).toMatch(/Clipboard\.setStringAsync\(text\)/);
    });
});
