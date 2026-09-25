import { describe, expect, it } from 'vitest';
import { interpretAgentSemanticTurn } from '../src/services/agentSemanticInterpreter.service';
import { DeterministicInputInterpreter } from '../src/services/agentInputInterpreter.service';
import { DeterministicObjectiveInterpreter } from '../src/services/agentObjectiveInterpreter.service';
import type { Interpretation } from '../src/types/agentContext';

function fakeInterpretation(overrides: Partial<Interpretation>): Interpretation {
    return {
        intent: 'general_context', intentConfidence: 0.5, personHints: [], topicHints: [],
        textQuery: null, timeExpression: null, temporalIntent: null, priorReferenceIntent: null,
        followUpAttribute: null, temporalComparison: null, urgencyComparison: null, statusHints: null,
        requestedTransition: null, wantsCommitments: true, wantsMessages: true,
        wantsTranscriptions: false, wantsAttachments: false, wantsOverdueFocus: false,
        proposalFocus: null, isWriteActionRequest: false, ambiguityHints: [],
        source: 'test', modelUsed: 'test', schemaValid: true, ...overrides,
    } as Interpretation;
}

describe('M-7 legacy semantic characterization (pre-V4 behavior)', () => {
    it('records the safety override from a model WRITE to deterministic READ', async () => {
        const result = await interpretAgentSemanticTurn('¿Cuál de mis pendientes es el más urgente?', {
            actorUserId: 'actor',
        }, { inputInterpreter: { interpret: async () => fakeInterpretation({ isWriteActionRequest: true, intent: 'commitment_query' }) } });
        expect(result.route).toBe('read');
        expect(result.objective).toBeNull();
    });

    it('records the safety override from a model READ to a deterministic WRITE', async () => {
        const result = await interpretAgentSemanticTurn('Recuérdame revisar el informe mañana', {
            actorUserId: 'actor',
        }, { inputInterpreter: { interpret: async () => fakeInterpretation({ isWriteActionRequest: false, intent: 'recall' }) } });
        expect(result.route).toBe('write');
        expect(result.objective?.objectiveType).toBe('create_personal_commitment');
    });

    it('records deterministic objective replacement after a model-selected WRITE route', async () => {
        const expected = await new DeterministicObjectiveInterpreter().interpret('recuérdame llamar a Paula mañana', { actorUserId: 'actor' });
        const result = await interpretAgentSemanticTurn('recuérdame llamar a Paula mañana', {
            actorUserId: 'actor',
        }, {
            inputInterpreter: { interpret: async () => fakeInterpretation({ isWriteActionRequest: true, intent: 'general_context' }) },
            objectiveInterpreter: { interpret: async () => expected },
        });
        expect(result.route).toBe('write');
        expect(result.objective).toEqual(expected);
    });

    it('keeps deterministic fallback itself isolated as a characterization dependency', async () => {
        const result = await new DeterministicInputInterpreter().interpret('¿Qué me queda por hacer?');
        expect(result.isWriteActionRequest).toBe(false);
        expect(result.source).toBe('deterministic');
    });
});
