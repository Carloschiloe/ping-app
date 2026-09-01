import { describe, expect, it } from 'vitest';
import {
    buildDeterministicCommitmentSuggestion,
    reconcileCommitmentSuggestion,
} from '../src/utils/deterministicCommitmentSuggestion';

const REFERENCE_DATE = new Date('2026-07-29T20:00:00.000Z');

describe('deterministic commitment suggestion', () => {
    it('detecta una reunión clara con fecha y hora relativas', () => {
        const suggestion = buildDeterministicCommitmentSuggestion(
            'Mañana a las 12:00 veremos película Spiderman',
            REFERENCE_DATE
        );

        expect(suggestion).not.toBeNull();
        expect(suggestion?.dueAt).toBe('2026-07-30T16:00:00.000Z');
        expect(suggestion?.type).toBe('meeting');
        expect(suggestion?.replyText).toBe('Agendar');
    });

    it('detecta una tarea personal fechada', () => {
        const suggestion = buildDeterministicCommitmentSuggestion(
            'Tengo que comprar medicamentos mañana a las 10',
            REFERENCE_DATE
        );

        expect(suggestion).not.toBeNull();
        expect(suggestion?.type).toBe('task');
    });

    it('resuelve próximo miércoles con hora aunque haya palabras entre ambos', () => {
        const thursdayReference = new Date('2026-07-30T15:12:00.000Z');
        const suggestion = buildDeterministicCommitmentSuggestion(
            'El próximo miércoles hacer supermercado a las 13:00',
            thursdayReference
        );

        expect(suggestion?.dueAt).toBe('2026-08-05T17:00:00.000Z');
        expect(suggestion?.title).toBe('hacer supermercado');
    });

    it('la fecha explícita prevalece si la IA propone erróneamente otro día', () => {
        const deterministic = buildDeterministicCommitmentSuggestion(
            'El próximo miércoles hacer supermercado a las 13:00',
            new Date('2026-07-30T15:12:00.000Z')
        );
        const reconciled = reconcileCommitmentSuggestion({
            hasCommitment: true,
            title: 'Hacer supermercado',
            dueAt: '2026-08-03T15:00:00.000Z',
            type: 'task',
        }, deterministic);

        expect(reconciled?.title).toBe('Hacer supermercado');
        expect(reconciled?.dueAt).toBe('2026-08-05T17:00:00.000Z');
    });

    it('no convierte una fecha sin acción en compromiso', () => {
        expect(
            buildDeterministicCommitmentSuggestion('Mañana es jueves', REFERENCE_DATE)
        ).toBeNull();
    });

    it('no inventa fecha para una tarea sin referencia temporal', () => {
        expect(
            buildDeterministicCommitmentSuggestion('Tengo que comprar pan', REFERENCE_DATE)
        ).toBeNull();
    });

    it('conserva 16:00 del transcript real aunque la IA proponga otra hora', () => {
        const deterministic = buildDeterministicCommitmentSuggestion(
            'Necesitamos juntarnos hoy día en el terreno a las 16 horas.',
            new Date('2026-09-01T18:33:53.000Z'),
            'America/Santiago',
        );
        const reconciled = reconcileCommitmentSuggestion({
            hasCommitment: true,
            title: 'Juntarse en el terreno',
            dueAt: '2026-09-01T19:00:00-03:00',
            type: 'meeting',
        }, deterministic);

        expect(deterministic?.dueAt).toBe('2026-09-01T20:00:00.000Z');
        expect(reconciled?.dueAt).toBe('2026-09-01T20:00:00.000Z');
    });
});
