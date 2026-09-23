import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
    DeterministicInputInterpreter,
    LlmInputInterpreter,
} from '../src/services/agentInputInterpreter.service';
import { buildAgentContext } from '../src/services/agentContextBuilder.service';

vi.mock('../src/services/retrieval.service', () => ({
    resolvePerson: vi.fn(),
    retrieveCommitments: vi.fn(),
    retrieveCommitmentProposals: vi.fn(),
    retrieveCommitmentEvents: vi.fn(),
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
const TOMORROW = commitment('cm-tomorrow', 'verificar el audio de PING', '2026-09-23T11:00:00.000Z');
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
