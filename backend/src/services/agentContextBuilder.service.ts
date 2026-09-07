// M-1D — Agent Context Builder.
//
// user input → interpret intent/hints → resolve authorized entities →
// build an explicit retrieval plan → execute it via M-1B/M-1C → dedupe →
// pack into a compact, provenance-carrying AgentContext.
//
// This module NEVER answers the user, never writes data, never calls a
// tool, never talks to legacy Ping AI. It is preparation of context, not
// execution (sección 3). Authorization is never decided by the
// interpreter: every ID used comes from `AgentContextInput.conversationId`
// (passed explicitly by the caller) or from `resolvePerson` (M-1B,
// authorization-safe) — never from parsed text (sección 23).
import { AppError } from '../utils/AppError';
import {
    resolvePerson,
    retrieveCommitments,
    retrieveCommitmentProposals,
    retrieveCommitmentEvents,
    retrieveMessages,
    retrieveTranscriptions,
    retrieveAttachments,
    dedupeProvenance,
} from './retrieval.service';
import { retrieveMemory } from './memory.service';
import { enforceMemoryCanonicalDominance } from './canonicalTruthRegistry';
import type { MemoryFreshness, MemoryQueryCardinality, MemoryQueryPlan, RetrievalMemory } from '../types/memory';
import {
    LlmInputInterpreter,
    DeterministicInputInterpreter,
    fallbackInterpretation,
    isPersonHintGroundedInInput,
    classifyQueryCardinality,
    type AgentInputInterpreter,
} from './agentInputInterpreter.service';
import type {
    AgentCapabilityGap,
    AgentContext,
    AgentContextBudget,
    AgentContextInput,
    AgentClarification,
    Interpretation,
    ProposalFocus,
    QueryCardinality,
    RetrievalPlanStep,
} from '../types/agentContext';
import type { PersonResolutionResult, RetrievalCommitment, RetrievalProvenance, RetrievalTimeRange } from '../types/retrieval';
// [PING_OVERDUE_TRACE] TEMPORARY — ver backend/src/utils/overdueTrace.ts.
import { traceOverdue, traceSafeTitle } from '../utils/overdueTrace';
// [PING_PROPOSAL_TRACE] TEMPORARY (ticket "M-1H: DETERMINISTIC QUERY
// SEMANTICS") — instrumentación de diagnóstico para certificar
// físicamente el contrato de normalización determinística
// (personHints/proposalFocus/queryCardinality) y de cobertura exhaustiva.
// Retirar junto con [PING_OVERDUE_TRACE] en un ticket separado una vez
// certificado (ver sección 22 del ticket).
import { traceProposal } from '../utils/overdueTrace';
import { resolveAgentTimezone, timeZoneOffsetMs, startOfDayInZone } from '../utils/timezone';
import { isCommitmentOverdue } from '../utils/overdueSemantics';

// ─── Context budget (sección 16) — mismo orden de magnitud que los defaults
// de M-1B/M-1C; M-1D no inventa un techo distinto, sólo lo hace explícito a
// nivel de "cuánto pedirle a cada retrieval". ────────────────────────────────
const DEFAULT_BUDGET: Required<AgentContextBudget> = {
    commitments: 10,
    events: 10,
    messages: 15,
    transcriptions: 5,
    attachments: 5,
    memory: 10,
};

// ─── Timezone (sección 12) — resolveAgentTimezone/timeZoneOffsetMs/
// startOfDayInZone ahora viven en utils/timezone.ts (M-1H v3): las necesita
// también overdueSemantics.ts para "mismo día calendario" -- una sola
// fuente de verdad para la aritmética de zona horaria, nunca duplicada.
function addDays(date: Date, days: number): Date {
    return new Date(date.getTime() + days * 24 * 60 * 60 * 1000);
}

function endOfDayInZone(date: Date, timeZone: string): Date {
    return addDays(startOfDayInZone(date, timeZone), 1);
}

// Semana ISO (lunes primer día) — convención neutral documentada, no ligada
// a un idioma/región específico (sección 29).
function startOfWeekInZone(date: Date, timeZone: string): Date {
    const startToday = startOfDayInZone(date, timeZone);
    const offsetMs = timeZoneOffsetMs(startToday, timeZone);
    const local = new Date(startToday.getTime() + offsetMs);
    const isoDow = local.getUTCDay() === 0 ? 7 : local.getUTCDay(); // 1=lunes .. 7=domingo
    return addDays(startToday, -(isoDow - 1));
}

function startOfMonthInZone(date: Date, timeZone: string): Date {
    const offsetMs = timeZoneOffsetMs(date, timeZone);
    const local = new Date(date.getTime() + offsetMs);
    const monthStartUtcMs = Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), 1, 0, 0, 0);
    return new Date(monthStartUtcMs - offsetMs);
}

// Resuelve una expresión temporal cruda (detectada por el intérprete) a un
// RetrievalTimeRange concreto, timezone-aware — nunca UTC silencioso
// (sección 12). Separado del intérprete a propósito: 100% determinista,
// testeable con `now`/`timezone` fijos sin depender del reloj real.
export function resolveTimeExpression(expression: string | null, now: Date, timezone: string): RetrievalTimeRange | null {
    if (!expression) return null;
    const expr = expression.toLowerCase();

    if (/hoy|today/.test(expr)) {
        return { from: startOfDayInZone(now, timezone).toISOString(), to: endOfDayInZone(now, timezone).toISOString() };
    }
    if (/ayer|yesterday/.test(expr)) {
        const yesterday = addDays(now, -1);
        return { from: startOfDayInZone(yesterday, timezone).toISOString(), to: endOfDayInZone(yesterday, timezone).toISOString() };
    }
    if (/mañana|tomorrow/.test(expr)) {
        const tomorrow = addDays(now, 1);
        return { from: startOfDayInZone(tomorrow, timezone).toISOString(), to: endOfDayInZone(tomorrow, timezone).toISOString() };
    }
    if (/semana pasada|last week/.test(expr)) {
        const startThisWeek = startOfWeekInZone(now, timezone);
        const startLastWeek = addDays(startThisWeek, -7);
        return { from: startLastWeek.toISOString(), to: startThisWeek.toISOString() };
    }
    if (/esta semana|this week/.test(expr)) {
        return { from: startOfWeekInZone(now, timezone).toISOString(), to: endOfDayInZone(now, timezone).toISOString() };
    }
    if (/mes pasado|last month/.test(expr)) {
        const startThisMonth = startOfMonthInZone(now, timezone);
        const startLastMonth = startOfMonthInZone(addDays(startThisMonth, -1), timezone);
        return { from: startLastMonth.toISOString(), to: startThisMonth.toISOString() };
    }
    const agoMatch = expr.match(/hace (\d+) d[ií]as?|(\d+) d[ií]as? ago|(\d+) days? ago/);
    if (agoMatch) {
        const n = Number(agoMatch[1] || agoMatch[2] || agoMatch[3]);
        const target = addDays(now, -n);
        return { from: startOfDayInZone(target, timezone).toISOString(), to: endOfDayInZone(target, timezone).toISOString() };
    }
    return null;
}

// Última red de seguridad (sección 31 M-1D / sección 3 M-1D.1): si el
// intérprete inyectado (LLM, determinístico, o cualquier otro futuro)
// lanzara una excepción no capturada por su propia lógica interna, esto
// nunca debe tumbar el Context Builder. `LlmInputInterpreter` ya maneja sus
// propios fallos internamente (timeout/api_error/invalid_json/schema_invalid
// → cae a su propio fallback) — este wrapper es sólo para lo verdaderamente
// inesperado.
async function safeInterpret(interpreter: AgentInputInterpreter, input: string, context: { conversationId?: string; channel?: string }): Promise<Interpretation> {
    try {
        const result = await interpreter.interpret(input, context);
        if (!result || typeof result.intent !== 'string') throw new Error('invalid interpretation shape');
        return result;
    } catch {
        return fallbackInterpretation(input, 'interpreter_threw');
    }
}

// M-1H — hallazgo real de staging (caso "Entrenar"): la UI siempre mezcló
// GET /commitments + GET /commitment-proposals; el Agent sólo consultaba la
// primera, así que un compromiso que existía SÓLO como proposal (todavía no
// confirmada) nunca aparecía en el contexto ni podía evaluarse como vencido.
// Esto NO es "retrieveCommitments + retrieveProposals + concat sin reglas"
// (explícitamente prohibido en el ticket): ambas fuentes ya llegan con el
// MISMO shape (RetrievalCommitment, entityType honesto) y se combinan bajo
// el MISMO criterio de orden ya certificado para commitments solo
// (orderByOverdueFirst: due_at asc / si no: created_at desc). La
// precedencia "canonical commitment gana sobre su proposal" no requiere
// lógica extra aquí: retrieveCommitmentProposals ya excluye status=
// 'confirmed' en el query (dedupe en la fuente) — una proposal
// materializada simplemente deja de existir en el segundo array.
//
// M-1H (ticket "M-1H FINAL ARCHITECTURE GATE", bloqueo A) — YA NO recorta al
// budget aquí. Hallazgo real del gate: recortar ANTES de filterByProposalFocus
// podía dejar 0 resultados aunque existieran N válidos, simplemente porque el
// budget conservó ítems que el filtro de proposalFocus iba a descartar de
// todos modos. El budget final se aplica DESPUÉS del filtro estructural (ver
// buildAgentContext) — sólo concatena y ordena, nunca trunca.
function mergeCommitmentSources(
    commitments: RetrievalCommitment[],
    proposals: RetrievalCommitment[],
    orderByOverdueFirst: boolean,
): RetrievalCommitment[] {
    const merged = [...commitments, ...proposals];
    merged.sort((a, b) => {
        if (orderByOverdueFirst) {
            const aTime = a.dueAt ? new Date(a.dueAt).getTime() : Number.POSITIVE_INFINITY;
            const bTime = b.dueAt ? new Date(b.dueAt).getTime() : Number.POSITIVE_INFINITY;
            // Tiebreaker explícito (sección 4 del ticket "STAGING
            // PUBLICATION"): mismo criterio (id ASC) que el ORDER BY real
            // de retrieveCommitmentProposals/retrieveCommitments -- nunca
            // depender implícitamente de que Array.prototype.sort sea
            // estable (lo es desde ES2019, pero un tiebreaker explícito no
            // depende de esa garantía del lenguaje para ser correcto ni de
            // que un futuro cambio de implementación la preserve).
            return aTime !== bTime ? aTime - bTime : a.id.localeCompare(b.id);
        }
        const aCreated = new Date(a.createdAt).getTime();
        const bCreated = new Date(b.createdAt).getTime();
        return aCreated !== bCreated ? bCreated - aCreated : a.id.localeCompare(b.id);
    });
    return merged;
}

// M-1H (ticket "FINAL ARCHITECTURE GATE", bloqueo A/sección 3) — Opción B:
// overfetch RAZONADO, nunca "limit=1000" ciego. `proposalFocus` es el ÚNICO
// filtro estructurado que NO se puede empujar a la query SQL de
// retrieveCommitmentProposals (depende de actorHasApproved/pendingResponderIds,
// derivados de un JOIN contra commitment_proposal_responses que ya calcula
// esa función -- la DECISIÓN de filtrar vive en Core, no en SQL). status/
// person/time/topic SÍ ya se empujan a SQL como parámetros directos (Opción
// A, ya vigente, topic real vía search_tsv desde M-1H FINAL) -- esto sólo
// cubre la excepción real.
//
// M-1H FINAL (ticket "WORLD-CLASS AGENT QUERY ARCHITECTURE", secciones
// 11-15) — reemplazó el overfetch de multiplicador fijo (M-1H, 10x/techo
// 200: "puede optimizar, NUNCA es contrato de correctness"). Un
// multiplicador fijo puede fallar con un dataset real más grande que la
// ventana (300, 1000 filas -- ver tests adversariales).
//
// M-1H FINAL CERTIFICATION (ticket "STAGING PUBLICATION", secciones 1/2/6)
// — auditoría posterior descartó la primera implementación (paginación
// multi-request, por offset y luego por keyset): `commitment_proposals.due_at`
// es mutable en producción (respond_to_commitment_proposal con
// decision='counter_propose' hace `update ... set due_at = ...`) y una
// prueba empírica directa contra Postgres real demostró que keyset
// tampoco es inmune -- si una fila TODAVÍA no alcanzada cambia su due_at a
// un valor anterior al cursor ya consumido, esa fila queda permanentemente
// fuera de las páginas restantes de esa request. Ninguna paginación
// multi-request puede resolver eso sin snapshot/transacción explícita.
//
// Solución real: UN solo fetch atómico (`rawOrder`, ver
// retrieval.service.ts) hasta el safety cap -- una única sentencia SQL ve
// una snapshot MVCC consistente por garantía real de Postgres (no una
// suposición), inmune tanto a inserciones como a mutaciones concurrentes
// durante la misma request. `proposalFocus` sigue sin poder empujarse a
// SQL (depende de participación calculada vía JOIN que retrieveCommitmentProposals
// ya resuelve) -- se filtra en JS sobre el array ya completo. status/
// person/time/topic sí se empujan a SQL como siempre (topic real vía
// search_tsv desde M-1H FINAL). PROPOSAL_FOCUS_SAFETY_CAP (1000 filas) es
// deliberadamente el mismo orden de magnitud que el propio test
// adversarial de 1000 filas del ticket -- un límite real, probado,
// divulgado en la metadata de completitud (nunca presentado como "no hay
// más" cuando en realidad se cortó por este cap).
const PROPOSAL_FOCUS_SAFETY_CAP = 1000;

interface ProposalFocusFillResult {
    matches: RetrievalCommitment[];
    scannedCount: number;
    sourceExhausted: boolean;
    safetyCapReached: boolean;
}

async function fillProposalFocusMatches(
    baseInput: Parameters<typeof retrieveCommitmentProposals>[0],
    proposalFocus: ProposalFocus,
    resolvedPersonId: string | undefined,
    targetCount: number,
): Promise<ProposalFocusFillResult> {
    const rows = await retrieveCommitmentProposals({ ...baseInput, rawOrder: true }, PROPOSAL_FOCUS_SAFETY_CAP);
    const scannedCount = rows.length;
    const sourceExhausted = scannedCount < PROPOSAL_FOCUS_SAFETY_CAP;
    const matches = filterByProposalFocus(rows, proposalFocus, resolvedPersonId);
    // safetyCapReached es verdad SÓLO cuando la razón real de no poder
    // confirmar completitud fue el cap -- nunca cuando ya se encontraron
    // suficientes matches dentro de lo escaneado (aunque el conteo
    // escaneado coincida numéricamente con el cap por casualidad del
    // dataset real, ver test adversarial de 1000 filas con matches
    // distribuidos hasta la fila 900).
    const foundEnough = matches.length >= targetCount;
    const safetyCapReached = !sourceExhausted && !foundEnough;
    return { matches, scannedCount, sourceExhausted, safetyCapReached };
}

// M-1H v6 (Gap B del final proposal lifecycle gate, secciones 8/9/11): el
// Core filtra determinísticamente según proposalFocus -- el LLM NUNCA
// decide "¿quién falta por responder?"/"¿ya aprobé?"/"¿está aprobada del
// todo?" por su cuenta, sólo fraseia lo que ya llega filtrado aquí. Aplica
// SOLO a commitment_proposal -- un commitment canónico ya activo no tiene
// concepto de "aprobación pendiente".
function filterByProposalFocus(
    commitments: RetrievalCommitment[],
    proposalFocus: ProposalFocus,
    resolvedPersonId: string | undefined,
): RetrievalCommitment[] {
    if (!proposalFocus) return commitments;
    return commitments.filter((c) => {
        if (c.entityType !== 'commitment_proposal') return false;
        if (proposalFocus === 'waiting_for_others') {
            return c.actorHasApproved === true && c.isFullyApproved === false;
        }
        if (proposalFocus === 'needs_my_response') {
            return c.actorCanRespond === true;
        }
        if (proposalFocus === 'pending_response_from_person') {
            // Sin persona resuelta, no hay a quién filtrar -- nunca amplía
            // el scope devolviendo todo sin filtrar (sección 17: nunca
            // ampliar el scope semántico, mismo principio ya establecido
            // para personScopeBlocked).
            if (!resolvedPersonId) return false;
            return (c.pendingResponderIds ?? []).includes(resolvedPersonId);
        }
        return true;
    });
}

// ─── M-2 — Memory intent (mismo patrón que classifyQueryCardinality: 100%
// determinístico, corre siempre, gratis, nunca depende del LLM para decidir
// si esta consulta es sobre memoria). Cobertura deliberadamente centrada en
// las 9 preguntas del contrato del ticket (sección "matriz de contrato A-I")
// -- ampliar la cobertura de frases futuras es una mejora de amplitud de
// producto, no una corrección de contrato (ver informe de entrega, sección
// "MemoryQueryPlan").
const MEMORY_TRIGGER_PATTERN = /qu[eé] (sabes|recuerdas|recuerdo|cambi[oó])|conoces (de|sobre)|d[oó]nde viv|preferencias|por qu[eé] sabes|porque sabes|sigue siendo cierto|cu[aá]ndo (hablamos|aceptamos|acordamos|confirmamos|rechazamos|propusimos)|recuerdo (tenemos|hay)/;
const MEMORY_HISTORICAL_PATTERN = /viv[ií]a|antes viv|el a[nñ]o pasado|hace tiempo|anteriormente|sol[ií]a|used to|last year|previously/;
const MEMORY_CURRENT_PATTERN = /d[oó]nde vive|prefiero|prefiere|actualmente|sigue siendo cierto/;
const MEMORY_SELF_SUBJECT_PATTERN = /preferencias m[ií]as|sobre m[ií]\b|de m[ií]\b|conmigo|prefiero|por qu[eé] sabes que|porque sabes que/;
// M-2 FINAL (sección 20) — forma de la pregunta, evaluada en un orden fijo
// (la primera coincidencia gana) para que una frase que toca varios patrones
// a la vez ("¿por qué sabes que prefiero café?" toca tanto provenance como
// preferencia) tenga un resultado determinístico, nunca ambiguo.
const MEMORY_PROVENANCE_PATTERN = /por qu[eé] sabes|porque sabes/;
const MEMORY_CHANGE_PATTERN = /qu[eé] cambi[oó]/;
const MEMORY_EPISODIC_PATTERN = /cu[aá]ndo (hablamos|aceptamos|acordamos|confirmamos|rechazamos|propusimos)/;
const MEMORY_PREFERENCE_LIST_PATTERN = /preferencias/;
const MEMORY_SUMMARY_PATTERN = /qu[eé] sabes|conoces (de|sobre)|recuerdo (tenemos|hay)|qu[eé] recuerdas|qu[eé] recuerdo/;

function detectMemoryQueryCardinality(text: string, freshness: MemoryFreshness): MemoryQueryCardinality {
    if (MEMORY_PROVENANCE_PATTERN.test(text)) return 'provenance';
    if (MEMORY_CHANGE_PATTERN.test(text)) return 'change_over_time';
    if (MEMORY_EPISODIC_PATTERN.test(text)) return 'episodic_search';
    if (MEMORY_PREFERENCE_LIST_PATTERN.test(text)) return 'preference_list';
    if (MEMORY_SUMMARY_PATTERN.test(text)) return 'summary';
    return freshness === 'historical' ? 'history' : 'fact_lookup';
}

function detectMemoryIntent(rawInput: string): { wantsMemory: boolean; memoryFreshness: MemoryFreshness; subjectIsSelf: boolean; memoryQueryCardinality: MemoryQueryCardinality } {
    const text = rawInput.toLowerCase();
    if (!MEMORY_TRIGGER_PATTERN.test(text)) {
        return { wantsMemory: false, memoryFreshness: 'any', subjectIsSelf: false, memoryQueryCardinality: 'fact_lookup' };
    }
    const subjectIsSelf = MEMORY_SELF_SUBJECT_PATTERN.test(text);
    let memoryFreshness: MemoryFreshness = 'any';
    if (MEMORY_HISTORICAL_PATTERN.test(text)) memoryFreshness = 'historical';
    else if (MEMORY_CURRENT_PATTERN.test(text)) memoryFreshness = 'current';
    const memoryQueryCardinality = detectMemoryQueryCardinality(text, memoryFreshness);
    return { wantsMemory: true, memoryFreshness, subjectIsSelf, memoryQueryCardinality };
}

function buildMemoryQueryPlan(
    ownerUserId: string,
    subjectPersonId: string | null,
    topicQuery: string | null,
    timeRange: RetrievalTimeRange | null,
    freshness: MemoryFreshness,
    limit: number,
): MemoryQueryPlan {
    return {
        ownerUserId,
        subjectPersonId,
        subjectContactId: null,
        topicQuery,
        timeRange,
        memoryTypes: null,
        sourceTypes: null,
        freshness,
        limit,
    };
}

export interface BuildAgentContextOptions {
    interpreter?: AgentInputInterpreter;
    budget?: AgentContextBudget;
}

export async function buildAgentContext(input: AgentContextInput, options: BuildAgentContextOptions = {}): Promise<AgentContext> {
    const startedAt = Date.now();
    if (!input.actorUserId) throw new AppError('actorUserId is required', 400);
    if (!input.input || !input.input.trim()) throw new AppError('input is required', 400);

    // PRIMARY = LlmInputInterpreter (sección 3, M-1D.1) — internamente cae a
    // DeterministicInputInterpreter si el LLM no está configurado o falla,
    // así que sigue funcionando 100% local/sin red por defecto (sección 34).
    const interpreter = options.interpreter ?? new LlmInputInterpreter();
    const budget = { ...DEFAULT_BUDGET, ...options.budget };
    const now = input.now ? new Date(input.now) : new Date();
    const timezone = resolveAgentTimezone(input.timezone);
    // Sección 13: diagnostics debe poder indicar si la timezone vino del
    // caller (validada) o si se usó el fallback técnico (ausente o inválida).
    const timezoneSource: 'input' | 'fallback' = input.timezone?.trim() && timezone === input.timezone.trim() ? 'input' : 'fallback';
    const conversationId = input.conversationId; // ÚNICA fuente de conversationId — nunca el intérprete.

    const rawInterpretation = await safeInterpret(interpreter, input.input, { conversationId, channel: input.channel });

    // M-1H — "DETERMINISTIC QUERY SEMANTICS & EXHAUSTIVE ANSWER CONTRACTS":
    // "el LLM puede sugerir, el Core decide" (sección 0/3 del ticket).
    // Hallazgo físico real: el intérprete primario (LlmInputInterpreter)
    // alucinó personHints=["Alejandra"] y/o proposalFocus incorrecto para
    // "¿Qué estoy esperando confirmación?" -- un input sin ninguna mención
    // real de persona -- disparando needs_clarification sobre una persona
    // inexistente en el texto (Ejecución A del ticket). El intérprete
    // determinístico (sin red, sin I/O -- correr siempre es gratis) se
    // ejecuta AQUÍ incondicionalmente, sin importar cuál sea `interpreter`
    // primario, y sus señales estructuradas SIEMPRE ganan sobre lo que haya
    // dicho el LLM, en cualquier dirección (ni el LLM puede "activar" una
    // señal que el determinístico no ve en el texto -- ver personHints --
    // ni "apagar" una que el determinístico SÍ detecta -- ver proposalFocus/
    // intent/wantsOverdueFocus). Esto es la implementación práctica de un
    // "query plan canónico" (sección 20): en vez de una clase nueva, las
    // señales ganadoras se funden de vuelta en el mismo `Interpretation` que
    // ya viaja por retrieval/synthesis, evitando duplicar el contrato.
    const deterministicSignals = await new DeterministicInputInterpreter().interpret(input.input);
    // Sección 4: un personHint (de CUALQUIER intérprete) sólo cuenta como
    // scope estructural real si el nombre efectivamente aparece como texto
    // en el input crudo -- nunca "porque el LLM lo dijo". Esto reemplaza
    // confiar ciegamente en `rawInterpretation.personHints`.
    const explicitPersonHints = rawInterpretation.personHints.filter((hint) => isPersonHintGroundedInInput(hint, input.input));
    // Sección 3: cuando el determinístico detecta proposalFocus (waiting_for_
    // others/needs_my_response/pending_response_from_person), el LLM no
    // puede contradecirlo -- ni con un valor distinto, ni alegando
    // ambigüedad/apagando la recuperación de commitments, ni clasificando la
    // consulta como otra cosa. Deliberadamente ACOTADO a proposalFocus (no a
    // "cualquier intent distinto de general_context"): un intent confiado
    // pero AJENO a esta clase de consulta (ej. document_search/recall/
    // person_query, cada uno con su propio dominio ya certificado aparte)
    // nunca debe verse forzado a wantsCommitments=true sólo por ser
    // "distinto de general_context" -- eso rompía document_search real
    // (hallazgo durante la implementación, cubierto por un test dedicado
    // más abajo: "coreHasConfidentSignal no debe forzar wantsCommitments
    // para intents ajenos a commitments").
    const commitmentSignalConfident = deterministicSignals.proposalFocus !== null;
    const interpretation: Interpretation = {
        ...rawInterpretation,
        personHints: explicitPersonHints,
        proposalFocus: deterministicSignals.proposalFocus ?? rawInterpretation.proposalFocus,
        intent: commitmentSignalConfident ? 'commitment_query' : rawInterpretation.intent,
        // Una vez que el Core tiene autoridad total sobre esta consulta
        // (proposalFocus confiado), el textQuery correcto es exactamente el
        // que produce el extractor determinístico sobre el MISMO input crudo
        // -- ya endurecido específicamente para este dominio (control
        // language de confirmación/aceptación/aprobación, ver
        // stripConfirmationControlWords). Nunca se confía en un textQuery
        // sugerido por el LLM para un dominio que el Core ya resolvió.
        textQuery: commitmentSignalConfident ? deterministicSignals.textQuery : rawInterpretation.textQuery,
        topicHints: commitmentSignalConfident
            ? (deterministicSignals.textQuery ? [deterministicSignals.textQuery] : [])
            : rawInterpretation.topicHints,
        intentConfidence: commitmentSignalConfident
            ? Math.max(deterministicSignals.intentConfidence, rawInterpretation.intentConfidence)
            : rawInterpretation.intentConfidence,
        // Un "vencido" literal en el texto nunca puede ser suprimido por el
        // LLM (falso negativo, causa raíz real de M-1G) -- pero si el
        // determinístico no lo detecta y el LLM sí lo sugiere para una
        // frase que el regex no cubre, se mantiene (nunca se resta señal,
        // sólo se garantiza un piso).
        wantsOverdueFocus: deterministicSignals.wantsOverdueFocus || rawInterpretation.wantsOverdueFocus,
        // Cuando el Core ya tiene una lectura estructurada confiada de
        // proposalFocus, una alucinación de ambigüedad del LLM
        // (needs_clarification sobre una consulta que en realidad es clara)
        // queda descartada.
        ambiguityHints: commitmentSignalConfident ? [] : rawInterpretation.ambiguityHints,
        // Si el Core acaba de decidir que esto SÍ es una consulta de
        // proposalFocus (pese a que el LLM haya dicho wantsCommitments
        // false -- una alucinación correlacionada plausible), la
        // recuperación de commitments no puede quedar apagada.
        wantsCommitments: commitmentSignalConfident ? true : rawInterpretation.wantsCommitments,
    };
    const queryCardinality: QueryCardinality = classifyQueryCardinality(input.input, {
        intent: interpretation.intent,
        proposalFocus: interpretation.proposalFocus,
        wantsOverdueFocus: interpretation.wantsOverdueFocus,
    });
    const timeRange = resolveTimeExpression(interpretation.timeExpression, now, timezone);

    // [PING_PROPOSAL_TRACE] TEMPORARY — captura RAW vs NORMALIZED para poder
    // comparar dos ejecuciones idénticas del mismo input (sección 2 del
    // ticket). Gated en proposalFocus/queryCardinality para no ensuciar
    // logs de requests sin relación con esta clase de consulta.
    if (interpretation.proposalFocus !== null || queryCardinality === 'exhaustive_list' || queryCardinality === 'count') {
        traceProposal(input.traceId, 'INTERPRETATION', {
            rawIntent: rawInterpretation.intent,
            rawProposalFocus: rawInterpretation.proposalFocus,
            rawPersonHints: rawInterpretation.personHints,
            rawTextQuery: rawInterpretation.textQuery,
            rawSource: rawInterpretation.source,
            deterministicIntent: deterministicSignals.intent,
            deterministicProposalFocus: deterministicSignals.proposalFocus,
            normalizedIntent: interpretation.intent,
            normalizedProposalFocus: interpretation.proposalFocus,
            normalizedPersonHints: interpretation.personHints,
            normalizedTextQuery: interpretation.textQuery,
            queryCardinality,
        });
    }

    // [PING_OVERDUE_TRACE] TEMPORARY — sólo emite si la consulta interpretada
    // resulta overdue-focused, para no ensuciar logs de requests normales.
    if (interpretation.wantsOverdueFocus) {
        traceOverdue(input.traceId, 'INTERPRETATION', {
            intent: interpretation.intent,
            textQuery: interpretation.textQuery,
            topicHints: interpretation.topicHints,
            personHints: interpretation.personHints,
            statusHints: interpretation.statusHints,
            wantsOverdueFocus: interpretation.wantsOverdueFocus,
            timeExpression: interpretation.timeExpression,
            wantsCommitments: interpretation.wantsCommitments,
            source: interpretation.source,
        });
    }

    const retrievalPlan: RetrievalPlanStep[] = [];
    const sourcesConsulted: string[] = [];
    const sourceCounts: Record<string, number> = {};

    // ─── Entity resolution (sección 11) — nunca se elige arbitrariamente. ────
    const people: PersonResolutionResult[] = [];
    let needsClarification = false;
    let clarification: AgentClarification | undefined;
    let resolvedPersonId: string | undefined;
    // M-1F.1 (Caso A del staging real, docs/M-1F-S): un personHint explícito
    // que no resolvió a NADIE (ni ambiguo con >1 candidatos, ni resuelto) no
    // debe degradar silenciosamente a "consulta sin filtro de persona" — eso
    // permitía que retrieveCommitments trajera TODOS los commitments abiertos
    // del actor, y la síntesis los atribuía erróneamente a la persona
    // nombrada aunque no existiera vínculo real (ej. assigned_to_user_id).
    let personAttributionUnresolved = false;

    for (const hint of interpretation.personHints) {
        retrievalPlan.push({ step: 'resolvePerson', params: { hint } });
        const resolution = await resolvePerson(input.actorUserId, { name: hint, conversationId });
        sourcesConsulted.push('resolvePerson');
        people.push(resolution);
        if (resolution.ambiguous) {
            needsClarification = true;
            clarification = { reason: 'person_ambiguous', candidates: resolution.candidates };
        } else if (resolution.resolved && !resolvedPersonId) {
            resolvedPersonId = resolution.resolved.id;
        } else if (!resolution.resolved) {
            personAttributionUnresolved = true;
        }
    }

    // Mismo mecanismo ya seguro de M-1D para "ambiguous" (candidatos reales):
    // needsClarification tiene prioridad ABSOLUTA en deriveStatus (M-1E), así
    // que la respuesta final nunca llega a sintetizar comentarios sobre
    // commitments/mensajes no vinculados — se resuelve con la MISMA plantilla
    // determinística ya usada para "unresolved_pronoun" (candidates:[] pide
    // que se especifique el nombre, sin inventar opciones falsas).
    if (!needsClarification && personAttributionUnresolved && !resolvedPersonId) {
        needsClarification = true;
        clarification = { reason: 'person_ambiguous', candidates: [] };
    }

    // Retrieval-plan guard (sección 4): si hay un personHint explícito y
    // ninguno resolvió a un ID real, las fuentes person-scoped NO se ejecutan
    // como si no hubiera filtro de persona — se tratan como vacías. Esto es
    // defensa en profundidad (needsClarification ya lo cubre estructuralmente
    // arriba, vía la plantilla determinística que nunca usa context.commitments),
    // no la única barrera — sección 17: nunca se amplía el scope semántico.
    const personScopeBlocked = interpretation.personHints.length > 0 && !resolvedPersonId;

    // ─── M-2 — Memory query plan ────────────────────────────────────────────
    // Mismo guard que commitments/messages: un personHint explícito que no
    // resolvió a nadie nunca se relaja a "memoria sin filtro de persona" --
    // salvo que la memoria pedida sea sobre el propio actor (subjectIsSelf),
    // que no depende en absoluto de resolvePerson.
    const memoryIntentSignal = detectMemoryIntent(input.input);
    const memorySubjectPersonId = memoryIntentSignal.subjectIsSelf ? input.actorUserId : (resolvedPersonId ?? null);
    const memoryBlocked = personScopeBlocked && !memoryIntentSignal.subjectIsSelf;
    const memoryTopicQuery = interpretation.textQuery ?? (interpretation.topicHints?.[0] ?? null);

    const canonicalFacts: AgentContext['canonicalFacts'] = people
        .filter((p) => p.resolved && !p.ambiguous)
        .map((p) => ({ type: 'person_resolved' as const, personId: p.resolved!.id, displayName: p.resolved!.displayName }));

    // ─── Retrieval plan + ejecución (secciones 13, 15, 33) ──────────────────
    // Fuentes independientes en paralelo; nunca se ejecutan fuentes que la
    // intención no pidió (sección 33). commitment events depende de los
    // commitments encontrados, así que va después.
    if (personScopeBlocked && (interpretation.wantsCommitments || interpretation.wantsMessages)) {
        retrievalPlan.push({ step: 'personScopeGuardSkipped', params: { personHints: interpretation.personHints } });
    }

    // M-1H FINAL (sección 29, performance) — cuando proposalFocus está
    // activo, un commitment canónico SIEMPRE queda excluido por
    // filterByProposalFocus (sólo commitment_proposal tiene concepto de
    // "aprobación pendiente") -- pedirlos igual sería tráfico/carga de DB
    // ciento por ciento desperdiciada. Nunca cambia el resultado final,
    // sólo evita transferir un pool que ya sabemos que no puede sobrevivir.
    const commitmentsPromise = interpretation.wantsCommitments && !personScopeBlocked && !interpretation.proposalFocus
        ? (() => {
            retrievalPlan.push({ step: 'retrieveCommitments', params: { personId: !!resolvedPersonId, conversationId: !!conversationId, statuses: interpretation.statusHints, hasTextQuery: !!interpretation.textQuery, orderByOverdueFirst: interpretation.wantsOverdueFocus } });
            // [PING_OVERDUE_TRACE] TEMPORARY — retrieval input + query path.
            if (interpretation.wantsOverdueFocus) {
                traceOverdue(input.traceId, 'RETRIEVAL_INPUT', {
                    actorPresent: !!input.actorUserId,
                    statuses: interpretation.statusHints,
                    query: interpretation.textQuery,
                    ftsWillRun: !!interpretation.textQuery,
                    timeRange: timeRange ?? null,
                    orderByOverdueFirst: interpretation.wantsOverdueFocus,
                    orderColumn: interpretation.wantsOverdueFocus ? 'due_at' : 'created_at',
                    ascending: interpretation.wantsOverdueFocus,
                    limit: budget.commitments,
                    conversationScope: !!conversationId,
                    personScope: !!resolvedPersonId,
                });
            }
            return retrieveCommitments({
                actorUserId: input.actorUserId,
                conversationId,
                personId: resolvedPersonId,
                statuses: interpretation.statusHints ?? undefined,
                timeRange: timeRange ?? undefined,
                query: interpretation.textQuery ?? undefined,
                // M-1G.2: prioriza lo realmente vencido en el budget de 10
                // en vez de dejarlo a merced de created_at DESC.
                orderByOverdueFirst: interpretation.wantsOverdueFocus,
            }, budget.commitments);
        })()
        : Promise.resolve([]);

    // M-1H — misma guarda (wantsCommitments + personScopeBlocked) que
    // commitmentsPromise: es la MISMA intención ("compromisos"), sólo una
    // segunda fuente real. retrieveCommitmentProposals ya maneja
    // internamente su propia limitación de FTS (devuelve [] con textQuery,
    // ver retrieval.service.ts) — no se duplica esa condición aquí.
    //
    // M-1H v6 (Gap B): para 'pending_response_from_person' ("¿qué falta que
    // acepte Alejandra?"), la persona resuelta NUNCA debe pasarse como
    // `personId` de retrieval -- ese filtro SQL sólo matchea
    // proposed_by_user_id/proposed_responsible_user_id (proposer/
    // responsible), pero Alejandra en el caso real "Entrenar" es sólo una
    // PARTICIPANTE requerida (fila en commitment_proposal_responses) --
    // pasarla como personId excluiría "Entrenar" de la query SQL antes de
    // que filterByProposalFocus pudiera siquiera evaluarla. El filtrado por
    // "¿Alejandra está pendiente aquí?" ocurre DESPUÉS, vía
    // pendingResponderIds (ver filterByProposalFocus arriba).
    const proposalsPersonId = interpretation.proposalFocus === 'pending_response_from_person' ? undefined : resolvedPersonId;
    const baseProposalInput = {
        actorUserId: input.actorUserId,
        conversationId,
        personId: proposalsPersonId,
        statuses: interpretation.statusHints ?? undefined,
        timeRange: timeRange ?? undefined,
        query: interpretation.textQuery ?? undefined,
        orderByOverdueFirst: interpretation.wantsOverdueFocus,
        now: now.toISOString(), // M-1H v5: para proposalDatePassed, determinista
    };
    // M-1H FINAL (ticket "WORLD-CLASS AGENT QUERY ARCHITECTURE", secciones
    // 11-15) — cuando hay proposalFocus, un solo fetch con multiplicador
    // fijo NUNCA es una garantía de correctness (puede haber más candidatos
    // reales que cualquier ventana razonada, ver tests adversariales de
    // 300/1000 filas) -- se pagina hasta llenar el budget final, agotar la
    // fuente, o topar con un safety cap explícito y divulgado (ver
    // fillProposalFocusMatches arriba). Sin proposalFocus, topic/status/
    // person/time ya son exactos vía SQL (FTS real desde esta misma
    // entrega) -- un solo fetch basta, sin pérdida posible.
    const commitmentProposalsPromise: Promise<ProposalFocusFillResult> = interpretation.wantsCommitments && !personScopeBlocked
        ? (() => {
            retrievalPlan.push({ step: 'retrieveCommitmentProposals', params: { personId: !!proposalsPersonId, conversationId: !!conversationId, statuses: interpretation.statusHints, hasTextQuery: !!interpretation.textQuery, orderByOverdueFirst: interpretation.wantsOverdueFocus, proposalFocus: interpretation.proposalFocus, paginated: interpretation.proposalFocus !== null } });
            if (interpretation.proposalFocus !== null) {
                return fillProposalFocusMatches(baseProposalInput, interpretation.proposalFocus, resolvedPersonId, budget.commitments);
            }
            return retrieveCommitmentProposals(baseProposalInput, budget.commitments)
                .then((matches): ProposalFocusFillResult => ({ matches, scannedCount: matches.length, sourceExhausted: true, safetyCapReached: false }));
        })()
        : Promise.resolve<ProposalFocusFillResult>({ matches: [], scannedCount: 0, sourceExhausted: true, safetyCapReached: false });

    const messagesPromise = interpretation.wantsMessages && !personScopeBlocked
        ? (() => {
            retrievalPlan.push({ step: 'retrieveMessages', params: { conversationId: !!conversationId, personId: !!resolvedPersonId, hasTextQuery: !!interpretation.textQuery } });
            return retrieveMessages({
                actorUserId: input.actorUserId,
                conversationId,
                personId: resolvedPersonId,
                query: interpretation.textQuery ?? undefined,
                timeRange: timeRange ?? undefined,
            }, budget.messages);
        })()
        : Promise.resolve([]);

    // Transcripciones/adjuntos (M-1C/M-1B) requieren conversationId — si no
    // hay una explícita, se omiten (nunca "todas las conversaciones" para
    // estas dos fuentes, consistente con el contrato ya certificado de M-1C).
    // M-1D.1 (secciones 17-18): esto ya NO es "sin evidencia" en silencio —
    // se registra un capabilityGap explícito, porque la búsqueda ni se
    // ejecutó (limitación real de infraestructura, no ausencia de datos).
    const capabilityGaps: AgentCapabilityGap[] = [];
    // M-1G.1 (Caso F): una petición de escritura (crear/cancelar/enviar/
    // modificar/borrar) nunca es "falta de evidencia" -- es una limitación
    // real de este Agent read-only. Señalarlo explícito evita el "no
    // encontré nada relacionado" confuso que ocurría antes.
    if (interpretation.isWriteActionRequest) {
        capabilityGaps.push({
            type: 'write_action_not_supported',
            reason: 'El usuario pidió una acción de escritura (crear/cancelar/enviar/modificar/borrar) -- este Agent es read-only, nunca ejecuta escrituras.',
        });
    }
    if (interpretation.wantsTranscriptions && !conversationId) {
        capabilityGaps.push({
            type: 'global_transcription_scope_not_supported',
            reason: 'retrieveTranscriptions requiere conversationId — no existe búsqueda global de transcripciones todavía (M-1C).',
        });
    }
    if (interpretation.wantsAttachments && !conversationId) {
        capabilityGaps.push({
            type: 'global_attachment_scope_not_supported',
            reason: 'retrieveAttachments requiere conversationId — no existe búsqueda global de adjuntos todavía (M-1B).',
        });
    }

    const transcriptionsPromise = interpretation.wantsTranscriptions && conversationId
        ? (() => {
            retrievalPlan.push({ step: 'retrieveTranscriptions', params: { conversationId: true, hasTextQuery: !!interpretation.textQuery } });
            return retrieveTranscriptions(input.actorUserId, conversationId, budget.transcriptions, timeRange ?? undefined, interpretation.textQuery ?? undefined);
        })()
        : Promise.resolve([]);

    const attachmentsPromise = interpretation.wantsAttachments && conversationId
        ? (() => {
            retrievalPlan.push({ step: 'retrieveAttachments', params: { conversationId: true, kind: 'document' } });
            return retrieveAttachments(input.actorUserId, conversationId, budget.attachments, ['document']);
        })()
        : Promise.resolve([]);

    // M-2 — retrieveMemory ya es owner-scoped internamente (nunca depende de
    // este guard para autorización -- ver memory.service.ts#retrieveMemory,
    // siempre `.eq('owner_user_id', ...)`); memoryBlocked es sólo el mismo
    // principio de "nunca ampliar el scope semántico" ya aplicado a
    // commitments/messages, no una segunda barrera de autorización.
    const memoryPromise: Promise<RetrievalMemory[]> = memoryIntentSignal.wantsMemory && !memoryBlocked
        ? (() => {
            retrievalPlan.push({ step: 'retrieveMemory', params: { subjectPersonId: !!memorySubjectPersonId, freshness: memoryIntentSignal.memoryFreshness, hasTopicQuery: !!memoryTopicQuery } });
            const plan = buildMemoryQueryPlan(input.actorUserId, memorySubjectPersonId, memoryTopicQuery, timeRange, memoryIntentSignal.memoryFreshness, budget.memory);
            return retrieveMemory(plan, input.traceId);
        })()
        : Promise.resolve<RetrievalMemory[]>([]);

    const [commitmentsOnly, proposalsFill, messages, transcriptions, attachments, memoryFactsRaw] = await Promise.all([
        commitmentsPromise, commitmentProposalsPromise, messagesPromise, transcriptionsPromise, attachmentsPromise, memoryPromise,
    ]);
    const proposalsOnly = proposalsFill.matches;
    // M-1H FINAL — CONTRATO CORREGIDO: authorized candidates -> structured
    // semantic filter -> canonical sort -> global budget -> requiredSourceRefs.
    // mergeCommitmentSources sólo concatena+ordena (nunca trunca);
    // proposalsOnly ya viene filtrada por proposalFocus PÁGINA A PÁGINA (ver
    // fillProposalFocusMatches) -- aplicar filterByProposalFocus de nuevo
    // aquí es idempotente (mismo predicado puro por fila) y se mantiene por
    // uniformidad/defensa en profundidad, nunca cambia el resultado. El
    // budget final se aplica DESPUÉS del filtro, nunca antes.
    const sortedCommitments = mergeCommitmentSources(commitmentsOnly, proposalsOnly, interpretation.wantsOverdueFocus);
    const filteredCommitments = filterByProposalFocus(sortedCommitments, interpretation.proposalFocus, resolvedPersonId);
    const commitments = filteredCommitments.slice(0, budget.commitments);

    // M-2 — INVARIANTE NO NEGOCIABLE: la verdad canónica siempre domina a la
    // memoria. Se aplica AQUÍ, después de que `commitments` ya es el conjunto
    // canónico final (filtrado+ordenado+recortado) para esta consulta -- una
    // memoria de estado de commitment/proposal que ya no coincide con el
    // estado canónico actual se reclasifica como histórica (isCurrent=false)
    // sin importar su `status` almacenado. Luego se particiona en
    // vigentes/históricos para que síntesis nunca tenga que re-derivar esa
    // distinción por su cuenta.
    const memoryFactsDominanceApplied = enforceMemoryCanonicalDominance(memoryFactsRaw);
    const memoryFacts = memoryFactsDominanceApplied.filter((m) => m.isCurrent);
    const historicalMemoryFacts = memoryFactsDominanceApplied.filter((m) => !m.isCurrent);
    if (memoryFactsRaw.length > 0) sourcesConsulted.push('retrieveMemory');
    sourceCounts.memory = memoryFactsRaw.length;

    // Sección 12 del ticket (truncation/completeness honesty) — señales
    // DISTINTAS, nunca una sola "truncated" optimista:
    //   - requiredSourceRefsTruncated: ya sabemos con CERTEZA (conteos que
    //     de verdad observamos) que hay más items válidos que los que el
    //     budget final devolvió.
    //   - requiredSourceRefsTruncationKnown: falso SÓLO cuando la única
    //     razón de detenerse fue un safety cap explícito (nunca porque
    //     "hay más que el budget" en sí sea incierto -- eso siempre se sabe
    //     con certeza una vez que se observó el conteo real). Cuando
    //     proposalFocus no aplica, topic/status/person/time ya son exactos
    //     vía SQL real -- siempre conocido.
    const requiredSourceRefsTruncated = filteredCommitments.length > commitments.length;
    const requiredSourceRefsTruncationKnown = !proposalsFill.safetyCapReached;
    // [PING_OVERDUE_TRACE] TEMPORARY — retrieved commitments trace (máx 20).
    // Post-merge a propósito (M-1H): el trace debe reflejar lo que el Agent
    // realmente evalúa, no sólo la tabla `commitments`.
    if (interpretation.wantsOverdueFocus) {
        traceOverdue(input.traceId, 'RETRIEVED_COMMITMENTS', {
            count: commitments.length,
            commitmentsOnlyCount: commitmentsOnly.length,
            proposalsOnlyCount: proposalsOnly.length,
            items: commitments.slice(0, 20).map((c) => ({
                safeTitle: traceSafeTitle(c.title),
                entityType: c.entityType,
                status: c.status,
                dueAt: c.dueAt,
                createdAt: c.createdAt,
                sourceRef: c.provenance?.sourceId ?? null,
            })),
        });
    }
    // [PING_PROPOSAL_TRACE] TEMPORARY — retrieval input + merge/budget +
    // proposal filter result (sección 2 del ticket).
    if (interpretation.proposalFocus !== null) {
        traceProposal(input.traceId, 'RETRIEVAL_AND_FILTER', {
            commitmentsOnlyCount: commitmentsOnly.length,
            proposalsOnlyCount: proposalsOnly.length,
            proposalsScannedCount: proposalsFill.scannedCount,
            proposalsSourceExhausted: proposalsFill.sourceExhausted,
            proposalsSafetyCapReached: proposalsFill.safetyCapReached,
            sortedBeforeFilterCount: sortedCommitments.length,
            afterProposalFilterCount: filteredCommitments.length,
            afterFinalBudgetCount: commitments.length,
            requiredSourceRefsTruncated,
            requiredSourceRefsTruncationKnown,
            proposalFocus: interpretation.proposalFocus,
            resolvedPersonId: resolvedPersonId ?? null,
            items: commitments.slice(0, 20).map((c) => ({
                safeTitle: traceSafeTitle(c.title),
                entityType: c.entityType,
                actorHasApproved: c.actorHasApproved ?? null,
                actorCanRespond: c.actorCanRespond ?? null,
                isFullyApproved: c.isFullyApproved ?? null,
            })),
        });
    }
    if (commitmentsOnly.length > 0) sourcesConsulted.push('retrieveCommitments');
    if (proposalsOnly.length > 0) sourcesConsulted.push('retrieveCommitmentProposals');
    if (messages.length > 0 || interpretation.wantsMessages) sourcesConsulted.push('retrieveMessages');
    if (transcriptions.length > 0 || (interpretation.wantsTranscriptions && conversationId)) sourcesConsulted.push('retrieveTranscriptions');
    if (attachments.length > 0 || (interpretation.wantsAttachments && conversationId)) sourcesConsulted.push('retrieveAttachments');
    sourceCounts.commitments = commitments.length;
    sourceCounts.messages = messages.length;
    sourceCounts.transcriptions = transcriptions.length;
    sourceCounts.attachments = attachments.length;

    const events = commitments.length > 0
        ? (() => {
            retrievalPlan.push({ step: 'retrieveCommitmentEvents', params: { commitmentCount: commitments.length } });
            return retrieveCommitmentEvents(input.actorUserId, commitments.map((c) => c.id), budget.events);
        })()
        : Promise.resolve([]);
    const resolvedEvents = await events;
    if (resolvedEvents.length > 0) sourcesConsulted.push('retrieveCommitmentEvents');
    sourceCounts.events = resolvedEvents.length;

    const provenance = dedupeProvenance([
        ...commitments.map((c) => c.provenance),
        ...resolvedEvents.map((e) => e.provenance),
        ...messages.map((m) => m.provenance),
        ...transcriptions.map((t) => t.provenance),
        ...attachments.map((a) => a.provenance),
    ]);

    const evidenceFound = commitments.length > 0 || resolvedEvents.length > 0 || messages.length > 0
        || transcriptions.length > 0 || attachments.length > 0 || memoryFacts.length > 0 || historicalMemoryFacts.length > 0;

    // M-1H — REQUIRED SOURCE REFS (secciones 8/9 del ticket): para una
    // consulta exhaustive_list, la respuesta final DEBE cubrir TODOS los
    // items en `commitments` (ya filtrado por proposalFocus y recortado al
    // budget) -- nunca dejar que el modelo de síntesis "elija" arbitrariamente
    // un subconjunto. `requiredSourceRefs` es un SUBCONJUNTO de `provenance`,
    // nunca una fuente nueva de evidencia (invariante: requiredSourceRefs ⊆
    // provenance ⊆ allowedSourceRefs de síntesis).
    const requiredSourceRefs: RetrievalProvenance[] = queryCardinality === 'exhaustive_list'
        ? commitments.map((c) => c.provenance)
        : [];
    // requiredSourceRefsTruncated/requiredSourceRefsTruncationKnown ya se
    // calcularon arriba, DESPUÉS del filtro estructural y ANTES/DESPUÉS del
    // budget final respectivamente (ver comentario junto a su cómputo) --
    // reflejan honestamente el conjunto que de verdad importa para
    // exhaustive_list, no una aproximación pre-filtro.
    // M-1H — COUNT CONTRACT (sección 10): el Core calcula el número, el
    // modelo de síntesis nunca cuenta manualmente (ver
    // agentResponseSynthesizer.service.ts, camino de respuesta determinística
    // para queryCardinality='count').
    const countResult = queryCardinality === 'count' ? commitments.length : undefined;

    if (interpretation.proposalFocus !== null || queryCardinality === 'exhaustive_list' || queryCardinality === 'count') {
        traceProposal(input.traceId, 'REQUIRED_SOURCE_REFS', {
            queryCardinality,
            requiredCount: requiredSourceRefs.length,
            requiredSourceRefsTruncated,
            requiredSourceRefsTruncationKnown,
            countResult: countResult ?? null,
        });
    }

    // topic_too_broad (sección 20): general_context sin ninguna evidencia y
    // sin ningún hint (ni persona ni texto ni tiempo) — la query no dio
    // suficiente señal, no es lo mismo que "no evidence" con una query clara.
    if (!needsClarification && !evidenceFound && interpretation.intent === 'general_context'
        && interpretation.personHints.length === 0 && !interpretation.textQuery && !interpretation.timeExpression) {
        needsClarification = true;
        clarification = { reason: 'topic_too_broad' };
    }

    // M-1D.1 (sección 19): el intérprete (LLM o determinístico) sólo SEÑALA
    // ambigüedad — nunca la resuelve. El builder decide qué hacer. Un
    // "unresolved_pronoun" ("¿qué dijo él?" sin antecedente confiable) se
    // trata como person_ambiguous sin candidatos: no hay a quién resolver,
    // a diferencia de >1 match real de resolvePerson.
    const ambiguityHints = interpretation.ambiguityHints ?? []; // defensivo: un intérprete mal formado no debe crashear el builder
    if (!needsClarification) {
        if (ambiguityHints.includes('unresolved_pronoun')) {
            needsClarification = true;
            clarification = { reason: 'person_ambiguous', candidates: [] };
        } else if (ambiguityHints.includes('time_ambiguous')) {
            needsClarification = true;
            clarification = { reason: 'time_ambiguous' };
        } else if (ambiguityHints.includes('topic_too_broad')) {
            needsClarification = true;
            clarification = { reason: 'topic_too_broad' };
        }
    }

    // [PING_OVERDUE_TRACE] TEMPORARY — AgentContext trace. isOverdue aquí usa
    // AHORA la misma función canónica real que consumirá la síntesis
    // (utils/overdueSemantics.ts#isCommitmentOverdue) -- antes tenía su
    // propia fórmula inline, una TERCERA duplicación de esta lógica que
    // nunca aplicaba el carve-out de "mismo día calendario" (M-1H v3,
    // Canonical Overdue Semantics). isOverdue aquí es sólo para el log,
    // nunca se agrega al AgentContext real.
    if (interpretation.wantsOverdueFocus) {
        const nowIso = now.toISOString();
        traceOverdue(input.traceId, 'AGENT_CONTEXT', {
            commitmentCount: commitments.length,
            commitments: commitments.map((c) => ({
                safeTitle: traceSafeTitle(c.title),
                entityType: c.entityType,
                status: c.status,
                dueAt: c.dueAt,
                // M-1H v5: entityType real -- una commitment_proposal nunca
                // es "vencida" (regla principal), isOverdue siempre false
                // para ella aquí también, para que el trace refleje la
                // MISMA verdad que la síntesis real, nunca una tercera
                // fórmula.
                isOverdue: isCommitmentOverdue(c.dueAt, c.status, nowIso, timezone, c.entityType),
            })),
            wantsOverdueFocus: interpretation.wantsOverdueFocus,
            textQuery: interpretation.textQuery,
            evidenceFound,
        });
    }

    return {
        input: input.input,
        now: now.toISOString(),
        // M-1H v3 — CANONICAL OVERDUE SEMANTICS: propagada para que la
        // síntesis (agentResponseSynthesizer.service.ts) calcule "mismo día
        // calendario" en la zona REAL del actor, nunca con new Date() local
        // del servidor (Render). Siempre presente (resolveAgentTimezone ya
        // garantiza un fallback a 'UTC', nunca undefined).
        timezone,
        intent: { type: interpretation.intent, confidence: interpretation.intentConfidence },
        wantsOverdueFocus: interpretation.wantsOverdueFocus,
        explicitPersonMention: explicitPersonHints.length > 0,
        proposalFocus: interpretation.proposalFocus,
        queryCardinality,
        requiredSourceRefs,
        requiredSourceRefsTruncated,
        requiredSourceRefsTruncationKnown,
        proposalFocusScannedCount: interpretation.proposalFocus !== null ? proposalsFill.scannedCount : undefined,
        proposalFocusSourceExhausted: interpretation.proposalFocus !== null ? proposalsFill.sourceExhausted : undefined,
        proposalFocusSafetyCapReached: interpretation.proposalFocus !== null ? proposalsFill.safetyCapReached : undefined,
        countResult,
        entities: {
            people,
            timeRange,
            topics: (interpretation.topicHints ?? []).length > 0 ? interpretation.topicHints : (interpretation.textQuery ? [interpretation.textQuery] : []),
            conversationId: conversationId ?? null,
        },
        commitments,
        events: resolvedEvents,
        messages,
        transcriptions,
        attachments,
        wantsMemory: memoryIntentSignal.wantsMemory,
        memoryFreshness: memoryIntentSignal.memoryFreshness,
        memoryQueryCardinality: memoryIntentSignal.memoryQueryCardinality,
        memoryFacts,
        historicalMemoryFacts,
        summaries: [],
        canonicalFacts,
        provenance,
        needsClarification,
        clarification,
        evidenceFound,
        capabilityGaps,
        // contextSummary deliberadamente ausente (sección 18) — ver doc.
        retrievalPlan,
        diagnostics: {
            interpretedIntent: interpretation.intent,
            interpretationSource: interpretation.source,
            interpreterUsed: interpretation.source === 'llm' ? 'llm' : interpretation.source === 'deterministic' ? 'deterministic' : 'fallback',
            model: interpretation.modelUsed,
            schemaValid: interpretation.schemaValid,
            fallbackReason: interpretation.fallbackReason,
            timezoneSource,
            retrievalPlan,
            sourcesConsulted: Array.from(new Set(sourcesConsulted)),
            sourceCounts,
            durationMs: Date.now() - startedAt,
        },
    };
}
