// M-2 — CANONICAL MEMORY + CONTEXT ARCHITECTURE.
//
// Taxonomía (ver supabase/migrations/20260907030000_canonical_memory_records.sql
// para la justificación completa de por qué sólo 'episodic'/'semantic' son
// FILAS persistidas de esta tabla):
//   - canonical entity truth  -> commitments/profiles/contacts (nunca aquí)
//   - episodic                -> MemoryRecord.memoryType='episodic'
//   - semantic-personal       -> MemoryRecord.memoryType='semantic'
//   - derived summary         -> producto de síntesis en memoria de proceso
//   - working context         -> AgentContext, no persistido por esta tabla
//   - retrieval index         -> memory_records.search_tsv (GIN), no una tabla
//
// INVARIANTE NO NEGOCIABLE: "PING CORE OWNS MEMORY TRUTH." El LLM sólo
// produce `MemoryExtractionCandidate` (campos *Hint) — nunca escribe
// directamente un `MemoryRecord`. Todo campo de identidad/autorización/
// procedencia/tiempo final es resuelto exclusivamente por
// memory.service.ts, nunca copiado de la sugerencia del modelo sin
// validación (ver memory.service.ts#validateMemoryCandidate /
// #parseMemoryExtractionCandidate).
import type { RetrievalTimeRange } from './retrieval';

export type MemoryType = 'episodic' | 'semantic';

export type MemoryStatus = 'candidate' | 'active' | 'superseded' | 'invalidated' | 'deleted';

export type MemorySensitivity = 'normal' | 'sensitive' | 'restricted';

// 'private' es el único valor CON efecto en este ticket (ver invariante de
// alcance en la migración) -- 'conversation'/'shared' son aceptados por el
// esquema para no requerir una migración futura sólo para agregar un valor,
// pero ningún camino de lectura de este ticket los trata distinto de
// 'private': la visibilidad real siempre es owner-only.
export type MemoryVisibilityScope = 'private' | 'conversation' | 'shared';

export type MemoryExtractionMethod = 'deterministic' | 'llm' | 'manual';

export type MemorySourceType =
    | 'message'
    | 'commitment'
    | 'commitment_proposal'
    | 'attachment'
    | 'transcription'
    | 'manual';

export interface MemoryEvidenceRef {
    sourceType: MemorySourceType;
    sourceId: string;
    messageId?: string | null;
    conversationId?: string | null;
    timestamp?: string | null;
}

// Forma completa de una fila real (post-validación, post-Core-resolution).
export interface MemoryRecord {
    id: string;
    ownerUserId: string;
    memoryType: MemoryType;
    subjectPersonId: string | null;
    subjectContactId: string | null;
    subjectUnresolvedHint: string | null;
    predicate: string;
    objectValue: string;
    canonicalText: string;
    sourceType: MemorySourceType;
    sourceId: string | null;
    conversationId: string | null;
    evidenceRefs: MemoryEvidenceRef[];
    observedAt: string;
    validFrom: string | null;
    validUntil: string | null;
    status: MemoryStatus;
    supersededBy: string | null;
    supersededAt: string | null;
    confidence: number;
    sensitivity: MemorySensitivity;
    visibilityScope: MemoryVisibilityScope;
    extractionMethod: MemoryExtractionMethod;
    modelProvider: string | null;
    modelVersion: string | null;
    contentHash: string;
    createdAt: string;
    updatedAt: string;
}

// ─── Frontera de extracción LLM (sección "esquema de extracción") ──────────
// Sólo campos *Hint: el LLM SUGIERE, nunca resuelve identidad/autorización/
// procedencia. Cualquier campo ausente aquí (ownerUserId, subjectPersonId,
// sourceType/sourceId reales, evidenceRefs, status, contentHash,
// extractionMethod) es responsabilidad EXCLUSIVA de Core. Un candidato que
// intente incluir uno de esos campos "resueltos" es ignorado por
// parseMemoryExtractionCandidate -- nunca copiado, ni siquiera como sugerencia
// (ver esa función: whitelist estricta, todo lo demás se descarta).
export interface MemorySubjectHint {
    isSelf?: boolean;
    name?: string;
    email?: string;
    phone?: string;
}

export interface MemoryTemporalHint {
    observedAtHint?: string; // sugerencia únicamente -- Core SIEMPRE usa el
    // timestamp real del evento fuente para `observedAt`, nunca este valor
    // (ver memory.service.ts#ingestMemoryFromEvent). Existe sólo para permitir
    // que un proveedor futuro explique su razonamiento; jamás se persiste.
    validFromHint?: string;
    validUntilHint?: string;
}

export interface MemoryExtractionCandidate {
    memoryTypeHint: MemoryType;
    subjectHint: MemorySubjectHint | null;
    predicateHint: string;
    objectValueHint: string;
    canonicalTextHint: string;
    temporalHint?: MemoryTemporalHint;
    confidenceHint?: number;
    sensitivityHint?: MemorySensitivity;
}

// ─── Frontera de ingesta (evento -> candidato) ──────────────────────────────
// El Core, nunca la UI, decide cuándo generar memoria. Un llamador (webhook
// de mensaje, resolución de commitment, actualización de persona) construye
// este evento con datos YA autorizados/resueltos y lo pasa a
// memory.service.ts#ingestMemoryFromEvent. `extractionMethod` lo fija
// SIEMPRE el llamador (nunca el candidato) -- distingue un hecho sugerido
// por LLM (confianza acotada, sensible a bloqueo 'restricted') de uno
// derivado determinísticamente de un evento canónico (confianza plena).
export interface MemoryIngestionSourceEvent {
    ownerUserId: string;
    sourceType: MemorySourceType;
    sourceId: string;
    conversationId: string | null;
    observedAt: string;
    evidenceRefs: MemoryEvidenceRef[];
    extractionMethod: MemoryExtractionMethod;
    modelProvider?: string;
    modelVersion?: string;
    // `unknown` a propósito: puede venir de un proveedor externo real (no
    // tipado en el límite del proceso) -- ver parseMemoryExtractionCandidate,
    // que es la única función autorizada para convertir esto en un
    // MemoryExtractionCandidate confiable.
    candidate: unknown;
}

export type MemoryIngestionOutcome =
    | { kind: 'rejected'; reason: string }
    | { kind: 'duplicate'; existingId: string }
    | { kind: 'inserted'; id: string; status: MemoryStatus }
    | { kind: 'superseded'; id: string; supersededId: string };

// ─── Plan de consulta de memoria (sección 17: decisión de diseño) ──────────
// DECISIÓN: NO se extiende AgentQueryPlan/Interpretation. Se crea un tipo
// DERIVADO propio. Justificación (ver informe de entrega, sección
// "MemoryQueryPlan"): Interpretation está modelado 1:1 sobre las dimensiones
// de commitments/proposals (proposalFocus, queryCardinality, statusFilter) --
// forzar "sujeto de memoria", "vigencia temporal (current/historical)" y
// "tipo de memoria" dentro de ese mismo contrato mezclaría dos taxonomías
// distintas en un solo tipo (violación directa de la regla "nunca mezclar
// categorías" del propio ticket). MemoryQueryPlan en cambio REUTILIZA valores
// ya resueltos por el pipeline existente (resolvedPersonId, timeRange,
// topicQuery) en vez de re-derivarlos -- no hay una segunda interpretación de
// lenguaje natural paralela, sólo un segundo *plan* construido desde el mismo
// Interpretation ya validado (ver agentContextBuilder.service.ts#buildMemoryQueryPlan).
export type MemoryFreshness = 'current' | 'historical' | 'any';

// M-2 FINAL (sección 20, "memory query cardinality") — la FORMA de la
// pregunta, distinta de `MemoryFreshness` (la VIGENCIA temporal que se pide):
// una consulta puede ser 'provenance' Y 'current' a la vez ("¿por qué sabes
// que prefiero café?" -- forma=provenance, vigencia=current). Nunca se
// fuerza toda consulta de memoria por el mismo modo genérico de retrieval --
// esto es una señal de DIAGNÓSTICO/SÍNTESIS (cómo debe frasear la
// respuesta), no un filtro adicional de `retrieveMemory` (el filtro real ya
// lo dan freshness/topicQuery/subjectPersonId).
export type MemoryQueryCardinality =
    | 'fact_lookup'        // "¿dónde vive Alejandra?" -- un hecho puntual
    | 'history'            // "¿dónde vivía el año pasado?" -- la versión superada
    | 'summary'            // "¿qué sabes de Alejandra?" -- panorama general
    | 'provenance'         // "¿por qué sabes que prefiero café?" -- exige citar evidencia
    | 'change_over_time'   // "¿qué cambió sobre Proyecto X?" -- comparación vigente/histórico
    | 'preference_list'    // "¿qué preferencias mías conoces?"
    | 'episodic_search';   // "¿cuándo hablamos de Puerto Montt?"

export interface MemoryQueryPlan {
    ownerUserId: string;
    subjectPersonId: string | null;
    subjectContactId: string | null;
    topicQuery: string | null;
    timeRange: RetrievalTimeRange | null;
    memoryTypes: MemoryType[] | null;
    sourceTypes: MemorySourceType[] | null;
    freshness: MemoryFreshness;
    limit: number;
}

// ─── DTO de retrieval (proyección delgada, nunca la fila cruda) ───────────
export interface RetrievalMemory {
    id: string;
    memoryType: MemoryType;
    subjectPersonId: string | null;
    subjectContactId: string | null;
    canonicalText: string;
    predicate: string;
    objectValue: string;
    observedAt: string;
    validFrom: string | null;
    validUntil: string | null;
    status: MemoryStatus;
    isCurrent: boolean; // derivado: status==='active' && (validUntil===null || validUntil>now)
    supersededBy: string | null;
    confidence: number;
    sensitivity: MemorySensitivity;
    evidenceRefs: MemoryEvidenceRef[];
    sourceType: MemorySourceType;
    sourceId: string | null;
    conversationId: string | null;
    textRank?: number;
}
