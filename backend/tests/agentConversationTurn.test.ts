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

    it('persists the bounded temporal/status read scope without changing the idempotency identity', async () => {
        const db = seedPersistence({
            data: [{ turn_id: 'turn-scope', idempotent_replay: false, created_at: '2026-10-22T19:00:00.000Z' }],
            error: null,
        });
        const { persistAgentConversationTurn } = await import('../src/services/agentConversationTurn.service');

        await persistAgentConversationTurn({
            actorUserId: ACTOR_ID,
            conversationId: CONVERSATION_ID,
            clientTurnKey: 'client-turn-scope',
            inputText: '¿Qué tengo esta semana?',
            inputMode: 'text',
            result,
            readContext: {
                kind: 'commitment_query',
                timeRange: { from: '2026-10-19T03:00:00.000Z', to: '2026-10-26T03:00:00.000Z' },
                sourceTurnId: 'turn-scope',
                commitmentReferents: [],
                statuses: ['accepted', 'proposed'],
            },
        });

        expect(db.getRpcCalls()[0]?.args.p_result.__pingAgentHistory).toEqual({
            dialogueConversationId: null,
            readContext: {
                timeRange: { from: '2026-10-19T03:00:00.000Z', to: '2026-10-26T03:00:00.000Z' },
                statuses: ['accepted', 'proposed'],
            },
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

    it('rehydrates temporal/status scope after restart and still requires canonical citations for referents', async () => {
        const db = createSupabaseAdminMock({
            conversation_participants: [{ data: { conversation_id: CONVERSATION_ID }, error: null }],
            agent_conversation_turns: [{
                data: [{
                    id: 'turn-read-scope',
                    result_kind: 'response',
                    result: {
                        kind: 'response',
                        response: {
                            status: 'answered',
                            citations: [{ sourceType: 'commitment', sourceId: 'commitment-1' }],
                        },
                        __pingAgentHistory: {
                            dialogueConversationId: null,
                            readContext: {
                                timeRange: { from: '2026-10-19T03:00:00.000Z', to: '2026-10-26T03:00:00.000Z' },
                                statuses: ['accepted', 'not-a-status', 'proposed'],
                            },
                        },
                    },
                }],
                error: null,
            }],
        });
        setSupabaseAdminMock(db);
        const { loadLatestAgentReadContext } = await import('../src/services/agentConversationTurn.service');

        await expect(loadLatestAgentReadContext(ACTOR_ID, CONVERSATION_ID)).resolves.toMatchObject({
            timeRange: { from: '2026-10-19T03:00:00.000Z', to: '2026-10-26T03:00:00.000Z' },
            statuses: ['accepted', 'proposed'],
            commitmentReferents: [{ entityType: 'commitment', canonicalId: 'commitment-1' }],
        });
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

    it('reconciles a staged execution without invoking tools and keeps the projection idempotent', async () => {
        const execution = {
            authorizationId: 'auth-reconcile',
            status: 'done',
            executedSteps: [],
            failedSteps: [],
            waitingSteps: [],
            humanReadableSummary: 'Listo.',
        };
        const db = createSupabaseAdminMock({
            agent_execution_history_outbox: [{
                data: [{
                    authorization_id: 'auth-reconcile',
                    actor_user_id: ACTOR_ID,
                    conversation_id: CONVERSATION_ID,
                    source_turn_key: 'client-turn-reconcile',
                    execution_result: execution,
                }],
                error: null,
            }],
            conversation_participants: [{ data: { conversation_id: CONVERSATION_ID }, error: null }],
            agent_conversation_turns: [{
                data: {
                    input_text: 'Crea el compromiso de llamar mañana',
                    input_mode: 'text',
                    result: { kind: 'plan', presentation: { title: 'Llamar mañana' } },
                },
                error: null,
            }],
            'rpc:persist_agent_conversation_turn': [{
                data: [{ turn_id: 'execution-turn-reconciled', idempotent_replay: false, created_at: '2026-10-24T19:00:00.000Z' }],
                error: null,
            }],
            'rpc:complete_agent_execution_history': [{ data: {}, error: null }],
        });
        setSupabaseAdminMock(db);
        const { reconcilePendingAgentExecutionHistory } = await import('../src/services/agentConversationTurn.service');

        await expect(reconcilePendingAgentExecutionHistory()).resolves.toEqual({
            scanned: 1,
            projected: 1,
            deferred: 0,
        });
        expect(db.getRpcCalls().map((call) => call.name)).toEqual([
            'persist_agent_conversation_turn',
            'complete_agent_execution_history',
        ]);
        expect(db.getRpcCalls()[0]?.args.p_client_turn_key).toBe('client-turn-reconcile:execution');
    });

    it('quarantines an invalid staged result without trying to project it', async () => {
        const db = createSupabaseAdminMock({
            agent_execution_history_outbox: [{
                data: [{
                    authorization_id: 'auth-invalid',
                    actor_user_id: ACTOR_ID,
                    conversation_id: CONVERSATION_ID,
                    source_turn_key: 'client-turn-invalid',
                    execution_result: { authorizationId: 'different-authorization' },
                }],
                error: null,
            }],
            'rpc:complete_agent_execution_history': [{ data: {}, error: null }],
        });
        setSupabaseAdminMock(db);
        const { reconcilePendingAgentExecutionHistory } = await import('../src/services/agentConversationTurn.service');

        await expect(reconcilePendingAgentExecutionHistory()).resolves.toEqual({
            scanned: 1,
            projected: 0,
            deferred: 1,
        });
        expect(db.getCalledTables()).toEqual(['agent_execution_history_outbox']);
        expect(db.getRpcCalls()).toEqual([{
            name: 'complete_agent_execution_history',
            args: {
                p_authorization_id: 'auth-invalid',
                p_actor_user_id: ACTOR_ID,
                p_error_code: 'invalid_staged_result',
            },
        }]);
    });

    it('loads the newest bounded history window and returns it chronologically', async () => {
        const db = createSupabaseAdminMock({
            conversation_participants: [{ data: { conversation_id: CONVERSATION_ID }, error: null }],
            agent_conversation_turns: [{
                data: [
                    { id: 'turn-new', conversation_id: CONVERSATION_ID, actor_user_id: ACTOR_ID, client_turn_key: 'new', input_text: 'new', input_mode: 'text', result_kind: 'response', result, created_at: '2026-10-23T19:02:00.000Z', conversations: { deleted_at: null, agent_history_cleared_at: null } },
                    { id: 'turn-old', conversation_id: CONVERSATION_ID, actor_user_id: ACTOR_ID, client_turn_key: 'old', input_text: 'old', input_mode: 'text', result_kind: 'response', result, created_at: '2026-10-23T19:01:00.000Z', conversations: { deleted_at: null, agent_history_cleared_at: null } },
                ],
                error: null,
            }],
        });
        setSupabaseAdminMock(db);
        const { listAgentConversationTurns } = await import('../src/services/agentConversationTurn.service');

        await expect(listAgentConversationTurns(ACTOR_ID, CONVERSATION_ID)).resolves.toMatchObject([
            { clientTurnKey: 'old' },
            { clientTurnKey: 'new' },
        ]);
        expect(db.getCalledTables()).toEqual(['conversation_participants', 'agent_conversation_turns']);
    });

    it('clears the Agent projection with a reversible cutoff, without deleting events', async () => {
        const db = createSupabaseAdminMock({
            conversation_participants: [{ data: { conversation_id: CONVERSATION_ID }, error: null }],
            'rpc:clear_agent_conversation_history': [{ data: '2026-10-23T19:00:00.000Z', error: null }],
        });
        setSupabaseAdminMock(db);
        const { clearAgentConversationHistory } = await import('../src/services/agentConversationTurn.service');

        const result = await clearAgentConversationHistory(ACTOR_ID, CONVERSATION_ID);

        expect(result.clearedAt).toBe('2026-10-23T19:00:00.000Z');
        expect(db.getCalledTables()).toEqual(['conversation_participants']);
        expect(db.getRpcCalls()).toEqual([{
            name: 'clear_agent_conversation_history',
            args: {
                p_actor_user_id: ACTOR_ID,
                p_conversation_id: CONVERSATION_ID,
                p_dialogue_scope_key: CONVERSATION_ID,
            },
        }]);
    });

    it('resets the main mobile dialogue scope without allowing an unrelated scope', async () => {
        const db = createSupabaseAdminMock({
            conversation_participants: [{ data: { conversation_id: CONVERSATION_ID }, error: null }],
            'rpc:clear_agent_conversation_history': [{ data: '2026-10-23T19:00:00.000Z', error: null }],
        });
        setSupabaseAdminMock(db);
        const { clearAgentConversationHistory } = await import('../src/services/agentConversationTurn.service');

        await clearAgentConversationHistory(ACTOR_ID, CONVERSATION_ID, 'agent:mobile');
        expect(db.getRpcCalls()[0]).toEqual({
            name: 'clear_agent_conversation_history',
            args: {
                p_actor_user_id: ACTOR_ID,
                p_conversation_id: CONVERSATION_ID,
                p_dialogue_scope_key: 'agent:mobile',
            },
        });
        await expect(clearAgentConversationHistory(ACTOR_ID, CONVERSATION_ID, 'other-scope'))
            .rejects.toMatchObject({ statusCode: 400 });
    });
});
