import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type { Server } from 'http';
import type { NormalizedSemanticTurnV4 } from '../src/types/agentTurnCommit';

const actor = 'b7000000-0000-4000-8000-000000000001';
const outsider = 'b7000000-0000-4000-8000-000000000002';
const emptyActor = 'b7000000-0000-4000-8000-000000000003';
const pendingOne = 'b7100000-0000-4000-8000-000000000001';
const pendingTwo = 'b7100000-0000-4000-8000-000000000002';
const resolved = 'b7100000-0000-4000-8000-000000000003';
const archived = 'b7100000-0000-4000-8000-000000000004';
const outsiderCommitment = 'b7100000-0000-4000-8000-000000000005';
const postCommitment = 'b7100000-0000-4000-8000-000000000006';
const ownerEmail = 'local-http-count-owner@example.invalid';
const outsiderEmail = 'local-http-count-outsider@example.invalid';
const emptyEmail = `local-http-empty-${Date.now()}@example.invalid`;
const countKey = `local-http-count-${Date.now()}`;

const semantic: NormalizedSemanticTurnV4 = {
    version: 4, kind: 'read_request', domain: 'commitment', objectiveCompleteness: 'complete',
    lifecycleCommand: 'none', lifecycleTarget: 'unspecified', lifecycleEvidence: 'unknown',
    pendingSlotAnswer: 'not_a_slot_answer', continuationLike: 'unknown', candidateSlotType: null,
    independentObjective: 'yes', objectiveType: 'lookup', entityHints: [], slots: {}, ambiguityFields: [],
    confidence: 1, source: 'deterministic',
    readMeaning: {
        queryShape: 'count', explicitCollection: false, targetShape: 'none',
        relationship: { kind: 'current_state' }, temporalRole: 'none', commitmentStatus: 'pending',
    },
};

vi.mock('../src/services/canonicalSemanticProducer.service', async () => {
    const actual = await vi.importActual<typeof import('../src/services/canonicalSemanticProducer.service')>('../src/services/canonicalSemanticProducer.service');
    return {
        ...actual,
        canonicalSemanticProducer: { produceV4: vi.fn(async () => semantic) },
    };
});

let server: Server;
let baseUrl: string;
let admin: typeof import('../src/lib/supabaseAdmin').supabaseAdmin;

async function cleanup() {
    await admin.from('agent_turn_semantic_checkpoints').delete().eq('actor_user_id', actor);
    await admin.from('agent_dialogue_checkpoints').delete().eq('actor_user_id', actor);
    await admin.from('agent_turn_admissions').delete().eq('actor_user_id', actor);
    await admin.from('commitments').delete().in('id', [pendingOne, pendingTwo, resolved, archived, outsiderCommitment, postCommitment]);
    for (const id of [actor, outsider, emptyActor]) await admin.auth.admin.deleteUser(id);
}

async function postTurn(body: Record<string, unknown>, token: string, key: string) {
    const response = await fetch(`${baseUrl}/api/agent/turn`, {
        method: 'POST', headers: {
            'Content-Type': 'application/json', Authorization: `Bearer ${token}`, 'Idempotency-Key': key,
        }, body: JSON.stringify(body),
    });
    return { status: response.status, body: await response.json() };
}

describe('M-7 local HTTP READ V4 exact pending count', () => {
    beforeAll(async () => {
        if (!process.env.PING_RUN_LOCAL_HTTP_E2E || process.env.SUPABASE_URL !== 'http://127.0.0.1:54321') return;
        const supabase = await import('../src/lib/supabaseAdmin');
        admin = supabase.supabaseAdmin;
        await cleanup();
        for (const [id, name] of [[actor, 'local-http-count-owner'], [outsider, 'local-http-count-outsider']]) {
            const { error } = await admin.auth.admin.createUser({ id, email: `${name}@example.invalid`, password: 'local-http-count-password', email_confirm: true });
            if (error && !error.message.toLowerCase().includes('already been registered')) throw error;
        }
        for (const row of [
            { id: pendingOne, owner_user_id: actor, title: 'pending accepted', status: 'accepted' },
            { id: pendingTwo, owner_user_id: actor, title: 'pending proposed', status: 'proposed' },
            { id: resolved, owner_user_id: actor, title: 'already cancelled', status: 'cancelled' },
            { id: archived, owner_user_id: actor, title: 'archived pending', status: 'accepted', archived_at: '2026-09-01T00:00:00Z' },
            { id: outsiderCommitment, owner_user_id: outsider, title: 'outsider pending', status: 'accepted' },
        ]) {
            const { error } = await admin.from('commitments').insert(row);
            if (error) throw error;
        }
        const { data, error } = await admin.auth.signInWithPassword({ email: ownerEmail, password: 'local-http-count-password' });
        if (error || !data.session) throw error ?? new Error('local auth session missing');
        const { app } = await import('../src/app');
        process.env.PING_ENVIRONMENT = 'local';
        process.env.PING_ENABLE_READ_V4_EXACT_COUNT = 'true';
        process.env.PING_LOCAL_READ_V4_ENABLED = 'true';
        await new Promise<void>((resolve) => { server = app.listen(0, resolve); });
        const address = server.address();
        baseUrl = `http://127.0.0.1:${typeof address === 'object' && address ? address.port : 0}`;
        (globalThis as any).__M7_LOCAL_TOKEN__ = data.session.access_token;
    }, 30000);

    afterAll(async () => {
        if (!server) return;
        await new Promise<void>((resolve) => server.close(() => resolve()));
        await cleanup();
    });

    it('returns exact pending count, zero, isolation, and idempotent replay', async () => {
        if (!server) return;
        const token = (globalThis as any).__M7_LOCAL_TOKEN__ as string;
        const first = await postTurn({ input: '¿Cuántos compromisos tengo pendientes?', readCapability: 'commitment_count_v4' }, token, countKey);
        expect(first.status).toBe(200);
        expect(first.body).toMatchObject({ kind: 'read', execution: { status: 'completed', completeness: 'complete', conclusion: 'count', count: { value: 2, universe: 'authorized_commitments' } } });

        await admin.from('commitments').insert({ id: postCommitment, owner_user_id: actor, title: 'new pending after commit', status: 'accepted' });
        const replay = await postTurn({ input: '¿Cuántos compromisos tengo pendientes?', readCapability: 'commitment_count_v4' }, token, countKey);
        expect(replay.body).toEqual(first.body);

        const emptyToken = await admin.auth.admin.createUser({ id: emptyActor, email: emptyEmail, password: 'local-http-empty-password', email_confirm: true });
        if (emptyToken.error || !emptyToken.data.user) throw emptyToken.error ?? new Error('empty actor creation failed');
        const session = await admin.auth.signInWithPassword({ email: emptyEmail, password: 'local-http-empty-password' });
        if (session.error || !session.data.session) throw session.error ?? new Error('empty actor session missing');
        const zero = await postTurn({ input: '¿Cuántos compromisos tengo pendientes?', readCapability: 'commitment_count_v4' }, session.data.session.access_token, 'local-http-zero-1');
        expect(zero.body.execution.count.value).toBe(0);
        await admin.auth.admin.deleteUser(emptyToken.data.user.id);
    });

    it('keeps legacy routing when the opt-in is absent', async () => {
        if (!server) return;
        const token = (globalThis as any).__M7_LOCAL_TOKEN__ as string;
        const response = await postTurn({ input: '¿Qué tengo hoy?' }, token, 'local-http-legacy-1');
        expect(response.status).toBe(200);
        expect(response.body.kind).not.toBe('read');
    });
});
