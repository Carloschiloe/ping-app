import { describe, it, expect } from 'vitest';
import {
    normalizeCommitmentStatus,
    tryNormalizeCommitmentStatus,
    isPendingResponseStatus,
    isOpenCommitmentStatus,
    isClosedCommitmentStatus,
    isCanonicalCommitmentStatus,
    UnknownCommitmentStatusError,
} from '../src/utils/commitmentStatus';

describe('normalizeCommitmentStatus', () => {
    it('reconoce los 6 estados canonicos V2', () => {
        expect(normalizeCommitmentStatus('proposed')).toBe('proposed');
        expect(normalizeCommitmentStatus('accepted')).toBe('accepted');
        expect(normalizeCommitmentStatus('counter_proposal')).toBe('counter_proposal');
        expect(normalizeCommitmentStatus('rejected')).toBe('rejected');
        expect(normalizeCommitmentStatus('resolved')).toBe('resolved');
        expect(normalizeCommitmentStatus('cancelled')).toBe('cancelled');
    });

    it('"completed" ya NO es un estado canonico propio: se interpreta como alias legacy de resolved', () => {
        expect(normalizeCommitmentStatus('completed')).toBe('resolved');
    });

    it('normaliza el legacy pending a proposed', () => {
        expect(normalizeCommitmentStatus('pending')).toBe('proposed');
    });

    it('normaliza el legacy done a resolved', () => {
        expect(normalizeCommitmentStatus('done')).toBe('resolved');
    });

    it('normaliza el legacy in_progress a accepted', () => {
        expect(normalizeCommitmentStatus('in_progress')).toBe('accepted');
    });

    it('normaliza el legacy postponed a counter_proposal', () => {
        expect(normalizeCommitmentStatus('postponed')).toBe('counter_proposal');
    });

    it('trata null/undefined/"" como proposed (coincide con el default de la columna)', () => {
        expect(normalizeCommitmentStatus(null)).toBe('proposed');
        expect(normalizeCommitmentStatus(undefined)).toBe('proposed');
        expect(normalizeCommitmentStatus('')).toBe('proposed');
    });

    it('un valor desconocido NUNCA cae en silencio a "proposed": lanza UnknownCommitmentStatusError', () => {
        expect(() => normalizeCommitmentStatus('estado_inventado_xyz')).toThrow(UnknownCommitmentStatusError);
    });

    it('un numero o un objeto tambien se tratan como valor desconocido (no coaccion implicita)', () => {
        expect(() => normalizeCommitmentStatus(42)).toThrow(UnknownCommitmentStatusError);
        expect(() => normalizeCommitmentStatus({ foo: 'bar' })).toThrow(UnknownCommitmentStatusError);
    });
});

describe('tryNormalizeCommitmentStatus', () => {
    it('devuelve el estado canonico para un valor valido', () => {
        expect(tryNormalizeCommitmentStatus('accepted')).toBe('accepted');
    });

    it('devuelve null (nunca lanza) para un valor desconocido', () => {
        expect(tryNormalizeCommitmentStatus('estado_inventado_xyz')).toBeNull();
    });
});

describe('isCanonicalCommitmentStatus', () => {
    it('true para los 6 valores canonicos', () => {
        expect(isCanonicalCommitmentStatus('resolved')).toBe(true);
        expect(isCanonicalCommitmentStatus('cancelled')).toBe(true);
    });

    it('false para un alias legacy (no es canonico, aunque sea normalizable)', () => {
        expect(isCanonicalCommitmentStatus('completed')).toBe(false);
        expect(isCanonicalCommitmentStatus('pending')).toBe(false);
    });
});

describe('isPendingResponseStatus', () => {
    it('proposed y counter_proposal estan pendientes de respuesta', () => {
        expect(isPendingResponseStatus('proposed')).toBe(true);
        expect(isPendingResponseStatus('counter_proposal')).toBe(true);
    });

    it('accepted/resolved/cancelled no estan pendientes de respuesta', () => {
        expect(isPendingResponseStatus('accepted')).toBe(false);
        expect(isPendingResponseStatus('resolved')).toBe(false);
        expect(isPendingResponseStatus('cancelled')).toBe(false);
    });
});

describe('isOpenCommitmentStatus', () => {
    it('proposed/accepted/counter_proposal se consideran abiertos', () => {
        expect(isOpenCommitmentStatus('proposed')).toBe(true);
        expect(isOpenCommitmentStatus('accepted')).toBe(true);
        expect(isOpenCommitmentStatus('counter_proposal')).toBe(true);
    });

    it('resolved/cancelled/rejected NO se consideran abiertos', () => {
        expect(isOpenCommitmentStatus('resolved')).toBe(false);
        expect(isOpenCommitmentStatus('cancelled')).toBe(false);
        expect(isOpenCommitmentStatus('rejected')).toBe(false);
    });
});

describe('isClosedCommitmentStatus', () => {
    it('resolved/cancelled/rejected se consideran cerrados', () => {
        expect(isClosedCommitmentStatus('resolved')).toBe(true);
        expect(isClosedCommitmentStatus('cancelled')).toBe(true);
        expect(isClosedCommitmentStatus('rejected')).toBe(true);
    });

    it('proposed/accepted/counter_proposal no se consideran cerrados', () => {
        expect(isClosedCommitmentStatus('proposed')).toBe(false);
        expect(isClosedCommitmentStatus('accepted')).toBe(false);
        expect(isClosedCommitmentStatus('counter_proposal')).toBe(false);
    });
});

// M-1G.2 — test de paridad documental (sección 9 del ticket): mobile y
// backend tienen archivos `commitmentStatus.ts` SEPARADOS (mobile es un
// "espejo" documentado, sin compartir código físicamente). El criterio de
// "vencido" en mobile (TaskDashboardScreen.tsx, InsightsScreen.tsx) excluye
// exactamente `['resolved', 'cancelled', 'rejected'].includes(status)`. Este
// test fija ese contrato exacto contra `isOpenCommitmentStatus` -- si algún
// día uno de los 6 CanonicalCommitmentStatus cambia de lado sin el otro,
// este test debe fallar antes de que la respuesta del Agent vuelva a
// divergir de lo que el usuario ve en la UI (causa raíz real de M-1G-S2/
// M-1G.1/M-1G.2).
describe('M-1G.2: paridad con el criterio de "vencido" de mobile (contrato documental)', () => {
    // Copia LITERAL del criterio de exclusión usado en
    // mobile/src/screens/TaskDashboardScreen.tsx e InsightsScreen.tsx.
    const MOBILE_OVERDUE_EXCLUDED_STATUSES = ['resolved', 'cancelled', 'rejected'];

    it('isOpenCommitmentStatus(status) === true exactamente para los mismos estados que mobile NO excluye de "vencido"', () => {
        const ALL_STATUSES = ['proposed', 'accepted', 'counter_proposal', 'rejected', 'resolved', 'cancelled'];
        for (const status of ALL_STATUSES) {
            const mobileConsidersCandidateForOverdue = !MOBILE_OVERDUE_EXCLUDED_STATUSES.includes(status);
            expect(isOpenCommitmentStatus(status)).toBe(mobileConsidersCandidateForOverdue);
        }
    });
});
