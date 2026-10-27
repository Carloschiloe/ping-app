import { describe, expect, it } from 'vitest';
import type { AgentObjective } from '../src/types/agentPlan';
import type { AgentDialogueState } from '../src/types/agentDialogueState';
import { groundPendingPlanCandidate, isCompletePendingPlanReplacement, isSelfContainedPendingPlanCandidate, reconcileDialogueTurn } from '../src/services/agentDialogueContinuation.service';
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

function pendingState(overrides: Partial<AgentDialogueState> = {}): AgentDialogueState {
    return {
        actorUserId: 'actor-1',
        dialogueScopeKey: 'agent:mobile',
        lifecycle: 'plan_pending_authorization',
        openObjective: candidate({
            targetEntities: { personHints: [], entityHints: ['revisar inventario'] },
            timeConstraints: { rawHint: 'mañana' },
        }),
        ambiguities: [],
        pendingClarification: null,
        corrections: {},
        referents: [],
        currentPlanDigestRef: 'digest-1',
        currentAuthorizationIdRef: null,
        version: 1,
        lastTurnSequence: 1,
        createdAt: '2026-10-27T00:00:00.000Z',
        updatedAt: '2026-10-27T00:00:00.000Z',
        expiresAt: '2026-10-27T00:10:00.000Z',
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

    it('allows a complete replacement before applying a concurrent suspend signal', () => {
        expect(isCompletePendingPlanReplacement(candidate({
            dialogueAct: 'new_objective',
            targetEntities: { personHints: [], entityHints: ['preparar la llamada al proveedor'] },
            timeConstraints: { rawHint: 'viernes' },
        }))).toBe(true);
        expect(isCompletePendingPlanReplacement(candidate({
            dialogueAct: 'correct',
            targetEntities: { personHints: [], entityHints: ['preparar la llamada al proveedor'] },
            timeConstraints: { rawHint: 'viernes' },
        }))).toBe(false);
    });

    it('does not call an untimed new objective a complete replacement', () => {
        expect(isCompletePendingPlanReplacement(candidate({
            dialogueAct: 'new_objective',
            targetEntities: { personHints: [], entityHints: ['revisar otro asunto'] },
            timeConstraints: { rawHint: null },
        }))).toBe(false);
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

    it('gives Core semantic dialogue signals precedence through the unified reconciler', () => {
        expect(reconcileDialogueTurn({
            dialogueState: pendingState(),
            semantic: { route: 'write', interpretation: { dialogueAct: 'confirm', dialogueControl: null, followUpAttribute: null }, objective: null },
        })).toEqual({ kind: 'approve' });
        expect(reconcileDialogueTurn({
            dialogueState: pendingState(),
            semantic: { route: 'read', interpretation: { dialogueAct: null, dialogueControl: 'suspend_current', followUpAttribute: null }, objective: null },
        })).toEqual({ kind: 'suspend_current' });
        expect(reconcileDialogueTurn({
            dialogueState: pendingState(),
            semantic: { route: 'read', interpretation: { dialogueAct: null, dialogueControl: null, followUpAttribute: 'date' }, objective: null },
        })).toEqual({ kind: 'follow_up', attribute: 'date' });
        expect(reconcileDialogueTurn({
            dialogueState: pendingState(),
            semantic: { route: 'write', interpretation: { dialogueAct: 'other', dialogueControl: null, followUpAttribute: null }, objective: null },
        })).toEqual({ kind: 'independent' });
    });
});
