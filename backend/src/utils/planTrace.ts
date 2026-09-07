// M-3 — [PING_PLAN_TRACE]. PERMANENT (same rationale as memoryTrace.ts, not
// TEMPORARY like overdueTrace.ts/proposalTrace.ts): a planning layer that
// will eventually authorize real writes (M-4) needs to be able to explain,
// for as long as it exists, why it built the plan it built. Same shape as
// traceMemory/traceOverdue/traceProposal (utils/memoryTrace.ts,
// utils/overdueTrace.ts) — no-op when traceId is undefined, wrapped in
// try/catch, never logs message bodies/sensitive memory values/secrets,
// only ids/counts/booleans/enum labels (sección 40 del ticket).
export function tracePlan(traceId: string | undefined, label: string, data: Record<string, unknown>): void {
    if (!traceId) return;
    try {
        console.log(`[PING_PLAN_TRACE][${traceId}][${label}]`, JSON.stringify(data));
    } catch {
        console.log(`[PING_PLAN_TRACE][${traceId}][${label}] (unserializable payload)`);
    }
}
