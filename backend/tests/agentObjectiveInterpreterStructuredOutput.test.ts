import { describe, expect, it } from 'vitest';
import {
    LlmObjectiveInterpreter,
    type AgentObjectiveModel,
} from '../src/services/agentObjectiveInterpreter.service';

const ACTOR = '00000000-0000-4000-8000-000000000001';

const context = {
    actorUserId: ACTOR,
    dialogueReconciliation: 'none',
    pendingPlan: null,
    activeObjective: null,
    priorReadSummary: null,
} as any;

const observedProviderPayload = {
    dialogueAct: 'new_objective',
    slotDelta: { title: 'null', date: 'null', time: 'mañana' },
    objectiveType: 'create_commitment_or_proposal',
    personHints: [],
    entityHints: [],
    contentHint: 'null',
    timeHint: 'mañana',
    decisionHint: 'null',
    draftOnly: false,
    responsibleHint: 'null',
    commitmentOwnership: 'personal',
    followUpObjectiveType: 'null',
    additionalPersonHint: 'null',
    desiredOutcomeHint: 'null',
    verbatimMessageHint: 'null',
};

function modelReturning(payload: unknown): AgentObjectiveModel {
    return {
        modelName: 'test-structured-output',
        timeoutMs: 100,
        interpret: async () => JSON.stringify(payload),
    };
}

describe('objective interpreter structured output contract', () => {
    it('accepts the observed provider payload after normalizing only nullable null sentinels', async () => {
        const interpreter = new LlmObjectiveInterpreter({
            model: modelReturning(observedProviderPayload),
        });

        const result = await interpreter.interpret('Crea un compromiso para mañana', context);

        expect(result.source).toBe('llm');
        expect(result.fallbackReason).toBeUndefined();
        expect(result.objectiveType).toBe('create_commitment_or_proposal');
        expect(result.timeConstraints.rawHint).toBe('mañana');
        expect(result.constraints.commitmentOwnership).toBe('personal');
    });

    it('keeps rejecting an invalid non-null enum sentinel', async () => {
        const invalidPayload = {
            ...observedProviderPayload,
            decisionHint: 'later',
        };
        const interpreter = new LlmObjectiveInterpreter({
            model: modelReturning(invalidPayload),
        });

        const result = await interpreter.interpret('Crea un compromiso para mañana', context);

        expect(result.source).toBe('llm_fallback');
        expect(result.fallbackReason).toBe('schema_invalid');
    });

    it('does not alter a provider payload that already uses real null values', async () => {
        const validPayload = {
            ...observedProviderPayload,
            slotDelta: { title: null, date: null, time: 'mañana' },
            contentHint: null,
            decisionHint: null,
            responsibleHint: null,
            followUpObjectiveType: null,
            additionalPersonHint: null,
            desiredOutcomeHint: null,
            verbatimMessageHint: null,
        };
        const interpreter = new LlmObjectiveInterpreter({
            model: modelReturning(validPayload),
        });

        const result = await interpreter.interpret('Crea un compromiso para mañana', context);

        expect(result.source).toBe('llm');
        expect(result.fallbackReason).toBeUndefined();
        expect(result.timeConstraints.rawHint).toBe('mañana');
    });
});
