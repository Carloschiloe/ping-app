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
// directly -- the caller (agentTurnCore.service.ts, the turn pipeline body;
// reached via the public agentTurn.service.ts entry point) still runs the
// reconciled objective through the EXACT SAME runAgentPlanning/authorization/
// execution pipeline as any other objective. There is exactly one trusted
// write architecture; this module only decides what objective enters it.
//
// Currently enabled ONLY for create_commitment (create_personal_commitment
// / create_commitment_or_proposal) continuation, per the task's explicit
// bounded-rollout instruction -- see isContinuationEligibleObjectiveType.
import type { AgentDialogueState } from '../types/agentDialogueState';
import type { AgentObjective, AgentObjectiveType } from '../types/agentPlan';
import { resolvePerson } from './retrieval.service';
import { resolveEntityHint } from './agentPlanner.service';
import { parseDateFromText } from './date-parser.service';
import { DeterministicInputInterpreter } from './agentInputInterpreter.service';
import { LlmObjectiveInterpreter, extractTimeHint, stripTrailingDateSpan } from './agentObjectiveInterpreter.service';
import type { RetrievalPerson, RetrievalCommitment } from '../types/retrieval';

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

// PING — M-7: targetEntity ambiguity only arises for objectives that target
// an EXISTING commitment/proposal (reschedule/complete/respond/cancel) --
// never create, which has no target to disambiguate. Kept separate from
// CONTINUATION_ELIGIBLE_OBJECTIVE_TYPES (create-only) rather than merged,
// since the two sets answer different questions (which objective types can
// be SLOT-FILLED across turns vs. which can have an ambiguous EXISTING
// target) and conflating them would silently widen one by editing the other.
//
// M-9 INTEGRATION FIX: cancel_existing_commitment was NOT added here when
// M-9 landed, even though agentPlanner.service.ts's own
// planRescheduleOrCompleteOrRespond (which cancel shares) already produces
// the exact same field:'targetEntity' ambiguity for it as for the other
// three types. Without this entry, "Cancela Entrenar" against two
// same-titled commitments correctly asked "¿Cuál compromiso?" but a
// follow-up like "el del jueves" was never recognized as answering that
// question -- it fell through to an isolated-turn read response instead,
// exactly the "assistant forgot what I just said" failure mode this whole
// mechanism exists to prevent. Found during a consolidation pass across all
// seven write tools (never assumed from the M-9 commit message), confirmed
// with a direct end-to-end reproduction before this fix.
const TARGET_ENTITY_ELIGIBLE_OBJECTIVE_TYPES: ReadonlySet<AgentObjectiveType> = new Set([
    'reschedule_existing_commitment',
    'complete_existing_commitment',
    'respond_to_existing_proposal',
    'cancel_existing_commitment',
]);

// PING — M-7: plan-date-correction only makes sense for objective types
// where a date is a real, meaningful field to replace -- creation (which
// already carries one) and reschedule (whose entire purpose is a date
// change). Kept as its own set, not merged into either set above, because
// it answers a THIRD distinct question (which types can have their date
// corrected AFTER a plan is already shown) -- complete/respond have no
// date field a correction could target, so they are deliberately absent.
const PLAN_DATE_CORRECTION_ELIGIBLE_OBJECTIVE_TYPES: ReadonlySet<AgentObjectiveType> = new Set([
    'create_personal_commitment',
    'create_commitment_or_proposal',
    'reschedule_existing_commitment',
]);

// GENERALIZATION (M-7): the single gate agentTurnCore.service.ts's write-turn
// bookkeeping uses to decide "is this objective type tracked by dialogue
// state AT ALL" (for any of the three mechanisms -- slot continuation,
// targetEntity clarification, or plan date correction). Originally that gate
// WAS isContinuationEligibleObjectiveType itself, which silently meant
// reschedule/complete/respond's planner-derived targetEntity ambiguities
// were never persisted, no matter how the answer-resolution side was built.
// This is the fix: the three ELIGIBLE sets above each answer "which
// mechanism," this answers "tracked by dialogue state at all" -- their
// union, never a fourth, divergently-maintained list.
export function isDialogueTrackedObjectiveType(objectiveType: AgentObjectiveType): boolean {
    return CONTINUATION_ELIGIBLE_OBJECTIVE_TYPES.has(objectiveType)
        || TARGET_ENTITY_ELIGIBLE_OBJECTIVE_TYPES.has(objectiveType)
        || PLAN_DATE_CORRECTION_ELIGIBLE_OBJECTIVE_TYPES.has(objectiveType);
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
// GENERALIZATION (M-7, second field): originally scoped to ONLY
// 'person_ambiguous' (the exact physical case). Extended to also cover
// 'targetEntity' -- the SAME structural shape (Core presents N real
// candidates, the user picks/names one, live resolution is the only source
// of truth) reused for "¿Cuál compromiso? [Entrenar] [Entrenar (jueves)]"
// answered by a follow-up naming or selecting one. Both fields share this
// module's one caller contract (PendingClarificationAnswerOutcome) so
// agentTurnCore.service.ts's single dialogue-first check handles either
// without a field-specific branch of its own. Extending this further (e.g.
// 'newDueAt'/'title', which need date-parsing/free-text reconciliation
// instead of candidate selection -- a materially different shape) remains
// explicitly a later, separate task -- never silently widened here.
const ANSWERABLE_CLARIFICATION_FIELDS: ReadonlySet<string> = new Set(['person_ambiguous', 'targetEntity']);

// Reuses TARGET_ENTITY_ELIGIBLE_OBJECTIVE_TYPES defined above (alongside
// isDialogueTrackedObjectiveType) -- never a second, divergent copy here.
export function isPendingClarificationAnswerable(dialogueState: AgentDialogueState | null): boolean {
    if (!dialogueState
        || (dialogueState.lifecycle !== 'clarifying' && dialogueState.lifecycle !== 'collecting')
        || !dialogueState.pendingClarification
        || !dialogueState.openObjective) {
        return false;
    }
    const field = dialogueState.pendingClarification.field;
    if (!ANSWERABLE_CLARIFICATION_FIELDS.has(field)) return false;
    if (field === 'targetEntity') {
        return TARGET_ENTITY_ELIGIBLE_OBJECTIVE_TYPES.has(dialogueState.openObjective.objectiveType);
    }
    return true;
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

async function classifyExplicitEscape(
    rawAnswer: string,
    actorUserId: string,
    conversationId: string | undefined,
): Promise<{ escaped: boolean; newObjective?: AgentObjective }> {
    if (QUESTION_MARK_PATTERN.test(rawAnswer)) return { escaped: true };
    const signals = await new DeterministicInputInterpreter().interpret(rawAnswer);
    if (signals.isWriteActionRequest || (signals.intent !== 'general_context' && signals.intentConfidence > 0.3)) {
        return { escaped: true };
    }

    // The deterministic input classifier intentionally does not own the full
    // natural-language vocabulary of create objectives. Reuse the existing
    // objective interpreter as a structural proposal, but accept it as an
    // escape only when it describes a complete eligible objective with its
    // own entity. A bare clarification answer such as a person's name has
    // no objective structure: its sole entity hint is the whole utterance.
    const candidate = await new LlmObjectiveInterpreter().interpret(rawAnswer, { actorUserId, conversationId });
    if (!candidate) return { escaped: false };
    const entityHint = candidate.targetEntities.entityHints[0]?.trim() ?? '';
    const completeNewObjective = isContinuationEligibleObjectiveType(candidate.objectiveType)
        && entityHint.length > 0
        && candidate.sourceUtterance.trim() !== entityHint;
    return completeNewObjective
        ? { escaped: true, newObjective: candidate }
        : { escaped: false };
}

export type PendingClarificationAnswerOutcome =
    | { outcome: 'escaped'; newObjective?: AgentObjective }
    | { outcome: 'zero_match' }
    | { outcome: 'multi_match'; candidates: RetrievalPerson[] }
    | { outcome: 'multi_match_entity'; candidates: RetrievalCommitment[] }
    | { outcome: 'resolved'; reconciledObjective: AgentObjective; resolvedPerson: RetrievalPerson }
    | { outcome: 'resolved_entity'; reconciledObjective: AgentObjective; resolvedEntity: RetrievalCommitment };

// GENERALIZATION (M-7): single dispatch point by pendingClarification.field,
// so agentTurnCore.service.ts's one dialogue-first check stays field-
// agnostic -- it calls this one function regardless of which answerable
// field is pending, exactly as before this generalization. Both branches
// share the identical safety contract: the raw answer is NEVER trusted as
// canonical identity/entity by itself, escape detection always runs first
// via the same classifyExplicitEscape, and the actual resolution always
// comes from live Core retrieval, never from parsing the answer text itself.
export async function tryAnswerPendingClarification(
    dialogueState: AgentDialogueState,
    rawAnswer: string,
    actorUserId: string,
    conversationId: string | undefined,
): Promise<PendingClarificationAnswerOutcome> {
    if (dialogueState.pendingClarification?.field === 'targetEntity') {
        return tryAnswerTargetEntityClarification(dialogueState, rawAnswer, actorUserId, conversationId);
    }
    return tryAnswerPersonAmbiguousClarification(dialogueState, rawAnswer, actorUserId, conversationId);
}

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
async function tryAnswerPersonAmbiguousClarification(
    dialogueState: AgentDialogueState,
    rawAnswer: string,
    actorUserId: string,
    conversationId: string | undefined,
): Promise<PendingClarificationAnswerOutcome> {
    const trimmedAnswer = rawAnswer.trim();
    if (!trimmedAnswer) {
        return { outcome: 'escaped' };
    }

    const escape = await classifyExplicitEscape(trimmedAnswer, actorUserId, conversationId);
    if (escape.escaped) return { outcome: 'escaped', newObjective: escape.newObjective };

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

// GENERALIZATION (M-7): same structural contract as
// tryAnswerPersonAmbiguousClarification (escape first, then live resolution
// is the only source of truth, zero/multi/one outcomes), applied to
// "¿Cuál compromiso? [Entrenar (jueves)] [Entrenar (viernes)]" instead of
// "¿Cuál Pedro?". Three ways a real answer narrows this, tried in order,
// ALL re-verified against a freshly re-derived candidate set -- never
// trusted from the answer text alone or from the stored option list's
// possibly-stale contents:
//   (a) the answer names one of the ALREADY-PRESENTED option labels
//       (dialogueState.pendingClarification.options) directly;
//   (b) the answer is itself a resolvable date/weekday phrase (e.g. "el del
//       jueves", "el viernes") -- reuses the SAME date-parser.service.ts
//       parseDateFromText every other date-bearing turn already goes
//       through, matched against each candidate's OWN dueAt (same-day, not
//       exact-instant, since a spoken "el jueves" never carries a time) --
//       never a second, divergent date grammar;
//   (c) fallback: treat the answer as additional narrowing TEXT and re-run
//       resolveEntityHint scoped to the answer alone (never concatenated
//       with the original hint, which would corrupt a real FTS query with
//       words like "el"/"del" that share no vocabulary with any real
//       title), intersected with the already-fetched candidate set so a
//       word that happens to match an unrelated commitment elsewhere can
//       never leak in.
async function tryAnswerTargetEntityClarification(
    dialogueState: AgentDialogueState,
    rawAnswer: string,
    actorUserId: string,
    conversationId: string | undefined,
): Promise<PendingClarificationAnswerOutcome> {
    const trimmedAnswer = rawAnswer.trim();
    if (!trimmedAnswer) {
        return { outcome: 'escaped' };
    }

    const escape = await classifyExplicitEscape(trimmedAnswer, actorUserId, conversationId);
    if (escape.escaped) return { outcome: 'escaped', newObjective: escape.newObjective };

    const priorObjective = dialogueState.openObjective as AgentObjective;
    const originalHint = priorObjective.targetEntities.entityHints[0] ?? '';
    const options = dialogueState.pendingClarification?.options ?? [];

    // Re-derive the candidate set fresh rather than trusting the stored
    // option list is still accurate, so a commitment archived/altered
    // between the question and the answer cannot silently be selected.
    const freshOriginalCandidates = originalHint ? await resolveEntityHint(actorUserId, originalHint) : [];

    // (a) Direct option-label match.
    const normalizedAnswer = trimmedAnswer.toLowerCase();
    const selectedOption = options.find((option) => option.label.toLowerCase().includes(normalizedAnswer)
        || normalizedAnswer.includes(option.label.toLowerCase()));
    let candidates = selectedOption
        ? freshOriginalCandidates.filter((candidate) => candidate.id === selectedOption.id)
        : [];

    // (b) Same-day dueAt match against a resolvable date/weekday phrase.
    if (candidates.length === 0) {
        const parsedDate = parseDateFromText(trimmedAnswer);
        if (parsedDate) {
            const targetDayKey = parsedDate.date.toISOString().slice(0, 10);
            candidates = freshOriginalCandidates.filter((candidate) =>
                candidate.dueAt && candidate.dueAt.slice(0, 10) === targetDayKey);
        }
    }

    // (c) Fallback: free-text narrowing, scoped to the answer alone and
    // intersected with the original candidate set (never a raw global
    // search on the answer text by itself).
    if (candidates.length === 0) {
        const textCandidates = await resolveEntityHint(actorUserId, trimmedAnswer);
        const textCandidateIds = new Set(textCandidates.map((c) => c.id));
        candidates = freshOriginalCandidates.filter((candidate) => textCandidateIds.has(candidate.id));
    }

    if (candidates.length > 1) {
        return { outcome: 'multi_match_entity', candidates };
    }
    if (candidates.length === 0) {
        return { outcome: 'zero_match' };
    }

    const resolvedEntity = candidates[0];
    // INTEGRATION FIX: entityHints only ever carries raw TEXT (see
    // AgentObjective's own shape comment -- "never an ID"), so re-emitting
    // just resolvedEntity.title here reproduces the exact same ambiguity the
    // planner already raised once (two live commitments still share that
    // title). Threading the resolved entity's OWN dueAt through
    // timeConstraints.rawHint lets planRescheduleOrCompleteOrRespond
    // re-derive the identical single match from LIVE data (same-day dueAt),
    // never by trusting this resolution directly -- Core still independently
    // re-verifies via resolveEntityHint + the date narrowing this enables.
    // Found during a deliberate cross-mechanism consolidation pass (M-7's
    // targetEntity answer path vs. M-9's cancel_commitment, which shares
    // planRescheduleOrCompleteOrRespond): confirmed end to end that, before
    // this fix, "Cancela Entrenar" -> "el del jueves" against two
    // same-titled commitments re-asked the SAME clarification question
    // instead of producing a plan, because the reconciled hint text alone
    // could never disambiguate them again.
    const reconciledObjective: AgentObjective = {
        ...priorObjective,
        targetEntities: {
            entityHints: [resolvedEntity.title],
            personHints: priorObjective.targetEntities.personHints,
        },
        timeConstraints: {
            rawHint: resolvedEntity.dueAt ?? priorObjective.timeConstraints.rawHint,
        },
        ambiguities: [],
    };

    return { outcome: 'resolved_entity', reconciledObjective, resolvedEntity };
}

function escapeRegExp(text: string): string {
    return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// ─────────────────────────────────────────────────────────────────────────
// GENERALIZATION (M-7), third mechanism: plan-shown, pre-authorization date
// correction (benchmark scenario 4: "mueve entrenar al viernes" -> [plan
// shown: "Mover Entrenar al viernes"] -> "mejor al sábado"). Distinct from
// both mechanisms above: neither an unresolved-slot continuation
// (classifyContinuation) nor an answer to a pending clarification
// (tryAnswerPendingClarification) -- this handles a bare follow-up arriving
// while dialogueState.lifecycle === 'plan_pending_authorization', i.e. a
// full AgentPlan already reached the user and is awaiting confirmation.
//
// Safety, grounded directly in the ADR's own Q13 finding (re-verified
// against current source before building this): NO bespoke plan/digest
// invalidation logic is needed here. AgentDialogueStateService.applyCorrection
// already clears currentPlanDigestRef and transitions
// plan_pending_authorization -> collecting the instant a correction is
// recorded (agentDialogueState.service.ts, ADR §3.2) -- this module's ONLY
// job is to (a) recognize a turn as a genuine date correction rather than an
// unrelated new request, and (b) hand Core a corrected AgentObjective that
// re-enters the EXACT SAME runAgentPlanning/authorizePlan pipeline as any
// other turn. authorizePlan's own existing re-plan-from-scratch +
// digest-comparison (never trusting a client-echoed plan) is what makes the
// OLD, now-stale plan harmless the instant the user tries to confirm it --
// this module never needs to know that mechanism exists, only to feed it an
// honestly corrected objective.
export interface PlanCorrectionClassification {
    isCorrection: boolean;
    reason: string;
}

// A correction is recognized ONLY when: (1) a plan is genuinely pending
// (lifecycle === 'plan_pending_authorization', an actual AgentPlan reached
// the user), (2) the open objective's type is one where a date is a
// meaningful field to replace, (3) escape detection (the SAME
// classifyExplicitEscape already proven for targetEntity/person answers)
// does not find a complete, differently-shaped new request, and (4) the new
// turn itself contains a recognizable date/time expression -- reusing the
// SAME closed TIME_HINT_PATTERN vocabulary agentObjectiveInterpreter.service.ts
// already uses to extract one, never a second date-phrase vocabulary. A turn
// with no date expression at all is never treated as a correction (it may be
// a genuinely new, unrelated turn, or "no, cancela" -- which UI/authorization
// revocation already handles, out of this module's scope).
export async function classifyPlanCorrection(
    dialogueState: AgentDialogueState | null,
    rawTurn: string,
    actorUserId: string,
    conversationId: string | undefined,
): Promise<PlanCorrectionClassification> {
    if (!dialogueState || dialogueState.lifecycle !== 'plan_pending_authorization' || !dialogueState.openObjective) {
        return { isCorrection: false, reason: 'no_plan_pending' };
    }
    if (!PLAN_DATE_CORRECTION_ELIGIBLE_OBJECTIVE_TYPES.has(dialogueState.openObjective.objectiveType)) {
        return { isCorrection: false, reason: 'objective_type_not_eligible' };
    }
    const trimmed = rawTurn.trim();
    if (!trimmed) {
        return { isCorrection: false, reason: 'empty_turn' };
    }
    const newTimeHint = extractTimeHint(trimmed);
    if (!newTimeHint) {
        return { isCorrection: false, reason: 'no_date_expression' };
    }
    const escape = await classifyExplicitEscape(trimmed, actorUserId, conversationId);
    if (escape.escaped) {
        return { isCorrection: false, reason: 'explicit_escape' };
    }
    return { isCorrection: true, reason: 'date_correction' };
}

export interface PlanCorrectionResult {
    correctedObjective: AgentObjective;
    turnSequence: number;
}

// Builds the corrected objective (structured-field replacement only, never
// raw string-mashing of the full conversation) and records the correction
// via applyCorrection -- which is what actually clears the stale
// currentPlanDigestRef and transitions the dialogue state back to
// `collecting`, per the ADR's own already-built mechanism. The caller
// (agentTurnCore.service.ts) is responsible for re-opening the objective
// (openObjective) and re-running it through runAgentPlanning, exactly as it
// already does for every other write turn -- this function only decides
// WHAT the corrected objective is, never touches planning/authorization
// itself.
export function buildPlanDateCorrection(
    dialogueService: { applyCorrection: (input: {
        actorUserId: string; dialogueScopeKey: string; slotName: string;
        previousValue: string | null; newValue: string; reason: 'user_correction';
        turnId: string; turnSequence: number;
    }) => unknown },
    dialogueState: AgentDialogueState,
    dialogueScopeKey: string,
    actorUserId: string,
    newTimeHint: string,
    turnId: string,
    now: Date,
    timezone: string,
): PlanCorrectionResult {
    const priorObjective = dialogueState.openObjective as AgentObjective;
    const previousRawHint = priorObjective.timeConstraints.rawHint;
    const turnSequence = dialogueState.lastTurnSequence + 1;

    dialogueService.applyCorrection({
        actorUserId, dialogueScopeKey, slotName: 'timeConstraints.rawHint',
        previousValue: previousRawHint, newValue: newTimeHint,
        reason: 'user_correction', turnId, turnSequence,
    });

    // The planner re-parses the FULL sourceUtterance for reschedule (never
    // just timeConstraints.rawHint), and parseDateFromText/
    // parseExplicitWeekday match the FIRST date-shaped span in the text --
    // simply appending the new phrase after the old one would leave the OLD
    // date winning (a real bug caught by this module's own tests). Reusing
    // stripTrailingDateSpan (the SAME chrono-anchored removal the reschedule
    // interpreter itself already uses to separate a target from its own
    // trailing date clause) removes the stale date span first, so the new
    // phrase becomes the only -- and therefore first -- match.
    const utteranceWithoutOldDate = stripTrailingDateSpan(priorObjective.sourceUtterance.trim(), now, timezone).trim();

    const correctedObjective: AgentObjective = {
        ...priorObjective,
        timeConstraints: { rawHint: newTimeHint },
        sourceUtterance: `${utteranceWithoutOldDate} ${newTimeHint}`.trim(),
        ambiguities: [],
    };

    return { correctedObjective, turnSequence };
}
