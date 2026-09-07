// M-4 — [PING_EXECUTION_TRACE] / [PING_AUTH_TRACE]. PERMANENT (same
// rationale as memoryTrace.ts/planTrace.ts — a write-capable pipeline needs
// to be able to explain, for as long as it exists, why it did or didn't
// execute something). Same no-op-when-untraced/try-catch shape as every
// other Ping trace utility (sección 59/60 del ticket): only ids, counts,
// booleans, enum labels — never message bodies, never sensitive memory
// values, never secrets.
export function traceExecution(traceId: string | undefined, label: string, data: Record<string, unknown>): void {
    if (!traceId) return;
    try {
        console.log(`[PING_EXECUTION_TRACE][${traceId}][${label}]`, JSON.stringify(data));
    } catch {
        console.log(`[PING_EXECUTION_TRACE][${traceId}][${label}] (unserializable payload)`);
    }
}

export function traceAuth(traceId: string | undefined, label: string, data: Record<string, unknown>): void {
    if (!traceId) return;
    try {
        console.log(`[PING_AUTH_TRACE][${traceId}][${label}]`, JSON.stringify(data));
    } catch {
        console.log(`[PING_AUTH_TRACE][${traceId}][${label}] (unserializable payload)`);
    }
}
