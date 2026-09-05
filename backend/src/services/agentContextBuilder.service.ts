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
    retrieveCommitmentEvents,
    retrieveMessages,
    retrieveTranscriptions,
    retrieveAttachments,
    dedupeProvenance,
} from './retrieval.service';
import { LlmInputInterpreter, fallbackInterpretation, type AgentInputInterpreter } from './agentInputInterpreter.service';
import type {
    AgentCapabilityGap,
    AgentContext,
    AgentContextBudget,
    AgentContextInput,
    AgentClarification,
    Interpretation,
    RetrievalPlanStep,
} from '../types/agentContext';
import type { PersonResolutionResult, RetrievalTimeRange } from '../types/retrieval';

// ─── Context budget (sección 16) — mismo orden de magnitud que los defaults
// de M-1B/M-1C; M-1D no inventa un techo distinto, sólo lo hace explícito a
// nivel de "cuánto pedirle a cada retrieval". ────────────────────────────────
const DEFAULT_BUDGET: Required<AgentContextBudget> = {
    commitments: 10,
    events: 10,
    messages: 15,
    transcriptions: 5,
    attachments: 5,
};

// ─── Timezone (sección 12) — Ping es global: el default es UTC, NUNCA una
// zona regional específica. Se valida con Intl.DateTimeFormat (mismo
// mecanismo que ya usa date-parser.service.ts, reescrito aquí en vez de
// importado para no heredar su default regional 'America/Santiago', que
// contradice el principio global de M-1D — ver doc, "Time resolution".
function resolveAgentTimezone(timezone?: string): string {
    const candidate = timezone?.trim();
    if (!candidate) return 'UTC';
    try {
        new Intl.DateTimeFormat('en-US', { timeZone: candidate }).format(0);
        return candidate;
    } catch {
        return 'UTC';
    }
}

function timeZoneOffsetMs(date: Date, timeZone: string): number {
    const dtf = new Intl.DateTimeFormat('en-US', {
        timeZone, hourCycle: 'h23',
        year: 'numeric', month: '2-digit', day: '2-digit',
        hour: '2-digit', minute: '2-digit', second: '2-digit',
    });
    const parts = Object.fromEntries(dtf.formatToParts(date).map((p) => [p.type, p.value]));
    const asUtc = Date.UTC(+parts.year, +parts.month - 1, +parts.day, +parts.hour, +parts.minute, +parts.second);
    return asUtc - date.getTime();
}

function startOfDayInZone(date: Date, timeZone: string): Date {
    const offsetMs = timeZoneOffsetMs(date, timeZone);
    const local = new Date(date.getTime() + offsetMs);
    const localMidnightUtcMs = Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate(), 0, 0, 0);
    return new Date(localMidnightUtcMs - offsetMs);
}

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

    const interpretation = await safeInterpret(interpreter, input.input, { conversationId, channel: input.channel });
    const timeRange = resolveTimeExpression(interpretation.timeExpression, now, timezone);

    const retrievalPlan: RetrievalPlanStep[] = [];
    const sourcesConsulted: string[] = [];
    const sourceCounts: Record<string, number> = {};

    // ─── Entity resolution (sección 11) — nunca se elige arbitrariamente. ────
    const people: PersonResolutionResult[] = [];
    let needsClarification = false;
    let clarification: AgentClarification | undefined;
    let resolvedPersonId: string | undefined;

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
        }
    }

    const canonicalFacts: AgentContext['canonicalFacts'] = people
        .filter((p) => p.resolved && !p.ambiguous)
        .map((p) => ({ type: 'person_resolved' as const, personId: p.resolved!.id, displayName: p.resolved!.displayName }));

    // ─── Retrieval plan + ejecución (secciones 13, 15, 33) ──────────────────
    // Fuentes independientes en paralelo; nunca se ejecutan fuentes que la
    // intención no pidió (sección 33). commitment events depende de los
    // commitments encontrados, así que va después.
    const commitmentsPromise = interpretation.wantsCommitments
        ? (() => {
            retrievalPlan.push({ step: 'retrieveCommitments', params: { personId: !!resolvedPersonId, conversationId: !!conversationId, statuses: interpretation.statusHints, hasTextQuery: !!interpretation.textQuery } });
            return retrieveCommitments({
                actorUserId: input.actorUserId,
                conversationId,
                personId: resolvedPersonId,
                statuses: interpretation.statusHints ?? undefined,
                timeRange: timeRange ?? undefined,
                query: interpretation.textQuery ?? undefined,
            }, budget.commitments);
        })()
        : Promise.resolve([]);

    const messagesPromise = interpretation.wantsMessages
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

    const [commitments, messages, transcriptions, attachments] = await Promise.all([
        commitmentsPromise, messagesPromise, transcriptionsPromise, attachmentsPromise,
    ]);
    if (commitments.length > 0) sourcesConsulted.push('retrieveCommitments');
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
        || transcriptions.length > 0 || attachments.length > 0;

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

    return {
        input: input.input,
        intent: { type: interpretation.intent, confidence: interpretation.intentConfidence },
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
