// Estado efímero y acotado para una aclaración de lectura. No es memoria
// canónica ni autorización: sólo conserva candidatos que Core acaba de
// recuperar y mostrar al actor para que el siguiente turno pueda elegir uno.

export interface ReadClarificationCandidate {
    id: string;
    label: string;
}

interface PendingReadClarification {
    originalQuery: string;
    candidates: ReadClarificationCandidate[];
    expiresAt: number;
}

const TTL_MS = 2 * 60 * 1000;
const MAX_ENTRIES = 500;
const pending = new Map<string, PendingReadClarification>();

function scopeKey(actorUserId: string, conversationId?: string): string | null {
    return conversationId ? JSON.stringify([actorUserId, conversationId]) : null;
}

function normalize(value: string): string {
    return value
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLocaleLowerCase()
        .replace(/[^\p{L}\p{N}]+/gu, ' ')
        .trim();
}

function candidateTitle(label: string): string {
    // Las etiquetas las construye Core como "título (fecha)". El sufijo es
    // presentación, nunca una fuente de verdad, por eso sólo se elimina para
    // comparar la selección textual del usuario con el título recuperado.
    return label.replace(/\s+\([^)]*\)\s*$/u, '').trim();
}

function prune(now: number): void {
    for (const [key, value] of pending) {
        if (value.expiresAt <= now) pending.delete(key);
    }
    while (pending.size >= MAX_ENTRIES) {
        const oldest = pending.keys().next().value;
        if (oldest === undefined) break;
        pending.delete(oldest);
    }
}

export function clearReadClarificationsForTests(): void {
    pending.clear();
}

export function rememberReadClarification(input: {
    actorUserId: string;
    conversationId?: string;
    originalQuery: string;
    candidates: ReadClarificationCandidate[];
    now?: number;
}): void {
    const key = scopeKey(input.actorUserId, input.conversationId);
    if (!key || !input.originalQuery.trim() || input.candidates.length < 2) return;
    const now = input.now ?? Date.now();
    prune(now);
    pending.set(key, {
        originalQuery: input.originalQuery,
        candidates: input.candidates,
        expiresAt: now + TTL_MS,
    });
}

export function forgetReadClarification(actorUserId: string, conversationId?: string): void {
    const key = scopeKey(actorUserId, conversationId);
    if (key) pending.delete(key);
}

export type ReadClarificationResolution =
    | { kind: 'none' }
    | { kind: 'resolved'; query: string; sourceId: string }
    | { kind: 'unmatched' };

/**
 * Consumes only a selection that matches exactly one candidate Core already
 * showed. A non-match clears the pending state so an unrelated question does
 * not get trapped in the old clarification.
 */
export function resolveReadClarification(input: {
    actorUserId: string;
    conversationId?: string;
    answer: string;
    now?: number;
}): ReadClarificationResolution {
    const key = scopeKey(input.actorUserId, input.conversationId);
    if (!key) return { kind: 'none' };
    const now = input.now ?? Date.now();
    const state = pending.get(key);
    if (!state) return { kind: 'none' };
    if (state.expiresAt <= now) {
        pending.delete(key);
        return { kind: 'none' };
    }

    const answer = normalize(input.answer);
    if (!answer) return { kind: 'unmatched' };

    const matches = state.candidates.filter((candidate) => {
        const title = normalize(candidateTitle(candidate.label));
        const label = normalize(candidate.label);
        return answer === title || answer === label || answer.includes(title);
    });

    pending.delete(key);
    if (matches.length !== 1) return { kind: 'unmatched' };

    // The original query is retained only as an interpretation hint. The
    // selected ID is passed separately through the trusted Core boundary.
    return {
        kind: 'resolved',
        query: `${state.originalQuery.trim()} ${candidateTitle(matches[0].label)}`,
        sourceId: matches[0].id,
    };
}
