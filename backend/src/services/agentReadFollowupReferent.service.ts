// M-7: bounded read referents. A previous answer is never a source of truth:
// callers must re-query authorized canonical data using the resolved title.
// This module does not bypass the Core's authorization or synthesize an answer.
export interface ReadReferentEvidence {
    id: string;
    title: string;
}

interface StoredReferent extends ReadReferentEvidence {
    expiresAt: number;
}

const TTL_MS = 2 * 60 * 1000;
const MAX_ENTRIES = 500;
const referents = new Map<string, StoredReferent>();

function key(actorUserId: string, conversationId: string): string {
    return JSON.stringify([actorUserId, conversationId]);
}

function prune(now: number): void {
    for (const [scope, item] of referents) {
        if (item.expiresAt <= now) referents.delete(scope);
    }
    while (referents.size >= MAX_ENTRIES) {
        const oldest = referents.keys().next().value;
        if (oldest === undefined) break;
        referents.delete(oldest);
    }
}

export function clearReadFollowupReferentsForTests(): void {
    referents.clear();
}

export function forgetReadFollowupReferent(actorUserId: string, conversationId?: string): void {
    if (conversationId) referents.delete(key(actorUserId, conversationId));
}

/** Record only after the Core answered from exactly one cited commitment.
 * Never persist a date, prior response text, or a user-supplied guess.
 */
export function rememberVerifiedReadReferent(input: {
    actorUserId: string;
    conversationId?: string;
    status: string;
    commitments: ReadReferentEvidence[];
    citations: Array<{ sourceType: string; sourceId: string }>;
    now?: number;
}): void {
    const { actorUserId, conversationId, status, commitments, citations } = input;
    if (!conversationId) return; // No conversation scope: no cross-surface carryover.
    const scope = key(actorUserId, conversationId);
    referents.delete(scope);
    if (status !== 'answered' || commitments.length !== 1 || citations.length !== 1) return;
    const commitment = commitments[0];
    const citation = citations[0];
    if (!commitment.id || !commitment.title.trim()
        || citation.sourceType !== 'commitment' || citation.sourceId !== commitment.id) return;
    const now = input.now ?? Date.now();
    prune(now);
    referents.set(scope, { id: commitment.id, title: commitment.title, expiresAt: now + TTL_MS });
}

/** Resolve only a narrow, unambiguous continuation. The caller MUST still
 * run its ordinary authorization-filtered canonical retrieval and synthesis.
 */
export function resolveVerifiedReadFollowup(input: {
    actorUserId: string;
    conversationId?: string;
    utterance: string;
    now?: number;
}): { query: string; sourceId: string } | null {
    const { actorUserId, conversationId, utterance } = input;
    if (!conversationId) return null;
    const scope = key(actorUserId, conversationId);
    const now = input.now ?? Date.now();
    const stored = referents.get(scope);
    if (!stored) return null;
    if (stored.expiresAt <= now) {
        referents.delete(scope);
        return null;
    }
    const normalized = utterance.trim().normalize('NFC');
    // Explicitly avoid carrying context across unrelated instructions,
    // ambiguous plural references, or anything that could be a write action.
    const completionFollowup = /^(?:¿\s*)?(?:(?:y|pero)\s+)?cu[aá]ndo\s+lo\s+(?:completamos|complet[eé]|completaste|terminamos|termin[eé]|terminaste)(?:\s*\?)?$/iu.test(normalized);
    if (!completionFollowup) {
        referents.delete(scope);
        return null;
    }
    return { query: `${normalized} ${stored.title}`, sourceId: stored.id };
}
