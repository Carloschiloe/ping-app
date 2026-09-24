import { describe, expect, it } from 'vitest';
import {
    agentInterpretationPayloadJsonSchema,
    AGENT_INTENT_VALUES,
} from '../src/schemas/agentInterpretation.schema';
import { buildReadContextFromAnswer } from '../src/services/agentReadContext.service';
import type { AgentContext } from '../src/types/agentContext';
import type { AgentResponse } from '../src/types/agentResponse';
import { fallbackInterpretation } from '../src/services/agentInputInterpreter.service';
import { interpretAgentSemanticTurn } from '../src/services/agentSemanticInterpreter.service';

const first = {
    id: '11111111-1111-4111-8111-111111111111',
    entityType: 'commitment' as const,
    title: 'revisar el audio',
    status: 'accepted' as const,
    provenance: { sourceType: 'commitment' as const, sourceId: '11111111-1111-4111-8111-111111111111' },
};
const second = {
    ...first,
    id: '22222222-2222-4222-8222-222222222222',
    title: 'comprar pan',
    provenance: { sourceType: 'commitment' as const, sourceId: '22222222-2222-4222-8222-222222222222' },
};

function contextWithWindow(): AgentContext {
    return {
        commitments: [first, second],
        entities: { timeRange: null },
    } as unknown as AgentContext;
}

describe('M-7 structural language boundaries', () => {
    it('derives conversational state from cited evidence, not the whole retrieval window', () => {
        const response: AgentResponse = {
            status: 'answered',
            answer: 'Revisar el audio.',
            claims: [],
            citations: [first.provenance],
        };

        expect(buildReadContextFromAnswer(contextWithWindow(), response, 'turn-1')).toMatchObject({
            kind: 'commitment_query',
            sourceTurnId: 'turn-1',
            commitmentReferents: [{ canonicalId: first.id, rawText: first.title }],
            statuses: ['accepted'],
        });
    });

    it('clears commitment continuity when the answer has no commitment evidence', () => {
        const response: AgentResponse = {
            status: 'answered', answer: 'No encontré mensajes.', claims: [], citations: [],
        };
        expect(buildReadContextFromAnswer(contextWithWindow(), response, 'turn-2')).toBeNull();
    });

    it('publishes the same bounded contract that the Zod runtime validates', () => {
        const schema = agentInterpretationPayloadJsonSchema as {
            properties: Record<string, any>;
            required: string[];
            additionalProperties: boolean;
        };
        expect(schema.additionalProperties).toBe(false);
        expect(schema.required).toContain('requestedSources');
        expect(schema.properties.requestedSources.type).toBe('array');
        expect(schema.properties.requestedSources.items.enum).toEqual([
            'messages', 'commitments', 'commitment_events', 'transcriptions', 'attachments',
        ]);
        expect(schema.properties.intent.enum).toEqual([...AGENT_INTENT_VALUES]);

        const serialized = JSON.stringify(agentInterpretationPayloadJsonSchema);
        expect(serialized).not.toContain('"default"');
        expect(serialized).not.toContain('"$schema"');
    });

    it('keeps a valid model read authoritative when surface words resemble an action', async () => {
        const modelRead = {
            ...fallbackInterpretation('Recuérdame lo que hablamos del seguro, no me crees una tarea.'),
            intent: 'recall' as const,
            isWriteActionRequest: false,
            source: 'llm' as const,
        };
        const result = await interpretAgentSemanticTurn(
            'Recuérdame lo que hablamos del seguro, no me crees una tarea.',
            { actorUserId: '11111111-1111-4111-8111-111111111111' },
            { inputInterpreter: { interpret: async () => modelRead } },
        );

        expect(result.route).toBe('read');
        expect(result.objective).toBeNull();
    });

    it('sends a valid model write to the planner without a second route classifier', async () => {
        const modelWrite = {
            ...fallbackInterpretation('Deja agendado revisar el galpón el viernes.'),
            intent: 'commitment_query' as const,
            isWriteActionRequest: true,
            source: 'llm' as const,
        };
        const objective = { objectiveType: 'create_personal_commitment' } as any;
        const result = await interpretAgentSemanticTurn(
            'Deja agendado revisar el galpón el viernes.',
            { actorUserId: '11111111-1111-4111-8111-111111111111' },
            {
                inputInterpreter: { interpret: async () => modelWrite },
                objectiveInterpreter: { interpret: async () => objective },
            },
        );

        expect(result.route).toBe('write');
        expect(result.objective).toBe(objective);
    });
});
