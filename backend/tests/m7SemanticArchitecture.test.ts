import { describe, expect, it } from 'vitest';
import { M7_CASE_COUNT, M7_NATURAL_LANGUAGE_CASES } from './fixtures/m7NaturalLanguageCases';
import { agentObjectiveInterpretationPayloadSchema } from '../src/schemas/agentObjectiveInterpretation.schema';
import { LlmInputInterpreter } from '../src/services/agentInputInterpreter.service';
import { LlmObjectiveInterpreter } from '../src/services/agentObjectiveInterpreter.service';
import { interpretAgentSemanticTurn } from '../src/services/agentSemanticInterpreter.service';

const ACTOR = '00000000-0000-0000-0000-000000000001';

function inputPayload(isWriteActionRequest: boolean) {
    return JSON.stringify({
        intent: isWriteActionRequest ? 'general_context' : 'commitment_query',
        personHints: [],
        topicHints: [],
        textQuery: null,
        timeExpression: null,
        temporalComparison: null,
        urgencyComparison: null,
        requestedSources: isWriteActionRequest ? [] : ['commitments'],
        commitmentFilterHints: { status: null, statusBasis: null },
        attachmentKindHints: [],
        ambiguityHints: [],
        wantsOverdueFocus: false,
        proposalFocus: null,
        isWriteActionRequest,
    });
}

describe('M-7 semantic architecture contract', () => {
    it('defines at least 100 expected-result cases before execution', () => {
        expect(M7_CASE_COUNT).toBeGreaterThanOrEqual(100);
        expect(new Set(M7_NATURAL_LANGUAGE_CASES.map((item) => item.id)).size).toBe(M7_CASE_COUNT);
        expect(M7_NATURAL_LANGUAGE_CASES.filter((item) => item.novel).length).toBeGreaterThanOrEqual(50);
    });

    it('routes an unseen wording through the semantic interpreter instead of a phrase gate', async () => {
        const inputInterpreter = new LlmInputInterpreter({
            model: {
                modelName: 'm7-input-test-double',
                interpret: async () => inputPayload(true),
            },
        });
        const objectiveInterpreter = new LlmObjectiveInterpreter({
            model: {
                modelName: 'm7-objective-test-double',
                interpret: async () => JSON.stringify({
                    objectiveType: 'create_personal_commitment',
                    personHints: [],
                    entityHints: ['revisar la caldera'],
                    timeHint: 'el viernes',
                    decisionHint: null,
                    draftOnly: false,
                    responsibleHint: null,
                    followUpObjectiveType: null,
                    additionalPersonHint: null,
                    desiredOutcomeHint: 'revisar la caldera',
                    verbatimMessageHint: null,
                }),
            },
        });

        const result = await interpretAgentSemanticTurn(
            'Déjame anotado que el viernes reviso la caldera',
            { actorUserId: ACTOR },
            { inputInterpreter, objectiveInterpreter },
        );

        expect(result.route).toBe('write');
        expect(result.objective?.objectiveType).toBe('create_personal_commitment');
        expect(result.interpretation.source).toBe('llm');
    });

    it('keeps the semantic objective catalog aligned with real memory/cancel tools', () => {
        const base = {
            personHints: [],
            entityHints: ['dato'],
            timeHint: null,
            decisionHint: null,
            draftOnly: false,
            responsibleHint: null,
            followUpObjectiveType: null,
            additionalPersonHint: null,
            desiredOutcomeHint: null,
            verbatimMessageHint: null,
        };
        expect(agentObjectiveInterpretationPayloadSchema.safeParse({ ...base, objectiveType: 'remember_fact' }).success).toBe(true);
        expect(agentObjectiveInterpretationPayloadSchema.safeParse({ ...base, objectiveType: 'cancel_existing_commitment' }).success).toBe(true);
    });
});
