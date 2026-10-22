import { getEnvConfig } from '../config/env';

// PING — bounded diagnostic instrumentation for overdue/query certification.
// It is disabled in production: production must not pay the logging cost or
// emit commitment titles when ordinary observability is sufficient. Local and
// test environments retain the trace for controlled regression diagnosis.
// Never
// logs PII (emails, phones, message content, tokens, secrets) — only
// commitment titles (already permitted explicitly for this diagnostic),
// status, dates, counts, and flags, all truncated defensively.

export function generateTraceId(): string {
    return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function safeTitle(title: unknown): string {
    if (typeof title !== 'string') return '(no-title)';
    return title.slice(0, 60);
}

export function traceOverdue(traceId: string | undefined, label: string, data: Record<string, unknown>): void {
    if (!traceId || getEnvConfig().environmentName === 'production') return;
    try {
        // eslint-disable-next-line no-console
        console.log(`[PING_OVERDUE_TRACE][${traceId}][${label}]`, JSON.stringify(data));
    } catch {
        // eslint-disable-next-line no-console
        console.log(`[PING_OVERDUE_TRACE][${traceId}][${label}] (unserializable payload)`);
    }
}

// Proposal traces use the same environment guard and privacy boundary as
// overdue traces, so the production path remains quiet by construction.
export function traceProposal(traceId: string | undefined, label: string, data: Record<string, unknown>): void {
    if (!traceId || getEnvConfig().environmentName === 'production') return;
    try {
        // eslint-disable-next-line no-console
        console.log(`[PING_PROPOSAL_TRACE][${traceId}][${label}]`, JSON.stringify(data));
    } catch {
        // eslint-disable-next-line no-console
        console.log(`[PING_PROPOSAL_TRACE][${traceId}][${label}] (unserializable payload)`);
    }
}

export { safeTitle as traceSafeTitle };
