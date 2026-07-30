import { describe, expect, it } from 'vitest';
import {
    getAgreementParticipantName,
    getAgreementResponseLabel,
    getAgreementSummary,
    getInvolvedParticipants,
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

    it('shows the recorded response snapshot when an agreement exists', () => {
        expect(getInvolvedParticipants([
            {
                participant_user_id: 'user-1',
                status: 'approved',
                participant: { full_name: 'Carlos' },
            },
            {
                participant_user_id: 'user-2',
                status: 'pending',
                participant: { full_name: 'Alejandra' },
            },
        ], [], 'user-1')).toEqual([
            expect.objectContaining({
                id: 'user-1',
                name: 'Tú',
                status: 'approved',
                hasRecordedResponse: true,
            }),
            expect.objectContaining({
                id: 'user-2',
                name: 'Alejandra',
                status: 'pending',
                hasRecordedResponse: true,
            }),
        ]);
    });

    it('shows conversation participants without inventing responses for legacy commitments', () => {
        expect(getInvolvedParticipants([], [
            {
                user_id: 'user-1',
                profiles: { id: 'user-1', full_name: 'Carlos' },
            },
            {
                user_id: 'user-2',
                profiles: { id: 'user-2', full_name: 'Alejandra' },
            },
        ], 'user-1')).toEqual([
            expect.objectContaining({
                id: 'user-1',
                name: 'Tú',
                status: null,
                hasRecordedResponse: false,
            }),
            expect.objectContaining({
                id: 'user-2',
                name: 'Alejandra',
                status: null,
                hasRecordedResponse: false,
            }),
        ]);
    });
});
