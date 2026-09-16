import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { supabaseAdmin } from '../src/lib/supabaseAdmin';
import { AgentTurnAdmissionService } from '../src/services/agentTurnAdmission.service';
import { AgentReadV4DurableOrchestrationService } from '../src/services/agentReadV4DurableOrchestration.service';
import { AgentTurnCommitService } from '../src/services/agentTurnCommit.service';
import { AgentDialogueCheckpointService } from '../src/services/agentDialogueCheckpoint.service';
import { agentReadV4OrchestrationService } from '../src/services/agentReadV4Orchestration.service';
import { adaptAgentReadV4Result } from '../src/services/agentReadResultAdapter.service';
import type { NormalizedSemanticTurnV4 } from '../src/types/agentTurnCommit';

const actor = 'a7000000-0000-4000-8000-000000000001';
const scope = 'm7-durable-read-v4';
const semantic: NormalizedSemanticTurnV4 = {
    version: 4, kind: 'read_request', domain: 'commitment', objectiveCompleteness: 'complete',
    lifecycleCommand: 'none', lifecycleTarget: 'unspecified', lifecycleEvidence: 'unknown',
    pendingSlotAnswer: 'not_a_slot_answer', continuationLike: 'unknown', candidateSlotType: null,
    independentObjective: 'yes', objectiveType: 'lookup', entityHints: [], slots: {}, ambiguityFields: [],
    confidence: 1, source: 'deterministic',
    readMeaning: { queryShape: 'count', explicitCollection: false, targetShape: 'none', relationship: { kind: 'general_recall' }, temporalRole: 'none' },
};

async function cleanup() {
    await supabaseAdmin.from('agent_turn_semantic_checkpoints').delete().eq('actor_user_id', actor);
    await supabaseAdmin.from('agent_dialogue_checkpoints').delete().eq('actor_user_id', actor);
    await supabaseAdmin.from('agent_turn_admissions').delete().eq('actor_user_id', actor);
    await supabaseAdmin.auth.admin.deleteUser(actor);
}

describe('durable READ V4 against local Supabase', () => {
    beforeAll(async () => {
        await cleanup();
        const { error } = await supabaseAdmin.auth.admin.createUser({ id: actor, email: 'm7-durable-read@example.invalid', password: 'local-only-test-password', email_confirm: true });
        if (error && !error.message.toLowerCase().includes('already been registered')) throw error;
    });
    afterAll(cleanup);

    it('admits, checkpoints, executes, commits and replays without a second READ execution', async () => {
        const admissionService = new AgentTurnAdmissionService();
        const durable = new AgentReadV4DurableOrchestrationService();
        const admission = await admissionService.admit({ actorUserId: actor, dialogueScopeKey: scope, clientTurnKey: 'durable-read-key', semanticRequest: { kind: 'read_request', queryShape: 'count' } });
        const input = {
            admission, semanticInput: { text: 'not persisted', modality: 'text' as const, authoritativeSemanticV4: semantic },
            queryKey: 'durable-read-count', person: null,
            temporal: { status: 'not_applicable' as const }, authorizedScope: { sourceTypes: ['commitment'] as const },
        };
        const first = await durable.execute(input);
        expect(first).toMatchObject({ committed: true, replayed: false, result: { kind: 'read', execution: { status: 'completed', completeness: 'complete', conclusion: 'count', count: { value: 0, universe: 'authorized_commitments' } } } });

        const retryAdmission = await admissionService.admit({ actorUserId: actor, dialogueScopeKey: scope, clientTurnKey: 'durable-read-key', semanticRequest: { queryShape: 'count', kind: 'read_request' } });
        expect(retryAdmission.turnId).toBe(admission.turnId);
        expect(retryAdmission.turnSequence).toBe(admission.turnSequence);
        const replay = await durable.execute({ ...input, admission: retryAdmission, semanticInput: { ...input.semanticInput, text: 'different retry text' } });
        expect(replay).toMatchObject({ committed: false, replayed: true, result: first.result });

        const { data: persisted, error } = await supabaseAdmin.from('agent_turn_admissions').select('status, replay_version, result_ref').eq('turn_id', admission.turnId).single();
        if (error) throw error;
        expect(persisted).toMatchObject({ status: 'completed', replay_version: 2, result_ref: { kind: 'read' } });
        expect(persisted.result_ref.execution.count.value).toBe(0);
    });

    it('recovers an ambiguous transport failure when reconciliation proves the atomic commit completed', async () => {
        const admissionService = new AgentTurnAdmissionService();
        const commit = new AgentTurnCommitService();
        const admission = await admissionService.admit({ actorUserId: actor, dialogueScopeKey: scope, clientTurnKey: 'durable-read-recovery', semanticRequest: { kind: 'read_request', queryShape: 'count' } });
        const durable = new AgentReadV4DurableOrchestrationService({
            admission: admissionService,
            semantic: commit,
            dialogue: new AgentDialogueCheckpointService(),
            read: agentReadV4OrchestrationService,
            adapt: adaptAgentReadV4Result,
            commit: {
                applyTurn: async (value) => { await commit.applyTurn(value); throw new Error('simulated transport loss after commit'); },
                reconcileApplication: (value) => commit.reconcileApplication(value),
            },
        });
        const replay = await durable.execute({
            admission, semanticInput: { text: 'not persisted', modality: 'text', authoritativeSemanticV4: semantic },
            queryKey: 'durable-recovery-count', person: null,
            temporal: { status: 'not_applicable' }, authorizedScope: { sourceTypes: ['commitment'] },
        });
        expect(replay).toMatchObject({ committed: true, replayed: true, result: { kind: 'read', execution: { conclusion: 'count', count: { value: 0 } } } });
    });
});
