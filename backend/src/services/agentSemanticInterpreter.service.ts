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
    isTemporalComparisonQuery,
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
    context: { actorUserId: string; conversationId?: string; channel?: string; priorReadSummary?: InterpreterContext['priorReadSummary'] },
    options: AgentSemanticInterpreterOptions = {},
): Promise<AgentSemanticInterpretation> {
    const inputInterpreter = options.inputInterpreter ?? new LlmInputInterpreter();
    const interpretation = await interpretInput(input, {
        conversationId: context.conversationId,
        channel: context.channel,
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
        const isStructuredRead = isRetrievalIntent
            || isTemporalComparisonQuery(input)
            || !!extractUrgencyComparison(input);
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
