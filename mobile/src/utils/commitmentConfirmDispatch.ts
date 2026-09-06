// SEMÁNTICA DE PRODUCTO (M-1H v4): "Confirmar" significa que una proposal
// PENDIENTE pasa a materializarse/transicionar en un commitment canónico
// (status='accepted') -- nunca significa "marcar como realizado". Una vez
// confirmado, la acción siguiente disponible sobre ese commitment ya
// aceptado es "Listo" (botón separado, ver CommitmentRow.tsx/TodayItemRow.tsx
// renderPrimaryAction status==='accepted' -> onMarkDone ->
// useResolveCommitment -> POST /commitments/:id/resolve), un flujo
// completamente distinto e independiente de éste, no tocado por este
// archivo. Confirmar y Resolver ("Listo") son dos transiciones de negocio
// separadas y nunca deben confundirse ni fusionarse.
//
// M-1H v2 — hallazgo real a nivel de RPC (no sólo de ruta HTTP): un
// commitment_proposal puede ser SOLO (creado vía POST /commitment-proposals,
// nunca tiene fila en commitment_proposal_responses) o COMPARTIDO (creado
// vía POST /commitment-proposals/shared, con una fila de respuesta por
// participante). El RPC respond_to_commitment_proposal EXIGE esa fila
// ("Actor is not required for this agreement", 403 si no existe) -- usarlo
// para una proposal solo sólo cambia el error de 404 a 403, nunca la
// confirma. El RPC correcto para una proposal solo es
// confirm_commitment_proposal (POST /commitment-proposals/:id/confirm), que
// sólo exige ser el owner de la proposal. Ver
// supabase/migrations/20260730123000_shared_commitment_agreements.sql
// (respond_to_commitment_proposal / confirm_commitment_proposal /
// finalize_approved_commitment_proposal).
//
// El discriminador real y suficiente: agreement_responses sólo existe (no
// vacío) para proposals compartidas -- lo llena
// create_shared_commitment_proposal_with_responses al crearlas; una
// proposal solo nunca tiene esas filas. La visibilidad ya garantiza que, si
// el actor puede ver una proposal compartida, es porque tiene una fila de
// respuesta propia entre agreement_responses (ver
// commitmentVisibility.ts#buildCommitmentProposalVisibilityFilter).
export type CommitmentConfirmAction =
    | { type: 'acceptCommitment'; id: string }
    | { type: 'respondToProposal'; id: string }
    | { type: 'confirmProposal'; id: string };

export function resolveCommitmentConfirmAction(commitment: any): CommitmentConfirmAction {
    const id = commitment?.id ?? commitment;
    if (commitment?._isAgreementProposal) {
        const isShared = Array.isArray(commitment.agreement_responses) && commitment.agreement_responses.length > 0;
        return isShared ? { type: 'respondToProposal', id } : { type: 'confirmProposal', id };
    }
    return { type: 'acceptCommitment', id };
}

// M-1H v4 — hallazgo real de staging: el usuario tocaba "Confirmar" sobre
// "Entrenar" (proposal solo, vencida) y no veía NADA -- ni modal, ni
// mensaje, ni cambio de fila. Auditando el código: la ejecución YA sucedía
// de inmediato al primer tap, `resolveCommitmentConfirmAction` se llamaba
// FUERA del try/catch (una excepción ahí habría sido una promesa rechazada
// sin manejar, invisible para el usuario en un build de staging/producción),
// y ni éxito ni error tenían ningún feedback visible -- indistinguible de
// "no pasó nada" tanto si la request tuvo éxito silencioso como si falló
// silenciosamente. Esta función es el ÚNICO punto de ejecución real
// (extraída de InsightsScreen.tsx/TaskDashboardScreen.tsx, antes duplicada
// en ambos): TODO el flujo (resolución de acción + llamada de red) vive
// dentro de un try/catch único, para que el caller (el modal) SIEMPRE sepa
// si terminó en éxito o error, sin excepción que se escape silenciosa.
export interface CommitmentConfirmRequests {
    acceptCommitment: (id: string) => Promise<any>;
    respondToProposal: (args: { id: string; decision: 'approve' }) => Promise<any>;
    confirmProposal: (id: string) => Promise<any>;
}

export async function performCommitmentConfirm(commitment: any, requests: CommitmentConfirmRequests): Promise<void> {
    const action = resolveCommitmentConfirmAction(commitment);
    if (action.type === 'respondToProposal') {
        await requests.respondToProposal({ id: action.id, decision: 'approve' });
    } else if (action.type === 'confirmProposal') {
        await requests.confirmProposal(action.id);
    } else {
        await requests.acceptCommitment(action.id);
    }
}
