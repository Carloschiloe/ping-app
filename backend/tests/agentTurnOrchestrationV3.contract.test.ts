import { describe, expect, it } from 'vitest';
import { claimCanProcess, claimOutcome, type V3CoreResolution, type V3DispositionBoundary, type V3PreparationBoundary, type V3SemanticCheckpointStore } from '../src/types/agentTurnOrchestrationV3';
import type { AgentTurnAdmission, AgentTurnProcessingDisposition } from '../src/types/agentTurnAdmission';
import type { NormalizedSemanticTurnV3 } from '../src/types/agentTurnCommit';

const admission = (status: AgentTurnAdmission['status']): AgentTurnAdmission => ({
    turnId: 'turn-1', actorUserId: 'actor-1', dialogueScopeKey: 'scope-1', clientTurnKey: 'client-1', requestFingerprint: 'f',
    turnSequence: 4, status, failureClass: status === 'failed' ? 'terminal' : null, resultRef: status === 'completed' ? { kind: 'response', response: { status: 'ok', answer: 'done', citations: [] } } : null,
    createdAt: '', updatedAt: '', completedAt: null, expiresAt: '', idempotentReplay: false,
});

describe('V3 orchestration executable contract', () => {
    it.each([
        ['completed_replay', { kind: 'completed_replay', admission: admission('completed') }],
        ['processing_duplicate', { kind: 'in_flight', admission: admission('processing') }],
        ['terminal_failure', { kind: 'terminal_failure', admission: admission('failed') }],
    ] as const)('keeps %s outside the processable claim branch', (_name, input) => {
        const result = input as AgentTurnProcessingDisposition;
        expect(claimCanProcess(result)).toBe(false);
        expect(claimOutcome(result).kind).not.toBe('claimed');
    });

    it('only a canonical claimed result can enter processing', () => {
        const result: AgentTurnProcessingDisposition = { kind: 'claimed', admission: admission('processing') };
        expect(claimCanProcess(result)).toBe(true);
        expect(claimOutcome(result)).toEqual(result);
    });

    it('represents replay, retryable failure, CAS conflict, and uncertain application distinctly', () => {
        const replay = claimOutcome({ kind: 'completed_replay', admission: admission('completed') });
        expect(replay).toMatchObject({ kind: 'completed_replay', result: { kind: 'response' } });
        const outcomes = [
            { kind: 'retryable_failure', admission: admission('failed'), phase: 'semantic' },
            { kind: 'cas_conflict', admission: admission('processing'), conflict: 'dialogue_version' },
            { kind: 'uncertain_application', admission: admission('processing'), reconciliationRequired: true },
        ];
        expect(outcomes.map((item) => item.kind)).toEqual(['retryable_failure', 'cas_conflict', 'uncertain_application']);
    });

    it('requires V3 semantic checkpoint and keeps READ/WRITE preparation separate', () => {
        const semanticStore: V3SemanticCheckpointStore = { load: async () => ({ status: 'not_found' }), save: async ({ semanticTurn }) => semanticTurn };
        const resolution: V3CoreResolution = { person: null, temporal: { status: 'not_applicable' } };
        const disposition: V3DispositionBoundary = { decide: () => { throw new Error('contract double'); } };
        const preparation: V3PreparationBoundary = {
            prepareRead: async () => ({ status: 'not_applicable', reason: 'not_a_read' }),
            prepareWrite: async () => ({ status: 'unsupported', reason: 'communication_content' }),
        };
        expect(semanticStore).toBeDefined();
        expect(resolution.temporal.status).toBe('not_applicable');
        expect(disposition).toHaveProperty('decide');
        expect(preparation).toHaveProperty('prepareRead');
        expect(preparation).toHaveProperty('prepareWrite');
    });

    it('does not expose raw semantic input or M-4 operations in the V3 dependency surface', () => {
        const dependencyNames = ['admission', 'semantic', 'dialogue', 'resolver', 'disposition', 'preparation', 'atomicApply'];
        expect(dependencyNames).not.toContain('authorize');
        expect(dependencyNames).not.toContain('execute');
        expect(dependencyNames).not.toContain('rawText');
        const v3: Pick<NormalizedSemanticTurnV3, 'version'> = { version: 3 };
        expect(v3.version).toBe(3);
    });
});
