import { describe, it, expect } from 'vitest';
import {
    isAgendaVisibleStatus,
    normalizeCommitmentStatus,
    isCanonicalCommitmentStatus,
} from '../src/utils/commitmentStatus';

describe('normalizeCommitmentStatus', () => {
    it('reconoce "resolved" como estado canonico V2 (se muestra como Resuelto)', () => {
        expect(normalizeCommitmentStatus('resolved')).toBe('resolved');
        expect(isCanonicalCommitmentStatus('resolved')).toBe(true);
    });

    it('reconoce "cancelled" como estado canonico V2', () => {
        expect(normalizeCommitmentStatus('cancelled')).toBe('cancelled');
    });

    it('normaliza el legacy "completed" a "resolved" SOLO como alias de compatibilidad de entrada', () => {
        expect(normalizeCommitmentStatus('completed')).toBe('resolved');
        // 'completed' ya no es un estado canonico V2 valido.
        expect(isCanonicalCommitmentStatus('completed')).toBe(false);
    });

    it('normaliza otros legacy conocidos (pending/in_progress/postponed/done)', () => {
        expect(normalizeCommitmentStatus('pending')).toBe('proposed');
        expect(normalizeCommitmentStatus('in_progress')).toBe('accepted');
        expect(normalizeCommitmentStatus('postponed')).toBe('counter_proposal');
        expect(normalizeCommitmentStatus('done')).toBe('resolved');
    });

    it('un valor totalmente desconocido no crashea la UI: cae a "proposed" en vez de propagar el error', () => {
        expect(normalizeCommitmentStatus('algo-inventado-que-no-existe')).toBe('proposed');
    });

    it('null/undefined se interpreta como "proposed"', () => {
        expect(normalizeCommitmentStatus(null)).toBe('proposed');
        expect(normalizeCommitmentStatus(undefined)).toBe('proposed');
    });

    it('mantiene en Agenda los compromisos aceptados y cancelados', () => {
        expect(isAgendaVisibleStatus('accepted')).toBe(true);
        expect(isAgendaVisibleStatus('cancelled')).toBe(true);
        expect(isAgendaVisibleStatus('proposed')).toBe(false);
        expect(isAgendaVisibleStatus('resolved')).toBe(false);
    });
});
