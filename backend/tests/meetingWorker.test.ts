import { describe, expect, it } from 'vitest';
import { meetingNoteFor, ownersByParticipant, trackOffsets, type StoredMeetingAnalysis } from '../src/services/meetings/meetingWorker.service';
import type { ProposedMeetingCommitment } from '../src/services/meetings/meetingTypes';

const carlos = { id: 'u-carlos', name: 'Carlos Soto', firstName: 'Carlos' };
const paula = { id: 'u-paula', name: 'Paula Ríos', firstName: 'Paula' };

function c(owner: string | null, ownerIsUser: boolean, task: string, extra: Partial<ProposedMeetingCommitment> = {}): ProposedMeetingCommitment {
    return { owner, ownerIsUser, task, dueDate: null, dueText: null, conditional: false, condition: null, dependsOn: null, quote: null, confidence: 'alta', ...extra };
}

describe('meeting worker pieces', () => {
    it('measures when each phone started recording', () => {
        expect(trackOffsets([
            { path: 'a', startedAt: '2026-11-16T13:00:02.500Z', seconds: 60 },
            { path: 'b', startedAt: '2026-11-16T13:00:00.000Z', seconds: 62 },
        ])).toEqual([2.5, 0]);
    });

    it('gives each commitment to the participant who said it', () => {
        const owners = ownersByParticipant([
            c('Carlos', true, 'Revisar el contrato'),
            c('Paula', false, 'Mandar la cotización'),
            c('paula ríos', false, 'Llamar al proveedor'),
            c('Jorge', false, 'Pagar la factura'),
        ], [carlos, paula], carlos.id);
        expect(owners).toEqual({ 'u-carlos': [0], 'u-paula': [1, 2] });
    });

    it('tells Vorian what is the person\'s own and asks it to wait for a yes', () => {
        const analysis: StoredMeetingAnalysis = {
            summary: 'Hablaron del proveedor de envases.',
            decisions: ['Firmar la otra semana'],
            commitments: [
                c('Carlos', true, 'Revisar el contrato', { dueDate: '2026-11-20', dueText: 'antes del viernes' }),
                c('Paula', false, 'Mandar la cotización', { conditional: true, condition: 'el proveedor la envíe' }),
            ],
            openQuestions: [],
            version: 'v', owners: { 'u-carlos': [0], 'u-paula': [1] }, delivered: [],
        };
        const forCarlos = meetingNoteFor(carlos, [paula], analysis);
        expect(forCarlos).toContain('Paula Ríos');
        expect(forCarlos).toContain('Quedó a cargo del usuario: 1) Revisar el contrato (fecha 2026-11-20');
        expect(forCarlos).toContain('Paula: Mandar la cotización — solo si el proveedor la envíe');
        expect(forCarlos).toContain('no anotes nada hasta que diga que sí');

        const nothing = meetingNoteFor(paula, [carlos], { ...analysis, owners: {} });
        expect(nothing).toContain('No quedó nada a cargo del usuario.');
        expect(nothing).toContain('no ofrezcas anotar nada');
    });
});
