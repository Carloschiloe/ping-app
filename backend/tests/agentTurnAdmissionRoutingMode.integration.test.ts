import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { supabaseAdmin } from '../src/lib/supabaseAdmin';
import { AgentTurnAdmissionService } from '../src/services/agentTurnAdmission.service';

const actor = 'a8000000-0000-4000-8000-000000000001';
const otherActor = 'a8000000-0000-4000-8000-000000000002';

async function cleanup() {
    for (const id of [actor, otherActor]) {
        await supabaseAdmin.from('agent_turn_admissions').delete().eq('actor_user_id', id);
        await supabaseAdmin.from('agent_turn_sequence_allocators').delete().eq('actor_user_id', id);
        await supabaseAdmin.auth.admin.deleteUser(id);
    }
}

async function ensureUser(id: string, email: string) {
    const { error } = await supabaseAdmin.auth.admin.createUser({ id, email, password: 'local-routing-mode-only-password', email_confirm: true });
    if (error && !error.message.toLowerCase().includes('already been registered')) throw error;
}

describe('durable routing mode against local Supabase', () => {
    beforeAll(async () => {
        await cleanup();
        await ensureUser(actor, 'm7-routing-mode-a@example.invalid');
        await ensureUser(otherActor, 'm7-routing-mode-b@example.invalid');
    });
    afterAll(cleanup);

    it('persists the selected mode and keeps it authoritative across a retry mode change', async () => {
        const service = new AgentTurnAdmissionService();
        const first = await service.admit({ actorUserId: actor, dialogueScopeKey: 'routing-mode-main', clientTurnKey: 'same-key', routingMode: 'read_v4_exact_count', semanticRequest: { input: 'count commitments' } });
        const retry = await service.admit({ actorUserId: actor, dialogueScopeKey: 'routing-mode-main', clientTurnKey: 'same-key', routingMode: 'legacy', semanticRequest: { input: 'count commitments' } });
        expect(first.routingMode).toBe('read_v4_exact_count');
        expect(retry).toMatchObject({ turnId: first.turnId, turnSequence: first.turnSequence, routingMode: 'read_v4_exact_count', idempotentReplay: true });

        const { data, error } = await supabaseAdmin.from('agent_turn_admissions').select('routing_mode').eq('turn_id', first.turnId).single();
        if (error) throw error;
        expect(data.routing_mode).toBe('read_v4_exact_count');
    });

    it('rejects a same-key different-fingerprint request without changing the stored mode', async () => {
        const service = new AgentTurnAdmissionService();
        await expect(service.admit({ actorUserId: actor, dialogueScopeKey: 'routing-mode-conflict', clientTurnKey: 'conflict-key', routingMode: 'legacy', semanticRequest: { input: 'first' } })).resolves.toMatchObject({ routingMode: 'legacy' });
        await expect(service.admit({ actorUserId: actor, dialogueScopeKey: 'routing-mode-conflict', clientTurnKey: 'conflict-key', routingMode: 'read_v4_exact_count', semanticRequest: { input: 'different' } })).rejects.toMatchObject({ statusCode: 409 });
    });

    it('allocates unique monotonic sequences and one turn for concurrent retries', async () => {
        const service = new AgentTurnAdmissionService();
        const admissions = await Promise.all(Array.from({ length: 5 }, (_, index) => service.admit({ actorUserId: actor, dialogueScopeKey: 'routing-mode-concurrency', clientTurnKey: `key-${index}`, routingMode: 'legacy', semanticRequest: { input: `turn-${index}` } })));
        expect(new Set(admissions.map((item) => item.turnId)).size).toBe(5);
        expect(admissions.map((item) => item.turnSequence).sort((a, b) => a - b)).toEqual([1, 2, 3, 4, 5]);
        const retries = await Promise.all(Array.from({ length: 5 }, () => service.admit({ actorUserId: actor, dialogueScopeKey: 'routing-mode-same-key', clientTurnKey: 'same-concurrent-key', routingMode: 'read_v4_exact_count', semanticRequest: { input: 'same' } })));
        expect(new Set(retries.map((item) => item.turnId)).size).toBe(1);
        expect(new Set(retries.map((item) => item.turnSequence)).size).toBe(1);
    });

    it('keeps actor and scope isolation, while old four-argument admissions remain historical NULL mode', async () => {
        const service = new AgentTurnAdmissionService();
        const other = await service.admit({ actorUserId: otherActor, dialogueScopeKey: 'routing-mode-concurrency', clientTurnKey: 'other-key', routingMode: 'legacy', semanticRequest: { input: 'other actor' } });
        const otherScope = await service.admit({ actorUserId: actor, dialogueScopeKey: 'routing-mode-other-scope', clientTurnKey: 'other-scope-key', routingMode: 'legacy', semanticRequest: { input: 'other scope' } });
        const historical = await service.admit({ actorUserId: actor, dialogueScopeKey: 'routing-mode-historical', clientTurnKey: 'historical-key', semanticRequest: { input: 'legacy caller' } });
        expect(other.turnSequence).toBe(1);
        expect(otherScope.turnSequence).toBe(1);
        expect(historical.routingMode).toBeNull();
    });

    it('rejects an unrecognized client-supplied mode at the database boundary', async () => {
        const service = new AgentTurnAdmissionService();
        await expect(service.admit({ actorUserId: actor, dialogueScopeKey: 'routing-mode-invalid', clientTurnKey: 'invalid-key', routingMode: 'read_v4_full' as any, semanticRequest: { input: 'invalid' } })).rejects.toMatchObject({ statusCode: 500 });
    });
});
