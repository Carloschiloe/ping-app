import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
    LlmInputInterpreter,
    type AgentInputModel,
} from '../src/services/agentInputInterpreter.service';
import {
    LlmObjectiveInterpreter,
    type AgentObjectiveModel,
} from '../src/services/agentObjectiveInterpreter.service';

vi.mock('../src/services/retrieval.service', () => ({
    resolvePerson: vi.fn(async () => ({ resolved: null, ambiguous: false, candidates: [] })),
    resolveDirectConversation: vi.fn(async () => ({ conversationId: null, ambiguous: false, candidateCount: 0 })),
    retrieveCommitments: vi.fn(async () => []),
    retrieveCommitmentProposals: vi.fn(async () => []),
    retrieveCommitmentEvents: vi.fn(async () => []),
    retrieveMessages: vi.fn(async () => []),
    retrieveTranscriptions: vi.fn(async () => []),
    retrieveAttachments: vi.fn(async () => []),
    retrieveVisibleCommitmentById: vi.fn(async () => null),
    dedupeProvenance: (items: unknown[]) => items,
}));

vi.mock('../src/services/memory.service', () => ({
    retrieveMemory: vi.fn(async () => []),
    ingestMemoryFromEvent: vi.fn(async () => undefined),
}));

const ACTOR = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const CONVERSATION = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

function unavailableInputModel(): AgentInputModel {
    return {
        modelName: 'controlled-provider-failure',
        timeoutMs: 100,
        interpret: async () => { throw new Error('controlled_provider_failure'); },
    };
}

function unavailableObjectiveModel(): AgentObjectiveModel {
    return {
        modelName: 'controlled-provider-failure',
        timeoutMs: 100,
        interpret: async () => { throw new Error('controlled_provider_failure'); },
    };
}

describe('continuidad de compromiso cuando falla el proveedor semántico', () => {
    beforeEach(async () => {
        vi.resetModules();
        const { clearAgentDialogueStateForTests } = await import('../src/services/agentDialogueState.service');
        clearAgentDialogueStateForTests();
    });

    it('conserva título y fecha y llega a una propuesta sin ejecutar', async () => {
        const { runAgentTurn } = await import('../src/services/agentTurn.service');
        const { AgentDialogueStateService, buildDialogueScopeKey } = await import('../src/services/agentDialogueState.service');
        const dialogueService = new AgentDialogueStateService();
        const inputInterpreter = new LlmInputInterpreter({ model: unavailableInputModel() });
        const objectiveInterpreter = new LlmObjectiveInterpreter({ model: unavailableObjectiveModel() });
        const options = {
            dialogueService,
            inputInterpreter,
            objectiveInterpreter,
            now: new Date('2026-10-27T12:00:00.000Z'),
            timezone: 'America/Santiago',
            locale: 'es-CL',
        };

        const turn = (input: string) => runAgentTurn({ actorUserId: ACTOR, conversationId: CONVERSATION, input, channel: 'mobile', timezone: 'America/Santiago', locale: 'es-CL' }, options);
        const first = await turn('Crea un compromiso para mañana');
        expect(first.kind).toBe('clarification');
        const second = await turn('Comprar materiales');
        expect(second.kind).toBe('clarification');
        if (second.kind === 'clarification') expect(second.questions.map((question) => question.field)).toEqual(['time']);

        const third = await turn('A las diez');
        expect(third.kind).toBe('plan');
        if (third.kind === 'plan') {
            expect(third.confirmationState).toBe('required');
            expect(third.plan.steps).toHaveLength(1);
            expect(third.plan.steps[0]?.toolId).toBe('create_commitment');
            expect(third.presentation.stepPresentations[0]?.targetLabel).toBe('Comprar materiales');
            expect(third.presentation.stepPresentations[0]?.dateLabel).toContain('10:00');
        }
        const state = dialogueService.getSnapshot(ACTOR, buildDialogueScopeKey({ conversationId: CONVERSATION, surface: 'mobile' }));
        expect(state?.openObjective?.targetEntities.entityHints).toEqual(['Comprar materiales']);
        expect(state?.currentPlanDigestRef).toBeTruthy();
    });

    it.each([
        ['consulta', '¿Qué tengo mañana?'],
        ['negación', 'No, no lo agendes'],
        ['cancelación', 'Cancelar'],
        ['cambio de tema', '¿Qué tiempo hará?'],
    ])('%s no rellena el título ni crea una operación', async (_label, answer) => {
        const { runAgentTurn } = await import('../src/services/agentTurn.service');
        const { AgentDialogueStateService, buildDialogueScopeKey } = await import('../src/services/agentDialogueState.service');
        const dialogueService = new AgentDialogueStateService();
        const options = {
            dialogueService,
            inputInterpreter: new LlmInputInterpreter({ model: unavailableInputModel() }),
            objectiveInterpreter: new LlmObjectiveInterpreter({ model: unavailableObjectiveModel() }),
            now: new Date('2026-10-27T12:00:00.000Z'),
        };
        const conversationId = `cccccccc-cccc-4ccc-8ccc-${'c'.repeat(11)}${String(_label.length).padStart(1, '0')}`.slice(0, 36);
        const input = (content: string) => runAgentTurn({
            actorUserId: ACTOR, conversationId, input: content, channel: 'mobile',
            timezone: 'America/Santiago', locale: 'es-CL',
        }, options);

        const first = await input('Crea un compromiso para mañana');
        expect(first.kind).toBe('clarification');
        const result = await input(answer);
        expect(result.kind).not.toBe('plan');
        const state = dialogueService.getSnapshot(ACTOR, buildDialogueScopeKey({ conversationId, surface: 'mobile_text' }));
        expect(state?.openObjective?.targetEntities.entityHints ?? []).toEqual([]);
    });
});
