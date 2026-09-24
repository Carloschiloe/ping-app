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
    LlmInputInterpreter,
    type AgentInputInterpreter,
    type InterpreterContext,
} from './agentInputInterpreter.service';
import {
    DeterministicObjectiveInterpreter,
    LlmObjectiveInterpreter,
    type AgentObjectiveInterpreter,
    type ObjectiveInterpreterContext,
} from './agentObjectiveInterpreter.service';
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

/**
 * A semantic topic/scope is an explicit context break. Attribute-only turns
 * remain eligible for Core-owned read continuity; a new objective, topic,
 * person or standalone temporal request must abandon stale pending dialogue.
 */
export function introducesIndependentSemanticScope(semantic: AgentSemanticInterpretation): boolean {
    return semantic.objective !== null
        || semantic.interpretation.textQuery !== null
        || semantic.interpretation.topicHints.length > 0
        || semantic.interpretation.personHints.length > 0
        || (semantic.interpretation.timeExpression !== null && semantic.interpretation.followUpAttribute == null);
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
        priorDialogueSummary?: InterpreterContext['priorDialogueSummary'];
    },
    options: AgentSemanticInterpreterOptions = {},
): Promise<AgentSemanticInterpretation> {
    const inputInterpreter = options.inputInterpreter ?? new LlmInputInterpreter();
    const interpretation = await interpretInput(input, {
        conversationId: context.conversationId,
        channel: context.channel,
        priorReadSummary: context.priorReadSummary,
        priorDialogueSummary: context.priorDialogueSummary,
    }, inputInterpreter);

    // A valid provider interpretation is authoritative for the semantic
    // route.  Deterministic classifiers remain the fallback selected by the
    // input interpreter when the provider is unavailable, but they must not
    // overwrite a valid LLM decision merely because a surface verb resembles
    // an action.  That old cross-check made negation, recall and corrections
    // depend on regex vocabulary and could turn a read into a write (or the
    // reverse) before Core validation.  Core still owns identity, permissions,
    // confirmation and execution below.
    // If the provider was unavailable or returned an invalid payload, the
    // input interpreter explicitly marks the result as `llm_fallback`.  Only
    // in that degraded mode may the deterministic objective safety net
    // recover a write that the fallback surface classifier could not express.
    // This keeps fallback behavior intact without allowing it to overwrite a
    // valid LLM interpretation.
    if (interpretation.source !== 'llm' && !interpretation.isWriteActionRequest) {
        const structuralObjective = await new DeterministicObjectiveInterpreter().interpret(input, {
            actorUserId: context.actorUserId,
            conversationId: context.conversationId,
        });
        const safeWriteObjective = structuralObjective.objectiveType === 'create_personal_commitment'
            || structuralObjective.objectiveType === 'remember_fact'
            || structuralObjective.objectiveType === 'cancel_existing_commitment';
        if (safeWriteObjective && structuralObjective.confidence >= 0.7) {
            const structuralInput = await new DeterministicInputInterpreter().interpret(input);
            if (structuralInput.isWriteActionRequest) {
                return { route: 'write', interpretation: structuralInput, objective: structuralObjective };
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
