import { describe, expect, it } from 'vitest';
import { personClarification, temporalClarification, structuredClarification } from '../src/services/agentStructuredClarification.service';

const semantic = {
    version: 3 as const, kind: 'write_request' as const, domain: 'commitment' as const,
    objectiveCompleteness: 'incomplete' as const, lifecycleCommand: 'none' as const,
    lifecycleTarget: 'unspecified' as const, lifecycleEvidence: 'unknown' as const,
    pendingSlotAnswer: 'not_a_slot_answer' as const, continuationLike: 'unknown' as const,
    candidateSlotType: 'person', independentObjective: 'yes' as const,
    objectiveType: 'create_commitment_or_proposal', entityHints: ['reunión'],
    slots: { title: 'reunión' }, ambiguityFields: ['person'], confidence: .8,
    source: 'llm' as const,
};

describe('M-7 structured clarification contract', () => {
    it('preserves canonical person options and continuation state without raw input', () => {
        const result = personClarification({ semanticTurn: semantic, person: {
            resolved: null, ambiguous: true,
            candidates: [{ kind: 'contact', id: 'contact-1', displayName: 'Persona Uno' }],
        } });
        expect(result).toMatchObject({ field: 'person', reason: 'person_resolution', condition: 'ambiguous', inputMode: 'choose_option', options: [{ id: 'contact-1', label: 'Persona Uno' }], continuation: { objectiveType: 'create_commitment_or_proposal', pendingField: 'person' } });
        expect(JSON.stringify(result)).not.toContain('raw');
        expect(JSON.stringify(result)).not.toContain('email');
    });

    it('preserves zero-match as distinct from ambiguity and fabricates no option', () => {
        const result = personClarification({ semanticTurn: semantic, person: { resolved: null, ambiguous: false, candidates: [] } });
        expect(result.condition).toBe('zero_match');
        expect(result.options).toEqual([]);
    });

    it('preserves temporal ambiguity and canonical temporal details', () => {
        const temporal = { status: 'ambiguous' as const, reason: 'dst_fold' as const, civil: { year: 2026, month: 11, day: 1, hour: 1, minute: 30 }, timezone: 'America/New_York', candidates: ['2026-11-01T05:30:00.000Z', '2026-11-01T06:30:00.000Z'] };
        const result = temporalClarification({ semanticTurn: semantic, temporal });
        expect(result).toMatchObject({ field: 'temporal', condition: 'ambiguous', temporal });
    });

    it('does not require a question or model to represent missing information', () => {
        const result = structuredClarification({ semanticTurn: semantic, field: 'title', reason: 'title' });
        expect(result).toMatchObject({ field: 'title', reason: 'title', condition: 'missing', inputMode: 'provide_value', options: [] });
    });
});
