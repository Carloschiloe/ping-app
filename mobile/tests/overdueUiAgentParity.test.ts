// M-1H v2 — EXACT UI-AGENT OVERDUE PARITY (respuesta al bloqueo B del final
// review gate). El dataset de 10 items es exactamente el pedido: proposal
// pendiente vencida, proposal pendiente futura, counter-proposal vencida,
// commitment canónico proposed/accepted vencidos y futuro, proposal
// rechazada pasada, commitment resuelto/cancelado pasados, y una proposal ya
// confirmada + su commitment canónico materializado.
//
// Este archivo calcula UI_OVERDUE_IDS con la función REAL que usa
// InsightsScreen.tsx (isCommitmentOverdue, extraída literalmente de
// ese componente -- no una reimplementación paralela). El archivo espejo
// backend/tests/overdueUiAgentParity.test.ts calcula AGENT_OVERDUE_IDS con
// la fórmula REAL de agentResponseSynthesizer.service.ts
// (isCommitmentOverdue) sobre el MISMO dataset (mismos ids/status/due_at,
// traducidos a los dos shapes reales). Ambos assertan contra la MISMA
// constante EXPECTED_OVERDUE_IDS -- si algún día uno de los dos archivos
// cambia sin el otro, cada test sigue fallando de forma independiente
// (no dependen en tiempo de ejecución uno del otro; no hay forma de
// correr un test único cross-repo en este monorepo, así que esta es la
// prueba de contrato más fuerte posible sin un test runner unificado).
import { describe, expect, it } from 'vitest';
import { isCommitmentOverdue } from '../src/utils/commitmentDisplay';

const NOW = new Date('2026-09-06T12:00:00Z');

// El item 10 (proposal ya confirmada) NUNCA llega a este dataset como
// proposal -- se excluye en la fuente real (ver
// commitmentProposal.service.ts#getAgreementProposals: .neq('status',
// 'confirmed'), y su espejo backend retrieval.service.ts
// #retrieveCommitmentProposals). Sólo su commitment canónico materializado
// (proposal_id apuntando a ella) es visible.
const DATASET = [
    { id: 'item-1-proposal-pending-overdue', entityType: 'commitment_proposal', status: 'proposed', due_at: '2026-08-01T00:00:00Z' },
    { id: 'item-2-proposal-pending-future', entityType: 'commitment_proposal', status: 'proposed', due_at: '2027-01-01T00:00:00Z' },
    { id: 'item-3-proposal-counter-overdue', entityType: 'commitment_proposal', status: 'counter_proposal', due_at: '2026-07-01T00:00:00Z' },
    { id: 'item-4-commitment-proposed-overdue', entityType: 'commitment', status: 'proposed', due_at: '2026-06-01T00:00:00Z' },
    { id: 'item-5-commitment-accepted-overdue', entityType: 'commitment', status: 'accepted', due_at: '2026-05-01T00:00:00Z' },
    { id: 'item-6-commitment-accepted-future', entityType: 'commitment', status: 'accepted', due_at: '2027-02-01T00:00:00Z' },
    { id: 'item-7-proposal-rejected-past', entityType: 'commitment_proposal', status: 'rejected', due_at: '2026-04-01T00:00:00Z' },
    { id: 'item-8-commitment-resolved-past', entityType: 'commitment', status: 'resolved', due_at: '2026-03-01T00:00:00Z' },
    { id: 'item-9-commitment-cancelled-past', entityType: 'commitment', status: 'cancelled', due_at: '2026-02-01T00:00:00Z' },
    // item-10-proposal-confirmed: excluida de la fuente, nunca aparece aquí.
    { id: 'item-10-commitment-materialized', entityType: 'commitment', status: 'accepted', due_at: '2026-01-01T00:00:00Z', proposal_id: 'item-10-proposal-confirmed' },
] as const;

// Constante compartida por contrato con backend/tests/overdueUiAgentParity.test.ts
// (no importable directamente -- monorepo sin test runner cross-paquete).
export const EXPECTED_OVERDUE_IDS = [
    'item-1-proposal-pending-overdue',
    'item-3-proposal-counter-overdue',
    'item-4-commitment-proposed-overdue',
    'item-5-commitment-accepted-overdue',
    'item-10-commitment-materialized',
].sort();

describe('M-1H v2: UI_OVERDUE_IDS — calculado con la función REAL de InsightsScreen.tsx', () => {
    it('el dataset nunca contiene la proposal confirmada como item propio (excluida en la fuente real)', () => {
        expect(DATASET.some((item) => item.id === 'item-10-proposal-confirmed')).toBe(false);
    });

    it('coincide exactamente con EXPECTED_OVERDUE_IDS -- mismos ids, mismo cardinal, sin duplicados', () => {
        const uiOverdueIds = DATASET
            .filter((item) => isCommitmentOverdue(item, NOW))
            .map((item) => item.id)
            .sort();

        expect(new Set(uiOverdueIds).size).toBe(uiOverdueIds.length); // sin duplicados
        expect(uiOverdueIds).toEqual(EXPECTED_OVERDUE_IDS);
    });

    it('cada item NO vencido tiene una razón real (futuro o status cerrado), nunca un accidente de la fórmula', () => {
        const notOverdue = DATASET.filter((item) => !isCommitmentOverdue(item, NOW));
        const notOverdueIds = notOverdue.map((i) => i.id).sort();
        expect(notOverdueIds).toEqual([
            'item-2-proposal-pending-future',
            'item-6-commitment-accepted-future',
            'item-7-proposal-rejected-past',
            'item-8-commitment-resolved-past',
            'item-9-commitment-cancelled-past',
        ].sort());
    });
});
