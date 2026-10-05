import { describe, expect, it } from 'vitest';
import type { AgentObjective } from '../src/types/agentPlan';
import { classifyPendingPlanSemanticRelation, groundPendingPlanCandidate, isSelfContainedPendingPlanCandidate } from '../src/services/agentDialogueContinuation.service';
import { containsThirdPersonPronoun, hasUnresolvedPersonReference } from '../src/services/agentInputInterpreter.service';

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

    it('grounds a pending candidate temporal slot in the current utterance only', () => {
        const grounded = groundPendingPlanCandidate(candidate({
            targetEntities: { personHints: [], entityHints: ['llamada al proveedor'] },
            slotDelta: { title: 'llamada al proveedor', date: 'jueves viernes', time: null },
            timeConstraints: { rawHint: 'jueves viernes' },
        }), 'Cambiemos de objetivo: prepara la llamada al proveedor para el viernes.');
        expect(grounded.timeConstraints.rawHint).toMatch(/viernes/i);
        expect(grounded.timeConstraints.rawHint).not.toMatch(/jueves/i);
        expect(grounded.slotDelta?.date).toBeNull();
    });

    it('does not reinterpret lifecycle decisions as temporal plan edits', () => {
        const decision = candidate({
            constraints: { decisionHint: 'reject', draftOnly: false, responsibleHint: null },
            timeConstraints: { rawHint: null },
        });
        expect(groundPendingPlanCandidate(decision, 'No lo ejecutes por ahora')).toEqual(decision);
    });

    it('treats demonstrative person references as unresolved until Core authorizes an antecedent', () => {
        expect(containsThirdPersonPronoun('Hazlo con esa persona.')).toBe(true);
        expect(containsThirdPersonPronoun('Hazlo con esa tarea.')).toBe(false);
    });

    it('blocks an unresolved person reference without blocking a concrete canonical hint', () => {
        expect(hasUnresolvedPersonReference('Hazlo con esa persona.', candidate())).toBe(true);
        expect(hasUnresolvedPersonReference('Hazlo con Ana.', candidate({
            targetEntities: { personHints: ['Ana'], entityHints: [] },
        }))).toBe(false);
    });

    it('gives Core semantic dialogue signals precedence over objective proposals', () => {
        expect(classifyPendingPlanSemanticRelation({ dialogueAct: 'confirm' })).toEqual({ kind: 'approve' });
        expect(classifyPendingPlanSemanticRelation({ dialogueControl: 'suspend_current' })).toEqual({ kind: 'suspend' });
        expect(classifyPendingPlanSemanticRelation({ followUpAttribute: 'date' })).toEqual({ kind: 'follow_up', attribute: 'date' });
        expect(classifyPendingPlanSemanticRelation({ dialogueAct: 'other' })).toEqual({ kind: 'none' });
    });
});
