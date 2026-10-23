// M-2 ABSOLUTE FINAL — MEMORY CONTRACT CLOSURE, sección 16-17.
//
// Pequeña abstracción de proveedor de búsqueda de memoria, cerrando la deuda
// explícita: `retrieveMemory` (memory.service.ts) ahora es una FACHADA
// delgada sobre `MemorySearchProvider` -- ningún call site existente cambia
// (`agentContextBuilder.service.ts` sigue llamando `retrieveMemory` igual
// que siempre), pero Core ya no necesita rediseñarse cuando llegue un
// segundo motor (semantic/híbrido): sólo se implementa esta MISMA interfaz
// y se cambia qué instancia usa la fachada.
//
// Deliberadamente pequeño (sección "no overengineering"): un solo método,
// una sola implementación real hoy (Postgres FTS + índices reales), sin
// embeddings, sin acoplar Core a ningún proveedor de IA.
import { supabaseAdmin } from '../lib/supabaseAdmin';
import type {
    MemoryEvidenceRef,
    MemoryFreshness,
    MemoryQueryPlan,
    MemorySensitivity,
    MemorySourceType,
    MemoryStatus,
    MemoryType,
    RetrievalMemory,
} from '../types/memory';
import { traceMemory } from '../utils/memoryTrace';

const FTS_CONFIG = 'ping_text';
const MEMORY_READ_MAX_ATTEMPTS = 3;
const MEMORY_READ_RETRY_DELAYS_MS = [50, 150] as const;

function isTransientMemoryReadError(error: { message?: string; code?: string } | null): boolean {
    const code = error?.code ?? '';
    if (/^(08|40|53|57)/.test(code)) return true;
    return /connection reset|connection refused|network|timeout|timed out|temporarily unavailable|service unavailable/i
        .test(error?.message ?? '');
}

async function waitForMemoryReadRetry(attempt: number): Promise<void> {
    const delay = MEMORY_READ_RETRY_DELAYS_MS[attempt - 1];
    if (delay === undefined) return;
    await new Promise<void>((resolve) => setTimeout(resolve, delay));
}

export interface MemorySearchProvider {
    readonly providerName: string;
    search(plan: MemoryQueryPlan, traceId?: string): Promise<RetrievalMemory[]>;
}

function mapRowToRetrievalMemory(row: Record<string, unknown>, nowMs: number): RetrievalMemory {
    const validUntil = row.valid_until as string | null;
    const isCurrent = row.status === 'active' && (!validUntil || new Date(validUntil).getTime() > nowMs);
    return {
        id: row.id as string,
        memoryType: row.memory_type as MemoryType,
        subjectPersonId: row.subject_person_id as string | null,
        subjectContactId: row.subject_contact_id as string | null,
        canonicalText: row.canonical_text as string,
        predicate: row.predicate as string,
        objectValue: row.object_value as string,
        observedAt: row.observed_at as string,
        validFrom: row.valid_from as string | null,
        validUntil,
        status: row.status as MemoryStatus,
        isCurrent,
        supersededBy: row.superseded_by as string | null,
        confidence: row.confidence as number,
        sensitivity: row.sensitivity as MemorySensitivity,
        evidenceRefs: (row.evidence_refs as MemoryEvidenceRef[]) || [],
        sourceType: row.source_type as MemorySourceType,
        sourceId: row.source_id as string | null,
        conversationId: row.conversation_id as string | null,
    };
}

interface NormalizedEvidenceRow {
    memory_record_id: string;
    source_type: MemorySourceType;
    source_id: string;
    message_id: string | null;
    conversation_id: string | null;
    occurred_at: string | null;
}

function mapEvidenceRowToRef(row: NormalizedEvidenceRow): MemoryEvidenceRef {
    return {
        sourceType: row.source_type,
        sourceId: row.source_id,
        messageId: row.message_id,
        conversationId: row.conversation_id,
        timestamp: row.occurred_at,
    };
}

/**
 * A memory row is owner-scoped, but its provenance is not automatically
 * authorized just because the memory itself belongs to that owner.  The
 * normalized evidence table is checked in one batch so a secondary
 * conversation reference cannot keep leaking through the denormalized cache.
 *
 * This is intentionally a read-time defense in depth.  The deletion hook in
 * memory.service.ts removes revoked conversation evidence asynchronously; this
 * filter keeps retrieval safe during that interval and after a failed hook.
 */
async function filterByEvidenceAuthorization(
    results: RetrievalMemory[],
    ownerUserId: string,
    traceId?: string,
): Promise<RetrievalMemory[]> {
    if (results.length === 0) return results;

    const memoryIds = results.map((result) => result.id);
    const { data: normalizedData, error: evidenceError } = await supabaseAdmin
        .from('memory_record_evidence')
        .select('memory_record_id, source_type, source_id, message_id, conversation_id, occurred_at')
        .in('memory_record_id', memoryIds);
    if (evidenceError) throw evidenceError;

    const normalizedAvailable = Array.isArray(normalizedData);
    const evidenceByMemory = new Map<string, NormalizedEvidenceRow[]>();
    for (const raw of (normalizedData || []) as NormalizedEvidenceRow[]) {
        const rows = evidenceByMemory.get(raw.memory_record_id) || [];
        rows.push(raw);
        evidenceByMemory.set(raw.memory_record_id, rows);
    }

    const conversationIds = new Set<string>();
    for (const result of results) {
        if (result.conversationId) conversationIds.add(result.conversationId);
        for (const ref of result.evidenceRefs) {
            if (ref.conversationId) conversationIds.add(ref.conversationId);
        }
        for (const evidence of evidenceByMemory.get(result.id) || []) {
            if (evidence.conversation_id) conversationIds.add(evidence.conversation_id);
        }
    }
    if (conversationIds.size === 0) return results;

    const conversationIdList = Array.from(conversationIds);
    const { data: liveConversations, error: conversationError } = await supabaseAdmin
        .from('conversations')
        .select('id')
        .in('id', conversationIdList)
        .is('deleted_at', null);
    if (conversationError) throw conversationError;

    const liveConversationIds = new Set((liveConversations || []).map((row: { id: string }) => row.id));
    let participantRows: Array<{ conversation_id: string }> = [];
    if (liveConversationIds.size > 0) {
        const { data, error: participantError } = await supabaseAdmin
            .from('conversation_participants')
            .select('conversation_id')
            .eq('user_id', ownerUserId)
            .in('conversation_id', Array.from(liveConversationIds));
        if (participantError) throw participantError;
        participantRows = data || [];
    }

    const authorizedConversationIds = new Set((participantRows || []).map((row: { conversation_id: string }) => row.conversation_id));
    const beforeCount = results.length;
    const filtered = results.flatMap((result) => {
        // The direct source conversation remains a hard boundary for the
        // memory row itself. Secondary evidence is narrowed below, so an
        // unrelated revoked citation cannot poison an otherwise authorized
        // memory when another valid source remains.
        if (result.conversationId && !authorizedConversationIds.has(result.conversationId)) return [];

        const normalizedEvidence = evidenceByMemory.get(result.id);
        if (!normalizedAvailable || !normalizedEvidence) {
            const visibleCachedEvidence = result.evidenceRefs.filter(
                (ref) => !ref.conversationId || authorizedConversationIds.has(ref.conversationId),
            );
            if (result.evidenceRefs.length > 0 && visibleCachedEvidence.length === 0) return [];
            return [{ ...result, evidenceRefs: visibleCachedEvidence }];
        }

        const visibleEvidence = normalizedEvidence
            .filter((evidence) => !evidence.conversation_id || authorizedConversationIds.has(evidence.conversation_id))
            .map(mapEvidenceRowToRef);
        if (normalizedEvidence.length > 0 && visibleEvidence.length === 0) return [];
        return [{ ...result, evidenceRefs: visibleEvidence }];
    });

    if (filtered.length !== beforeCount) {
        traceMemory(traceId, 'evidence_authorization_suppressed_at_read', {
            suppressedCount: beforeCount - filtered.length,
        });
    }
    return filtered;
}

// candidate/invalidated/deleted NUNCA son devueltos al Agent -- 'candidate'
// significa "todavía no es verdad validada" (ej. identidad sin resolver),
// 'invalidated'/'deleted' significa "ya no hay evidencia verificable" (ver
// memory.service.ts#invalidateMemoryForDeletedSource). Sólo 'active'
// (freshness='current') y 'superseded' (freshness='historical'/'any') son
// verdad memorizada legítima.
function statusesForFreshness(freshness: MemoryFreshness): MemoryStatus[] {
    if (freshness === 'current') return ['active'];
    if (freshness === 'historical') return ['superseded'];
    return ['active', 'superseded'];
}

// ─── Implementación real de hoy: Postgres (FTS léxico + índices reales) ────
export class PostgresMemorySearchProvider implements MemorySearchProvider {
    readonly providerName = 'postgres-fts';

    async search(plan: MemoryQueryPlan, traceId?: string): Promise<RetrievalMemory[]> {
        const textQuery = plan.topicQuery?.trim();
        let data: any[] | null = null;
        let error: { message?: string; code?: string } | null = null;
        for (let attempt = 1; attempt <= MEMORY_READ_MAX_ATTEMPTS; attempt += 1) {
            let query = supabaseAdmin
                .from('memory_records')
                .select('*')
                .eq('owner_user_id', plan.ownerUserId)
                .in('status', statusesForFreshness(plan.freshness));

            if (plan.subjectPersonId) query = query.eq('subject_person_id', plan.subjectPersonId);
            if (plan.subjectContactId) query = query.eq('subject_contact_id', plan.subjectContactId);
            if (plan.memoryTypes && plan.memoryTypes.length > 0) query = query.in('memory_type', plan.memoryTypes);
            if (plan.sourceTypes && plan.sourceTypes.length > 0) query = query.in('source_type', plan.sourceTypes);
            if (plan.timeRange?.from) query = query.gte('observed_at', plan.timeRange.from);
            if (plan.timeRange?.to) query = query.lte('observed_at', plan.timeRange.to);
            if (textQuery) query = query.textSearch('search_tsv', textQuery, { type: 'websearch', config: FTS_CONFIG });

            // Empate estable por id, mismo patrón que retrieval.service.ts --
            // nunca se depende únicamente de la estabilidad implícita del
            // ordenamiento SQL.
            query = query.order('observed_at', { ascending: false }).order('id', { ascending: true }).limit(plan.limit);

            const response = await query;
            data = response.data;
            error = response.error;
            if (!error || !isTransientMemoryReadError(error) || attempt === MEMORY_READ_MAX_ATTEMPTS) break;
            await waitForMemoryReadRetry(attempt);
        }
        if (error) throw error;

        const nowMs = Date.now();
        let results = (data || []).map((row) => mapRowToRetrievalMemory(row as Record<string, unknown>, nowMs));

        // Defense in depth: validate the primary conversation and every
        // normalized secondary evidence reference in one batched read.
        results = await filterByEvidenceAuthorization(results, plan.ownerUserId, traceId);

        // Ranking dependiente de la consulta (sección 22 del cierre
        // absoluto), no un genérico "más reciente primero" incondicional:
        //   - vigente (isCurrent) siempre antes que histórico -- satisface
        //     'fact_lookup'/'current' (la validez manda) y no rompe
        //     'history' (ahí TODO es igualmente no-vigente, cae al siguiente
        //     criterio).
        //   - a igualdad de vigencia, mayor confidence primero -- proxy real
        //     de "evidencia más fuerte" para 'provenance' (deterministic=1.0
        //     siempre gana sobre llm<=0.9) sin necesitar contar refs.
        //   - a igualdad de ambas, más reciente primero -- orden temporal
        //     correcto para 'history'/'summary'.
        // Límite honesto: esto NO es un score de relevancia léxica (ts_rank)
        // sobre `topicQuery` -- Postgres FTS ya FILTRA por relevancia vía
        // `@@` (websearch_to_tsquery), pero no pondera el GRADO de
        // coincidencia entre múltiples resultados. Con el volumen típico de
        // una consulta de memoria (acotado por `plan.limit`) esto es
        // suficiente; documentado como decisión final de esta entrega, no
        // como trabajo pendiente.
        results = [...results].sort((a, b) => {
            if (a.isCurrent !== b.isCurrent) return a.isCurrent ? -1 : 1;
            if (a.confidence !== b.confidence) return b.confidence - a.confidence;
            return new Date(b.observedAt).getTime() - new Date(a.observedAt).getTime();
        });

        traceMemory(traceId, 'retrieved', {
            candidateCount: results.length,
            freshness: plan.freshness,
            memoryTypes: plan.memoryTypes,
            hasTopicQuery: Boolean(textQuery),
            hasSubjectPerson: Boolean(plan.subjectPersonId),
        });
        return results;
    }
}

// Instancia por defecto usada por memory.service.ts#retrieveMemory. Un
// futuro `HybridMemorySearchProvider` (semantic + lexical) implementa la
// MISMA interfaz `MemorySearchProvider` y se sustituye aquí -- Core
// (agentContextBuilder.service.ts, retrieveMemory) no cambia.
export const defaultMemorySearchProvider: MemorySearchProvider = new PostgresMemorySearchProvider();
