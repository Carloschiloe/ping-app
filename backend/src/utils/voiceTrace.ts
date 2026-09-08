export function traceVoice(traceId: string | undefined, label: string, data: Record<string, unknown>): void {
    if (!traceId) return;
    try {
        console.log(`[PING_VOICE_TRACE][${traceId}][${label}]`, JSON.stringify(data));
    } catch {
        console.log(`[PING_VOICE_TRACE][${traceId}][${label}] (unserializable payload)`);
    }
}

export function traceContext(traceId: string | undefined, label: string, data: Record<string, unknown>): void {
    if (!traceId) return;
    try {
        console.log(`[PING_CONTEXT_TRACE][${traceId}][${label}]`, JSON.stringify(data));
    } catch {
        console.log(`[PING_CONTEXT_TRACE][${traceId}][${label}] (unserializable payload)`);
    }
}
