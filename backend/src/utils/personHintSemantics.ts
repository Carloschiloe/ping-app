/**
 * A person hint is only valid when the candidate is not the same lexical
 * span already owned by the temporal parser. Speech-to-text providers may
 * capitalize the first word of a recognized date expression (for example
 * "para Mañana"), and a capitalized temporal word must never become a
 * contact lookup.
 *
 * The temporal parser remains the authority here: this helper does not carry
 * a second date vocabulary or try to infer dates on its own. It only checks
 * whether a candidate is contained as a complete token in the already
 * recognized temporal expression.
 */
export function isTemporalPersonHintCandidate(candidate: string, temporalExpression: string | null | undefined): boolean {
    const normalizedCandidate = candidate.trim().normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('es');
    const normalizedTemporal = temporalExpression?.trim().normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('es') ?? '';
    if (!normalizedCandidate || !normalizedTemporal) return false;

    const escapedCandidate = normalizedCandidate.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return new RegExp(`(?:^|[^\\p{L}\\p{N}_])${escapedCandidate}(?:$|[^\\p{L}\\p{N}_])`, 'u').test(normalizedTemporal);
}

export function filterTemporalPersonHints(hints: string[], temporalExpression: string | null | undefined): string[] {
    return hints.filter((hint) => !isTemporalPersonHintCandidate(hint, temporalExpression));
}
