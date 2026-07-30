import { describe, expect, it } from 'vitest';
import { buildDeterministicCommitmentSuggestion } from '../src/utils/deterministicCommitmentSuggestion';

const REFERENCE_DATE = new Date(2026, 6, 29, 16, 0, 0);

describe('deterministic commitment suggestion', () => {
    it('detects a clear meeting with relative date and time', () => {
        const suggestion = buildDeterministicCommitmentSuggestion(
            'Mañana a las 12:00 veremos película Spiderman',
            REFERENCE_DATE
        );

        expect(suggestion).not.toBeNull();
        expect(suggestion?.dueAt).toContain('2026-07-30T12:00:00-03:00');
        expect(suggestion?.type).toBe('meeting');
        expect(suggestion?.replyText).toBe('Agendar');
    });

    it('detects a dated personal task', () => {
        const suggestion = buildDeterministicCommitmentSuggestion(
            'Tengo que comprar medicamentos mañana a las 10',
            REFERENCE_DATE
        );

        expect(suggestion).not.toBeNull();
        expect(suggestion?.type).toBe('task');
    });

    it('detects the infinitive used in a dated note', () => {
        const suggestion = buildDeterministicCommitmentSuggestion(
            'Próximo Viernes a las 12:00 ver Spiderman',
            REFERENCE_DATE
        );

        expect(suggestion).not.toBeNull();
        expect(suggestion?.dueAt).toContain('T12:00:00-03:00');
        expect(suggestion?.title).toBe('ver Spiderman');
    });

    it('does not turn a date without an action into a commitment', () => {
        expect(
            buildDeterministicCommitmentSuggestion('Mañana es jueves', REFERENCE_DATE)
        ).toBeNull();
    });

    it('does not invent a due date for an undated task', () => {
        expect(
            buildDeterministicCommitmentSuggestion('Tengo que comprar pan', REFERENCE_DATE)
        ).toBeNull();
    });
});
