/**
 * M-7 — Canonical semantic boundary.
 *
 * This is the only service that decides whether a turn is read-shaped or
 * write-shaped before it enters the corresponding pipeline. The language
 * model proposes the semantic interpretation; Core still validates entities,
 * authorization, temporal values, confirmations and execution downstream.
 *
 * Deterministic interpreters remain valid fallbacks and safety normalizers,
 * but they are not a gate in front of the model. That distinction is what
 * lets a new wording reach the planner without adding another phrase.
 */
import {
    DeterministicInputInterpreter,
    fallbackInterpretation,
    extractUrgencyComparison,
    isSocialConversationInput,
    isTemporalComparisonQuery,
    LlmInputInterpreter,
    inferContextualVoiceFollowUpAttribute,
    type AgentInputInterpreter,
    type InterpreterContext,
} from './agentInputInterpreter.service';
import {
    DeterministicObjectiveInterpreter,
    LlmObjectiveInterpreter,
    type AgentObjectiveInterpreter,
    type ObjectiveInterpreterContext,
} from './agentObjectiveInterpreter.service';
import { isAiConfigured } from './synthesis.service';
import type { Interpretation } from '../types/agentContext';
import type { AgentObjective } from '../types/agentPlan';

export type AgentSemanticRoute = 'read' | 'write';

export interface AgentSemanticInterpretation {
    route: AgentSemanticRoute;
    interpretation: Interpretation;
    objective: AgentObjective | null;
}

export interface AgentSemanticInterpreterOptions {
    inputInterpreter?: AgentInputInterpreter;
    objectiveInterpreter?: AgentObjectiveInterpreter;
}

const DETERMINISTIC_READ_INTENTS = new Set([
    'commitment_query',
    'person_query',
    'recall',
    'message_search',
    'document_search',
]);

// A deterministic interpreter may classify a declarative user statement as
// general_context (for example, "Tengo que llamar a Pedro") while the
// objective interpreter correctly recognizes a write. The read fast path is
// an optimization only; it must never pre-empt that safety-net write routing.
// Keep this structural and bounded instead of growing a phrase-by-phrase
// command list.
function looksLikeDeclarativeWriteFrame(input: string): boolean {
    return /^\s*(?:tengo\s+que|debo|necesito|recuerda(?:me)?\s+que|acuerda(?:me)?\s+que|agenda(?:r)?|anota(?:r)?|crea(?:r)?|recu[eé]rdame|llama(?:r)?|env[ií]a|dile|mueve|cancela(?:r)?|completa(?:r)?|elimina(?:r)?|marca(?:r)?|pon(?:er)?|programa(?:r)?|guarda(?:r)?|i\s+(?:have\s+to|need\s+to|must)|remember\s+to|remind\s+me\s+to|schedule|create|add|save|call|send|tell|move|assign|cancel|complete|delete|mark|set|put)\b/iu.test(input);
}

// Keep the question-shape guard in one place. It is a grammatical boundary,
// not a catalog of commands: voice transcripts may lose punctuation, while a
// retrieval question still exposes its interrogative at the start.
const RETRIEVAL_INTERROGATIVE_START = /^\s*(?:¿\s*)?(?:qué|cu[aá]l(?:es)?|cu[aá]ndo|d[oó]nde|qui[eé]n(?:es)?|c[oó]mo|cu[aá]nt(?:o|a|os|as)|mu[eé]strame|dime|hay|what|which|when|where|who|how|show\s+me|tell\s+me|are\s+there)(?=$|[^\p{L}\p{N}_])/iu;

function hasQuestionShape(input: string): boolean {
    return /[?\u061f]\s*$/u.test(input.trim())
        || RETRIEVAL_INTERROGATIVE_START.test(input);
}

function startsWithRetrievalInterrogative(input: string): boolean {
    return RETRIEVAL_INTERROGATIVE_START.test(input);
}

// A leading negation is a semantic boundary for mutation admission. The
// downstream planner may still interpret the text as a cancellation or a
// read, but this fallback must never turn "no quiero que..." into a write.
function startsWithNegation(input: string): boolean {
    const firstToken = input.trim().replace(/^¿/u, '').split(/\s+/u, 1)[0]?.toLocaleLowerCase();
    return new Set(['no', 'nunca', 'jamás', 'jamas', 'not', 'never']).has(firstToken ?? '');
}

function hasCurrentTurnObjectiveEvidence(objective: AgentObjective): boolean {
    return objective.targetEntities.entityHints.some((hint) => hint.trim().length > 0)
        || objective.targetEntities.personHints.some((hint) => hint.trim().length > 0)
        || !!objective.timeConstraints.rawHint?.trim()
        || !!objective.slotDelta?.title?.trim()
        || !!objective.slotDelta?.date?.trim()
        || !!objective.slotDelta?.time?.trim()
        || objective.dialogueAct === 'correct'
        || objective.dialogueAct === 'new_objective';
}

/**
 * Low-risk read fast path.
 *
 * The model remains the authority for novel wording, actions and any turn
 * that depends on dialogue state. Clear retrieval questions already have all
 * the structure Core needs in the deterministic interpreter, so spending a
 * provider round trip on them only adds latency and creates another failure
 * point. This predicate is intentionally conservative: a third-person
 * pronoun, a pending objective or an action signal always goes through the
 * full semantic boundary.
 */
export function isDeterministicReadFastPathEligible(
    input: string,
    interpretation: Interpretation,
    context: Pick<InterpreterContext, 'pendingPlan' | 'activeObjective' | 'dialogueReconciliation'>,
): boolean {
    if (process.env.PING_ENABLE_SEMANTIC_READ_FAST_PATH === 'false') return false;
    if (context.pendingPlan || context.activeObjective || context.dialogueReconciliation) return false;
    if (interpretation.isWriteActionRequest) return false;
    if (interpretation.ambiguityHints.includes('unresolved_pronoun')) return false;
    if (looksLikeDeclarativeWriteFrame(input)) return false;
    if (isSocialConversationInput(input)) return true;
    if (interpretation.followUpAttribute) return true;
    // A statement that carries commitment slots (a time or a person) is
    // ambiguous between a read and a write, and deterministic intent labels are
    // lexical: "el viernes debo pagar la luz" is labelled commitment_query and
    // "mañana tengo que llamar a Marcelo" general_context, yet both are
    // commitments whatever their word order. Without question shape such a
    // turn goes to the semantic model; it still reads fine there, only slower.
    // A leading "¿" also counts ("¿Y cuándo lo completamos? Ver Spiderman"),
    // but not a parenthetical question inside a statement.
    const questionShaped = hasQuestionShape(input) || /^\s*¿/u.test(input);
    const carriesCommitmentSlots = !!interpretation.timeExpression
        || !!interpretation.temporalIntent
        || interpretation.personHints.length > 0;
    if (!questionShaped && carriesCommitmentSlots) return false;
    // The deterministic interpreter only understands a question completely
    // when every word maps to structure (period, status, person, count). A
    // residual text query is the words it could not place, and those are
    // exactly where lexical parsing misreads speech: fillers ("qué onda con
    // lo de mañana"), indefinite objects ("¿tengo que llamar a alguien?").
    // Such a turn is read by the semantic model whenever one is configured;
    // without it the deterministic reading is still the best available.
    if (interpretation.textQuery && isAiConfigured()) return false;
    if (DETERMINISTIC_READ_INTENTS.has(interpretation.intent)) return true;
    return interpretation.intent === 'general_context'
        && (interpretation.wantsCommitments
            || interpretation.wantsMessages
            || interpretation.wantsTranscriptions
            || interpretation.wantsAttachments
            || !!interpretation.timeExpression
            || !!interpretation.temporalIntent
            || interpretation.personHints.length > 0);
}

async function interpretInput(
    input: string,
    context: InterpreterContext,
    interpreter: AgentInputInterpreter,
): Promise<Interpretation> {
    try {
        const result = await interpreter.interpret(input, context);
        if (!result || typeof result.intent !== 'string' || typeof result.isWriteActionRequest !== 'boolean') {
            return fallbackInterpretation(input, 'invalid_interpretation');
        }
        return result;
    } catch {
        return fallbackInterpretation(input, 'interpreter_error');
    }
}

/**
 * Resolve one semantic meaning for a turn. Callers must pass the resulting
 * Interpretation into context building instead of interpreting the same text
 * again through a second, incompatible route.
 */
export async function interpretAgentSemanticTurn(
    input: string,
    context: {
        actorUserId: string;
        conversationId?: string;
        channel?: string;
        priorReadSummary?: InterpreterContext['priorReadSummary'];
        pendingPlan?: ObjectiveInterpreterContext['pendingPlan'];
        activeObjective?: ObjectiveInterpreterContext['activeObjective'];
        dialogueReconciliation?: InterpreterContext['dialogueReconciliation'];
    },
    options: AgentSemanticInterpreterOptions = {},
): Promise<AgentSemanticInterpretation> {
    // Keep custom interpreters as an explicit test/provider seam. The
    // production default gets the bounded fast path below; injected
    // interpreters must retain their exact semantics for certification.
    if (!options.inputInterpreter) {
        const deterministic = await new DeterministicInputInterpreter().interpret(input);
        const contextualVoiceAttribute = inferContextualVoiceFollowUpAttribute(input, context.priorReadSummary);
        const contextualFollowUp = contextualVoiceAttribute
            ? {
                ...deterministic,
                intent: 'commitment_query' as const,
                intentConfidence: Math.max(deterministic.intentConfidence, 0.7),
                followUpAttribute: contextualVoiceAttribute,
                textQuery: null,
                topicHints: [],
                wantsCommitments: true,
            }
            : deterministic;
        if (isDeterministicReadFastPathEligible(input, contextualFollowUp, context)) {
            return { route: 'read', interpretation: contextualFollowUp, objective: null };
        }
    }

    const inputInterpreter = options.inputInterpreter ?? new LlmInputInterpreter();
    const interpretation = await interpretInput(input, {
        conversationId: context.conversationId,
        channel: context.channel,
        pendingPlan: context.pendingPlan,
        activeObjective: context.activeObjective,
        dialogueReconciliation: context.dialogueReconciliation,
        priorReadSummary: context.priorReadSummary,
    }, inputInterpreter);

    // Safety veto, never a semantic gate: an LLM write proposal cannot turn a
    // clearly structured retrieval/comparison into a mutation. The
    // deterministic interpreter is used here only for this narrow structural
    // invariant; novel write wording still reaches the LLM and planner.
    if (interpretation.isWriteActionRequest) {
        const safeRead = await new DeterministicInputInterpreter().interpret(input);
        const isRetrievalIntent = safeRead.intent === 'recall'
            || safeRead.intent === 'message_search'
            || safeRead.intent === 'document_search';
        const hasReadDomainSignal = safeRead.wantsCommitments
            || safeRead.wantsMessages
            || safeRead.wantsTranscriptions
            || safeRead.wantsAttachments
            || safeRead.intent === 'commitment_query'
            || !!safeRead.timeExpression
            || !!safeRead.temporalIntent;
        // Voice transcripts and informal text often omit the final question
        // mark.  The sentence shape still carries the same structural signal
        // (qué/cuál/cuándo/etc. at the start), so do not let a provider wobble
        // turn a read question such as "qué tengo para mañana" into a write
        // plan merely because punctuation was lost during transcription.
        const isQuestionShaped = hasQuestionShape(input);
        // A question-shaped turn with a read-domain signal is a structural
        // retrieval request even when the provider overstates
        // isWriteActionRequest. This does not enumerate user phrases and
        // does not override a deterministic write signal for an action.
        const isInterrogativeRead = isQuestionShaped && hasReadDomainSignal;
        const isStructuredRead = (isRetrievalIntent && isInterrogativeRead)
            || (safeRead.intent === 'commitment_query'
                && !safeRead.isWriteActionRequest
                && safeRead.textQuery === null)
            || isTemporalComparisonQuery(input)
            || !!extractUrgencyComparison(input)
            || isInterrogativeRead;
        if (isStructuredRead && !safeRead.isWriteActionRequest) {
            return { route: 'read', interpretation: safeRead, objective: null };
        }
    }

    // If the model says READ but the independent structural interpreter has
    // a complete, low-risk write objective (personal capture or memory), use
    // that only as an admission safety net. This prevents a provider wobble
    // from silently turning an explicit state-changing request into “no
    // evidence”, while lifecycle/entity/permission decisions remain in Core.
    if (!interpretation.isWriteActionRequest) {
        // Some natural commitments are declarative rather than imperative
        // (the user states an obligation they want kept, instead of saying
        // "create" or "remind me").  Let the objective interpreter decide
        // whether that meaning is a write; the bounded structural admission
        // below only applies to a non-interrogative commitment frame and
        // still sends the resulting objective through the normal planner.
        const declarativeCommitmentFrame = !/[?\u061f]$/u.test(input.trim())
            && interpretation.intent === 'commitment_query';
        if (declarativeCommitmentFrame) {
            const objectiveInterpreter = options.objectiveInterpreter ?? new LlmObjectiveInterpreter();
            const candidate = await objectiveInterpreter.interpret(input, {
                actorUserId: context.actorUserId,
                conversationId: context.conversationId,
            });
            const creationObjective = candidate.objectiveType === 'create_personal_commitment'
                || candidate.objectiveType === 'create_commitment_or_proposal';
            if (creationObjective && (candidate.targetEntities.entityHints.length > 0
                || candidate.timeConstraints.rawHint
                || candidate.sourceUtterance.trim().length > 0)) {
                return {
                    route: 'write',
                    interpretation: {
                        ...interpretation,
                        interactionMode: 'task',
                        isWriteActionRequest: true,
                    },
                    objective: candidate,
                };
            }
        }
        const structuralInput = await new DeterministicInputInterpreter().interpret(input);
        const structuralObjective = await new DeterministicObjectiveInterpreter().interpret(input, {
            actorUserId: context.actorUserId,
            conversationId: context.conversationId,
        });
        const safeWriteObjective = structuralObjective.objectiveType === 'create_personal_commitment'
            || (structuralObjective.objectiveType === 'create_commitment_or_proposal'
                && structuralObjective.constraints.commitmentOwnership !== 'third_party')
            || structuralObjective.objectiveType === 'remember_fact'
            || structuralObjective.objectiveType === 'cancel_existing_commitment';
        const structuralReadDomainSignal = structuralInput.wantsCommitments
            || structuralInput.wantsMessages
            || structuralInput.wantsTranscriptions
            || structuralInput.wantsAttachments
            || structuralInput.intent === 'commitment_query'
            || !!structuralInput.timeExpression
            || !!structuralInput.temporalIntent;
        const isReadQuestionFrame = hasQuestionShape(input)
            && !structuralInput.isWriteActionRequest
            && ((structuralReadDomainSignal
                    && structuralInput.textQuery === null)
                || (structuralInput.requestedTransition?.length ?? 0) > 0
                || !!context.priorReadSummary);
        const isRetrievalQuestionFrame = (structuralInput.intent === 'commitment_query'
            && structuralInput.textQuery === null)
            || isReadQuestionFrame
            || startsWithRetrievalInterrogative(input);
        // A provider can under-call an explicit write (especially when the
        // first turn is intentionally incomplete). Admit the structural
        // action frame before the confidence threshold: Core still owns slot
        // validation, authorization and execution. Retrieval questions and
        // negations remain outside this safety-net.
        const structuralActionFrame = structuralInput.isWriteActionRequest
            && !startsWithRetrievalInterrogative(input)
            && !startsWithNegation(input);
        if (safeWriteObjective && structuralActionFrame) {
            const objectiveInterpreter = options.objectiveInterpreter ?? new LlmObjectiveInterpreter();
            const objectiveContext: ObjectiveInterpreterContext = {
                actorUserId: context.actorUserId,
                conversationId: context.conversationId,
                pendingPlan: context.pendingPlan,
                activeObjective: context.activeObjective,
                dialogueReconciliation: context.dialogueReconciliation,
            };
            let candidate = structuralObjective;
            try {
                const interpreted = await objectiveInterpreter.interpret(input, objectiveContext);
                if (interpreted.objectiveType !== 'unsupported') candidate = interpreted;
            } catch {
                // The deterministic objective remains the bounded fallback.
            }
            return {
                route: 'write',
                interpretation: {
                    ...structuralInput,
                    interactionMode: 'task',
                    isWriteActionRequest: true,
                },
                objective: candidate,
            };
        }

        // If the deterministic input grammar cannot recognize an indirect or
        // colloquial action, let the semantic objective interpreter decide it
        // rather than silently converting the turn into a read. This is still
        // bounded by grammatical retrieval/negation guards; any unsupported
        // objective remains on the read path, and Core remains the authority
        // for slots, permissions, confirmation and execution.
        const canAskObjectiveInterpreter = !isRetrievalQuestionFrame
            && !startsWithNegation(input)
            && (interpretation.intent === 'general_context'
                || !!context.pendingPlan
                || !!context.activeObjective
                || !!context.dialogueReconciliation);
        if (canAskObjectiveInterpreter) {
            const objectiveInterpreter = options.objectiveInterpreter ?? new LlmObjectiveInterpreter();
            try {
                const candidate = await objectiveInterpreter.interpret(input, {
                    actorUserId: context.actorUserId,
                    conversationId: context.conversationId,
                    pendingPlan: context.pendingPlan,
                    activeObjective: context.activeObjective,
                    dialogueReconciliation: context.dialogueReconciliation,
                });
                if (candidate.objectiveType !== 'unsupported'
                    && hasCurrentTurnObjectiveEvidence(candidate)) {
                    return {
                        route: 'write',
                        interpretation: {
                            ...interpretation,
                            interactionMode: 'task',
                            isWriteActionRequest: true,
                        },
                        objective: candidate,
                    };
                }
            } catch {
                // A failed semantic objective must never invent a write.
            }
        }
    }

    if (!interpretation.isWriteActionRequest) {
        return { route: 'read', interpretation, objective: null };
    }

    const objectiveInterpreter = options.objectiveInterpreter ?? new LlmObjectiveInterpreter();
    const objectiveContext: ObjectiveInterpreterContext = {
        actorUserId: context.actorUserId,
        conversationId: context.conversationId,
        pendingPlan: context.pendingPlan,
        activeObjective: context.activeObjective,
        dialogueReconciliation: context.dialogueReconciliation,
    };
    let objective: AgentObjective;
    try {
        objective = await objectiveInterpreter.interpret(input, objectiveContext);
    } catch {
        objective = await new DeterministicObjectiveInterpreter().interpret(input, objectiveContext);
    }

    // Unsupported is still a WRITE route: the planner must produce an honest
    // unsupported/clarification result instead of a misleading read answer.
    return { route: 'write', interpretation, objective };
}
