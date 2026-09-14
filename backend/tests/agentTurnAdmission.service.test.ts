import { describe, expect, it, vi } from 'vitest';
import { AgentTurnAdmissionService, canonicalAgentTurnFingerprint } from '../src/services/agentTurnAdmission.service';

const row = (overrides: Record<string, unknown> = {}) => ({
    turn_id: '11111111-1111-4111-8111-111111111111', actor_user_id: '22222222-2222-4222-8222-222222222222',
    dialogue_scope_key: 'actor:scope', client_turn_key: 'client-turn-1',
    request_fingerprint: 'a'.repeat(64), turn_sequence: 7, status: 'accepted', failure_class: null,
    result_ref: null, created_at: '2026-09-14T00:00:00.000Z', updated_at: '2026-09-14T00:00:00.000Z',
    completed_at: null, expires_at: '2026-10-14T00:00:00.000Z', idempotent_replay: false, ...overrides,
});

describe('M-7 durable Agent Turn admission adapter', () => {
    it('fingerprints canonical JSON without semantic rewriting', () => {
        expect(canonicalAgentTurnFingerprint({ b: 'á\r\n', a: 1 }))
            .toBe(canonicalAgentTurnFingerprint({ a: 1, b: 'á\n' }));
        expect(canonicalAgentTurnFingerprint({ text: 'Hola?' }))
            .not.toBe(canonicalAgentTurnFingerprint({ text: 'hola' }));
    });

    it('admits with a server-computed fingerprint and never sends trace/client key into it', async () => {
        const rpc = vi.fn().mockResolvedValue({ data: [row()], error: null });
        const service = new AgentTurnAdmissionService({ rpc });
        const admission = await service.admit({
            actorUserId: '22222222-2222-4222-8222-222222222222', dialogueScopeKey: 'actor:scope',
            clientTurnKey: 'client-turn-1', traceId: 'attempt-1', semanticRequest: { input: 'Tengo que llamar', channel: 'mobile' },
        });
        expect(admission.turnId).toBe(row().turn_id);
        expect(rpc).toHaveBeenCalledWith('admit_agent_turn', expect.objectContaining({ p_request_fingerprint: expect.stringMatching(/^[a-f0-9]{64}$/) }));
        expect(rpc.mock.calls[0][1]).not.toHaveProperty('p_trace_id');
    });

    it('maps completed admission to replay and does not claim it for processing', async () => {
        const rpc = vi.fn().mockResolvedValue({ data: row({ status: 'completed', idempotent_replay: true, result_ref: { responseKind: 'response' } }), error: null });
        const service = new AgentTurnAdmissionService({ rpc });
        const admission = await service.admit({ actorUserId: row().actor_user_id as string, dialogueScopeKey: 'actor:scope', semanticRequest: { input: 'x' } });
        const result = await service.claimForProcessing(admission);
        expect(result.kind).toBe('completed_replay');
        expect(result.admission.resultRef).toEqual({ responseKind: 'response' });
    });

    it('preserves identity when a retryable failure is claimed again', async () => {
        const rpc = vi.fn()
            .mockResolvedValueOnce({ data: [row({ status: 'failed', failure_class: 'retryable' })], error: null })
            .mockResolvedValueOnce({ data: row({ status: 'processing', failure_class: null }), error: null });
        const service = new AgentTurnAdmissionService({ rpc });
        const admission = await service.admit({ actorUserId: row().actor_user_id as string, dialogueScopeKey: 'actor:scope', clientTurnKey: 'client-turn-1', semanticRequest: { input: 'x' } });
        const result = await service.claimForProcessing(admission);
        expect(result.kind).toBe('claimed');
        expect(result.admission.turnId).toBe(admission.turnId);
        expect(result.admission.turnSequence).toBe(admission.turnSequence);
    });
});
