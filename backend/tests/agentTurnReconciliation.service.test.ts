import { describe, expect, it, vi } from 'vitest';
import { AgentTurnCommitService } from '../src/services/agentTurnCommit.service';

const input = { turnId: 'turn-1', actorUserId: 'actor-1', dialogueScopeKey: 'scope-1', turnSequence: 3 };

describe('AgentTurnCommitService.reconcileApplication', () => {
    it.each(['committed', 'uncertain', 'not_applied', 'retryable_recovery', 'retryable_failure', 'terminal_failure', 'superseded'] as const)('preserves durable %s outcome', async status => {
        const rpc = vi.fn(async () => ({ data: [{ reconciliation_status: status, turn_id: input.turnId, actor_user_id: input.actorUserId, dialogue_scope_key: input.dialogueScopeKey, turn_sequence: input.turnSequence, admission_status: status === 'committed' ? 'completed' : status === 'terminal_failure' || status === 'superseded' ? 'failed' : 'processing', failure_class: null, result_ref: status === 'committed' ? { kind: 'response' } : null, last_applied_turn_id: status === 'committed' ? input.turnId : null, last_applied_turn_sequence: status === 'committed' ? input.turnSequence : 0 }], error: null }));
        const result = await new AgentTurnCommitService({ rpc }).reconcileApplication(input);
        expect(result.status).toBe(status);
        expect(rpc).toHaveBeenCalledWith('reconcile_agent_turn_application', expect.objectContaining({ p_turn_id: input.turnId, p_actor_user_id: input.actorUserId, p_dialogue_scope_key: input.dialogueScopeKey, p_turn_sequence: input.turnSequence }));
    });

    it('fails safely on identity mismatch', async () => {
        const rpc = vi.fn(async () => ({ data: null, error: { message: 'Agent turn admission identity mismatch', code: '42501' } }));
        await expect(new AgentTurnCommitService({ rpc }).reconcileApplication(input)).rejects.toMatchObject({ statusCode: 403 });
    });
});
