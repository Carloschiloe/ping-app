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
    });

    it('maps same-key/different-content conflicts to a retry-safe 409', async () => {
        seedPersistence({
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
    });
});
