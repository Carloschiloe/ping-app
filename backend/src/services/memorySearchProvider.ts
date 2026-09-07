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

        const textQuery = plan.topicQuery?.trim();
        if (textQuery) query = query.textSearch('search_tsv', textQuery, { type: 'websearch', config: FTS_CONFIG });

        // Empate estable por id, mismo patrón que retrieval.service.ts --
        // nunca se depende únicamente de la estabilidad implícita del
        // ordenamiento SQL.
        query = query.order('observed_at', { ascending: false }).order('id', { ascending: true }).limit(plan.limit);

        const { data, error } = await query;
        if (error) throw error;

        const nowMs = Date.now();
        let results = (data || []).map((row) => mapRowToRetrievalMemory(row as Record<string, unknown>, nowMs));

        // M-2 ABSOLUTE FINAL (Blocker B, sección 7, "defense-in-depth read
        // contract") — verificación EN TIEMPO DE LECTURA, en lote (nunca
        // N+1): una memoria owner-autorizada no basta si la conversación de
        // la que proviene su evidencia ya no es accesible para este owner
        // (ej. dejó de ser participante) SIN que ningún evento de
        // borrado/limpieza haya corrido todavía. Cierra el caso decisivo del
        // ticket: "sin escritura adicional de memoria, la consulta
        // inmediatamente después de perder autorización no debe exponer el
        // hecho." Una sola consulta batched sobre los conversation_id
        // DISTINTOS de este batch ya acotado por `plan.limit` -- nunca una
        // verificación por fila.
        const conversationIds = Array.from(new Set(results.map((r) => r.conversationId).filter((id): id is string => !!id)));
        if (conversationIds.length > 0) {
            const { data: authorizedRows, error: authErr } = await supabaseAdmin
                .from('conversation_participants')
                .select('conversation_id')
                .eq('user_id', plan.ownerUserId)
                .in('conversation_id', conversationIds);
            if (authErr) throw authErr;
            const authorizedConversationIds = new Set((authorizedRows || []).map((r: { conversation_id: string }) => r.conversation_id));
            const beforeCount = results.length;
            results = results.filter((r) => !r.conversationId || authorizedConversationIds.has(r.conversationId));
            if (results.length !== beforeCount) {
                traceMemory(traceId, 'evidence_authorization_suppressed_at_read', { suppressedCount: beforeCount - results.length });
            }
        }

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
