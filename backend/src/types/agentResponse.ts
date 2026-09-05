// M-1E — Agent Response / Synthesis Layer. Turns an already-authorized,
// already-retrieved `AgentContext` (M-1D) into a natural-language response
// for the user. This layer NEVER queries the database, NEVER decides
// authorization, NEVER executes anything — it only phrases what
// `AgentContext` already proved is true and traceable.
import type { AgentCapabilityGap, AgentChannel, AgentClarification, AgentContext } from './agentContext';
import type { RetrievalSourceType } from './retrieval';

// ─── Input (sección 4) ───────────────────────────────────────────────────────
// Deliberadamente NO acepta IDs adicionales ni vuelve a pedir retrieval —
// `context` ya es la única fuente de verdad (sección 2).
export interface AgentSynthesisInput {
    input: string;
    context: AgentContext;
    locale?: string;
    channel?: AgentChannel;
}

// ─── Status (sección 6) — SIEMPRE calculado determinísticamente por el
// backend a partir de AgentContext, NUNCA elegido por el modelo. Esto
// elimina una categoría entera de alucinación: el modelo no puede "decidir"
// que hay evidencia cuando no la hay. ────────────────────────────────────────
export type AgentResponseStatus = 'answered' | 'needs_clarification' | 'no_evidence' | 'capability_gap';

// ─── Citations / claims (secciones 8, 9, 34) ────────────────────────────────
export interface AgentCitation {
    sourceType: RetrievalSourceType;
    sourceId: string;
}

export interface AgentClaim {
    text: string;
    sourceRefs: AgentCitation[]; // siempre no vacío tras validación — un claim sin soporte se descarta, nunca se presenta (sección 11)
}

export type FollowUpType = 'clarify_person' | 'clarify_time' | 'clarify_topic';

export interface AgentFollowUpOption {
    id: string;   // SIEMPRE un id real de un candidato autorizado (ej. profile/contact id de resolvePerson) — nunca inventado
    label: string;
}

export interface AgentFollowUp {
    type: FollowUpType;
    question: string;
    options?: AgentFollowUpOption[];
}

// ─── Diagnostics (sección 37) — nunca contenido sensible ────────────────────
export interface AgentResponseDiagnostics {
    synthesizerUsed: 'llm' | 'deterministic' | 'fallback';
    model?: string;
    durationMs: number;
    schemaValid?: boolean;
    claimValidationPassed?: boolean;
    fallbackReason?: string;
    sourceCount: number;
    retried?: boolean;
    // M-1E.1: nunca IDs ni contenido — sólo conteos, para poder observar
    // cuánta evidencia autorizada quedó fuera del prompt por budget.
    serializedSourceCount?: number;
    droppedByBudgetCount?: number;
}

// ─── Output (sección 5) ──────────────────────────────────────────────────────
export interface AgentResponse {
    status: AgentResponseStatus;
    answer: string;
    claims: AgentClaim[];
    citations: AgentCitation[]; // deduplicado, agregado de claims — conveniencia para un futuro caller que no necesite el detalle por-claim
    followUp?: AgentFollowUp;
    diagnostics?: AgentResponseDiagnostics;
}

// Re-exportados por conveniencia — el resto del módulo de síntesis los
// consume directo de AgentContext, nunca los recalcula.
export type { AgentCapabilityGap, AgentClarification };
