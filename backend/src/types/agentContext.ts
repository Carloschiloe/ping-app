// M-1D — Agent Context Builder. DTOs for the first canonical layer that
// turns a natural-language request into a structured, authorized context
// package for a FUTURE Ping Agent. This file defines contracts only — no
// logic. Ping is global/horizontal: nothing here is tied to a language,
// timezone, or industry.
//
// This is preparation, not execution: nothing here decides a final answer,
// runs a tool, writes data, or talks to the end user.
import type { CanonicalCommitmentStatus } from '../utils/commitmentStatus';
import type {
    PersonResolutionResult,
    RetrievalAttachment,
    RetrievalCommitment,
    RetrievalCommitmentEvent,
    RetrievalMessage,
    RetrievalProvenance,
    RetrievalTimeRange,
    RetrievalTranscript,
} from './retrieval';

// ─── Input ───────────────────────────────────────────────────────────────────
// `channel` is contextual metadata only — it never changes authorization or
// retrieval semantics, only informs diagnostics/future presentation layers.
export type AgentChannel = 'mobile' | 'web' | 'voice' | 'device' | 'car' | string;

export interface AgentContextInput {
    actorUserId: string;
    input: string;
    conversationId?: string;
    channel?: AgentChannel;
    now?: string; // ISO timestamp; defaults to server "now" if absent
    locale?: string;
    timezone?: string; // IANA name; validated, never trusted blindly
    // [PING_OVERDUE_TRACE] TEMPORARY — ver backend/src/utils/overdueTrace.ts. Remover junto con esa instrumentación.
    traceId?: string;
}

// ─── Intent (sección 7) ──────────────────────────────────────────────────────
// Taxonomía mínima justificada por las consultas objetivo reales del ticket
// (sección 28). "conversation_context" y "task_status" se evaluaron y se
// descartaron como categorías separadas: conversation_context es un caso de
// recall (misma evidencia, mismo plan); task_status es un caso de
// commitment_query (mismo retrieval, sólo cambia el filtro de status). Menos
// categorías, cada una con un plan de retrieval realmente distinto.
export type AgentIntentType =
    | 'commitment_query'   // "qué le prometí a X", "qué pendientes tengo"
    | 'person_query'       // sobre una persona en general, sin foco en compromisos/texto
    | 'recall'             // "qué hablamos de X" — contexto conversacional general
    | 'message_search'     // búsqueda de texto explícita ("busca", "search")
    | 'document_search'    // adjuntos/documentos ("me mandaron", "contrato")
    | 'general_context';   // fallback conservador — no se identificó una intención más específica

export interface AgentIntent {
    type: AgentIntentType;
    confidence: number; // 0..1 — heurístico o reportado por el intérprete, nunca inventado como 1.0 salvo certeza estructural
}

// ─── Interpretation (secciones 8, 9, 10) ────────────────────────────────────
// Salida del intérprete de lenguaje natural. Deliberadamente NUNCA contiene
// un ID (conversationId/personId/commitmentId) — sólo hints en texto plano.
// La resolución a IDs autorizados ocurre DESPUÉS, vía servicios M-1B.1
// (sección 23: la autorización nunca la decide el intérprete).
// M-1D.1: hints de ambigüedad que el intérprete puede reportar (nunca
// resuelve él mismo — sólo señala). "unresolved_pronoun" cubre el caso de
// sección 11 ("¿qué dijo él?" sin antecedente confiable en el contexto
// disponible) — el builder lo trata como person_ambiguous sin candidatos
// (no hay a quién resolver, a diferencia de una ambigüedad de >1 match real).
export type AmbiguityHintType = 'unresolved_pronoun' | 'time_ambiguous' | 'topic_too_broad';

// M-1H v6 (Gap B del final proposal lifecycle gate): señal ESTRUCTURADA
// (nunca textQuery) para preguntas sobre el lifecycle de una
// commitment_proposal -- "¿qué estoy esperando?" (waiting_for_others),
// "¿qué tengo por aceptar?" (needs_my_response), "¿qué falta que acepte
// Alejandra?" (pending_response_from_person, junto con personHints). El
// Core filtra los resultados usando esta señal + los campos ya resueltos de
// participación (actorHasApproved/actorCanRespond/pendingResponderIds) --
// el LLM NUNCA decide esto por su cuenta (ver
// agentContextBuilder.service.ts, filtro aplicado después del merge de
// commitments+proposals).
export type ProposalFocus = 'waiting_for_others' | 'needs_my_response' | 'pending_response_from_person' | null;

// M-1H — "DETERMINISTIC QUERY SEMANTICS & EXHAUSTIVE ANSWER CONTRACTS":
// clasificación estructurada de CARDINALIDAD (sección 5 del ticket) --
// cuántos items reales corresponde devolver, decidido por el Core, nunca
// dejado a que el modelo de síntesis "elija" arbitrariamente cuántos
// mencionar. Ver agentInputInterpreter.service.ts#classifyQueryCardinality.
//   - 'exhaustive_list': la respuesta DEBE cubrir todos los items válidos
//     dentro del budget (ver AgentContext.requiredSourceRefs) -- "¿qué
//     estoy esperando?", "¿qué tengo vencido?", "¿qué falta que acepte X?".
//   - 'focused_lookup': una consulta sobre UN target puntual (ej. "¿qué
//     pasó con Entrenar?") -- nunca exige cobertura exhaustiva del dominio.
//   - 'count': el número lo calcula el Core, el modelo sólo lo redacta (ver
//     AgentContext.countResult).
//   - 'summary'/'unknown': reservados para clasificación futura más fina;
//     hoy se tratan igual que 'focused_lookup' (sin requiredSourceRefs).
export type QueryCardinality = 'exhaustive_list' | 'focused_lookup' | 'summary' | 'count' | 'unknown';

export interface Interpretation {
    intent: AgentIntentType;
    intentConfidence: number;
    personHints: string[];       // nombres tal como aparecen en el texto — nunca IDs
    topicHints: string[];        // M-1D.1: conceptos/temas explícitos del input — nunca expansión semántica (sección 14/19)
    textQuery: string | null;    // texto residual para FTS (M-1C) — null si no aporta
    timeExpression: string | null; // frase temporal cruda detectada, ej. "ayer" — la resolución ocurre aparte
    statusHints: CanonicalCommitmentStatus[] | null; // ej. ["proposed","accepted"] para "pendientes"/"open"
    wantsCommitments: boolean;
    wantsMessages: boolean;
    wantsTranscriptions: boolean;
    wantsAttachments: boolean;
    // M-1G.1: true sólo cuando el usuario pregunta específicamente por
    // compromisos vencidos/atrasados (no "pendientes" en general) — activa
    // el guard determinístico de vencidos en la síntesis (ver
    // agentResponseSynthesizer.service.ts#enforceOverdueDisclosure).
    wantsOverdueFocus: boolean;
    // M-1H v6 — ver ProposalFocus arriba. null cuando la pregunta no es
    // sobre el lifecycle de aprobación de una proposal (el caso normal).
    proposalFocus: ProposalFocus;
    // M-1G.1: true cuando el texto pide una ACCIÓN de escritura (crear,
    // cancelar, enviar, modificar, borrar...) en vez de una consulta. Este
    // Agent sigue siendo 100% read-only -- nunca ejecuta la acción -- pero
    // el builder usa esta señal para responder con un capability_gap claro
    // en vez de un "no encontré evidencia" confuso (ver
    // types/agentContext.ts#CapabilityGapType, 'write_action_not_supported').
    isWriteActionRequest: boolean;
    ambiguityHints: AmbiguityHintType[]; // M-1D.1: señales, nunca una resolución — el builder decide needsClarification
    source: 'deterministic' | 'llm' | 'llm_fallback';
    fallbackReason?: string; // M-1D.1: sólo presente cuando source='llm_fallback' — nunca contenido sensible, sólo la causa (timeout/schema_invalid/api_error/...)
    // M-1D.1: metadata de diagnóstico únicamente (nunca prompt/input/respuesta cruda) — el builder los traslada a AgentDiagnostics.
    modelUsed?: string;
    schemaValid?: boolean;
}

// ─── Retrieval plan (sección 13) ─────────────────────────────────────────────
// Plan explícito e inspeccionable ANTES de ejecutar — nunca una mega-query
// indiscriminada. Los `params` son un resumen seguro (nunca contenido crudo
// ni datos ajenos) pensado para tests/diagnostics.
export interface RetrievalPlanStep {
    step: 'resolvePerson' | 'retrieveCommitments' | 'retrieveCommitmentProposals' | 'retrieveCommitmentEvents' | 'retrieveMessages' | 'retrieveTranscriptions' | 'retrieveAttachments' | 'personScopeGuardSkipped';
    params?: Record<string, unknown>;
}

// ─── Ambigüedad / sin evidencia (secciones 20, 21) ──────────────────────────
export type ClarificationReason = 'person_ambiguous' | 'time_ambiguous' | 'topic_too_broad';

export interface AgentClarification {
    reason: ClarificationReason;
    candidates?: PersonResolutionResult['candidates'];
}

// ─── Context item empaquetado (sección 17) ──────────────────────────────────
// Se reutilizan los DTOs delgados de M-1B/M-1C directamente (RetrievalCommitment,
// RetrievalMessage, etc.) en vez de inventar una envoltura paralela — ya son
// { id, campos, timestamp, provenance, textRank? } compactos y tipados; una
// nueva envoltura sería duplicación sin beneficio real. `textRank` (M-1C)
// hace de `score` cuando hubo búsqueda de texto.

// ─── Capability gaps (M-1D.1, secciones 17-18) ──────────────────────────────
// Distingue "buscamos y no había nada" (evidenceFound=false) de "no pudimos
// ni buscar por una limitación real de infraestructura" (capabilityGap). El
// futuro Agent necesita esta diferencia para no afirmar falsamente "no
// evidence" cuando en realidad la búsqueda ni se ejecutó.
// M-1G.1: hallazgo real de staging (M-1G-S2, Caso F) — "Crea un compromiso
// para llamar a Alejandra" caía en no_evidence ("no encontré nada
// relacionado"), técnicamente seguro (no crea nada) pero semánticamente
// pobre/confuso: el problema no era falta de evidencia, era una petición de
// escritura que este Agent (read-only) no soporta. Mismo mecanismo de
// capability gap ya existente, nunca confundir con "no había evidencia".
export type CapabilityGapType = 'global_transcription_scope_not_supported' | 'global_attachment_scope_not_supported' | 'write_action_not_supported';

export interface AgentCapabilityGap {
    type: CapabilityGapType;
    reason: string;
}

// ─── Diagnostics (sección 32) — nunca contenido sensible ────────────────────
export interface AgentDiagnostics {
    interpretedIntent: AgentIntentType;
    interpretationSource: Interpretation['source'];
    interpreterUsed: 'llm' | 'deterministic' | 'fallback';
    model?: string; // sólo el nombre del modelo (ej. 'gpt-4o-mini'), nunca el prompt ni la respuesta cruda
    schemaValid?: boolean; // true/false sólo si se intentó interpretación LLM
    fallbackReason?: string;
    timezoneSource: 'input' | 'fallback';
    retrievalPlan: RetrievalPlanStep[];
    sourcesConsulted: string[];
    sourceCounts: Record<string, number>;
    durationMs: number;
}

// ─── Output canónico (sección 6) ─────────────────────────────────────────────
export interface AgentContextEntities {
    people: PersonResolutionResult[]; // uno por personHint interpretado, ya resuelto (o no) contra el universo autorizado
    timeRange: RetrievalTimeRange | null;
    topics: string[]; // términos de texto usados para FTS, para trazabilidad — nunca expansión semántica (sección 19)
    conversationId: string | null; // el que el CALLER pasó explícitamente — nunca uno "adivinado" por el intérprete
}

export interface AgentContext {
    input: string;
    // M-1G.1: el "ahora" real usado para resolver timeExpression, propagado
    // aquí para que la síntesis pueda calcular "vencido" (dueAt < now) de
    // forma determinística en vez de esperar que el modelo compare fechas
    // sin conocer la fecha actual (causa raíz real de M-1G-S2, Caso E).
    now: string;
    // M-1H v3 — CANONICAL OVERDUE SEMANTICS: zona horaria REAL del actor
    // (IANA, ya validada/con fallback a 'UTC' vía resolveAgentTimezone),
    // propagada para que "vencido" se calcule comparando el día calendario
    // en la zona del actor, nunca en la del servidor. Siempre presente.
    timezone: string;
    intent: AgentIntent;
    // M-1G.1: ver Interpretation.wantsOverdueFocus.
    wantsOverdueFocus: boolean;
    // M-1H FINAL (ticket "WORLD-CLASS AGENT QUERY ARCHITECTURE", sección 1/3)
    // — señal canónica EXPLÍCITA del AgentQueryPlan: true sólo si el input
    // crudo realmente contiene una referencia textual a una persona (ver
    // agentInputInterpreter.service.ts#isPersonHintGroundedInInput). Cuando
    // es false, NINGÚN personHint sugerido por el LLM pudo introducir scope
    // -- ver `entities.people`, siempre [] en ese caso.
    explicitPersonMention: boolean;
    // M-1H — ver ProposalFocus arriba. Propagado a AgentContext (no sólo a
    // Interpretation) para que la síntesis pueda frasear correctamente una
    // respuesta de queryCardinality='count' (sección 10 del ticket) sin
    // tener que re-derivarlo de texto libre.
    proposalFocus: ProposalFocus;
    // M-1H — ver QueryCardinality arriba. Calculado por el Core
    // (agentContextBuilder.service.ts#classifyQueryCardinality lógica),
    // nunca por el modelo de síntesis.
    queryCardinality: QueryCardinality;
    // M-1H — sólo no-vacío cuando queryCardinality='exhaustive_list': el
    // subconjunto EXACTO de `provenance` que la respuesta final DEBE citar
    // (sección 8/9 del ticket). Es un subconjunto de `provenance`/
    // `allowedSourceRefs` de síntesis, nunca una fuente nueva de evidencia.
    // La síntesis (enforceExhaustiveCoverage) agrega un claim determinístico
    // por cada ref de esta lista que el modelo omitió.
    requiredSourceRefs: RetrievalProvenance[];
    // M-1H — true cuando, DESPUÉS del filtro estructural (proposalFocus),
    // había más items válidos que los que el budget final devolvió (sección
    // 19: nunca afirmar implícitamente que una lista está completa si no lo
    // está). Calculado POST-filtro (ver "M-1H FINAL ARCHITECTURE GATE",
    // bloqueo A) -- ya no es una aproximación pre-filtro.
    requiredSourceRefsTruncated: boolean;
    // M-1H (ticket "FINAL ARCHITECTURE GATE", sección 5) — true cuando el
    // total real es CONOCIDO con certeza (ninguna fuente de retrieval
    // saturó su propia ventana de overfetch); false cuando alguna fuente
    // devolvió exactamente su límite y por lo tanto podría haber MÁS
    // candidatos más allá de esa ventana que nunca se llegaron a pedir.
    // `requiredSourceRefsTruncated=false` sólo es una afirmación honesta de
    // completitud cuando ESTE campo es también true -- nunca se reporta
    // "no truncado" cuando en realidad no se sabe.
    requiredSourceRefsTruncationKnown: boolean;
    // M-1H FINAL (ticket "WORLD-CLASS AGENT QUERY ARCHITECTURE", sección 12)
    // — metadata honesta de completitud del bucle de paginación de
    // proposalFocus (ver agentContextBuilder.service.ts#fillProposalFocusMatches).
    // Ausentes/irrelevantes cuando proposalFocus es null (un solo fetch,
    // topic/status/person/time ya exactos vía SQL real).
    //   - proposalFocusScannedCount: filas de commitment_proposals
    //     efectivamente escaneadas (nunca "asumidas").
    //   - proposalFocusSourceExhausted: true si se llegó al final real de
    //     la tabla (una página devolvió menos filas de las pedidas).
    //   - proposalFocusSafetyCapReached: true si se cortó por el techo
    //     explícito (PROPOSAL_FOCUS_SAFETY_CAP), nunca silenciosamente.
    proposalFocusScannedCount?: number;
    proposalFocusSourceExhausted?: boolean;
    proposalFocusSafetyCapReached?: boolean;
    // M-1H — sólo presente cuando queryCardinality='count': el conteo
    // calculado por el Core sobre `commitments` ya filtrado. El modelo de
    // síntesis nunca cuenta manualmente (sección 10 del ticket) -- ver
    // agentResponseSynthesizer.service.ts, camino de respuesta determinística.
    countResult?: number;
    entities: AgentContextEntities;

    commitments: RetrievalCommitment[];
    events: RetrievalCommitmentEvent[];
    messages: RetrievalMessage[];
    transcriptions: RetrievalTranscript[];
    attachments: RetrievalAttachment[];

    // "Hechos canónicos" mínimos y honestos (sección 6): entidades resueltas
    // con certeza estructural (ej. "Laura -> profile X"), NO un resumen del
    // contenido recuperado. M-1D no tiene una fuente de "facts" propia; esto
    // es deliberadamente pequeño para no inventar contenido no evidenciado.
    canonicalFacts: Array<{ type: 'person_resolved'; personId: string; displayName: string }>;

    provenance: RetrievalProvenance[];

    needsClarification: boolean;
    clarification?: AgentClarification;

    evidenceFound: boolean;
    capabilityGaps: AgentCapabilityGap[]; // nunca confundir con evidenceFound=false — ver "Capability gaps"

    // Sección 18: nunca alucinado. Ausente en este slice a propósito — ver doc.
    contextSummary?: string;

    retrievalPlan: RetrievalPlanStep[];
    diagnostics?: AgentDiagnostics;
}

export interface AgentContextBudget {
    commitments?: number;
    events?: number;
    messages?: number;
    transcriptions?: number;
    attachments?: number;
}
