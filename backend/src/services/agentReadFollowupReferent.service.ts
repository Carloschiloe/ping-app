// M-7: bounded read referents. A previous answer is never a source of truth:
// callers must re-query authorized canonical data using the resolved title.
// This module does not bypass the Core's authorization or synthesize an answer.
//
// GENERALIZATION (supersedes the original single-sentence regex): eligibility
// is now a STRUCTURAL judgment -- "does this turn ask a lifecycle-historical
// question without itself naming an entity?" -- composed entirely from
// existing, canonical, already-tested signals, never a new hand-written verb
// list of its own:
//   1. isHistoricalLifecycleQuery(utterance) -- the SAME "cuándo + verbo de
//      lifecycle" signal agentContextBuilder.service.ts already uses for
//      cardinality/scope. Covers all 8 closed-status verbs plus reassign/
//      accept/confirm/approve, not one hardcoded verb.
//   2. DeterministicInputInterpreter().interpret(utterance) run for its
//      structural signals only (never its own status/intent as a final
//      answer): textQuery === null && personHints.length === 0 means the
//      sentence carried no entity name of its own -- exactly the elliptical
//      "lo"/"la"/implicit-object shape ("cuándo LO completamos") this module
//      exists to resolve, and stays false for any turn that DOES name an
//      entity ("cuándo completamos Ver Spiderman"), which the ordinary
//      pipeline already resolves without help.
//   3. !isWriteActionRequest -- the SAME write-shaped-utterance guard the
//      turn router itself uses, so a write-shaped follow-up ("Completa Ver
//      Spiderman") never silently borrows a read referent.
// Adding a ninth lifecycle verb, a new phrasing, or a language variant to
// isHistoricalLifecycleQuery/DeterministicInputInterpreter automatically
// extends this module -- no edit needed here.
import { DeterministicInputInterpreter } from './agentInputInterpreter.service';
import { isHistoricalLifecycleQuery } from './agentInputInterpreter.service';

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

const deterministicInterpreter = new DeterministicInputInterpreter();

// A leading connector ("Y"/"Pero"/"And"/"But") that opens a spoken-style
// follow-up is not itself topical content -- extractTextQuery's own
// STOPWORDS set does not strip it (it was never designed to see a bare
// connector survive alone; every other caller either has real content
// alongside it or the connector never becomes the ENTIRE residual query),
// so "¿Y cuándo lo completamos?" can otherwise leave textQuery:"Y" instead
// of null. Never widened beyond a short, closed, non-lexical-content
// connector set to preserve this module's own single-owner boundary on
// entity-naming detection (STOPWORDS itself is not exported and is not
// duplicated here) -- this only recognizes when the ENTIRE textQuery IS
// one of these connectors, never strips them from a query with real content.
const BARE_LEADING_CONNECTOR = /^(?:y|pero|and|but)$/iu;
function namesNoEntityOfItsOwn(textQuery: string | null, personHints: string[]): boolean {
    if (personHints.length > 0) return false;
    if (textQuery === null) return true;
    return BARE_LEADING_CONNECTOR.test(textQuery.trim());
}

/** Structural eligibility check, isolated for direct unit testing independent
 * of the referent store above. Never itself a source of truth about WHICH
 * entity is meant -- only "does this turn's shape call for the stored one."
 */
export async function isEligibleReadFollowup(utterance: string): Promise<boolean> {
    const normalized = utterance.trim();
    if (!normalized) return false;
    if (!isHistoricalLifecycleQuery(normalized)) return false;
    const interpretation = await deterministicInterpreter.interpret(normalized);
    if (interpretation.isWriteActionRequest) return false;
    // No entity of its own named in this turn -- a null/connector-only
    // textQuery and no personHints means the sentence is structurally
    // elliptical ("cuándo lo completamos"), not a fresh, already-resolvable,
    // named-entity question.
    return namesNoEntityOfItsOwn(interpretation.textQuery, interpretation.personHints);
}

/** Resolve only a narrow, unambiguous continuation. The caller MUST still
 * run its ordinary authorization-filtered canonical retrieval and synthesis.
 */
export async function resolveVerifiedReadFollowup(input: {
    actorUserId: string;
    conversationId?: string;
    utterance: string;
    now?: number;
}): Promise<{ query: string; sourceId: string } | null> {
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
    // Explicitly avoid carrying context across unrelated instructions,
    // ambiguous plural references, or anything that could be a write action.
    if (!(await isEligibleReadFollowup(utterance))) {
        referents.delete(scope);
        return null;
    }
    const normalized = utterance.trim().normalize('NFC');
    return { query: `${normalized} ${stored.title}`, sourceId: stored.id };
}
