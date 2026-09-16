import { describe, expect, it, vi } from 'vitest';
import { AgentTurnCommitService, toAgentTurnReplayV1, toAgentTurnReplayV2 } from '../src/services/agentTurnCommit.service';

const response = (answer = 'ok') => ({
    kind: 'response' as const,
    response: { status: 'answered' as const, answer, citations: [] },
    debug: { traceId: 'secret-attempt', dialogueScopeKey: 'scope', stateFound: false } as any,
});

const readCount = (value: number) => ({
    kind: 'read' as const,
    execution: {
        status: 'completed' as const,
        queryKey: 'q-count',
        completeness: 'complete' as const,
        conclusion: 'count' as const,
        count: {
            value,
            universe: 'authorized_commitments' as const,
            queryKey: 'q-count',
            provenance: { kind: 'count_operation' as const, operation: 'count_visible_commitments', queryKey: 'q-count' },
        },
    },
    scopeFingerprint: 'a'.repeat(64),
    constraintsFingerprint: 'b'.repeat(64),
});

describe('M-7 turn commit boundary', () => {
    it('projects every current public result kind without debug metadata', () => {
        const results = [
            response(),
            { kind: 'clarification' as const, questions: [{ field: 'date', question: 'When?' }], debug: {} as any },
            { kind: 'unsupported' as const, reason: 'unsupported', supportedExamples: ['example'], debug: {} as any },
            { kind: 'plan' as const, plan: { planId: 'p', status: 'ready_for_authorization', objectiveType: 'x', humanReadableSummary: 'x', steps: [], canExecute: true }, presentation: { planId: 'p', planDigest: 'd', confirmationLabel: 'Confirm', requiresExplicitConfirmation: true, stepPresentations: [], headline: 'x', summary: 'x', effectDescription: 'x', cancelLabel: 'Cancel', expiresAt: '2026-10-01T00:00:00.000Z', objectiveType: 'x' }, debug: {} as any },
        ];
        for (const result of results) {
            const replay = toAgentTurnReplayV1(result as any);
            expect(replay).not.toHaveProperty('debug');
            expect(JSON.stringify(replay).length).toBeLessThan(128 * 1024);
        }
    });

    it('rejects oversized replay instead of truncating it', () => {
        expect(() => toAgentTurnReplayV1(response('x'.repeat(128 * 1024)))).toThrow(/exceeds/);
    });

    it('serializes exact READ count as version 2 and preserves zero, query and audit bindings', () => {
        for (const value of [0, 4]) {
            const replay = toAgentTurnReplayV2(readCount(value));
            expect(replay).toMatchObject({ kind: 'read', execution: { conclusion: 'count', count: { value, queryKey: 'q-count', universe: 'authorized_commitments' } }, scopeFingerprint: 'a'.repeat(64), constraintsFingerprint: 'b'.repeat(64) });
        }
        expect(() => toAgentTurnReplayV1(readCount(0) as any)).toThrow(/version 2/);
    });

    it.each([
        [{ ...readCount(0), scopeFingerprint: 'bad' }],
        [{ ...readCount(0), execution: { ...readCount(0).execution, count: { ...readCount(0).execution.count, value: -1 } } }],
    ])('rejects malformed or inconclusive READ replay payloads', (result) => {
        expect(() => toAgentTurnReplayV2(result as any)).toThrow();
    });

    it('round-trips an inconclusive READ result without turning it into an exact count', () => {
        const result = readCount(0) as any;
        result.execution = { status: 'completed', queryKey: 'q-count', completeness: 'partial', conclusion: 'inconclusive', count: { observedValue: 0, universe: 'authorized_commitments', queryKey: 'q-count', provenance: result.execution.count.provenance } };
        expect(toAgentTurnReplayV2(result).execution).toMatchObject({ completeness: 'partial', conclusion: 'inconclusive', count: { observedValue: 0 } });
    });

    it('checkpoints normalized semantics and applies replay atomically through RPC boundaries', async () => {
        const rpc = vi.fn()
            .mockResolvedValueOnce({ data: { semantic_turn: { intentType: 'read', objectiveType: null, entityHints: [], slots: {}, ambiguityFields: [], confidence: 1, source: 'deterministic' } }, error: null })
            .mockResolvedValueOnce({ data: [{ actor_user_id: 'a', dialogue_scope_key: 's', lifecycle: 'idle', active_dialogue: null, suspended_dialogue: null, version: 1, last_applied_turn_id: 't', last_applied_turn_sequence: 1, expires_at: '2026-10-01T00:00:00Z', replay: { kind: 'response', response: { status: 'answered', answer: 'ok', citations: [] } }, replayed: false }], error: null });
        const service = new AgentTurnCommitService({ rpc });
        const semantic = { intentType: 'read', objectiveType: null, entityHints: [], slots: {}, ambiguityFields: [], confidence: 1, source: 'deterministic' as const };
        await service.saveSemanticCheckpoint({ turnId: 't', actorUserId: 'a', dialogueScopeKey: 's', turnSequence: 1, semanticTurn: semantic });
        const applied = await service.applyTurn({ turnId: 't', actorUserId: 'a', dialogueScopeKey: 's', turnSequence: 1, expectedDialogueVersion: 0, lifecycle: 'idle', activeDialogue: null, suspendedDialogue: null, expiresAt: '2026-10-01T00:00:00Z', result: response() as any });
        expect(applied.replayed).toBe(false);
        expect(rpc).toHaveBeenNthCalledWith(1, 'save_agent_turn_semantic_checkpoint', expect.objectContaining({ p_turn_id: 't', p_turn_sequence: 1 }));
        expect(rpc).toHaveBeenNthCalledWith(2, 'apply_agent_turn_atomically', expect.objectContaining({ p_turn_id: 't', p_turn_sequence: 1, p_expected_dialogue_version: 0, p_replay_version: 1 }));
    });

    it('uses replay version 2 only for structured READ results while preserving version 1 for existing results', async () => {
        const rpc = vi.fn().mockResolvedValue({ data: [{ actor_user_id: 'a', dialogue_scope_key: 's', lifecycle: 'idle', active_dialogue: null, suspended_dialogue: null, version: 1, last_applied_turn_id: 't', last_applied_turn_sequence: 1, expires_at: '2026-10-01T00:00:00Z', replay: readCount(0), replayed: false }], error: null });
        const service = new AgentTurnCommitService({ rpc });
        await service.applyTurn({ turnId: 't', actorUserId: 'a', dialogueScopeKey: 's', turnSequence: 1, expectedDialogueVersion: 0, lifecycle: 'idle', activeDialogue: null, suspendedDialogue: null, expiresAt: '2026-10-01T00:00:00Z', result: readCount(0) as any });
        expect(rpc).toHaveBeenCalledWith('apply_agent_turn_atomically', expect.objectContaining({ p_replay_version: 2, p_replay: expect.objectContaining({ kind: 'read', execution: expect.objectContaining({ conclusion: 'count' }) }) }));
    });
});
