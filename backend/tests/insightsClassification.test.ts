import { describe, it, expect } from 'vitest';
import { classifyOpenCommitment } from '../src/controllers/insights.controller';

const USER = 'u1';
const NOW = new Date('2026-07-13T12:00:00.000Z').getTime();

describe('classifyOpenCommitment (Insights V2)', () => {
    it('accion realizada pero no resuelta tiene prioridad maxima: actionDonePendingResolution', () => {
        const bucket = classifyOpenCommitment({ action_completed_at: '2026-07-10T00:00:00.000Z', resolved_at: null, waiting_on_user_id: USER, due_at: '2026-07-01T00:00:00.000Z' }, USER, NOW);
        expect(bucket).toBe('actionDonePendingResolution');
    });

    it('cuando el usuario actual es quien debe actuar (waiting_on_user_id === userId): needsAttention', () => {
        const bucket = classifyOpenCommitment({ action_completed_at: null, resolved_at: null, waiting_on_user_id: USER, due_at: null }, USER, NOW);
        expect(bucket).toBe('needsAttention');
    });

    it('needsAttention tiene prioridad sobre overdue aunque la fecha ya haya pasado', () => {
        const bucket = classifyOpenCommitment({ action_completed_at: null, resolved_at: null, waiting_on_user_id: USER, due_at: '2020-01-01T00:00:00.000Z' }, USER, NOW);
        expect(bucket).toBe('needsAttention');
    });

    it('fecha pasada sin nadie bloqueando al usuario actual: overdue', () => {
        const bucket = classifyOpenCommitment({ action_completed_at: null, resolved_at: null, waiting_on_user_id: null, due_at: '2020-01-01T00:00:00.000Z' }, USER, NOW);
        expect(bucket).toBe('overdue');
    });

    it('esperando respuesta de OTRA persona (no el usuario actual): awaitingResponse', () => {
        const bucket = classifyOpenCommitment({ action_completed_at: null, resolved_at: null, waiting_on_user_id: 'otro-usuario', due_at: null }, USER, NOW);
        expect(bucket).toBe('awaitingResponse');
    });

    it('esperando respuesta de un contacto externo (waiting_on_contact_id): awaitingResponse', () => {
        const bucket = classifyOpenCommitment({ action_completed_at: null, resolved_at: null, waiting_on_user_id: null, waiting_on_contact_id: 'contact-1', due_at: null }, USER, NOW);
        expect(bucket).toBe('awaitingResponse');
    });

    it('fecha futura, sin nada bloqueante: upcoming', () => {
        const bucket = classifyOpenCommitment({ action_completed_at: null, resolved_at: null, waiting_on_user_id: null, due_at: '2026-08-01T00:00:00.000Z' }, USER, NOW);
        expect(bucket).toBe('upcoming');
    });

    it('sin fecha y sin nada bloqueante: noDate', () => {
        const bucket = classifyOpenCommitment({ action_completed_at: null, resolved_at: null, waiting_on_user_id: null, due_at: null }, USER, NOW);
        expect(bucket).toBe('noDate');
    });

    it('cada compromiso cae en exactamente un bucket (invariante de no-duplicado)', () => {
        const commitment = { action_completed_at: null, resolved_at: null, waiting_on_user_id: USER, due_at: '2020-01-01T00:00:00.000Z' };
        const bucket = classifyOpenCommitment(commitment, USER, NOW);
        const allBuckets = ['actionDonePendingResolution', 'needsAttention', 'overdue', 'awaitingResponse', 'upcoming', 'noDate'];
        expect(allBuckets.filter((b) => b === bucket)).toHaveLength(1);
    });
});
