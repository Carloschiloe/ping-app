// M-7B — Multi-turn slot continuation (first live dialogue-state wiring).
// See tmp/PING-M7-DIALOGUE-STATE-ADR.md Q10 ("hybrid insertion, structured
// not textual") and Q13 (plan/authorization safety) for the architecture
// this implements.
//
// SCOPE: this module owns exactly one decision -- given an open dialogue
// objective and a freshly-interpreted new-turn objective (produced by the
// EXISTING, UNCHANGED objective interpreter), decide whether the new turn
// is a continuation of the open objective and, if so, produce a Core-owned
// reconciled objective candidate. It never calls an LLM, never resolves
// entities, never talks to the planner/authorization/execution layers
// directly -- the caller (agentTurn.service.ts) still runs the reconciled
// objective through the EXACT SAME runAgentPlanning/authorization/
// execution pipeline as any other objective. There is exactly one trusted
// write architecture; this module only decides what objective enters it.
//
// Currently enabled ONLY for create_commitment (create_personal_commitment
// / create_commitment_or_proposal) continuation, per the task's explicit
// bounded-rollout instruction -- see isContinuationEligibleObjectiveType.
import type { AgentDialogueState } from '../types/agentDialogueState';
import type { AgentObjective, AgentObjectiveType } from '../types/agentPlan';
import { resolvePerson } from './retrieval.service';
import { DeterministicInputInterpreter } from './agentInputInterpreter.service';
import type { RetrievalPerson } from '../types/retrieval';

// PING — M-7B: only these two objective types are in scope for continuation
// in this phase (both share planCreateCommitment's exact missing-slot
// contract: title from entityHints[0], date from sourceUtterance via
// parseDateFromText). Extending this set to other objective types is
// explicitly a later, separate task -- never silently widened here.
const CONTINUATION_ELIGIBLE_OBJECTIVE_TYPES: ReadonlySet<AgentObjectiveType> = new Set([
    'create_personal_commitment',
    'create_commitment_or_proposal',
]);

export function isContinuationEligibleObjectiveType(objectiveType: AgentObjectiveType): boolean {
    return CONTINUATION_ELIGIBLE_OBJECTIVE_TYPES.has(objectiveType);
}

export interface ContinuationClassification {
    // true only when Core has validated (not merely the LLM proposing) that
    // the new turn should be merged into the open dialogue objective.
    isContinuation: boolean;
    reason: string;
}

// ADR Q13 (Core-side merge, not LLM-side merge) + task Q3 ("LLM may
// propose continuation=true/false but Core must validate whether an open
// objective actually exists"). This function is the sole place that
// decision is made -- it never trusts a claim, it only ever looks at
// STRUCTURAL facts already independently derived: does an open dialogue
// objective exist, is its type in-scope for continuation, and does the
// newly-interpreted turn look like either (a) a genuine fragment (no
// explicit new entity/person of its own) or (b) an objective of the SAME
// type carrying no conflicting new target -- never a different
// objectiveType, which is always treated as a new/unrelated request.
export function classifyContinuation(
    dialogueState: AgentDialogueState | null,
    newTurnObjective: AgentObjective,
): ContinuationClassification {
    if (!dialogueState || !dialogueState.openObjective) {
        return { isContinuation: false, reason: 'no_open_dialogue_objective' };
    }
    if (dialogueState.lifecycle !== 'collecting' && dialogueState.lifecycle !== 'clarifying') {
        return { isContinuation: false, reason: 'dialogue_not_awaiting_continuation' };
    }
    const openType = dialogueState.openObjective.objectiveType;
    if (!isContinuationEligibleObjectiveType(openType)) {
        return { isContinuation: false, reason: 'open_objective_type_not_eligible' };
    }

    // A genuinely new, different-type request (e.g. the open objective is
    // create_personal_commitment but the new turn resolves to
    // respond_to_existing_proposal) is NEVER a continuation, regardless of
    // any LLM-side continuation claim -- the objective type mismatch alone
    // is structural proof of a different request.
    if (newTurnObjective.objectiveType !== openType) {
        return { isContinuation: false, reason: 'new_turn_different_objective_type' };
    }

    // A same-type new turn that itself names an explicit new entity/title
    // (via an explicit-title marker already surfaced by the interpreter,
    // i.e. entityHints[0] present AND the new turn also carries its own
    // person/time signal beyond a bare fragment) is treated as a genuinely
    // new request of the same type, never force-merged into the old one --
    // e.g. "Recuérdame comprar pan mañana" arriving while "llamar a Pedro"
    // is still open must not silently overwrite Pedro's reminder.
    const newTurnHasOwnEntity = newTurnObjective.targetEntities.entityHints.length > 0
        && newTurnObjective.targetEntities.entityHints[0] !== dialogueState.openObjective.targetEntities.entityHints[0];
    if (newTurnHasOwnEntity) {
        return { isContinuation: false, reason: 'new_turn_names_its_own_entity' };
    }

    return { isContinuation: true, reason: 'same_type_fragment_continuation' };
}

export interface ReconciledObjectiveResult {
    objective: AgentObjective;
    // Which previously-missing field this turn is believed to have filled,
    // for dialogue-state bookkeeping only (never used for planning itself
    // -- the planner re-derives everything from the reconciled objective's
    // own fields, exactly as it would for a single-turn request).
    filledField: 'title' | 'time' | 'none';
}

// ADR Q1/§3.2 -- the reconciled objective's fields are drawn ONLY from the
// two turns' own already-extracted structured fields (never raw
// string-mashing of what the user sees): entityHints/personHints carry
// forward from whichever turn has them; sourceUtterance is Core-constructed
// SOLELY so date-parser.service.ts's existing parseDateFromText (which
// planCreateCommitment already calls unconditionally) can see both the
// date-bearing and time-bearing text in one string, exactly as it already
// does for a real single-turn utterance like "mañana a las 9" -- this is
// not a new capability, it is Core presenting two turns' worth of already-
// extracted content to the SAME existing deterministic date parser. This
// never touches raw `content`/routing text anywhere else in the pipeline.
export function reconcileContinuationObjective(
    priorObjective: AgentObjective,
    newTurnObjective: AgentObjective,
): ReconciledObjectiveResult {
    const entityHints = priorObjective.targetEntities.entityHints.length > 0
        ? priorObjective.targetEntities.entityHints
        : newTurnObjective.targetEntities.entityHints;
    const personHints = priorObjective.targetEntities.personHints.length > 0
        ? priorObjective.targetEntities.personHints
        : newTurnObjective.targetEntities.personHints;

    // The new turn's own timeConstraints.rawHint (LLM-extracted semantic
    // time phrase) or, failing that, its raw sourceUtterance fragment, is
    // the candidate new time-bearing text. If the new turn supplies
    // nothing usable, the objective is unchanged (no field filled) and the
    // caller will simply re-ask the same clarification.
    const newTimeText = newTurnObjective.timeConstraints.rawHint ?? newTurnObjective.sourceUtterance.trim();
    const priorHadNoDate = !priorObjective.timeConstraints.rawHint && !hasExplicitDateWord(priorObjective.sourceUtterance);
    const filledField: ReconciledObjectiveResult['filledField'] = priorHadNoDate && newTimeText.length > 0 ? 'time' : 'none';

    const reconciledSourceUtterance = filledField === 'time'
        ? `${priorObjective.sourceUtterance.trim()} ${newTimeText}`.trim()
        : priorObjective.sourceUtterance;

    const reconciled: AgentObjective = {
        ...priorObjective,
        targetEntities: { entityHints, personHints },
        timeConstraints: { rawHint: priorObjective.timeConstraints.rawHint ?? newTurnObjective.timeConstraints.rawHint },
        sourceUtterance: reconciledSourceUtterance,
        // Ambiguities are always re-derived fresh by the planner from the
        // reconciled objective -- never carried forward stale.
        ambiguities: [],
        confidence: Math.max(priorObjective.confidence, newTurnObjective.confidence),
    };

    return { objective: reconciled, filledField };
}

// Mirrors the same closed, small day/weekday vocabulary
// agentObjectiveInterpreter.service.ts's own TIME_HINT_PATTERN already
// uses for this exact purpose -- reused here only to decide whether the
// PRIOR turn already had a date-bearing word (so this module never needs
// its own divergent date-word list).
const DATE_WORD_PATTERN = /\b(?:ma[ñn]ana|hoy|pasado ma[ñn]ana|lunes|martes|mi[ée]rcoles|jueves|viernes|s[áa]bado|domingo)\b/iu;
function hasExplicitDateWord(text: string): boolean {
    return DATE_WORD_PATTERN.test(text);
}

// ─────────────────────────────────────────────────────────────────────────
// PING — M-7B PHYSICAL FAILURE #2 FIX: "pending clarification answer"
// resolution. Distinct from classifyContinuation/reconcileContinuationObjective
// above (which merge a NEW, independently-interpreted objective into an open
// one -- e.g. "mañana a las 9" filling a missing date). This is a narrower,
// earlier question: does the new turn even get a chance to be treated as the
// ANSWER to a question Ping just asked, before ordinary isolated-turn read/
// write routing commits to something else? See tmp/PING-M7-DIALOGUE-STATE-ADR.md
// Q10 and the physical failure report for the full architecture rationale.
//
// Scope: only the 'person_ambiguous' pending-clarification field is handled
// here (the exact physical case). Extending this to other clarification
// fields (time_ambiguous, topic_too_broad, planner-derived fields like
// 'title'/'dueAt') is explicitly a later, separate task -- never silently
// widened here.
export function isPendingClarificationAnswerable(dialogueState: AgentDialogueState | null): boolean {
    return !!dialogueState
        && (dialogueState.lifecycle === 'clarifying' || dialogueState.lifecycle === 'collecting')
        && !!dialogueState.pendingClarification
        && dialogueState.pendingClarification.field === 'person_ambiguous'
        && !!dialogueState.openObjective;
}

// TASK 9 -- escape/new-objective detection. Reuses the EXISTING deterministic
// intent classifier (DeterministicInputInterpreter) -- never a new regex
// family for names, never phrase-specific matching. A raw answer is treated
// as a genuine escape (an explicit unrelated request) only when it already
// carries a STRONG existing signal of its own: a recognized write-action
// verb, or a deterministic intent more specific than the default
// low-confidence 'general_context' fallback (commitment_query, person_query,
// document_search, message_search, recall all require their own real
// keyword/phrase match to fire -- see classifyIntent). A bare name like
// "Pedro González" matches none of these deterministically, so it is treated
// as a clarification-answer CANDIDATE and handed to live person resolution;
// only that live resolution (never an LLM guess) decides what it means.
// A question mark (either convention, Spanish "¿...?" or plain "...?") is a
// universal, language-neutral PUNCTUATION signal -- never a name-specific or
// phrase-specific pattern -- that the utterance has interrogative structure
// of its own, which a bare clarification-answer name never has ("Pedro
// González" vs. "¿Qué tengo hoy?"). Combined with the existing deterministic
// intent classifier below (which alone under-catches day-scoped queries like
// "¿Qué tengo hoy?" that don't match COMMITMENT_KEYWORDS deterministically),
// this keeps escape detection fully deterministic and free of any extra LLM
// call, exactly mirroring how cheap/free the existing deterministic-first
// checks already are elsewhere in this codebase.
const QUESTION_MARK_PATTERN = /[?¿]/u;

async function looksLikeExplicitEscape(rawAnswer: string): Promise<boolean> {
    if (QUESTION_MARK_PATTERN.test(rawAnswer)) return true;
    const signals = await new DeterministicInputInterpreter().interpret(rawAnswer);
    if (signals.isWriteActionRequest) return true;
    return signals.intent !== 'general_context' && signals.intentConfidence > 0.3;
}

export type PendingClarificationAnswerOutcome =
    | { outcome: 'escaped' }
    | { outcome: 'zero_match' }
    | { outcome: 'multi_match'; candidates: RetrievalPerson[] }
    | { outcome: 'resolved'; reconciledObjective: AgentObjective; resolvedPerson: RetrievalPerson };

// TASK 5/6 -- the raw answer is NEVER trusted as canonical identity by
// itself (never "the LLM/user said Pedro González, so it must be person
// X"). It is only ever a CANDIDATE NAME, and the actual identity comes
// exclusively from the same live resolvePerson() every other Core path
// already uses -- zero matches asks again, more than one asks again
// (disambiguation), and only a unique match reconciles the open objective.
// Reconciliation touches only entityHints/sourceUtterance (structured
// AgentObjective fields, never brittle raw string concatenation of the full
// conversation) -- see TASK 6: create_personal_commitment's title is free
// text ("llamar a Pedro"), so completing it with the resolved display name
// is itself Core-owned text composition from a verified candidate, not a
// trust decision about identity.
export async function tryAnswerPendingClarification(
    dialogueState: AgentDialogueState,
    rawAnswer: string,
    actorUserId: string,
    conversationId: string | undefined,
): Promise<PendingClarificationAnswerOutcome> {
    const trimmedAnswer = rawAnswer.trim();
    if (!trimmedAnswer || await looksLikeExplicitEscape(trimmedAnswer)) {
        return { outcome: 'escaped' };
    }

    const resolution = await resolvePerson(actorUserId, { name: trimmedAnswer, conversationId });

    if (resolution.ambiguous || resolution.candidates.length > 1) {
        return { outcome: 'multi_match', candidates: resolution.candidates };
    }
    if (!resolution.resolved) {
        return { outcome: 'zero_match' };
    }

    const priorObjective = dialogueState.openObjective as AgentObjective;
    const priorTitle = priorObjective.targetEntities.entityHints[0] ?? '';
    // Completes the free-text title ("llamar a Pedro" -> "llamar a Pedro
    // González") only when the resolved display name genuinely extends the
    // ambiguous mention already present -- never a blind append that could
    // duplicate or corrupt an unrelated title.
    const resolvedName = resolution.resolved.displayName;
    const firstNameOfResolved = resolvedName.split(/\s+/)[0] ?? resolvedName;
    const titleAlreadyHasFullName = priorTitle.toLowerCase().includes(resolvedName.toLowerCase());
    const completedTitle = titleAlreadyHasFullName || !priorTitle
        ? (priorTitle || resolvedName)
        : priorTitle.replace(new RegExp(`\\b${escapeRegExp(firstNameOfResolved)}\\b`, 'iu'), resolvedName);

    const reconciledObjective: AgentObjective = {
        ...priorObjective,
        targetEntities: {
            entityHints: [completedTitle],
            personHints: priorObjective.targetEntities.personHints,
        },
        sourceUtterance: priorObjective.sourceUtterance.replace(
            new RegExp(`\\b${escapeRegExp(firstNameOfResolved)}\\b`, 'iu'),
            resolvedName,
        ),
        ambiguities: [],
    };

    return { outcome: 'resolved', reconciledObjective, resolvedPerson: resolution.resolved };
}

function escapeRegExp(text: string): string {
    return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
