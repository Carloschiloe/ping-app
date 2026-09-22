import { describe, expect, it } from 'vitest';
import { DeterministicInputInterpreter } from '../src/services/agentInputInterpreter.service';
import { DeterministicObjectiveInterpreter } from '../src/services/agentObjectiveInterpreter.service';
import { LlmInputInterpreter } from '../src/services/agentInputInterpreter.service';
import { LlmObjectiveInterpreter } from '../src/services/agentObjectiveInterpreter.service';
import { interpretAgentSemanticTurn } from '../src/services/agentSemanticInterpreter.service';

const CONTEXT = { actorUserId: '00000000-0000-0000-0000-000000000001' };

describe('M-7 reproduction: deterministic routing cannot own natural-language understanding', () => {
    it('proves unseen write language reaches the planner through the semantic boundary', async () => {
        const utterances = [
            'Déjame anotado que el viernes reviso la caldera',
            'Quiero dejar registrado que debo llamar a mi mamá',
        ];

        const observed = [] as Array<Record<string, unknown>>;
        const inputInterpreter = new LlmInputInterpreter({
            model: { modelName: 'm7-routing-input-double', interpret: async () => JSON.stringify({
                intent: 'general_context', personHints: [], topicHints: [], textQuery: null,
                timeExpression: null, temporalComparison: null, urgencyComparison: null,
                requestedSources: [], commitmentFilterHints: { status: null, statusBasis: null },
                attachmentKindHints: [], ambiguityHints: [], wantsOverdueFocus: false,
                proposalFocus: null, isWriteActionRequest: true,
            }) },
        });
        const objectiveInterpreter = new LlmObjectiveInterpreter({
            model: { modelName: 'm7-routing-objective-double', interpret: async () => JSON.stringify({
                objectiveType: 'create_personal_commitment', personHints: [],
                entityHints: ['revisar la caldera'], timeHint: 'el viernes', decisionHint: null,
                draftOnly: false, responsibleHint: null, followUpObjectiveType: null,
                additionalPersonHint: null, desiredOutcomeHint: 'revisar la caldera',
                verbatimMessageHint: null,
            }) },
        });
        for (const utterance of utterances) {
            const input = await new DeterministicInputInterpreter().interpret(utterance, {});
            const objective = await new DeterministicObjectiveInterpreter().interpret(utterance, CONTEXT);
            const routing = await interpretAgentSemanticTurn(utterance, CONTEXT, { inputInterpreter, objectiveInterpreter });
            observed.push({
                utterance,
                deterministicWriteSignal: input.isWriteActionRequest,
                deterministicObjective: objective.objectiveType,
                routedToPlanner: routing.route === 'write',
            });
        }

        // The deterministic fallback remains conservative for these novel
        // forms, while the injected semantic provider demonstrates that the
        // canonical route reaches planning without a phrase gate.
        expect(observed).toEqual([
            {
                utterance: 'Déjame anotado que el viernes reviso la caldera',
                deterministicWriteSignal: false,
                deterministicObjective: 'unsupported',
                routedToPlanner: true,
            },
            {
                utterance: 'Quiero dejar registrado que debo llamar a mi mamá',
                deterministicWriteSignal: false,
                deterministicObjective: 'unsupported',
                routedToPlanner: true,
            },
        ]);
    });
});
