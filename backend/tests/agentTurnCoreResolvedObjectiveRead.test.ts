import { describe, expect, it } from 'vitest';
import type { AgentObjective } from '../src/types/agentPlan';
import {
    describeOpenObjectiveSchedule,
    openObjectiveForAttributeRead,
} from '../src/services/agentTurnCore.service';

function objective(overrides: Partial<AgentObjective> = {}): AgentObjective {
    return {
        objectiveType: 'create_personal_commitment',
        targetEntities: { personHints: [], entityHints: ['llamar a Prueba Ping'] },
        constraints: {},
        desiredOutcome: 'llamar a Prueba Ping',
        timeConstraints: { rawHint: 'mañana a las 10' },
        actor: 'actor-1',
        sourceUtterance: 'Recuérdame llamar a Prueba Ping mañana a las 10.',
        confidence: 0.8,
        ambiguities: [],
        source: 'llm',
        slotDelta: { title: 'llamar a Prueba Ping', date: 'mañana', time: '10' },
        ...overrides,
    };
}

describe('date/time reads after an objective was executed', () => {
    // Observed on device: "¿Qué tengo pendiente mañana?" right after creating
    // a commitment was answered from the retained draft ("El objetivo
    // pendiente está previsto para mañana a las 10") instead of the user data.
    it('never answers from the draft once the objective is resolved', () => {
        expect(openObjectiveForAttributeRead({ lifecycle: 'resolved', openObjective: objective() })).toBeNull();
    });

    it('still answers from the draft while the objective is being prepared', () => {
        const draft = objective();
        expect(openObjectiveForAttributeRead({ lifecycle: 'clarifying', openObjective: draft })).toBe(draft);
        expect(openObjectiveForAttributeRead({ lifecycle: 'plan_pending_authorization', openObjective: draft })).toBe(draft);
        expect(openObjectiveForAttributeRead(null)).toBeNull();
    });

    it('names what is scheduled instead of an internal "objective"', () => {
        const answer = describeOpenObjectiveSchedule(objective(), 'es');
        expect(answer).toBe('«llamar a Prueba Ping» está previsto para mañana a las 10.');
        expect(answer).not.toMatch(/objetivo/i);
    });

    it('falls back to the desired outcome when no title slot exists', () => {
        expect(describeOpenObjectiveSchedule(objective({ slotDelta: undefined }), 'es'))
            .toBe('«llamar a Prueba Ping» está previsto para mañana a las 10.');
    });
});
