import { describe, expect, it } from 'vitest';
import { AgentDialogueStateService } from '../src/services/agentDialogueState.service';
import type { AgentObjective } from '../src/types/agentPlan';

function objective(title: string, time: string): AgentObjective {
    return {
        objectiveType: 'create_commitment_or_proposal',
        targetEntities: { personHints: [], entityHints: [title] },
        constraints: { decisionHint: null, draftOnly: false, responsibleHint: null },
        desiredOutcome: title,
        timeConstraints: { rawHint: time },
        actor: 'actor-1', sourceUtterance: title, confidence: 0.9,
        ambiguities: [], source: 'llm',
    };
}

describe('M7 suspended objective state', () => {
    it('preserves an independent objective and its plan reference, then swaps it back safely', () => {
        const service = new AgentDialogueStateService();
        service.openObjective({ actorUserId: 'actor-1', dialogueScopeKey: 'conversation-1', objective: objective('inventario', 'jueves'), turnId: 't1', turnSequence: 1 });
        service.markReadyForAuthorization({ actorUserId: 'actor-1', dialogueScopeKey: 'conversation-1', planDigest: 'digest-inventario', turnId: 't1-plan', turnSequence: 2 });
        service.openObjective({ actorUserId: 'actor-1', dialogueScopeKey: 'conversation-1', objective: objective('proveedor', 'viernes'), turnId: 't2', turnSequence: 3 });

        const switched = service.getSnapshot('actor-1', 'conversation-1');
        expect(switched?.openObjective?.targetEntities.entityHints).toEqual(['proveedor']);
        expect(switched?.suspendedObjectives).toHaveLength(1);
        expect(switched?.suspendedObjectives[0].objective.targetEntities.entityHints).toEqual(['inventario']);
        expect(switched?.suspendedObjectives[0].planDigestRef).toBe('digest-inventario');

        const resumed = service.resumeObjective({ actorUserId: 'actor-1', dialogueScopeKey: 'conversation-1', suspendedIndex: 0, turnId: 't3', turnSequence: 4 });
        expect(resumed.openObjective?.targetEntities.entityHints).toEqual(['inventario']);
        expect(resumed.currentPlanDigestRef).toBe('digest-inventario');
        expect(resumed.lifecycle).toBe('plan_pending_authorization');
        expect(resumed.suspendedObjectives[0].objective.targetEntities.entityHints).toEqual(['proveedor']);
    });
});

