import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { RetrievalPerson } from '../src/types/retrieval';

const ACTOR_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const RECIPIENT_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const CONVERSATION_ID = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';

const recipient: RetrievalPerson = {
    kind: 'user',
    id: RECIPIENT_ID,
    displayName: 'Alejandra',
};

const { resolvePersonMock, resolveDirectConversationMock } = vi.hoisted(() => ({
    resolvePersonMock: vi.fn(),
    resolveDirectConversationMock: vi.fn(),
}));

vi.mock('../src/services/retrieval.service', () => ({
    resolvePerson: (...args: unknown[]) => resolvePersonMock(...args),
    resolveDirectConversation: (...args: unknown[]) => resolveDirectConversationMock(...args),
    retrieveCommitments: vi.fn(async () => []),
    retrieveCommitmentProposals: vi.fn(async () => []),
    retrieveVisibleCommitmentById: vi.fn(async () => null),
}));

import { DeterministicObjectiveInterpreter } from '../src/services/agentObjectiveInterpreter.service';
import { runAgentPlanning } from '../src/services/agentPlanOrchestrator.service';

const objectiveInterpreter = new DeterministicObjectiveInterpreter();

beforeEach(() => {
    resolvePersonMock.mockReset();
    resolveDirectConversationMock.mockReset();
});

describe('runAgentPlanning: global recipient/conversation resolution', () => {
    it('finaliza ready_for_authorization con ids canónicos y el contenido exacto', async () => {
        resolvePersonMock.mockResolvedValue({ resolved: recipient, ambiguous: false, candidates: [] });
        resolveDirectConversationMock.mockResolvedValue({
            conversationId: CONVERSATION_ID,
            ambiguous: false,
            candidateCount: 1,
        });

        const plan = await runAgentPlanning({
            actorUserId: ACTOR_ID,
            input: 'Dile a Alejandra que llegaré tarde.',
            now: new Date('2026-09-09T12:00:00.000Z'),
        }, { objectiveInterpreter });

        expect(plan.status).toBe('ready_for_authorization');
        expect(plan.canExecute).toBe(true);
        expect(plan.steps).toHaveLength(1);
        expect(plan.steps[0]).toMatchObject({
            toolId: 'send_message',
            arguments: {
                conversationId: CONVERSATION_ID,
                recipientPersonId: RECIPIENT_ID,
                content: 'llegaré tarde.',
            },
        });
        expect(plan.planDigest).toBeTruthy();
    });

    it('mantiene needs_clarification cuando coinciden varias personas', async () => {
        resolvePersonMock.mockResolvedValue({
            resolved: null,
            ambiguous: true,
            candidates: [recipient, { ...recipient, id: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd' }],
        });

        const plan = await runAgentPlanning({
            actorUserId: ACTOR_ID,
            input: 'Dile a Alejandra que llegaré tarde.',
        }, { objectiveInterpreter });

        expect(plan.status).toBe('needs_clarification');
        expect(plan.canExecute).toBe(false);
        expect(plan.steps).toEqual([]);
        expect(plan.unresolvedInputs[0]?.field).toBe('recipient');
        expect(resolveDirectConversationMock).not.toHaveBeenCalled();
    });

    it('no produce un plan listo cuando la persona no tiene conversación directa autorizada', async () => {
        resolvePersonMock.mockResolvedValue({ resolved: recipient, ambiguous: false, candidates: [] });
        resolveDirectConversationMock.mockResolvedValue({
            conversationId: null,
            ambiguous: false,
            candidateCount: 0,
        });

        const plan = await runAgentPlanning({
            actorUserId: ACTOR_ID,
            input: 'Dile a Alejandra que llegaré tarde.',
        }, { objectiveInterpreter });

        expect(plan.status).toBe('needs_clarification');
        expect(plan.canExecute).toBe(false);
        expect(plan.steps).toEqual([]);
        expect(plan.unresolvedInputs[0]?.field).toBe('conversation');
    });

    it('con currentConversationId conserva el flujo contextual y no ejecuta resolución global', async () => {
        resolvePersonMock.mockResolvedValue({ resolved: recipient, ambiguous: false, candidates: [] });

        const plan = await runAgentPlanning({
            actorUserId: ACTOR_ID,
            input: 'Dile a Alejandra que llegaré tarde.',
            conversationId: CONVERSATION_ID,
        }, { objectiveInterpreter });

        expect(plan.status).toBe('ready_for_authorization');
        expect(plan.steps[0]?.arguments).toMatchObject({ conversationId: CONVERSATION_ID });
        expect(resolveDirectConversationMock).not.toHaveBeenCalled();
    });
});
