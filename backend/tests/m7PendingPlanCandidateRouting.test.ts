import { describe, expect, it } from 'vitest';
import type { AgentObjective } from '../src/types/agentPlan';
import { isSelfContainedPendingPlanCandidate } from '../src/services/agentDialogueContinuation.service';
import { containsThirdPersonPronoun } from '../src/services/agentInputInterpreter.service';

function candidate(overrides: Partial<AgentObjective> = {}): AgentObjective {
    return {
        objectiveType: 'create_personal_commitment',
        targetEntities: { personHints: [], entityHints: [] },
        constraints: { decisionHint: null, draftOnly: false, responsibleHint: null },
        desiredOutcome: 'dejarlo pendiente',
        timeConstraints: { rawHint: null },
        actor: 'actor-1', sourceUtterance: 'turno', confidence: 0.9,
        ambiguities: [], source: 'llm',
        ...overrides,
    };
}

describe('M7 pending-plan candidate routing', () => {
    it('does not trust an empty route candidate without pending-plan context', () => {
        expect(isSelfContainedPendingPlanCandidate(candidate())).toBe(false);
    });

    it('accepts a structured lifecycle decision without requiring a phrase', () => {
        expect(isSelfContainedPendingPlanCandidate(candidate({
            constraints: { decisionHint: 'reject', draftOnly: false, responsibleHint: null },
        }))).toBe(true);
    });

    it('keeps deferral structurally distinct from rejection', () => {
        expect(isSelfContainedPendingPlanCandidate(candidate({
            constraints: { decisionHint: 'defer', draftOnly: false, responsibleHint: null },
        }))).toBe(true);
    });

    it('accepts a genuinely independent candidate with its own target or time', () => {
        expect(isSelfContainedPendingPlanCandidate(candidate({
            targetEntities: { personHints: [], entityHints: ['revisar inventario'] },
        }))).toBe(true);
    });

    it('treats demonstrative person references as unresolved until Core authorizes an antecedent', () => {
        expect(containsThirdPersonPronoun('Hazlo con esa persona.')).toBe(true);
        expect(containsThirdPersonPronoun('Hazlo con esa tarea.')).toBe(false);
    });
});
