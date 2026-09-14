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
