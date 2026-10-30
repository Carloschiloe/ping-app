import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createSupabaseAdminMock, setSupabaseAdminMock, supabaseAdminMockModule } from './helpers/supabaseMock';

vi.mock('../src/lib/supabaseAdmin', () => supabaseAdminMockModule());

import { executeAuthorization } from '../src/services/agentExecution.service';

// A repeated confirmation of the same plan turn gets a fresh authorization
// row (consumed rows are never reused at authorize time). Executing it would
// repeat the side effect, so execution replays the authorization already bound
// to that plan turn — but only for the same digest, and never for a different
// (deliberately repeated) request.

const ACTOR = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const CONVERSATION = '11111111-1111-4111-8111-111111111111';
const SOURCE_TURN = 'm8-voice-session-turn-1';

function authorizationRow(id: string, status: string, planDigest: string) {
    return {
        id, actor_user_id: ACTOR, plan_digest: planDigest, objective_type: 'create_personal_commitment',
        frozen_steps: [], authorized_step_ids: [], confirmation_level: 'explicit', status,
        issued_at: '2026-10-29T12:00:00.000Z', expires_at: '2026-10-29T12:05:00.000Z',
        consumed_at: status === 'consumed' ? '2026-10-29T12:00:05.000Z' : null, revoked_at: null, trace_id: null,
    };
}

function claimedAuthorizationIds(db: ReturnType<typeof createSupabaseAdminMock>): string[] {
    return db.getRpcCalls()
        .filter((call: { name: string }) => call.name === 'claim_agent_authorization_for_execution_with_history')
        .map((call: { args: { p_authorization_id: string } }) => call.args.p_authorization_id);
}

function setup(priorOutboxRows: Array<{ authorization_id: string }>, priorDigest = 'digest-1') {
    const db = createSupabaseAdminMock({
        agent_authorizations: [
            { data: authorizationRow('new-auth', 'authorized', 'digest-1'), error: null },
            { data: authorizationRow('old-auth', 'consumed', priorDigest), error: null },
            { data: authorizationRow('old-auth', 'consumed', priorDigest), error: null },
        ],
        agent_execution_history_outbox: [{ data: priorOutboxRows, error: null }],
        'rpc:claim_agent_authorization_for_execution_with_history': [
            { data: authorizationRow('claimed', 'consumed', 'digest-1'), error: null },
        ],
    });
    setSupabaseAdminMock(db);
    return db;
}

describe('execution replay by plan turn', () => {
    beforeEach(() => setSupabaseAdminMock(createSupabaseAdminMock({})));

    it('replays the execution already bound to the same plan turn and digest instead of executing again', async () => {
        const db = setup([{ authorization_id: 'old-auth' }]);

        await executeAuthorization({
            authorizationId: 'new-auth', actorUserId: ACTOR,
            historyConversationId: CONVERSATION, historySourceTurnKey: SOURCE_TURN,
        });

        expect(claimedAuthorizationIds(db)).toEqual(['old-auth']);
        expect(db.getEqCalls('agent_execution_history_outbox')).toEqual(expect.arrayContaining([
            ['actor_user_id', ACTOR], ['conversation_id', CONVERSATION], ['source_turn_key', SOURCE_TURN],
        ]));
    });

    it('executes a deliberate repeat that comes from a different plan turn', async () => {
        const db = setup([]);

        await executeAuthorization({
            authorizationId: 'new-auth', actorUserId: ACTOR,
            historyConversationId: CONVERSATION, historySourceTurnKey: 'another-plan-turn',
        });

        expect(claimedAuthorizationIds(db)).toEqual(['new-auth']);
    });

    it('never replays an execution of a different plan bound to the same turn', async () => {
        const db = setup([{ authorization_id: 'old-auth' }], 'digest-other');

        await executeAuthorization({
            authorizationId: 'new-auth', actorUserId: ACTOR,
            historyConversationId: CONVERSATION, historySourceTurnKey: SOURCE_TURN,
        });

        expect(claimedAuthorizationIds(db)).toEqual(['new-auth']);
    });
});
