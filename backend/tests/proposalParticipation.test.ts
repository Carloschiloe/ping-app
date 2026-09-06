import { describe, expect, it } from 'vitest';
import { getProposalParticipationState } from '../src/utils/proposalParticipation';

// M-1H v5 — CANONICAL PROPOSAL PARTICIPATION MODEL. Caso real físico
// certificado: "Entrenar" -- Carlos (proposer + responsible) ya aprobó,
// Alejandra (participante requerida) sigue pendiente. Ni la UI ni el Agent
// tenían forma de responder "¿quién falta por responder?" -- sólo miraban
// status==='proposed'. getProposalParticipationState es la única función
// canónica que responde eso (ver mobile/src/utils/agreement.ts para el
// contrato espejo del lado mobile).
const CARLOS = 'carlos-id';
const ALEJANDRA = 'alejandra-id';

describe('CANONICAL PROPOSAL PARTICIPATION MODEL: caso real "Entrenar" (sección 4/21 del ticket)', () => {
    const entrenar = {
        proposed_by_user_id: CARLOS,
        proposed_responsible_user_id: CARLOS,
        responses: [
            { participant_user_id: CARLOS, status: 'approved' as const },
            { participant_user_id: ALEJANDRA, status: 'pending' as const },
        ],
    };

    it('vista de Carlos (proposer, responsible, ya aprobó)', () => {
        const state = getProposalParticipationState(entrenar, CARLOS);
        expect(state).toEqual({
            actorRole: 'proposer',
            actorHasApproved: true,
            actorCanRespond: false,
            pendingResponderIds: [ALEJANDRA],
            approvedResponderIds: [CARLOS],
            rejectedResponderIds: [],
            isFullyApproved: false,
            requiresMoreResponses: true,
        });
    });

    it('vista de Alejandra (participante requerida, pendiente)', () => {
        const state = getProposalParticipationState(entrenar, ALEJANDRA);
        expect(state.actorRole).toBe('participant');
        expect(state.actorHasApproved).toBe(false);
        expect(state.actorCanRespond).toBe(true);
        expect(state.pendingResponderIds).toEqual([]); // excluye al actor mismo
        expect(state.isFullyApproved).toBe(false);
    });
});

describe('CANONICAL PROPOSAL PARTICIPATION MODEL: proposal SOLO (sin filas de respuesta)', () => {
    const solo = { proposed_by_user_id: CARLOS, proposed_responsible_user_id: CARLOS, responses: [] };

    it('el owner puede confirmarla directamente -- sin depender de nadie más', () => {
        const state = getProposalParticipationState(solo, CARLOS);
        expect(state.actorRole).toBe('proposer');
        expect(state.actorCanRespond).toBe(true);
        expect(state.actorHasApproved).toBe(false); // no hay concepto de "aprobación" individual sin filas
        expect(state.pendingResponderIds).toEqual([]);
        expect(state.isFullyApproved).toBe(true);
        expect(state.requiresMoreResponses).toBe(false);
    });

    it('alguien que no es el owner nunca puede responder una proposal solo ajena', () => {
        const state = getProposalParticipationState(solo, ALEJANDRA);
        expect(state.actorRole).toBe('none');
        expect(state.actorCanRespond).toBe(false);
    });
});

describe('CANONICAL PROPOSAL PARTICIPATION MODEL: full approval (sección 22)', () => {
    it('todas las respuestas approved -> isFullyApproved=true, requiresMoreResponses=false', () => {
        const state = getProposalParticipationState({
            proposed_by_user_id: CARLOS, proposed_responsible_user_id: CARLOS,
            responses: [
                { participant_user_id: CARLOS, status: 'approved' },
                { participant_user_id: ALEJANDRA, status: 'approved' },
            ],
        }, CARLOS);
        expect(state.isFullyApproved).toBe(true);
        expect(state.requiresMoreResponses).toBe(false);
        expect(state.actorCanRespond).toBe(false); // Carlos ya respondió, nada más que hacer
    });
});

describe('CANONICAL PROPOSAL PARTICIPATION MODEL: counterproposal (sección 12/23)', () => {
    it('tras una contrapropuesta de Alejandra, Carlos vuelve a poder responder (su fila se resetea a pending)', () => {
        // Refleja el efecto real del RPC respond_to_commitment_proposal
        // (decision='counter_propose'): TODAS las respuestas vuelven a
        // 'pending', excepto la del contraproponente ('counter_proposed').
        const afterCounter = {
            proposed_by_user_id: CARLOS, proposed_responsible_user_id: CARLOS,
            responses: [
                { participant_user_id: CARLOS, status: 'pending' as const },
                { participant_user_id: ALEJANDRA, status: 'counter_proposed' as const },
            ],
        };
        const state = getProposalParticipationState(afterCounter, CARLOS);
        expect(state.actorCanRespond).toBe(true);
        expect(state.isFullyApproved).toBe(false);
    });
});

describe('CANONICAL PROPOSAL PARTICIPATION MODEL: reject (sección 24)', () => {
    it('una respuesta rejected se refleja en rejectedResponderIds, nunca cuenta como aprobada', () => {
        const state = getProposalParticipationState({
            proposed_by_user_id: CARLOS, proposed_responsible_user_id: CARLOS,
            responses: [
                { participant_user_id: CARLOS, status: 'approved' },
                { participant_user_id: ALEJANDRA, status: 'rejected' },
            ],
        }, CARLOS);
        expect(state.rejectedResponderIds).toEqual([ALEJANDRA]);
        expect(state.isFullyApproved).toBe(false);
    });
});

describe('CANONICAL PROPOSAL PARTICIPATION MODEL: actorRole', () => {
    it('resuelve "responsible" cuando el actor es el responsable pero no el proposer', () => {
        const state = getProposalParticipationState({
            proposed_by_user_id: CARLOS, proposed_responsible_user_id: ALEJANDRA,
            responses: [
                { participant_user_id: CARLOS, status: 'approved' },
                { participant_user_id: ALEJANDRA, status: 'pending' },
            ],
        }, ALEJANDRA);
        expect(state.actorRole).toBe('responsible');
    });

    it('resuelve "participant" cuando el actor sólo tiene una fila de respuesta (ni proposer ni responsible)', () => {
        const otro = 'otro-id';
        const state = getProposalParticipationState({
            proposed_by_user_id: CARLOS, proposed_responsible_user_id: CARLOS,
            responses: [
                { participant_user_id: CARLOS, status: 'approved' },
                { participant_user_id: otro, status: 'pending' },
            ],
        }, otro);
        expect(state.actorRole).toBe('participant');
    });
});
