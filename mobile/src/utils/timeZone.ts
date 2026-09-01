export function normalizeDeviceTimeZone(candidate?: string | null): string {
    if (candidate) {
        try {
            new Intl.DateTimeFormat('en-US', { timeZone: candidate }).format(0);
            return candidate;
        } catch {
            // Fall through to the runtime zone.
        }
    }
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
}

export function getDeviceTimeZone(): string {
    return normalizeDeviceTimeZone(Intl.DateTimeFormat().resolvedOptions().timeZone);
}

export function formatSuggestionDueAt(
    dueAt: string,
    timeZone = getDeviceTimeZone(),
): string {
    const date = new Date(dueAt);
    if (Number.isNaN(date.getTime())) return '';
    return new Intl.DateTimeFormat('es-CL', {
        timeZone: normalizeDeviceTimeZone(timeZone),
        weekday: 'long',
        day: 'numeric',
        month: 'short',
        hour: '2-digit',
        minute: '2-digit',
        hourCycle: 'h23',
    }).format(date);
}
