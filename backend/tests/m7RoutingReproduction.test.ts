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

    it('admits a complete personal scheduling objective even when the input model says read', async () => {
        const inputInterpreter = new LlmInputInterpreter({
            model: { modelName: 'm7-read-wobble-double', interpret: async () => JSON.stringify({
                intent: 'general_context', personHints: [], topicHints: [], textQuery: null,
                timeExpression: null, temporalComparison: null, urgencyComparison: null,
                requestedSources: [], commitmentFilterHints: { status: null, statusBasis: null },
                attachmentKindHints: [], ambiguityHints: [], wantsOverdueFocus: false,
                proposalFocus: null, isWriteActionRequest: false,
            }) },
        });
        const routing = await interpretAgentSemanticTurn(
            'Agenda maÃ±ana a las 10 llamar a Persona No Registrada.',
            CONTEXT,
            { inputInterpreter },
        );

        expect(routing.route).toBe('write');
        expect(routing.objective?.objectiveType).toBe('create_commitment_or_proposal');
        expect(routing.objective?.constraints.commitmentOwnership).toBe('personal');
    });

    it('keeps an incomplete creation in the write planner when the provider under-calls the intent', async () => {
        const inputInterpreter = new LlmInputInterpreter({
            model: { modelName: 'm7-incomplete-read-wobble-double', interpret: async () => JSON.stringify({
                intent: 'general_context', personHints: [], topicHints: [], textQuery: null,
                timeExpression: null, temporalComparison: null, urgencyComparison: null,
                requestedSources: [], commitmentFilterHints: { status: null, statusBasis: null },
                attachmentKindHints: [], ambiguityHints: [], wantsOverdueFocus: false,
                proposalFocus: null, isWriteActionRequest: false,
            }) },
        });
        const objectiveInterpreter = new LlmObjectiveInterpreter({
            model: { modelName: 'm7-incomplete-create-double', interpret: async () => JSON.stringify({
                objectiveType: 'create_commitment_or_proposal', personHints: [], entityHints: [],
                timeHint: 'mañana', decisionHint: null, draftOnly: false,
                responsibleHint: null, followUpObjectiveType: null, additionalPersonHint: null,
                desiredOutcomeHint: null, verbatimMessageHint: null, dialogueAct: 'new_objective',
                slotDelta: { title: null, date: 'mañana', time: null },
            }) },
        });

        const routing = await interpretAgentSemanticTurn(
            'Crea un compromiso para mañana',
            CONTEXT,
            { inputInterpreter, objectiveInterpreter },
        );

        expect(routing.route).toBe('write');
        expect(routing.objective?.objectiveType).toBe('create_commitment_or_proposal');
        expect(routing.objective?.targetEntities.entityHints).toEqual([]);
        expect(routing.objective?.timeConstraints.rawHint).toBe('mañana');
        expect(routing.objective?.ambiguities?.map((item) => item.field)).toContain('title');
    });

    it('does not convert a retrieval question containing a create verb into a write', async () => {
        const inputInterpreter = new LlmInputInterpreter({
            model: { modelName: 'm7-retrieval-question-wobble-double', interpret: async () => JSON.stringify({
                intent: 'general_context', personHints: [], topicHints: [], textQuery: null,
                timeExpression: 'mañana', temporalComparison: null, urgencyComparison: null,
                requestedSources: [], commitmentFilterHints: { status: null, statusBasis: null },
                attachmentKindHints: [], ambiguityHints: [], wantsOverdueFocus: false,
                proposalFocus: null, isWriteActionRequest: false,
            }) },
        });
        const routing = await interpretAgentSemanticTurn(
            '¿Qué compromisos puedo crear para mañana?',
            CONTEXT,
            { inputInterpreter },
        );

        expect(routing.route).toBe('read');
        expect(routing.objective).toBeNull();
    });

    it('does not admit a negated creation as a write fallback', async () => {
        const inputInterpreter = new LlmInputInterpreter({
            model: { modelName: 'm7-negated-write-wobble-double', interpret: async () => JSON.stringify({
                intent: 'general_context', personHints: [], topicHints: [], textQuery: null,
                timeExpression: 'mañana', temporalComparison: null, urgencyComparison: null,
                requestedSources: [], commitmentFilterHints: { status: null, statusBasis: null },
                attachmentKindHints: [], ambiguityHints: [], wantsOverdueFocus: false,
                proposalFocus: null, isWriteActionRequest: false,
            }) },
        });
        const routing = await interpretAgentSemanticTurn(
            'No quiero que crees un compromiso para mañana; dime qué tengo.',
            CONTEXT,
            { inputInterpreter },
        );

        expect(routing.route).toBe('read');
        expect(routing.objective).toBeNull();
    });
});
