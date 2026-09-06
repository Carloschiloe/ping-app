// M-1H v2 — request functions puras para el flujo de "Confirmar" de
// commitments/commitment_proposals, aisladas en su propio módulo pequeño a
// propósito: commitments.ts (donde vivían antes) usa en OTRA función no
// relacionada (useCancelCommitment) una llamada con type argument explícito
// (`queryClient.getQueriesData<any[]>(...)`) que el transform SSR de este
// pipeline de vitest no logra parsear de forma aislada ("Expected 'from',
// got 'typeOf'" al intentar importar commitments.ts directamente desde un
// test) -- no se toca esa función preexistente; este módulo evita que un
// test necesite arrastrarla indirectamente sólo para llegar a estas tres.
//
// Real chain probada contra el RPC (ver
// supabase/migrations/20260730123000_shared_commitment_agreements.sql):
// - acceptCommitmentRequest: commitment canónico, status=proposed.
// - respondToCommitmentProposalRequest: proposal COMPARTIDA (creada vía
//   POST /commitment-proposals/shared) -- RPC respond_to_commitment_proposal,
//   exige una fila previa en commitment_proposal_responses para el actor.
// - confirmCommitmentProposalRequest: proposal SOLO (creada vía
//   POST /commitment-proposals, caso real "Entrenar") -- RPC
//   confirm_commitment_proposal, sólo exige ser el owner de la proposal.
// Ver commitmentConfirmDispatch.ts para el discriminador real entre las dos
// últimas.
import { apiClient } from '../client';

export const acceptCommitmentRequest = (id: string) => apiClient.post(`/commitments/${id}/accept`, {});

export const respondToCommitmentProposalRequest = ({
    id,
    decision,
    reason,
    proposedDueAt,
}: {
    id: string;
    decision: 'approve' | 'reject' | 'counter_propose';
    reason?: string | null;
    proposedDueAt?: string | null;
}) => apiClient.post(`/commitment-proposals/${id}/respond`, {
    decision,
    reason: reason?.trim() || null,
    proposedDueAt: proposedDueAt || null,
});

export const confirmCommitmentProposalRequest = (id: string) => apiClient.post(`/commitment-proposals/${id}/confirm`, {});
