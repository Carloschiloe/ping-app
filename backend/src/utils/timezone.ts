// M-1H v3 — extraído de agentContextBuilder.service.ts (donde vivía inline,
// sin exportar) para que agentResponseSynthesizer.service.ts pueda calcular
// "mismo día calendario" con la MISMA aritmética exacta -- antes de esta
// extracción, un segundo lugar habría tenido que reimplementar el cálculo de
// offset/medianoche-en-zona a mano, con riesgo real de divergencia sutil en
// un borde de día (ver docs, "Canonical Overdue Semantics", sección
// timezone). Ping es global: el default es siempre UTC, nunca una zona
// regional específica.

// Se valida con Intl.DateTimeFormat (mismo mecanismo que ya usa
// date-parser.service.ts, reescrito aquí en vez de importado para no
// heredar su default regional 'America/Santiago', que contradice el
// principio global de M-1D).
export function resolveAgentTimezone(timezone?: string): string {
    const candidate = timezone?.trim();
    if (!candidate) return 'UTC';
    try {
        new Intl.DateTimeFormat('en-US', { timeZone: candidate }).format(0);
        return candidate;
    } catch {
        return 'UTC';
    }
}

export function timeZoneOffsetMs(date: Date, timeZone: string): number {
    const dtf = new Intl.DateTimeFormat('en-US', {
        timeZone, hourCycle: 'h23',
        year: 'numeric', month: '2-digit', day: '2-digit',
        hour: '2-digit', minute: '2-digit', second: '2-digit',
    });
    const parts = Object.fromEntries(dtf.formatToParts(date).map((p) => [p.type, p.value]));
    const asUtc = Date.UTC(+parts.year, +parts.month - 1, +parts.day, +parts.hour, +parts.minute, +parts.second);
    return asUtc - date.getTime();
}

export function startOfDayInZone(date: Date, timeZone: string): Date {
    const offsetMs = timeZoneOffsetMs(date, timeZone);
    const local = new Date(date.getTime() + offsetMs);
    const localMidnightUtcMs = Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate(), 0, 0, 0);
    return new Date(localMidnightUtcMs - offsetMs);
}

// M-1H v3 — la pieza que faltaba para el criterio canónico de overdue: "es
// el mismo día calendario" comparado en la zona del ACTOR, nunca en la del
// servidor (Render corre en UTC/una zona fija -- new Date() local del
// servidor NUNCA debe decidir esto, ver "Canonical Overdue Semantics",
// sección 4).
export function isSameCalendarDay(a: Date, b: Date, timeZone: string): boolean {
    return startOfDayInZone(a, timeZone).getTime() === startOfDayInZone(b, timeZone).getTime();
}
