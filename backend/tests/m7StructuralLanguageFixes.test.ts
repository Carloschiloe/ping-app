import { describe, expect, it } from 'vitest';
import {
    agentInterpretationPayloadJsonSchema,
    AGENT_INTENT_VALUES,
} from '../src/schemas/agentInterpretation.schema';
import { buildReadContextFromAnswer } from '../src/services/agentReadContext.service';
import type { AgentContext } from '../src/types/agentContext';
import type { AgentResponse } from '../src/types/agentResponse';
import { fallbackInterpretation } from '../src/services/agentInputInterpreter.service';
import { interpretAgentSemanticTurn, introducesIndependentSemanticScope } from '../src/services/agentSemanticInterpreter.service';
import { reconcilePendingPlanModification } from '../src/services/agentDialogueObjectiveMerge.service';
import { AgentDialogueStateService, createInMemoryDialogueStateRepository } from '../src/services/agentDialogueState.service';

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

const message = {
    id: '33333333-3333-4333-8333-333333333333',
    conversationId: '44444444-4444-4444-8444-444444444444',
    senderId: '55555555-5555-4555-8555-555555555555',
    content: 'La reunion queda para el jueves.',
    isSystem: false,
    createdAt: '2026-09-24T12:00:00.000Z',
    provenance: { sourceType: 'message' as const, sourceId: '33333333-3333-4333-8333-333333333333' },
};

const proposal = {
    ...first,
    id: '66666666-6666-4666-8666-666666666666',
    entityType: 'commitment_proposal' as const,
    title: 'propuesta de revisar el contrato',
    status: 'proposed' as const,
    provenance: { sourceType: 'commitment_proposal' as const, sourceId: '66666666-6666-4666-8666-666666666666' },
};

const person = {
    resolved: { kind: 'contact' as const, id: '77777777-7777-4777-8777-777777777777', displayName: 'Camila' },
    ambiguous: false,
    candidates: [],
};

function contextWithWindow(overrides: Partial<AgentContext> = {}): AgentContext {
    return {
        input: 'consulta de prueba',
        now: '2026-09-24T12:00:00.000Z',
        timezone: 'America/Santiago',
        intent: { type: 'commitment_query' } as any,
        wantsOverdueFocus: false,
        requestedTransition: null,
        requestedTransitionTargetCommitmentId: null,
        explicitPersonMention: false,
        proposalFocus: null,
        queryCardinality: 'list',
        requiredSourceRefs: [],
        requiredSourceRefsTruncated: false,
        requiredSourceRefsTruncationKnown: true,
        commitments: [first, second],
        events: [], messages: [], transcriptions: [], attachments: [], canonicalFacts: [], provenance: [],
        wantsMemory: false, memoryFreshness: 'any', memoryQueryCardinality: 'list', memoryFacts: [],
        historicalMemoryFacts: [], summaries: [], needsClarification: false, evidenceFound: true,
        capabilityGaps: [], retrievalPlan: [],
        entities: { people: [], timeRange: null, topics: [], conversationId: null },
        ...overrides,
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

    it('keeps an empty temporal scope without inventing an entity', () => {
        const response: AgentResponse = {
            status: 'answered', answer: 'No encontré mensajes.', claims: [], citations: [],
        };
        expect(buildReadContextFromAnswer({
            ...contextWithWindow(),
            entities: { people: [], timeRange: { from: '2026-09-25T03:00:00.000Z', to: '2026-09-26T03:00:00.000Z' }, topics: [], conversationId: null },
        }, response, 'turn-2')).toMatchObject({
            cardinality: 'empty_scope', evidence: [],
            timeRange: { from: '2026-09-25T03:00:00.000Z', to: '2026-09-26T03:00:00.000Z' },
            commitmentReferents: [],
        });
    });

    it('retains a unique message as the only authorized follow-up referent', () => {
        const state = buildReadContextFromAnswer(contextWithWindow({
            commitments: [], messages: [message], intent: { type: 'message_search' } as any,
        }), {
            status: 'answered', answer: 'La reunion queda para el jueves.', claims: [], citations: [message.provenance],
        }, 'turn-message');

        expect(state).toMatchObject({
            kind: 'message_search', cardinality: 'unique_entity',
            relationship: { kind: 'message_relationship', relationship: 'content' },
            evidence: [{ sourceType: 'message', canonicalId: message.id }],
        });
        expect(state.commitmentReferents).toEqual([]);
    });

    it('keeps multiple cited commitments as a result set, not a unique entity', () => {
        const state = buildReadContextFromAnswer(contextWithWindow(), {
            status: 'answered', answer: 'Tienes dos pendientes.', claims: [], citations: [first.provenance, second.provenance],
        }, 'turn-set');

        expect(state.cardinality).toBe('result_set');
        expect(state.evidence?.map((item) => item.canonicalId)).toEqual([first.id, second.id]);
    });

    it('preserves an exact proposal referent for re-authorization', () => {
        const state = buildReadContextFromAnswer(contextWithWindow({
            commitments: [proposal], intent: { type: 'commitment_query' } as any,
        }), {
            status: 'answered', answer: 'Hay una propuesta pendiente.', claims: [], citations: [proposal.provenance],
        }, 'turn-proposal');

        expect(state.evidence).toEqual([expect.objectContaining({ sourceType: 'commitment_proposal', canonicalId: proposal.id })]);
        expect(state.commitmentReferents).toEqual([expect.objectContaining({ entityType: 'commitment_proposal', canonicalId: proposal.id })]);
    });

    it('replaces a person scope when the next answer cites another person', () => {
        const firstState = buildReadContextFromAnswer(contextWithWindow({
            commitments: [], intent: { type: 'person_query' } as any,
            entities: { people: [person], timeRange: null, topics: [], conversationId: null },
        }), {
            status: 'answered', answer: 'Camila aparece en la conversacion.', claims: [], citations: [{ sourceType: 'person', sourceId: person.resolved!.id }],
        }, 'turn-person-a');
        const otherPerson = { ...person, resolved: { ...person.resolved!, id: '88888888-8888-4888-8888-888888888888', displayName: 'Diego' } };
        const secondState = buildReadContextFromAnswer(contextWithWindow({
            commitments: [], intent: { type: 'person_query' } as any,
            entities: { people: [otherPerson], timeRange: null, topics: [], conversationId: null },
        }), {
            status: 'answered', answer: 'Diego aparece en la conversacion.', claims: [], citations: [{ sourceType: 'person', sourceId: otherPerson.resolved!.id }],
        }, 'turn-person-b');

        expect(firstState.scope?.personIds).toEqual([person.resolved!.id]);
        expect(secondState.scope?.personIds).toEqual([otherPerson.resolved!.id]);
        expect(secondState.scope?.personIds).not.toContain(person.resolved!.id);
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

    it('keeps a single cited person as the only re-authorizable person scope', () => {
        const otherPerson = { ...person, resolved: { ...person.resolved!, id: '88888888-8888-4888-8888-888888888888', displayName: 'Diego' } };
        const state = buildReadContextFromAnswer(contextWithWindow({
            commitments: [],
            intent: { type: 'person_query' } as any,
            entities: { people: [person, otherPerson], timeRange: null, topics: [], conversationId: null },
        }), {
            status: 'answered', answer: 'Camila aparece.', claims: [],
            citations: [{ sourceType: 'person', sourceId: person.resolved!.id }],
        }, 'turn-person-focused');

        expect(state.cardinality).toBe('unique_entity');
        expect(state.scope?.personIds).toEqual([person.resolved!.id]);
    });

    it('preserves the canonical message/person context contract for an attribute follow-up', async () => {
        let receivedContext: any;
        const modelRead = {
            ...fallbackInterpretation('¿Qué decía ese mensaje?'),
            intent: 'message_search' as const,
            textQuery: null,
            followUpAttribute: 'details' as const,
            priorReferenceIntent: 'single_entity' as const,
            isWriteActionRequest: false,
            source: 'llm' as const,
        };
        const result = await interpretAgentSemanticTurn(
            '¿Qué decía ese mensaje?',
            {
                actorUserId: first.id,
                priorReadSummary: {
                    kind: 'message_search', cardinality: 'unique_entity', referentCount: 1,
                    uniqueReferent: true, entityTypes: ['message'], hasTimeRange: false,
                },
            },
            { inputInterpreter: { interpret: async (_input, context) => { receivedContext = context; return modelRead; } } },
        );

        expect(result.route).toBe('read');
        expect(result.interpretation.followUpAttribute).toBe('details');
        expect(receivedContext.priorReadSummary.entityTypes).toEqual(['message']);
    });

    it('merges a pending plan modification without discarding the authorized objective target', () => {
        const prior = {
            objectiveType: 'create_personal_commitment',
            targetEntities: { personHints: [], entityHints: ['revisar el informe'] },
            constraints: { draftOnly: false },
            desiredOutcome: 'Crear compromiso',
            timeConstraints: { rawHint: 'mañana a las 10' },
            actor: first.id,
            sourceUtterance: 'Recuérdame revisar el informe mañana a las 10',
            confidence: 0.75,
            ambiguities: [],
            source: 'llm' as const,
        };
        const modification = {
            ...prior,
            targetEntities: { personHints: [], entityHints: [] },
            desiredOutcome: '',
            timeConstraints: { rawHint: 'el jueves a las 15' },
            sourceUtterance: 'Mejor el jueves a las 15',
            confidence: 0.8,
        };

        const merged = reconcilePendingPlanModification(prior, modification);
        expect(merged.targetEntities.entityHints).toEqual(['revisar el informe']);
        expect(merged.timeConstraints.rawHint).toBe('el jueves a las 15');
        expect(merged.sourceUtterance).toBe('Mejor el jueves a las 15');
    });

    it('keeps independently scoped dialogue state isolated while preserving same-scope continuity', () => {
        const now = new Date('2026-09-24T12:00:00.000Z');
        const repository = createInMemoryDialogueStateRepository();
        const service = new AgentDialogueStateService({ repository, now: () => now });
        const firstContext = buildReadContextFromAnswer(contextWithWindow(), {
            status: 'answered', answer: 'Revisar el audio.', claims: [], citations: [first.provenance],
        }, 'scope-a');
        const secondContext = buildReadContextFromAnswer(contextWithWindow({
            commitments: [second],
        }), {
            status: 'answered', answer: 'Comprar pan.', claims: [], citations: [second.provenance],
        }, 'scope-b');

        service.setReadContext({ actorUserId: first.id, dialogueScopeKey: 'conversation-a', context: firstContext, turnId: 'a-1', turnSequence: 1 });
        service.setReadContext({ actorUserId: first.id, dialogueScopeKey: 'conversation-b', context: secondContext, turnId: 'b-1', turnSequence: 1 });
        expect(service.getSnapshot(first.id, 'conversation-a')?.lastReadContext?.evidence?.[0]?.canonicalId).toBe(first.id);
        expect(service.getSnapshot(first.id, 'conversation-b')?.lastReadContext?.evidence?.[0]?.canonicalId).toBe(second.id);

        service.setReadContext({ actorUserId: first.id, dialogueScopeKey: 'conversation-a', context: secondContext, turnId: 'a-2', turnSequence: 2 });
        expect(service.getSnapshot(first.id, 'conversation-a')?.lastReadContext?.sourceTurnId).toBe('scope-b');
        expect(service.getSnapshot(first.id, 'conversation-b')?.lastReadContext?.sourceTurnId).toBe('scope-b');
    });

    it('keeps negated and list/order requests on the READ route when the model says no write', async () => {
        const modelRead = {
            ...fallbackInterpretation('No me crees nada; ordéname lo que ya tengo por hora.'),
            intent: 'commitment_query' as const,
            temporalComparison: 'earliest' as const,
            isWriteActionRequest: false,
            source: 'llm' as const,
        };
        const result = await interpretAgentSemanticTurn(
            'No me crees nada; ordéname lo que ya tengo por hora.',
            { actorUserId: first.id },
            { inputInterpreter: { interpret: async () => modelRead } },
        );
        expect(result.route).toBe('read');
        expect(result.interpretation.isWriteActionRequest).toBe(false);
        expect(result.interpretation.temporalComparison).toBe('earliest');
    });

    it('breaks stale pending scope only for a new semantic topic, not an attribute follow-up', () => {
        const followUp = {
            route: 'read' as const,
            objective: null,
            interpretation: {
                ...fallbackInterpretation('¿A qué hora?'),
                textQuery: null,
                topicHints: [],
                personHints: [],
                timeExpression: null,
                followUpAttribute: 'time' as const,
            },
        };
        const newTopic = {
            ...followUp,
            interpretation: { ...followUp.interpretation, textQuery: 'la reunión del viernes', topicHints: ['la reunión del viernes'] },
        };
        expect(introducesIndependentSemanticScope(followUp)).toBe(false);
        expect(introducesIndependentSemanticScope(newTopic)).toBe(true);
    });

    it('models confirmation, rejection and correction as distinct Core state transitions', () => {
        const now = new Date('2026-09-24T12:00:00.000Z');
        const repository = createInMemoryDialogueStateRepository();
        const service = new AgentDialogueStateService({ repository, now: () => now });
        const objective = {
            objectiveType: 'create_personal_commitment' as const,
            targetEntities: { personHints: [], entityHints: ['revisar el informe'] },
            constraints: {}, desiredOutcome: 'Crear compromiso',
            timeConstraints: { rawHint: 'mañana a las 10' }, actor: first.id,
            sourceUtterance: 'Recuérdame revisar el informe mañana a las 10', confidence: 0.75,
            ambiguities: [], source: 'llm' as const,
        };
        service.openObjective({ actorUserId: first.id, dialogueScopeKey: 'plan', objective, turnId: 'p-1', turnSequence: 1 });
        const ready = service.markReadyForAuthorization({ actorUserId: first.id, dialogueScopeKey: 'plan', planDigest: 'digest-1', turnId: 'p-2', turnSequence: 2 });
        expect(ready.lifecycle).toBe('plan_pending_authorization');
        expect(ready.currentPlanDigestRef).toBe('digest-1');

        const corrected = service.applyCorrection({
            actorUserId: first.id, dialogueScopeKey: 'plan', slotName: 'timeConstraints.rawHint',
            previousValue: 'mañana a las 10', newValue: 'el jueves a las 15', reason: 'user_correction',
            turnId: 'p-3', turnSequence: 3,
        });
        expect(corrected.lifecycle).toBe('collecting');
        expect(corrected.currentPlanDigestRef).toBeNull();
        service.reset({ actorUserId: first.id, dialogueScopeKey: 'plan' });
        expect(service.getSnapshot(first.id, 'plan')?.lifecycle).toBe('idle');
        expect(service.getSnapshot(first.id, 'plan')?.openObjective).toBeNull();
    });
});
