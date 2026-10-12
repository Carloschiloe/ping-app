import type {
    AgentInputInterpreter,
    InterpreterContext,
} from '../../src/services/agentInputInterpreter.service';
import type {
    AgentObjectiveInterpreter,
    ObjectiveInterpreterContext,
} from '../../src/services/agentObjectiveInterpreter.service';

type InputInterpreterModule = typeof import('../../src/services/agentInputInterpreter.service');
type ObjectiveInterpreterModule = typeof import('../../src/services/agentObjectiveInterpreter.service');

/**
 * The agent turn suites exercise Core/planner behavior, not an LLM provider.
 * These factories keep the real deterministic interpreters and make the
 * provider boundary explicit, so CI cannot accidentally call OpenAI.
 */
export function createOfflineInputInterpreter(actual: InputInterpreterModule): new () => AgentInputInterpreter {
    return class OfflineInputInterpreter implements AgentInputInterpreter {
        async interpret(input: string, _context: InterpreterContext) {
            return new actual.DeterministicInputInterpreter().interpret(input);
        }
    };
}

export function createOfflineObjectiveInterpreter(actual: ObjectiveInterpreterModule): new () => AgentObjectiveInterpreter {
    return class OfflineObjectiveInterpreter implements AgentObjectiveInterpreter {
        async interpret(input: string, context: ObjectiveInterpreterContext) {
            const objective = await new actual.DeterministicObjectiveInterpreter().interpret(input, context);

            // The real semantic provider marks a short confirmation as an
            // approval of the Core-owned pending plan. Preserve that one
            // bounded semantic signal without inventing identity or slots.
            if (context.pendingPlan && /^(?:s[ií]|ok|dale|confirmo|confirmar|adelante)(?:\s|[,!.;:]|$)[\s,!.;:]*(?:cr[eé]alo|hazlo|ejecuta(?:lo)?|confirma(?:r)?)?/iu.test(input.trim())) {
                return {
                    ...objective,
                    objectiveType: context.pendingPlan.objectiveType,
                    dialogueAct: 'confirm' as const,
                    constraints: { ...objective.constraints, decisionHint: 'approve' as const },
                    targetEntities: { personHints: [], entityHints: [] },
                    timeConstraints: { rawHint: null },
                };
            }

            return objective;
        }
    };
}
