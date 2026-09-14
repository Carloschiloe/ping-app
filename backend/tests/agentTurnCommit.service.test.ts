import { describe, expect, it, vi } from 'vitest';
import { AgentTurnCommitService, toAgentTurnReplayV1 } from '../src/services/agentTurnCommit.service';

const response = (answer = 'ok') => ({
    kind: 'response' as const,
    response: { status: 'answered' as const, answer, citations: [] },
    debug: { traceId: 'secret-attempt', dialogueScopeKey: 'scope', stateFound: false } as any,
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
});
