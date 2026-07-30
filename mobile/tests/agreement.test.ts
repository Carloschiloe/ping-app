import { describe, expect, it } from 'vitest';
import {
    getAgreementParticipantName,
    getAgreementResponseLabel,
    getAgreementSummary,
} from '../src/utils/agreement';

describe('shared commitment agreement presentation', () => {
    it('keeps the proposal pending until every participant approves', () => {
        expect(getAgreementSummary([
            { participant_user_id: 'a', status: 'approved' },
            { participant_user_id: 'b', status: 'pending' },
            { participant_user_id: 'c', status: 'pending' },
        ])).toMatchObject({
            approved: 1,
            pending: 2,
            total: 3,
            label: 'Pendiente 1/3',
        });
    });

    it('distinguishes a counterproposal and rejection', () => {
        expect(getAgreementSummary([
            { participant_user_id: 'a', status: 'approved' },
            { participant_user_id: 'b', status: 'counter_proposed' },
            { participant_user_id: 'c', status: 'pending' },
        ]).label).toBe('Nuevo horario');

        expect(getAgreementSummary([
            { participant_user_id: 'a', status: 'approved' },
            { participant_user_id: 'b', status: 'rejected' },
        ]).label).toBe('Rechazado');
    });

    it('uses understandable participant and response labels', () => {
        expect(getAgreementParticipantName({
            participant_user_id: 'user-1',
            status: 'approved',
            participant: { full_name: 'Carlos' },
        }, 'user-1')).toBe('Tú');
        expect(getAgreementResponseLabel('counter_proposed')).toBe('Sugirió otro horario');
    });
});
