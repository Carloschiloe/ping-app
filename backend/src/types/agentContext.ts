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
    step: 'resolvePerson' | 'retrieveCommitments' | 'retrieveCommitmentEvents' | 'retrieveMessages' | 'retrieveTranscriptions' | 'retrieveAttachments' | 'personScopeGuardSkipped';
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
export type CapabilityGapType = 'global_transcription_scope_not_supported' | 'global_attachment_scope_not_supported';

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
    intent: AgentIntent;
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
