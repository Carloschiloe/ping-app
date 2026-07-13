import { describe, it, expect } from 'vitest';
import {
    normalizeCommitmentStatus,
    isPendingResponseStatus,
    isOpenCommitmentStatus,
} from '../src/utils/commitmentStatus';

describe('normalizeCommitmentStatus', () => {
    it('reconoce proposed', () => {
        expect(normalizeCommitmentStatus('proposed')).toBe('proposed');
    });

    it('reconoce accepted', () => {
        expect(normalizeCommitmentStatus('accepted')).toBe('accepted');
    });

    it('reconoce rejected', () => {
        expect(normalizeCommitmentStatus('rejected')).toBe('rejected');
    });

    it('reconoce completed', () => {
        expect(normalizeCommitmentStatus('completed')).toBe('completed');
    });

    it('reconoce counter_proposal', () => {
        expect(normalizeCommitmentStatus('counter_proposal')).toBe('counter_proposal');
    });

    it('normaliza el legacy pending a proposed', () => {
        expect(normalizeCommitmentStatus('pending')).toBe('proposed');
    });

    it('normaliza el legacy done a completed', () => {
        expect(normalizeCommitmentStatus('done')).toBe('completed');
    });

    it('normaliza el legacy in_progress a accepted', () => {
        expect(normalizeCommitmentStatus('in_progress')).toBe('accepted');
    });

    it('normaliza el legacy postponed a counter_proposal', () => {
        expect(normalizeCommitmentStatus('postponed')).toBe('counter_proposal');
    });

    it('un valor desconocido no se trata como un estado válido propio: cae al default seguro (proposed)', () => {
        expect(normalizeCommitmentStatus('estado_inventado_xyz')).toBe('proposed');
    });

    it('trata null como proposed', () => {
        expect(normalizeCommitmentStatus(null)).toBe('proposed');
    });

    it('trata undefined como proposed', () => {
        expect(normalizeCommitmentStatus(undefined)).toBe('proposed');
    });
});

describe('isPendingResponseStatus', () => {
    it('proposed está pendiente de respuesta', () => {
        expect(isPendingResponseStatus('proposed')).toBe(true);
    });

    it('counter_proposal está pendiente de respuesta', () => {
        expect(isPendingResponseStatus('counter_proposal')).toBe(true);
    });

    it('accepted no está pendiente de respuesta', () => {
        expect(isPendingResponseStatus('accepted')).toBe(false);
    });

    it('rejected no está pendiente de respuesta', () => {
        expect(isPendingResponseStatus('rejected')).toBe(false);
    });
});

describe('isOpenCommitmentStatus', () => {
    it('accepted se considera abierto (activo)', () => {
        expect(isOpenCommitmentStatus('accepted')).toBe(true);
    });

    it('proposed se considera abierto', () => {
        expect(isOpenCommitmentStatus('proposed')).toBe(true);
    });

    it('completed no se considera abierto (cerrado)', () => {
        expect(isOpenCommitmentStatus('completed')).toBe(false);
    });

    it('rejected no se considera abierto (cerrado)', () => {
        expect(isOpenCommitmentStatus('rejected')).toBe(false);
    });
});
