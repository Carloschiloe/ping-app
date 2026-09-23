import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
    DeterministicInputInterpreter,
    LlmInputInterpreter,
    type AgentInputModel,
    type AgentInputModelRequest,
} from '../src/services/agentInputInterpreter.service';
import { buildAgentContext } from '../src/services/agentContextBuilder.service';
import { interpretAgentSemanticTurn } from '../src/services/agentSemanticInterpreter.service';
import { synthesizeAgentResponse } from '../src/services/agentResponseSynthesizer.service';

vi.mock('../src/services/retrieval.service', () => ({
    resolvePerson: vi.fn(),
    retrieveCommitments: vi.fn(),
    retrieveCommitmentProposals: vi.fn(),
    retrieveCommitmentEvents: vi.fn(),
    retrieveVisibleCommitmentById: vi.fn(),
    retrieveMessages: vi.fn(),
    retrieveTranscriptions: vi.fn(),
    retrieveAttachments: vi.fn(),
    dedupeProvenance: vi.fn((items: any[]) => items),
}));

vi.mock('../src/services/memory.service', () => ({
    retrieveMemory: vi.fn(),
}));

import * as retrievalService from '../src/services/retrieval.service';
import * as memoryService from '../src/services/memory.service';

const retrieveCommitments = vi.mocked(retrievalService.retrieveCommitments);
const retrieveCommitmentProposals = vi.mocked(retrievalService.retrieveCommitmentProposals);
const retrieveCommitmentEvents = vi.mocked(retrievalService.retrieveCommitmentEvents);
const retrieveVisibleCommitmentById = vi.mocked(retrievalService.retrieveVisibleCommitmentById);
const retrieveMessages = vi.mocked(retrievalService.retrieveMessages);
const retrieveTranscriptions = vi.mocked(retrievalService.retrieveTranscriptions);
const retrieveAttachments = vi.mocked(retrievalService.retrieveAttachments);
const resolvePerson = vi.mocked(retrievalService.resolvePerson);
const retrieveMemory = vi.mocked(memoryService.retrieveMemory);

const commitment = (id: string, title: string, dueAt: string) => ({
    id,
    entityType: 'commitment' as const,
    title,
    description: null,
    status: 'accepted' as const,
    type: 'task',
    priority: null,
    dueAt,
    proposedDueAt: null,
    expectedResult: null,
    resolvedAt: null,
    resolutionResult: null,
    rejectionReason: null,
    ownerUserId: 'actor-1',
    assignedToUserId: null,
    counterpartyContactId: null,
    conversationId: null,
    messageId: null,
    createdAt: '2026-09-20T12:00:00.000Z',
    provenance: { sourceType: 'commitment' as const, sourceId: id },
});

const TODAY = commitment('cm-today', 'probar la voz de Ping', '2026-09-22T10:00:00.000Z');
// 14:00Z is 11:00 in America/Santiago on this date. The regression must
// verify presentation in the actor's timezone, not accidentally assert UTC.
const TOMORROW = commitment('cm-tomorrow', 'verificar el audio de PING', '2026-09-23T14:00:00.000Z');
const OVERDUE = commitment('cm-overdue', 'compromiso vencido', '2026-09-14T10:00:00.000Z');
const PROPOSAL = {
    ...commitment('pr-pending', 'propuesta pendiente de aceptacion', '2026-09-24T15:00:00.000Z'),
    entityType: 'commitment_proposal' as const,
    status: 'proposed' as const,
    provenance: { sourceType: 'commitment_proposal' as const, sourceId: 'pr-pending' },
    actorHasApproved: false,
    actorCanRespond: true,
    pendingResponderNamesSafe: [],
    pendingResponderIds: [],
    isFullyApproved: false,
    proposalDatePassed: false,
};

beforeEach(() => {
    resolvePerson.mockReset().mockResolvedValue({ resolved: null, ambiguous: false, candidates: [] });
    retrieveCommitments.mockReset().mockResolvedValue([TODAY, TOMORROW]);
    retrieveCommitmentProposals.mockReset().mockResolvedValue([]);
    retrieveCommitmentEvents.mockReset().mockResolvedValue([]);
    retrieveVisibleCommitmentById.mockReset().mockResolvedValue(null);
    retrieveMessages.mockReset().mockResolvedValue([]);
    retrieveTranscriptions.mockReset().mockResolvedValue([]);
    retrieveAttachments.mockReset().mockResolvedValue([]);
    retrieveMemory.mockReset().mockResolvedValue([]);
});

function useUpcomingDatabaseRows() {
    retrieveCommitments.mockImplementation(async (query) => [OVERDUE, TODAY, TOMORROW].filter((item) => {
        const due = Date.parse(item.dueAt);
        return (!query.timeRange?.from || due >= Date.parse(query.timeRange.from))
            && (!query.timeRange?.to || due <= Date.parse(query.timeRange.to))
            && (!query.statuses || query.statuses.includes(item.status));
    }) as any);
}

describe('M-7 physical regression: broad natural commitment reads use the UI universe', () => {
    it.each([
        'Oye Ping, qué cosas tengo pendiente para los próximos días?',
        'Muéstrame mis pendientes de los próximos días',
        '¿Qué compromisos tengo hoy?',
        '¿Qué pendientes hay mañana?',
    ])('does not turn a broad commitment read into an FTS topic: %s', async (input) => {
        const interpreter = new DeterministicInputInterpreter();
        const interpretation = await interpreter.interpret(input, {});
        const context = await buildAgentContext({
            actorUserId: 'actor-1',
            input,
            now: '2026-09-22T12:00:00.000Z',
            timezone: 'UTC',
            traceId: `m7-regression-${input.slice(0, 8)}`,
        }, { interpreter, interpretation });

        expect(interpretation.intent).toBe('commitment_query');
        expect(interpretation.textQuery).toBeNull();
        expect(context.commitments).toHaveLength(2);
        expect(retrieveCommitments).toHaveBeenCalledWith(expect.objectContaining({ query: undefined }), expect.any(Number));
        expect(context.needsClarification).toBe(false);
    });

    it('keeps a substantive topic as FTS while removing only conversational and temporal scaffolding', async () => {
        const interpretation = await new DeterministicInputInterpreter().interpret(
            'Oye Ping, qué pendientes tengo para los próximos días sobre el proyecto Aurora?',
            {},
        );

        expect(interpretation.textQuery).toBe('proyecto Aurora');
        expect(interpretation.timeExpression).toMatch(/pr[oó]ximos d[ií]as/i);
    });

    it('applies the same boundary when the model suggests noisy textQuery content', async () => {
        const model = {
            modelName: 'm7-test-model',
            interpret: async () => JSON.stringify({
                intent: 'commitment_query',
                personHints: [],
                topicHints: ['Oye Ping cosas próximos días'],
                textQuery: 'Oye Ping cosas próximos días',
                timeExpression: 'próximos días',
                temporalComparison: null,
                urgencyComparison: null,
                requestedSources: ['commitments'],
                commitmentFilterHints: { status: 'open', statusBasis: 'explicit' },
                attachmentKindHints: [],
                ambiguityHints: [],
                wantsOverdueFocus: false,
                proposalFocus: null,
                isWriteActionRequest: false,
            }),
        };

        const interpretation = await new LlmInputInterpreter({ model }).interpret(
            'Oye Ping, qué cosas tengo pendiente para los próximos días?',
            {},
        );

        expect(interpretation.textQuery).toBeNull();
        expect(interpretation.timeExpression).toBe('próximos días');
    });

    it('reproduces the real bug: upcoming days must not become an unbounded mixed read', async () => {
        useUpcomingDatabaseRows();
        retrieveCommitmentProposals.mockResolvedValue([PROPOSAL] as any);

        const input = 'Oye Ping, qué cosas tengo pendientes para los próximos días?';
        const interpreter = new DeterministicInputInterpreter();
        const context = await buildAgentContext({
            actorUserId: 'actor-1',
            input,
            now: '2026-09-22T12:00:00.000Z',
            timezone: 'UTC',
            traceId: 'm7-upcoming-reproduction',
        }, { interpreter, interpretation: await interpreter.interpret(input, {}) });

        expect(context.entities.timeRange).toEqual({
            from: '2026-09-22T12:00:00.000Z',
            to: '2026-09-30T00:00:00.000Z',
        });
        expect(context.commitments.map((item) => item.id)).toEqual(['cm-tomorrow']);
        expect(retrieveCommitments).toHaveBeenCalledWith(expect.objectContaining({
            timeRange: { from: '2026-09-22T12:00:00.000Z', to: '2026-09-30T00:00:00.000Z' },
            statuses: ['accepted'],
            query: undefined,
        }), expect.any(Number));
        expect(retrieveCommitmentProposals).not.toHaveBeenCalled();
    });

    it.each([
        'Mu\u00e9strame mis pendientes de los pr\u00f3ximos d\u00edas',
        'Show my pending items for the next few days',
        'List what is coming in the coming days',
    ])('applies the same future-only range to equivalent wording: %s', async (input) => {
        useUpcomingDatabaseRows();

        const interpreter = new DeterministicInputInterpreter();
        const interpretation = await interpreter.interpret(input, {});
        const context = await buildAgentContext({
            actorUserId: 'actor-1',
            input,
            now: '2026-09-22T12:00:00.000Z',
            timezone: 'UTC',
            traceId: `m7-upcoming-equivalent-${input.slice(0, 5)}`,
        }, { interpreter, interpretation });

        expect(interpretation.timeExpression).not.toBeNull();
        expect(context.entities.timeRange).toEqual({
            from: '2026-09-22T12:00:00.000Z',
            to: '2026-09-30T00:00:00.000Z',
        });
        expect(context.commitments.map((item) => item.id)).toEqual(['cm-tomorrow']);
        expect(retrieveCommitmentProposals).not.toHaveBeenCalled();
    });

    it('keeps overdue and approval lifecycle queries on their distinct semantic paths', async () => {
        retrieveCommitments.mockResolvedValue([OVERDUE] as any);
        retrieveCommitmentProposals.mockResolvedValue([]);

        const overdueInput = 'Mu\u00e9strame mis compromisos vencidos';
        const overdueInterpreter = new DeterministicInputInterpreter();
        const overdueContext = await buildAgentContext({
            actorUserId: 'actor-1',
            input: overdueInput,
            now: '2026-09-22T12:00:00.000Z',
            timezone: 'UTC',
            traceId: 'm7-overdue-classification',
        }, { interpreter: overdueInterpreter, interpretation: await overdueInterpreter.interpret(overdueInput, {}) });
        expect(overdueContext.commitments.map((item) => item.id)).toEqual(['cm-overdue']);
        expect(overdueContext.wantsOverdueFocus).toBe(true);
        expect(retrieveCommitmentProposals).not.toHaveBeenCalled();

        retrieveCommitments.mockResolvedValue([]);
        retrieveCommitmentProposals.mockResolvedValue([PROPOSAL] as any);
        const proposalInput = 'Qu\u00e9 tengo por aceptar?';
        const proposalInterpreter = new DeterministicInputInterpreter();
        const proposalContext = await buildAgentContext({
            actorUserId: 'actor-1',
            input: proposalInput,
            now: '2026-09-22T12:00:00.000Z',
            timezone: 'UTC',
            traceId: 'm7-proposal-classification',
        }, { interpreter: proposalInterpreter, interpretation: await proposalInterpreter.interpret(proposalInput, {}) });
        expect(proposalContext.commitments.map((item) => item.id)).toEqual(['pr-pending']);
        expect(proposalContext.commitments[0].entityType).toBe('commitment_proposal');
        expect(proposalContext.proposalFocus).toBe('needs_my_response');
    });

    it('preserves the repaired substantive FTS topic inside the future range', async () => {
        useUpcomingDatabaseRows();
        const input = 'Oye Ping, qu\u00e9 pendientes tengo para los pr\u00f3ximos d\u00edas sobre el proyecto Aurora?';
        const interpreter = new DeterministicInputInterpreter();
        const context = await buildAgentContext({
            actorUserId: 'actor-1',
            input,
            now: '2026-09-22T12:00:00.000Z',
            timezone: 'UTC',
            traceId: 'm7-upcoming-fts',
        }, { interpreter, interpretation: await interpreter.interpret(input, {}) });

        expect(context.commitments.map((item) => item.id)).toEqual(['cm-tomorrow']);
        expect(retrieveCommitments).toHaveBeenCalledWith(expect.objectContaining({
            query: 'proyecto Aurora',
            timeRange: { from: '2026-09-22T12:00:00.000Z', to: '2026-09-30T00:00:00.000Z' },
            statuses: ['accepted'],
        }), expect.any(Number));
    });

    it.each([
        ['¿Qué se me viene durante esta semana?', '2026-09-22T12:00:00.000Z', '2026-09-28T00:00:00.000Z'],
        ['¿Tengo algo que cumplir en los días que siguen?', '2026-09-22T12:00:00.000Z', '2026-09-30T00:00:00.000Z'],
        ['Muéstrame lo que vence dentro de cinco días', '2026-09-22T12:00:00.000Z', '2026-09-28T00:00:00.000Z'],
    ])('resolves novel future wording through a semantic temporal range: %s', async (input, from, to) => {
        useUpcomingDatabaseRows();
        const interpreter = new DeterministicInputInterpreter();
        const interpretation = await interpreter.interpret(input, {});
        const context = await buildAgentContext({
            actorUserId: 'actor-1',
            input,
            now: '2026-09-22T12:00:00.000Z',
            timezone: 'UTC',
            traceId: `m7-novel-temporal-${from}`,
        }, { interpreter, interpretation });

        expect(interpretation.temporalIntent).toBeTruthy();
        expect(context.entities.timeRange).toEqual({ from, to });
        expect(context.commitments.map((item) => item.id)).toEqual(['cm-tomorrow']);
        expect(retrieveCommitments).toHaveBeenCalledWith(expect.objectContaining({
            timeRange: { from, to },
            statuses: ['accepted'],
            query: undefined,
        }), expect.any(Number));
        expect(retrieveCommitmentProposals).not.toHaveBeenCalled();
    });

    it('uses the LLM semantic temporal object for wording outside deterministic examples', async () => {
        useUpcomingDatabaseRows();
        const model = {
            modelName: 'm7-temporal-semantics-test',
            interpret: async () => JSON.stringify({
                intent: 'general_context', personHints: [], topicHints: [],
                textQuery: null, timeExpression: 'my near horizon',
                temporalIntent: { kind: 'relative_days', daysAhead: 5, futureOnly: true },
                temporalComparison: null, urgencyComparison: null,
                requestedSources: ['commitments'],
                commitmentFilterHints: { status: null, statusBasis: null },
                attachmentKindHints: [], ambiguityHints: [], wantsOverdueFocus: false,
                proposalFocus: null, isWriteActionRequest: false,
            }),
        };
        const input = 'Surface obligations in my near horizon';
        const interpreter = new LlmInputInterpreter({ model });
        const interpretation = await interpreter.interpret(input, {});
        const context = await buildAgentContext({
            actorUserId: 'actor-1', input, now: '2026-09-22T12:00:00.000Z', timezone: 'UTC', traceId: 'm7-llm-temporal-object',
        }, { interpreter, interpretation });

        expect(interpretation.temporalIntent).toEqual({ kind: 'relative_days', daysAhead: 5, futureOnly: true });
        expect(context.entities.timeRange).toEqual({ from: '2026-09-22T12:00:00.000Z', to: '2026-09-28T00:00:00.000Z' });
        expect(context.commitments.map((item) => item.id)).toEqual(['cm-tomorrow']);
    });
});

describe('M-7 conversational continuity: a singular follow-up keeps the authorized entity', () => {
    it('re-authorizes the prior canonical commitment by id and never broadens to proposals or unrelated commitments', async () => {
        const interpreter = new DeterministicInputInterpreter();
        retrieveCommitments.mockResolvedValue([TOMORROW] as any);
        const firstInput = 'Oye Ping, ¿qué cosas tengo pendientes para los próximos días?';
        const first = await buildAgentContext({
            actorUserId: 'actor-1', input: firstInput, now: '2026-09-22T12:00:00.000Z',
            timezone: 'America/Santiago', traceId: 'm7-continuity-first',
        }, { interpreter, interpretation: await interpreter.interpret(firstInput, {}) });

        retrieveCommitments.mockClear();
        retrieveCommitmentProposals.mockClear();
        retrieveVisibleCommitmentById.mockClear();

        const priorReadContext = {
            kind: 'commitment_query' as const,
            timeRange: first.entities.timeRange,
            sourceTurnId: 'm7-continuity-first',
            commitmentReferents: [{ rawText: TOMORROW.title, entityType: 'commitment' as const, canonicalId: TOMORROW.id }],
            statuses: ['accepted' as const],
        };
        retrieveVisibleCommitmentById.mockResolvedValue(TOMORROW as any);
        retrieveCommitments.mockResolvedValue([OVERDUE, TODAY, TOMORROW] as any);
        retrieveCommitmentProposals.mockResolvedValue([PROPOSAL] as any);

        const followInput = '¿Y a qué hora tengo que hacerlo?';
        const follow = await buildAgentContext({
            actorUserId: 'actor-1', input: followInput, now: '2026-09-22T12:00:00.000Z',
            timezone: 'America/Santiago', traceId: 'm7-continuity-follow', priorReadContext,
        }, { interpreter, interpretation: await interpreter.interpret(followInput, {}) });

        expect(retrieveVisibleCommitmentById).toHaveBeenCalledWith('actor-1', TOMORROW.id);
        expect(retrieveCommitments).not.toHaveBeenCalled();
        expect(retrieveCommitmentProposals).not.toHaveBeenCalled();
        expect(follow.commitments.map((item) => item.id)).toEqual([TOMORROW.id]);
        expect(follow.commitments[0].dueAt).toBe(TOMORROW.dueAt);
        expect(follow.needsClarification).toBe(false);
    });

    it('does not guess when the prior result contains multiple possible referents', async () => {
        const interpreter = new DeterministicInputInterpreter();
        const followInput = '¿Y a qué hora tengo que hacerlo?';
        const context = await buildAgentContext({
            actorUserId: 'actor-1', input: followInput, now: '2026-09-22T12:00:00.000Z',
            timezone: 'America/Santiago', traceId: 'm7-continuity-ambiguous',
            priorReadContext: {
                kind: 'commitment_query', timeRange: null, sourceTurnId: 'm7-prior',
                commitmentReferents: [
                    { rawText: 'probar la voz de Ping', entityType: 'commitment' },
                    { rawText: 'verificar el audio de PING', entityType: 'commitment' },
                ], statuses: ['accepted'],
            },
        }, { interpreter, interpretation: await interpreter.interpret(followInput, {}) });

        expect(context.needsClarification).toBe(true);
        expect(context.commitments).toEqual([]);
        expect(retrieveVisibleCommitmentById).not.toHaveBeenCalled();
        expect(retrieveCommitments).not.toHaveBeenCalled();
        expect(retrieveCommitmentProposals).not.toHaveBeenCalled();
    });

    it('lets an explicit new topic replace the previous referent instead of inheriting it', async () => {
        const interpreter = new DeterministicInputInterpreter();
        retrieveCommitments.mockResolvedValue([OVERDUE] as any);
        const input = '¿Qué compromisos tengo sobre terreno?';
        const context = await buildAgentContext({
            actorUserId: 'actor-1', input, now: '2026-09-22T12:00:00.000Z',
            timezone: 'America/Santiago', traceId: 'm7-continuity-topic-change',
            priorReadContext: {
                kind: 'commitment_query', timeRange: null, sourceTurnId: 'm7-prior',
                commitmentReferents: [{ rawText: 'verificar el audio de PING', entityType: 'commitment', canonicalId: TOMORROW.id }],
                statuses: ['accepted'],
            },
        }, { interpreter, interpretation: await interpreter.interpret(input, {}) });

        expect(retrieveVisibleCommitmentById).not.toHaveBeenCalled();
        expect(retrieveCommitments).toHaveBeenCalledWith(expect.objectContaining({ query: 'terreno' }), expect.any(Number));
        expect(context.commitments.map((item) => item.id)).toEqual([OVERDUE.id]);
    });

    it('passes structural prior-read context to the semantic interpreter for text and voice transcripts', async () => {
        const conversationId = 'conversation-m7-continuity';
        const priorReadSummary = {
            kind: 'commitment_query' as const,
            referentCount: 1,
            uniqueReferent: true,
            entityTypes: ['commitment' as const],
            hasTimeRange: true,
        };
        const priorReadContext = {
            kind: 'commitment_query' as const,
            timeRange: { from: '2026-09-23T00:00:00.000Z', to: '2026-09-24T00:00:00.000Z' },
            sourceTurnId: 'm7-first-turn',
            commitmentReferents: [{ rawText: TOMORROW.title, entityType: 'commitment' as const, canonicalId: TOMORROW.id }],
            statuses: ['accepted' as const],
        };
        const requests: AgentInputModelRequest[] = [];
        const model: AgentInputModel = {
            modelName: 'm7-context-aware-test-model',
            interpret: vi.fn(async (request) => {
                requests.push(request);
                return JSON.stringify({
                    intent: 'general_context', personHints: [], topicHints: [], textQuery: null,
                    timeExpression: null, temporalIntent: null, priorReferenceIntent: null, followUpAttribute: 'time',
                    temporalComparison: null, urgencyComparison: null, requestedSources: ['commitments'],
                    commitmentFilterHints: { status: null, statusBasis: null }, attachmentKindHints: [],
                    ambiguityHints: [], wantsOverdueFocus: false, proposalFocus: null, isWriteActionRequest: false,
                });
            }),
        };
        const interpreter = new LlmInputInterpreter({ model });
        const utterances = [
            { input: '¿Y a qué hora?', channel: 'mobile' },
            { input: '¿Y a qué hora?', channel: 'mobile' }, // voice transcript reaches the same semantic boundary
        ];

        for (const utterance of utterances) {
            const semantic = await interpretAgentSemanticTurn(utterance.input, {
                actorUserId: 'actor-1', conversationId, channel: utterance.channel,
                priorReadSummary,
            }, { inputInterpreter: interpreter });
            expect(semantic.route).toBe('read');
            expect(semantic.interpretation.followUpAttribute).toBe('time');
            expect(semantic.interpretation.priorReferenceIntent).toBeNull();

            retrieveVisibleCommitmentById.mockResolvedValue(TOMORROW as any);
            const follow = await buildAgentContext({
                actorUserId: 'actor-1', input: utterance.input, conversationId,
                now: '2026-09-22T12:00:00.000Z', timezone: 'America/Santiago',
                traceId: `m7-continuity-${utterance.channel}`,
                priorReadContext,
            }, { interpretation: semantic.interpretation });
            expect(follow.needsClarification).toBe(false);
            expect(follow.followUpAttribute).toBe('time');
            expect(follow.commitments.map((item) => item.id)).toEqual([TOMORROW.id]);
            expect(follow.commitments[0].dueAt).toBe(TOMORROW.dueAt);
            const model = {
                modelName: 'must-not-run-for-canonical-follow-up',
                synthesize: vi.fn(async () => JSON.stringify({
                    answer: '13:00', claims: [{ text: '13:00', sourceRefs: [TOMORROW.provenance] }],
                })),
            };
            const response = await synthesizeAgentResponse({
                input: utterance.input, context: follow, locale: 'es-CL', channel: utterance.channel,
            }, { model });
            expect(response.answer).toContain('11:00');
            expect(response.answer).not.toContain('13:00');
            expect(response.citations).toEqual([TOMORROW.provenance]);
            expect(model.synthesize).not.toHaveBeenCalled();
            retrieveVisibleCommitmentById.mockClear();
            retrieveCommitments.mockClear();
            retrieveCommitmentProposals.mockClear();
        }

        expect(requests).toHaveLength(2);
        for (const request of requests) {
            expect(request.context.conversationId).toBe(conversationId);
            expect(request.context.priorReadSummary).toEqual(priorReadSummary);
            expect(JSON.stringify(request.context)).not.toContain(TOMORROW.id);
            expect(JSON.stringify(request.context)).not.toContain(TOMORROW.title);
        }
    });

    it.each([
        '¿Y para qué día quedó?',
        '¿Quién se encarga?',
        '¿Sigue pendiente?',
        'Cuéntame un poco más.',
    ])('reuses one authorized referent for an unseen attribute follow-up: %s', async (input) => {
        const interpretation = {
            ...(await new DeterministicInputInterpreter().interpret(input, {})),
            intent: 'commitment_query' as const,
            priorReferenceIntent: 'single_entity' as const,
            textQuery: null,
            topicHints: [],
            wantsCommitments: true,
        };
        retrieveVisibleCommitmentById.mockResolvedValue(TOMORROW as any);
        const context = await buildAgentContext({
            actorUserId: 'actor-1', input, conversationId: 'conversation-m7-continuity',
            now: '2026-09-22T12:00:00.000Z', timezone: 'America/Santiago', traceId: 'm7-attribute-follow-up',
            priorReadContext: {
                kind: 'commitment_query', timeRange: null, sourceTurnId: 'm7-first-turn',
                commitmentReferents: [{ rawText: TOMORROW.title, entityType: 'commitment', canonicalId: TOMORROW.id }],
                statuses: ['accepted'],
            },
        }, { interpretation });

        expect(context.needsClarification).toBe(false);
        expect(context.commitments).toHaveLength(1);
        expect(context.commitments[0].id).toBe(TOMORROW.id);
        expect(retrieveVisibleCommitmentById).toHaveBeenCalledWith('actor-1', TOMORROW.id);
        expect(retrieveCommitments).not.toHaveBeenCalled();
        expect(retrieveCommitmentProposals).not.toHaveBeenCalled();
    });
});
