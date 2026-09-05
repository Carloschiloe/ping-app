// PING — TEMPORARY diagnostic instrumentation for the real "Entrenar"
// overdue bug (staging trace ticket). Logs ONLY when the interpreted query
// is overdue-focused (wantsOverdueFocus=true), to minimize noise. Never
// logs PII (emails, phones, message content, tokens, secrets) — only
// commitment titles (already permitted explicitly for this diagnostic),
// status, dates, counts, and flags, all truncated defensively.
//
// THIS FILE IS TEMPORARY AND MUST BE REMOVED once the real staging trace
// has been captured and the root cause is confirmed from real log output.
// Revert by deleting this file and every `traceOverdue(...)` call site
// (all tagged with `// [PING_OVERDUE_TRACE]` at the call site).

export function generateTraceId(): string {
    return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function safeTitle(title: unknown): string {
    if (typeof title !== 'string') return '(no-title)';
    return title.slice(0, 60);
}

export function traceOverdue(traceId: string | undefined, label: string, data: Record<string, unknown>): void {
    if (!traceId) return;
    try {
        // eslint-disable-next-line no-console
        console.log(`[PING_OVERDUE_TRACE][${traceId}][${label}]`, JSON.stringify(data));
    } catch {
        // eslint-disable-next-line no-console
        console.log(`[PING_OVERDUE_TRACE][${traceId}][${label}] (unserializable payload)`);
    }
}

export { safeTitle as traceSafeTitle };
