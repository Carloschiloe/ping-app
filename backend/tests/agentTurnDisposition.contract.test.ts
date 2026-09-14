import { describe, expect, it } from 'vitest';
import { AgentTurnDispositionService } from '../src/services/agentTurnDisposition.service';
import type { AgentTurnDispositionInput, DispositionDialogueSnapshot, NormalizedDispositionSemanticTurn } from '../src/types/agentTurnDisposition';

const service = new AgentTurnDispositionService();
const active = { objectiveType: 'create_commitment', slots: { person: 'contact' } };
const suspended = { objectiveType: 'create_commitment', slots: { date: 'tomorrow' } };
const baseDialogue: DispositionDialogueSnapshot = {
    lifecycle: 'clarifying', activeDialogue: active, suspendedDialogue: null,
    version: 3, lastAppliedTurnId: 'turn-1', lastAppliedTurnSequence: 1,
};

function turn(overrides: Partial<NormalizedDispositionSemanticTurn> = {}): NormalizedDispositionSemanticTurn {
    return {
        kind: 'unknown', objective: null, lifecycleCommand: null, lifecycleTarget: null,
        explicitLifecycleCommand: false, structurallyUnambiguousResume: false, ...overrides,
    };
}

function input(overrides: Partial<AgentTurnDispositionInput> = {}): AgentTurnDispositionInput {
    return { semanticTurn: turn(), dialogue: null, ...overrides };
}

describe('M-7 Core-owned AgentTurnDisposition contract', () => {
    it.each([
        ['bare pending answer', 'answer_pending', { status: 'resolved', slot: 'person', value: 'id', updatedDialogue: { ...active, person: 'id' } }],
        ['unique person', 'answer_pending', { status: 'resolved', slot: 'person', value: 'person-id', updatedDialogue: { ...active, person: 'person-id' } }],
    ])('%s -> %s', (_name, expected, pendingSlotResolution) => {
        expect(service.decide(input({ dialogue: baseDialogue, pendingSlotResolution: pendingSlotResolution as any })).disposition).toBe(expected);
    });

    it.each([
        ['zero-match person', 'zero_match'], ['ambiguous person', 'ambiguous'],
        ['invalid date/time', 'invalid'],
    ])('%s -> reclarify', (_name, status) => {
        expect(service.decide(input({ dialogue: baseDialogue, pendingSlotResolution: { status } as any })).disposition).toBe('reclarify');
    });

    it('complete independent objective beats a possible pending-slot answer', () => {
        const result = service.decide(input({ dialogue: baseDialogue, pendingSlotResolution: { status: 'resolved', slot: 'person', value: 'x', updatedDialogue: {} }, semanticTurn: turn({ kind: 'write', objective: { objectiveType: 'send_message', domain: 'write', complete: true, slots: {} } }) }));
        expect(result.disposition).toBe('new_objective');
        expect(result.transition.suspendedDialogue).toEqual(active);
    });

    it.each([
        ['same-type new objective', 'create_commitment'], ['different-type new objective', 'send_message'],
    ])('%s suspends active dialogue without leakage', (_name, objectiveType) => {
        const result = service.decide(input({ dialogue: baseDialogue, semanticTurn: turn({ kind: 'write', objective: { objectiveType, domain: 'write', complete: true, slots: { fresh: true } } }) }));
        expect(result.disposition).toBe('new_objective');
        expect(result.transition.activeDialogue).not.toBe(active);
        expect(result.transition.suspendedDialogue).toEqual(active);
    });

    it('third dialogue-requiring objective reclarifies with no silent loss', () => {
        const result = service.decide(input({ dialogue: { ...baseDialogue, suspendedDialogue: suspended }, semanticTurn: turn({ kind: 'write', objective: { objectiveType: 'send_message', domain: 'write', complete: true, slots: {} } }) }));
        expect(result.disposition).toBe('reclarify');
        expect(result.transition.activeDialogue).toEqual(active);
        expect(result.transition.suspendedDialogue).toEqual(suspended);
    });

    it('explicit abandon is a lifecycle disposition, not domain execution', () => {
        const result = service.decide(input({ dialogue: baseDialogue, semanticTurn: turn({ kind: 'lifecycle', lifecycleCommand: 'abandon', lifecycleTarget: 'active', explicitLifecycleCommand: true }) }));
        expect(result.disposition).toBe('abandon_pending');
        expect(result.transition.activeDialogue).toBeNull();
        expect(result.requiresAuthorization).toBe(false);
        expect(result.requiresExecution).toBe(false);
    });

    it('ambiguous cancel is reclarified', () => {
        expect(service.decide(input({ dialogue: baseDialogue, semanticTurn: turn({ kind: 'lifecycle', lifecycleCommand: 'abandon', lifecycleTarget: 'ambiguous' }) })).disposition).toBe('reclarify');
    });

    it('explicit abandon can target the suspended dialogue without deleting the active one', () => {
        const result = service.decide(input({ dialogue: { ...baseDialogue, suspendedDialogue: suspended }, semanticTurn: turn({ kind: 'lifecycle', lifecycleCommand: 'abandon', lifecycleTarget: 'suspended', explicitLifecycleCommand: true }) }));
        expect(result.disposition).toBe('abandon_pending');
        expect(result.transition.activeDialogue).toEqual(active);
        expect(result.transition.suspendedDialogue).toBeNull();
    });

    it.each([
        ['explicit resume', { lifecycleCommand: 'resume' as const, lifecycleTarget: 'suspended' as const, explicitLifecycleCommand: true }],
        ['structural resume', { structurallyUnambiguousResume: true }],
    ])('%s resumes without discarding dialogue', (_name, semanticOverrides) => {
        const result = service.decide(input({ dialogue: { ...baseDialogue, activeDialogue: null, suspendedDialogue: suspended }, suspendedResumeCandidate: { structurallyValid: true, dialogue: suspended }, semanticTurn: turn(semanticOverrides) }));
        expect(result.disposition).toBe('resume_pending');
        expect(result.transition.activeDialogue).toEqual(suspended);
    });

    it('structural resume swaps active and suspended dialogue when the active interpretation is non-conflicting', () => {
        const result = service.decide(input({ dialogue: { ...baseDialogue, suspendedDialogue: suspended }, suspendedResumeCandidate: { structurallyValid: true, dialogue: suspended }, semanticTurn: turn({ kind: 'slot_answer', structurallyUnambiguousResume: true }) }));
        expect(result.disposition).toBe('resume_pending');
        expect(result.transition.activeDialogue).toEqual(suspended);
        expect(result.transition.suspendedDialogue).toEqual(active);
    });

    it('conflicting or ambiguous resume reclarifies', () => {
        expect(service.decide(input({ dialogue: { ...baseDialogue, suspendedDialogue: suspended }, semanticTurn: turn({ lifecycleCommand: 'resume', lifecycleTarget: 'ambiguous' }) })).disposition).toBe('reclarify');
    });

    it('stateless read interruption preserves the active dialogue', () => {
        const result = service.decide(input({ dialogue: baseDialogue, semanticTurn: turn({ kind: 'read' }) }));
        expect(result.disposition).toBe('suspend_pending');
        expect(result.transition.activeDialogue).toEqual(active);
    });

    it.each([
        ['ordinary read', 'read', 'ordinary_read'], ['ordinary write', 'write', 'ordinary_write'],
    ])('%s routes without dialogue', (_name, kind, expected) => {
        expect(service.decide(input({ semanticTurn: turn({ kind: kind as any }) })).disposition).toBe(expected);
    });

    it('deterministic fallback routes when normalized Core evidence is sufficient', () => {
        expect(service.decide(input({ semanticTurn: turn({ kind: 'write', objective: { objectiveType: 'create_commitment', domain: 'write', complete: true, slots: {} } }) })).disposition).toBe('ordinary_write');
    });

    it('semantic uncertainty reclarifies safely', () => {
        expect(service.decide(input({ semanticTurn: turn({ kind: 'unknown' }) })).disposition).toBe('reclarify');
    });

    it('does not expose a second interpreter or text-shape routing heuristic', async () => {
        const fs = await import('node:fs');
        const source = fs.readFileSync(new URL('../src/services/agentTurnDisposition.service.ts', import.meta.url), 'utf8');
        expect(source).not.toMatch(/LlmObjectiveInterpreter|sourceUtterance|entityHint|QUESTION_MARK|[!?].*regex/);
    });

    it('produces one pure transition and never authorization/execution', () => {
        const result = service.decide(input({ dialogue: baseDialogue, semanticTurn: turn({ kind: 'write', objective: { objectiveType: 'x', domain: 'write', complete: true, slots: {} } }) }));
        expect(result).toEqual(expect.objectContaining({ requiresAuthorization: false, requiresExecution: false, transition: expect.any(Object) }));
    });

    it('keeps actor/scope isolation as a caller invariant and represents bounded active/suspended state', () => {
        const first = service.decide(input({ dialogue: { ...baseDialogue, activeDialogue: { actor: 'a' }, suspendedDialogue: { actor: 'a-old' } }, semanticTurn: turn({ kind: 'write', objective: { objectiveType: 'x', domain: 'write', complete: true, slots: {} } }) }));
        expect(first.transition.activeDialogue).toEqual({ actor: 'a' });
        expect(first.transition.suspendedDialogue).toEqual({ actor: 'a-old' });
    });
});
