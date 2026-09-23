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
});
