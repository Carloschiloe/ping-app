// M-2 — [PING_MEMORY_TRACE] observability. A diferencia de
// utils/overdueTrace.ts (marcado temporal, a borrar tras certificación de
// staging), este archivo es PERMANENTE: la memoria canónica necesita poder
// explicar, para siempre, por qué decidió lo que decidió.
//
// Garantía de privacidad no negociable (sección "observabilidad" del
// ticket): NUNCA se pasa canonical_text, object_value, subjectUnresolvedHint,
// ni cualquier otro contenido potencialmente sensible del memory_record en
// `data` -- sólo ids, tipos, conteos y decisiones (candidateCount,
// memoryType, sourceType, conflictDecision, canonicalOverride,
// selectedMemoryIds). Todo call site vive en memory.service.ts.
export function traceMemory(traceId: string | undefined, label: string, data: Record<string, unknown>): void {
    if (!traceId) return;
    try {
        // eslint-disable-next-line no-console
        console.log(`[PING_MEMORY_TRACE][${traceId}][${label}]`, JSON.stringify(data));
    } catch {
        // eslint-disable-next-line no-console
        console.log(`[PING_MEMORY_TRACE][${traceId}][${label}] (unserializable payload)`);
    }
}
