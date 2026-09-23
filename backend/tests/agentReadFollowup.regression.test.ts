// M-7: focused wiring regression, not proof of live Supabase retrieval.
// A prior, actor-visible canonical commitment is the only source of the date.
// The second request does not repeat its title; Core must recover the scoped
// referent and query canonical evidence again, never assume an earlier answer
// itself authorizes a date. No real network, secrets or writes are used.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { clearAgentDialogueStateForTests } from '../src/services/agentDialogueState.service';
import { clearReadFollowupReferentsForTests, resolveVerifiedReadFollowup } from '../src/services/agentReadFollowupReferent.service';
import { DeterministicInputInterpreter } from '../src/services/agentInputInterpreter.service';
import type { RunAgentTurnOptions } from '../src/services/agentTurnCore.service';

const { buildContextMock, synthesizeMock } = vi.hoisted(() => ({
    buildContextMock: vi.fn(),
    synthesizeMock: vi.fn(),
}));

vi.mock('../src/services/agentPlanOrchestrator.service', () => ({
    resolveDeterministicRouting: vi.fn(async () => ({ isWriteActionRequest: false, resolvedObjective: null })),
    runAgentPlanning: vi.fn(),
}));
vi.mock('../src/services/agentContextBuilder.service', () => ({
    buildAgentContext: (...args: unknown[]) => buildContextMock(...args),
}));
vi.mock('../src/services/agentResponseSynthesizer.service', () => ({
    synthesizeAgentResponse: (...args: unknown[]) => synthesizeMock(...args),
    realizeAgentClarification: vi.fn(),
}));

const { runAgentTurn } = await import('../src/services/agentTurn.service');
const ACTOR = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const OTHER = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const CONVERSATION = '11111111-1111-4111-8111-111111111111';
const OTHER_CONVERSATION = '22222222-2222-4222-8222-222222222222';
const TITLE = 'Ver Spiderman';
const COMPLETED_AT = '2026-09-11T23:00:00.000Z';

beforeEach(() => {
    clearAgentDialogueStateForTests();
    clearReadFollowupReferentsForTests();
    buildContextMock.mockReset().mockImplementation(async (input: { actorUserId: string; input: string; conversationId?: string }) => {
        // Fake of canonical retrieval: evidence is accessible ONLY to ACTOR
        // in CONVERSATION and ONLY when the builder is given a query naming
        // the target. Returning the same date for all queries would hide
        // the exact missing-context bug this test is meant to reproduce.
        const hasEvidence = input.actorUserId === ACTOR
            && input.conversationId === CONVERSATION
            && input.input.includes(TITLE);
        return {
            intent: { type: 'commitment_query', confidence: 1 },
            wantsOverdueFocus: false,
            needsClarification: false,
            clarification: null,
            capabilityGaps: [],
            evidenceFound: hasEvidence,
            commitments: hasEvidence ? [{
                id: '33333333-3333-4333-8333-333333333333', title: TITLE,
                status: 'resolved', resolvedAt: COMPLETED_AT,
                provenance: { sourceType: 'commitment', sourceId: '33333333-3333-4333-8333-333333333333' },
            }] : [],
            events: [], messages: [], transcriptions: [], attachments: [],
        };
    });
    synthesizeMock.mockReset().mockImplementation(async ({ context }: { context: {
        evidenceFound: boolean;
        commitments: Array<{ title: string; resolvedAt: string; id: string }>;
    } }) => ({
        status: context.evidenceFound ? 'answered' : 'no_evidence',
        answer: context.evidenceFound
            ? `${context.commitments[0].title}: ${context.commitments[0].resolvedAt}`
            : 'No encontré evidencia verificable para identificar el compromiso.',
        citations: context.evidenceFound
            ? [{ sourceType: 'commitment', sourceId: context.commitments[0].id }] : [],
        claims: [],
    }));
});

async function read(actorUserId: string, conversationId: string, input: string, options: RunAgentTurnOptions = {}) {
    return runAgentTurn({ actorUserId, conversationId, input, locale: 'es-CL', channel: 'mobile' }, options);
}

describe('M-7: read-only follow-up keeps an authorized referent', () => {
    it('carries the same conversation read context into an unseen voice follow-up', async () => {
        const firstInput = '¿Qué tengo que hacer mañana?';
        const voiceTranscript = '¿Y a qué hora?';
        const baseInterpreter = new DeterministicInputInterpreter();
        const seenContexts: Array<{ input: string; context: any }> = [];
        const inputInterpreter = {
            interpret: async (input: string, context: any) => {
                seenContexts.push({ input, context });
                const interpretation = await baseInterpreter.interpret(input, context);
                return input === voiceTranscript
                    ? {
                        ...interpretation,
                        intent: 'commitment_query' as const,
                        textQuery: null,
                        topicHints: [],
                        priorReferenceIntent: 'single_entity' as const,
                        wantsCommitments: true,
                    }
                    : interpretation;
            },
        };
        buildContextMock.mockImplementation(async (input: any) => {
            const referentFromPriorRead = input.priorReadContext?.commitmentReferents?.[0];
            const hasEvidence = input.input === firstInput || !!referentFromPriorRead;
            return {
                intent: { type: 'commitment_query', confidence: 1 },
                wantsOverdueFocus: false,
                needsClarification: false,
                clarification: null,
                capabilityGaps: [],
                evidenceFound: hasEvidence,
                commitments: hasEvidence ? [{
                    id: 'commitment-m7-tomorrow', title: 'verificar el audio de PING',
                    status: 'accepted', dueAt: '2026-09-23T11:00:00.000Z',
                    provenance: { sourceType: 'commitment', sourceId: 'commitment-m7-tomorrow' },
                }] : [],
                events: [], messages: [], transcriptions: [], attachments: [],
            };
        });

        const first = await read(ACTOR, CONVERSATION, firstInput, { inputInterpreter });
        expect(first.kind).toBe('response');
        const second = await read(ACTOR, CONVERSATION, voiceTranscript, { inputInterpreter });
        expect(second.kind).toBe('response');

        expect(seenContexts).toHaveLength(2);
        expect(seenContexts[0].context.priorReadSummary).toBeNull();
        expect(seenContexts[1].context.priorReadSummary).toMatchObject({
            kind: 'commitment_query', referentCount: 1, uniqueReferent: true,
        });
        expect(seenContexts[1].context.conversationId).toBe(CONVERSATION);
        expect(buildContextMock.mock.calls[1][0].priorReadContext.commitmentReferents).toEqual([
            expect.objectContaining({ canonicalId: 'commitment-m7-tomorrow' }),
        ]);
    }, 10000);

    it('re-queries the uniquely identified commitment when the next turn says only «lo»', async () => {
        const first = await read(ACTOR, CONVERSATION, '¿Qué pasó con Ver Spiderman?');
        expect(first.kind).toBe('response');
        if (first.kind !== 'response') return;
        expect(first.response.status).toBe('answered');
        expect(first.response.citations).toEqual([{ sourceType: 'commitment', sourceId: '33333333-3333-4333-8333-333333333333' }]);
        // Verify the first answer actually saved a title from canonical evidence.
        expect(buildContextMock).toHaveBeenCalledTimes(2);
        expect(await resolveVerifiedReadFollowup({
            actorUserId: ACTOR, conversationId: CONVERSATION, utterance: '¿Y cuándo lo completamos?',
        })).toEqual({ query: '¿Y cuándo lo completamos? Ver Spiderman', sourceId: '33333333-3333-4333-8333-333333333333' });

        const second = await read(ACTOR, CONVERSATION, '¿Y cuándo lo completamos?');
        expect(second.kind).toBe('response');
        if (second.kind !== 'response') return;
        expect(buildContextMock.mock.lastCall?.[0].input).toContain(TITLE);
        expect(second.response.status).toBe('answered');
        expect(second.response.answer).toContain(COMPLETED_AT);
        expect(second.response.citations).toEqual([{
            sourceType: 'commitment', sourceId: '33333333-3333-4333-8333-333333333333',
        }]);
    });

    it('never shares a read referent with another actor or conversation', async () => {
        await read(ACTOR, CONVERSATION, '¿Qué pasó con Ver Spiderman?');
        for (const [actor, conversation] of [
            [OTHER, CONVERSATION], [ACTOR, OTHER_CONVERSATION],
        ] as const) {
            const followUp = await read(actor, conversation, '¿Y cuándo lo completamos?');
            expect(followUp.kind).toBe('response');
            if (followUp.kind !== 'response') continue;
            expect(followUp.response.status).not.toBe('answered');
            expect(followUp.response.citations).toEqual([]);
        }
    });
});
