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

import { DeterministicObjectiveInterpreter, type AgentObjectiveModel } from '../src/services/agentObjectiveInterpreter.service';
import { runAgentPlanning } from '../src/services/agentPlanOrchestrator.service';

const objectiveInterpreter = new DeterministicObjectiveInterpreter();

// M-6 semantic enrichment bridge: "Dile a Alejandra que llegaré tarde." has
// no colon/quote, so the deterministic proposer alone yields no
// communicateContentCandidate (sección: "no que/si/that table") -- the real
// bridge (agentPlanOrchestrator.service.ts) needs a live semantic provider
// to fill that gap. This fake stands in for one, returning the exact
// verbatim substring that already exists in the fixture utterance -- Core
// (validateCommunicateContent) still independently locates/validates it,
// exactly as it would a real provider's response.
function fakeSemanticModel(verbatimMessageHint: string | null): AgentObjectiveModel {
    return {
        modelName: 'test-fake-semantic-model',
        async interpret() {
            return JSON.stringify({ objectiveType: 'communicate_message', verbatimMessageHint });
        },
    };
}

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
        }, { objectiveInterpreter, semanticContentModel: fakeSemanticModel('llegaré tarde.') });

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
        }, { objectiveInterpreter, semanticContentModel: fakeSemanticModel('llegaré tarde.') });

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
        }, { objectiveInterpreter, semanticContentModel: fakeSemanticModel('llegaré tarde.') });

        expect(plan.status).toBe('ready_for_authorization');
        expect(plan.steps[0]?.arguments).toMatchObject({ conversationId: CONVERSATION_ID });
        expect(resolveDirectConversationMock).not.toHaveBeenCalled();
    });
});

describe('runAgentPlanning: M-6 semantic enrichment BRIDGE (deterministic first; semantic enrichment is a HINT stage, never a second source of truth)', () => {
    beforeEach(() => {
        resolvePersonMock.mockReset();
        resolveDirectConversationMock.mockReset();
        resolvePersonMock.mockResolvedValue({ resolved: recipient, ambiguous: false, candidates: [] });
    });

    it('1) deterministic colon/quote path never calls semantic enrichment (no network when a safe candidate already exists)', async () => {
        const enrichModel = vi.fn(async () => JSON.stringify({ objectiveType: 'communicate_message', verbatimMessageHint: 'jamás debería usarse esto' }));
        const plan = await runAgentPlanning({
            actorUserId: ACTOR_ID,
            input: 'Dile a Alejandra: llegaré tarde.',
            conversationId: CONVERSATION_ID,
        }, { objectiveInterpreter, semanticContentModel: { modelName: 'spy', interpret: enrichModel } });

        expect(plan.status).toBe('ready_for_authorization');
        expect(plan.steps[0]?.arguments).toMatchObject({ content: 'llegaré tarde.' });
        expect(enrichModel).not.toHaveBeenCalled();
    });

    it('2) natural Spanish path ("Dile a Alejandra que llegaré tarde.") uses semantic enrichment and reaches ready_for_authorization', async () => {
        const plan = await runAgentPlanning({
            actorUserId: ACTOR_ID,
            input: 'Dile a Alejandra que llegaré tarde.',
            conversationId: CONVERSATION_ID,
        }, { objectiveInterpreter, semanticContentModel: fakeSemanticModel('llegaré tarde.') });

        expect(plan.status).toBe('ready_for_authorization');
        expect(plan.steps[0]?.arguments).toMatchObject({ content: 'llegaré tarde.' });
    });

    it('3) natural English path ("Tell Alejandra that I\'ll be late") uses the same architecture, no English-specific connector rule', async () => {
        // The deterministic person-hint regex only recognizes Spanish "a"/
        // "para" prepositions, so this constructs the objective the same way
        // the real deterministic interpreter would have to for an English
        // sentence with no recognizable preposition -- resolvedObjective lets
        // us exercise the BRIDGE + Core validation in isolation, which is
        // exactly what's being certified here (never a second parser).
        const objective = {
            objectiveType: 'communicate_message' as const,
            targetEntities: { personHints: ['Alejandra'], entityHints: [] },
            constraints: {},
            desiredOutcome: "Tell Alejandra that I'll be late",
            timeConstraints: { rawHint: null },
            actor: ACTOR_ID,
            sourceUtterance: "Tell Alejandra that I'll be late",
            confidence: 0.75,
            ambiguities: [],
            source: 'deterministic' as const,
        };
        const plan = await runAgentPlanning({
            actorUserId: ACTOR_ID,
            input: "Tell Alejandra that I'll be late",
            conversationId: CONVERSATION_ID,
        }, { resolvedObjective: objective, semanticContentModel: fakeSemanticModel("I'll be late") });

        expect(plan.status).toBe('ready_for_authorization');
        expect(plan.steps[0]?.arguments).toMatchObject({ content: "I'll be late" });
    });

    it('4) translated/paraphrased semantic hint is rejected by Core -- never becomes executable content', async () => {
        const plan = await runAgentPlanning({
            actorUserId: ACTOR_ID,
            input: 'Dile a Alejandra que llegaré tarde.',
            conversationId: CONVERSATION_ID,
        }, { objectiveInterpreter, semanticContentModel: fakeSemanticModel('Inform Alejandra that I will arrive late') });

        expect(plan.status).toBe('needs_clarification');
        expect(plan.steps).toEqual([]);
        expect(plan.unresolvedInputs[0]?.field).toBe('messageContent');
    });

    it('5) semantic provider failure (timeout/error/not configured) -> clarification, zero writes, never fabricates a payload', async () => {
        const failingModel: AgentObjectiveModel = {
            modelName: 'failing',
            async interpret() { throw new Error('network down'); },
        };
        const plan = await runAgentPlanning({
            actorUserId: ACTOR_ID,
            input: 'Dile a Alejandra que llegaré tarde.',
            conversationId: CONVERSATION_ID,
        }, { objectiveInterpreter, semanticContentModel: failingModel });

        expect(plan.status).toBe('needs_clarification');
        expect(plan.steps).toEqual([]);
        expect(plan.canExecute).toBe(false);
        expect(plan.unresolvedInputs[0]?.field).toBe('messageContent');
    });

    it('6) existing global recipient resolution remains intact when enrichment supplies the candidate', async () => {
        resolveDirectConversationMock.mockResolvedValue({ conversationId: CONVERSATION_ID, ambiguous: false, candidateCount: 1 });
        const plan = await runAgentPlanning({
            actorUserId: ACTOR_ID,
            input: 'Dile a Alejandra que llegaré tarde.',
        }, { objectiveInterpreter, semanticContentModel: fakeSemanticModel('llegaré tarde.') });

        expect(plan.status).toBe('ready_for_authorization');
        expect(plan.steps[0]?.arguments).toMatchObject({
            recipientPersonId: RECIPIENT_ID,
            conversationId: CONVERSATION_ID,
            content: 'llegaré tarde.',
        });
    });

    it('bridge never alters actor/recipient/conversation/tool: enrichment supplies content ONLY, everything else stays exactly what deterministic/global resolution produced', async () => {
        resolveDirectConversationMock.mockResolvedValue({ conversationId: CONVERSATION_ID, ambiguous: false, candidateCount: 1 });
        const enrichModel = vi.fn(async () => JSON.stringify({
            objectiveType: 'create_commitment_or_proposal', // a hostile/buggy provider trying to change the tool/intent
            personHints: ['SomeoneElse'], // and the recipient
            verbatimMessageHint: 'llegaré tarde.',
        }));
        const plan = await runAgentPlanning({
            actorUserId: ACTOR_ID,
            input: 'Dile a Alejandra que llegaré tarde.',
        }, { objectiveInterpreter, semanticContentModel: { modelName: 'hostile', interpret: enrichModel } });

        // The bridge only ever reads verbatimMessageHint off the response --
        // objectiveType/personHints returned by the "model" are structurally
        // never read by proposeSemanticContentCandidate, so the plan is
        // still exactly the deterministic communicate_message/send_message
        // to the real, already-resolved Alejandra.
        expect(plan.objective.objectiveType).toBe('communicate_message');
        expect(plan.steps[0]?.toolId).toBe('send_message');
        expect(plan.steps[0]?.arguments).toMatchObject({ recipientPersonId: RECIPIENT_ID, conversationId: CONVERSATION_ID });
    });
});
