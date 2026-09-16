import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { supabaseAdmin } from '../src/lib/supabaseAdmin';
import { AgentTurnRoutingSelectionService, READ_V4_EXACT_COUNT_OPT_IN } from '../src/services/agentTurnRoutingSelection.service';

const actor = 'a8000000-0000-4000-8000-000000000011';

async function cleanup() {
    await supabaseAdmin.from('agent_turn_admissions').delete().eq('actor_user_id', actor);
    await supabaseAdmin.from('agent_turn_sequence_allocators').delete().eq('actor_user_id', actor);
    await supabaseAdmin.auth.admin.deleteUser(actor);
}

async function ensureUser() {
    const { error } = await supabaseAdmin.auth.admin.createUser({
        id: actor, email: 'm7-routing-selection@example.invalid', password: 'local-routing-selection-only-password', email_confirm: true,
    });
    if (error && !error.message.toLowerCase().includes('already been registered')) throw error;
}

describe('M-7 routing selection against local Supabase', () => {
    beforeAll(async () => { await cleanup(); await ensureUser(); });
    afterAll(cleanup);

    it('persists V4 only when server conditions pass and recovers it after flag/opt-in change', async () => {
        const v4 = new AgentTurnRoutingSelectionService(undefined, () => ({ environmentName: 'staging', readV4ExactCountEnabled: true }));
        const first = await v4.selectAndAdmit({
            server: { actorUserId: actor, dialogueScopeKey: 'routing-selection-retry' },
            request: { idempotencyKey: 'stable-retry-key', readCapability: READ_V4_EXACT_COUNT_OPT_IN, semanticRequest: { input: 'same canonical request' } },
        });
        expect(first.routingMode).toBe('read_v4_exact_count');
        expect(first.newlySelected).toBe(true);

        const legacyConfig = new AgentTurnRoutingSelectionService(undefined, () => ({ environmentName: 'production', readV4ExactCountEnabled: false }));
        const retry = await legacyConfig.selectAndAdmit({
            server: { actorUserId: actor, dialogueScopeKey: 'routing-selection-retry' },
            request: { idempotencyKey: 'stable-retry-key', semanticRequest: { input: 'same canonical request' } },
        });
        expect(retry.routingMode).toBe('read_v4_exact_count');
        expect(retry.admission.turnId).toBe(first.admission.turnId);
        expect(retry.admission.turnSequence).toBe(first.admission.turnSequence);
        expect(retry.newlySelected).toBe(false);
    });

    it('creates a legacy admission when the server flag or opt-in is absent', async () => {
        const service = new AgentTurnRoutingSelectionService(undefined, () => ({ environmentName: 'staging', readV4ExactCountEnabled: false }));
        const result = await service.selectAndAdmit({
            server: { actorUserId: actor, dialogueScopeKey: 'routing-selection-legacy' },
            request: { idempotencyKey: 'legacy-key', semanticRequest: { input: 'legacy request' } },
        });
        expect(result.routingMode).toBe('legacy');
        expect(result.admission.routingMode).toBe('legacy');
    });

    it('keeps the durable conflict guard active for the boundary', async () => {
        const service = new AgentTurnRoutingSelectionService(undefined, () => ({ environmentName: 'staging', readV4ExactCountEnabled: true }));
        await service.selectAndAdmit({
            server: { actorUserId: actor, dialogueScopeKey: 'routing-selection-conflict' },
            request: { idempotencyKey: 'conflict-key', readCapability: READ_V4_EXACT_COUNT_OPT_IN, semanticRequest: { input: 'first' } },
        });
        await expect(service.selectAndAdmit({
            server: { actorUserId: actor, dialogueScopeKey: 'routing-selection-conflict' },
            request: { idempotencyKey: 'conflict-key', semanticRequest: { input: 'different' } },
        })).rejects.toMatchObject({ statusCode: 409 });
    });

    it('allocates unique monotonic sequences through the private pool under concurrency', async () => {
        const service = new AgentTurnRoutingSelectionService(undefined, () => ({ environmentName: 'staging', readV4ExactCountEnabled: true }));
        const results = await Promise.all(Array.from({ length: 5 }, (_, index) => service.selectAndAdmit({
            server: { actorUserId: actor, dialogueScopeKey: 'routing-selection-concurrency' },
            request: { idempotencyKey: `concurrent-key-${index}`, readCapability: READ_V4_EXACT_COUNT_OPT_IN, semanticRequest: { input: `concurrent-${index}` } },
        })));
        expect(new Set(results.map((result) => result.admission.turnId)).size).toBe(5);
        expect(results.map((result) => result.admission.turnSequence).sort((a, b) => a - b)).toEqual([1, 2, 3, 4, 5]);
    });
});
