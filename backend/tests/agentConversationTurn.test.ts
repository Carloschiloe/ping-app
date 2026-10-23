import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createSupabaseAdminMock, setSupabaseAdminMock, supabaseAdminMockModule } from './helpers/supabaseMock';

vi.mock('../src/lib/supabaseAdmin', () => supabaseAdminMockModule());

const ACTOR_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const CONVERSATION_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

function seedPersistence(response: { data: any; error: any }) {
    const db = createSupabaseAdminMock({
        conversation_participants: [{ data: { conversation_id: CONVERSATION_ID }, error: null }],
        'rpc:persist_agent_conversation_turn': [response],
    });
    setSupabaseAdminMock(db);
    return db;
}

const result = { kind: 'response', response: { status: 'answered', text: 'ok', citations: [] } } as any;

describe('Agent conversation persistence', () => {
    beforeEach(() => {
        vi.resetModules();
    });

    it('trims durable keys/text and preserves the idempotent replay flag from Core', async () => {
        const db = seedPersistence({
            data: [{ turn_id: 'turn-1', idempotent_replay: true, created_at: '2026-10-22T19:00:00.000Z' }],
            error: null,
        });
        const { persistAgentConversationTurn } = await import('../src/services/agentConversationTurn.service');

        const persisted = await persistAgentConversationTurn({
            actorUserId: ACTOR_ID,
            conversationId: CONVERSATION_ID,
            clientTurnKey: '  client-turn-1  ',
            inputText: '  ¿Qué compromisos tengo?  ',
            inputMode: 'text',
            result,
        });

        expect(persisted).toMatchObject({ turnId: 'turn-1', idempotentReplay: true });
        expect(db.getRpcCalls()[0]).toMatchObject({
            name: 'persist_agent_conversation_turn',
            args: {
                p_client_turn_key: 'client-turn-1',
                p_input_text: '¿Qué compromisos tengo?',
                p_result_kind: 'response',
            },
        });
        expect(db.getRpcCalls()[0]?.args.p_request_fingerprint).toMatch(/^[a-f0-9]{64}$/);
        expect(db.getRpcCalls()[0]?.args.p_result.__pingAgentHistory).toEqual({ dialogueConversationId: null });
    });

    it('persists semantic scope separately from the durable history conversation', async () => {
        const db = seedPersistence({
            data: [{ turn_id: 'turn-scoped', idempotent_replay: false, created_at: '2026-10-22T19:00:00.000Z' }],
            error: null,
        });
        const { persistAgentConversationTurn } = await import('../src/services/agentConversationTurn.service');

        await persistAgentConversationTurn({
            actorUserId: ACTOR_ID,
            conversationId: CONVERSATION_ID,
            dialogueConversationId: CONVERSATION_ID,
            clientTurnKey: 'client-turn-scoped',
            inputText: '¿Qué hablamos aquí?',
            inputMode: 'text',
            result,
        });

        expect(db.getRpcCalls()[0]?.args.p_result.__pingAgentHistory).toEqual({
            dialogueConversationId: CONVERSATION_ID,
        });
    });

    it('maps same-key/different-content conflicts to a retry-safe 409', async () => {
        const db = seedPersistence({
            data: null,
            error: { code: 'P0003', message: 'different content' },
        });
        const { persistAgentConversationTurn } = await import('../src/services/agentConversationTurn.service');

        await expect(persistAgentConversationTurn({
            actorUserId: ACTOR_ID,
            conversationId: CONVERSATION_ID,
            clientTurnKey: 'client-turn-1',
            inputText: '¿Qué compromisos tengo?',
            inputMode: 'text',
            result,
        })).rejects.toMatchObject({ statusCode: 409 });
        expect(db.getRpcCalls()).toHaveLength(1);
    });

    it('retries transient persistence failures because the RPC is idempotent', async () => {
        // The mock repeats the last response by default; use a fresh client
        // so the second attempt can succeed deterministically.
        const retryDb = createSupabaseAdminMock({
            conversation_participants: [{ data: { conversation_id: CONVERSATION_ID }, error: null }],
            'rpc:persist_agent_conversation_turn': [
                { data: null, error: { code: '08006', message: 'connection reset by peer' } },
                { data: [{ turn_id: 'turn-retried', idempotent_replay: false, created_at: '2026-10-22T19:00:00.000Z' }], error: null },
            ],
        });
        setSupabaseAdminMock(retryDb);
        const { persistAgentConversationTurn } = await import('../src/services/agentConversationTurn.service');

        await expect(persistAgentConversationTurn({
            actorUserId: ACTOR_ID,
            conversationId: CONVERSATION_ID,
            clientTurnKey: 'client-turn-retry',
            inputText: 'Recuérdame llamar mañana',
            inputMode: 'text',
            result,
        })).resolves.toMatchObject({ turnId: 'turn-retried' });

        expect(retryDb.getRpcCalls()).toHaveLength(2);
    });

    it('retries a transient read-context failure after restart before dropping continuity', async () => {
        const retryDb = createSupabaseAdminMock({
            conversation_participants: [{ data: { conversation_id: CONVERSATION_ID }, error: null }],
            agent_conversation_turns: [
                { data: null, error: { code: '08006', message: 'connection reset by peer' } },
                {
                    data: [{
                        id: 'turn-read-1',
                        result_kind: 'response',
                        result: {
                            kind: 'response',
                            response: {
                                status: 'answered',
                                citations: [{ sourceType: 'commitment', sourceId: 'commitment-1' }],
                            },
                        },
                    }],
                    error: null,
                },
            ],
        });
        setSupabaseAdminMock(retryDb);
        const { loadLatestAgentReadContext } = await import('../src/services/agentConversationTurn.service');

        await expect(loadLatestAgentReadContext(ACTOR_ID, CONVERSATION_ID)).resolves.toMatchObject({
            kind: 'commitment_query',
            commitmentReferents: [{ entityType: 'commitment', canonicalId: 'commitment-1' }],
        });
        expect(retryDb.getCalledTables()).toEqual([
            'conversation_participants',
            'agent_conversation_turns',
            'agent_conversation_turns',
        ]);
    });

    it('retries resolving the source plan before projecting an execution event', async () => {
        const retryDb = createSupabaseAdminMock({
            conversation_participants: [{ data: { conversation_id: CONVERSATION_ID }, error: null }],
            agent_conversation_turns: [
                { data: null, error: { code: '08006', message: 'connection reset by peer' } },
                {
                    data: {
                        input_text: 'Crea el compromiso de llamar mañana',
                        input_mode: 'text',
                        result: {
                            kind: 'plan',
                            presentation: { title: 'Llamar mañana' },
                        },
                    },
                    error: null,
                },
            ],
            'rpc:persist_agent_conversation_turn': [{
                data: [{ turn_id: 'execution-turn', idempotent_replay: false, created_at: '2026-10-22T19:00:00.000Z' }],
                error: null,
            }],
        });
        setSupabaseAdminMock(retryDb);
        const { persistAgentExecutionConversationEvent } = await import('../src/services/agentConversationTurn.service');

        await expect(persistAgentExecutionConversationEvent({
            actorUserId: ACTOR_ID,
            conversationId: CONVERSATION_ID,
            sourceTurnKey: 'client-turn-1',
            execution: { authorizationId: 'auth-1', status: 'done', executedSteps: [], failedSteps: [], waitingSteps: [], humanReadableSummary: 'Listo.' } as any,
        })).resolves.toMatchObject({ turnId: 'execution-turn' });

        expect(retryDb.getCalledTables()).toEqual([
            'conversation_participants',
            'agent_conversation_turns',
            'agent_conversation_turns',
            'conversation_participants',
        ]);
        expect(retryDb.getRpcCalls()[0]?.args.p_client_turn_key).toBe('client-turn-1:execution');
    });
});
