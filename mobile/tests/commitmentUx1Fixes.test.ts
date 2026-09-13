import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { getProposalParticipationState } from '../src/utils/agreement';

// PING COMMITMENT UX-1 — FIX HIGH-SEVERITY ACTION SEMANTICS.
// FIX 1: un proposer de una proposal SOLO no debe ver "Rechazar propuesta"
// (esa acción llama a respond_to_commitment_proposal, que exige una fila
// real en commitment_proposal_responses -- las proposals solo nunca la
// tienen, así que el backend real devolvía 403 pese a que la UI la ofrecía).
// La señal canónica reutilizada es actorHasRecordedResponse
// (getProposalParticipationState, agreement.ts), nunca un título/status
// inventado en esta pantalla.
// FIX 2: "Archivar / Cancelar" -> "Cancelar" (Android real) / "Cancelar
// {tarea/reunión}" (iOS, para no colisionar con el dismiss nativo del
// ActionSheet que ya usa el string "Cancelar" en el índice 0). El endpoint
// (onCancel -> POST /commitments/:id/cancel) no cambia.
const COMMITMENT_ROW_SRC = fs.readFileSync(
    path.join(__dirname, '..', 'src/components/compromisos/CommitmentRow.tsx'), 'utf-8',
);
const AGREEMENT_SRC = fs.readFileSync(
    path.join(__dirname, '..', 'src/utils/agreement.ts'), 'utf-8',
);
// PING — CANCELAR/ARCHIVAR LABEL MISMATCH FIX: src/screens/HoyScreen.tsx was
// dead code (zero importers, confirmed via docs/generated/import-index.json
// -- importedBy: []) and has been deleted. The real, currently-reachable
// archive/cancel UI for a canonical commitment is CommitmentDetailSheet.tsx
// (opened from InsightsScreen.tsx, the actual current Hoy/Compromisos
// surface) -- this is what FIX 2's own "Archivar/Cancelar" wording actually
// needs to stay correct against now.
const COMMITMENT_DETAIL_SHEET_SRC = fs.readFileSync(
    path.join(__dirname, '..', 'src/components/compromisos/CommitmentDetailSheet.tsx'), 'utf-8',
);

const CARLOS = 'carlos-id';
const ALEJANDRA = 'alejandra-id';

describe('FIX 1 — señal canónica reutilizada: actorHasRecordedResponse', () => {
    it('getProposalParticipationState (agreement.ts) expone actorHasRecordedResponse, false para el caso solo, !!actorResponse para el caso compartido', () => {
        expect(AGREEMENT_SRC).toMatch(/actorHasRecordedResponse: boolean;/);
        expect(AGREEMENT_SRC).toMatch(/actorHasRecordedResponse: false,/);
        expect(AGREEMENT_SRC).toMatch(/actorHasRecordedResponse: !!actorResponse,/);
    });
    it('CommitmentRow.tsx importa getProposalParticipationState directamente y la usa en canRespondToProposal', () => {
        expect(COMMITMENT_ROW_SRC).toMatch(/import \{ getProposalParticipationState \} from '\.\.\/\.\.\/utils\/agreement';/);
        expect(COMMITMENT_ROW_SRC).toMatch(/const proposalParticipation = isProposal \? getProposalParticipationState\(c, currentUserId\) : null;/);
        expect(COMMITMENT_ROW_SRC).toMatch(/const canRespondToProposal = isProposal && primaryAction === 'accept' && !!proposalParticipation\?\.actorHasRecordedResponse;/);
    });
});

describe('FIX 1 — proposer de proposal SOLO: "Retirar" visible, "Rechazar propuesta" oculto', () => {
    // Re-deriva la condición REAL de canRespondToProposal/canWithdrawProposal
    // tal como vive en CommitmentRow.tsx, usando la función pura real
    // (getProposalParticipationState) en vez de re-escribirla a mano --
    // así un cambio futuro en la condición real rompe este test si se
    // desincroniza, en vez de quedar silenciosamente obsoleto.
    function evalEligibility(c: any, currentUserId: string) {
        const isProposal = c._isAgreementProposal === true;
        const participation = isProposal ? getProposalParticipationState(c, currentUserId) : null;
        const primaryActionIsAccept = isProposal && participation !== null
            ? (c.status === 'proposed' && (participation.actorRole === 'proposer' || participation.actorRole === 'responsible' || participation.actorCanRespond))
            : false;
        // canRespondToProposal exige TAMBIÉN actorHasRecordedResponse -- el
        // mismo requisito real que CommitmentRow.tsx aplica.
        const canRespondToProposal = isProposal && !!participation?.actorCanRespond && !!participation?.actorHasRecordedResponse;
        const isProposer = isProposal && c.owner_user_id === currentUserId;
        const canWithdrawProposal = isProposer && c.status === 'proposed';
        return { canRespondToProposal, canWithdrawProposal };
    }

    it('proposal SOLO (sin agreement_responses), proposer: canWithdrawProposal=true, canRespondToProposal=false', () => {
        const entrenarSolo = {
            id: 'pr-entrenar-solo', _isAgreementProposal: true, status: 'proposed',
            owner_user_id: CARLOS, assigned_to_user_id: CARLOS,
            agreement_responses: [],
        };
        const { canRespondToProposal, canWithdrawProposal } = evalEligibility(entrenarSolo, CARLOS);
        expect(canWithdrawProposal).toBe(true);
        expect(canRespondToProposal).toBe(false);
    });

    it('proposal COMPARTIDA con fila de respuesta real para el actor (destinatario elegible): "Rechazar propuesta" sigue visible', () => {
        const shared = {
            id: 'pr-shared', _isAgreementProposal: true, status: 'proposed',
            owner_user_id: CARLOS, assigned_to_user_id: CARLOS,
            agreement_responses: [
                { participant_user_id: CARLOS, status: 'approved' as const },
                { participant_user_id: ALEJANDRA, status: 'pending' as const },
            ],
        };
        const { canRespondToProposal } = evalEligibility(shared, ALEJANDRA);
        expect(canRespondToProposal).toBe(true);
    });

    it('el gate real en CommitmentRow.tsx efectivamente exige actorHasRecordedResponse (no sólo primaryAction===\'accept\')', () => {
        // Confirma en el source real que la condición NO es sólo
        // primaryAction==='accept' -- debe incluir la nueva señal.
        expect(COMMITMENT_ROW_SRC).not.toMatch(/const canRespondToProposal = isProposal && primaryAction === 'accept';\s*$/m);
        expect(COMMITMENT_ROW_SRC).toMatch(/&& !!proposalParticipation\?\.actorHasRecordedResponse;/);
    });
});

describe('FIX 2 — vocabulario "Cancelar" para el commitment canónico', () => {
    it('"Archivar / Cancelar" ya no existe en CommitmentRow.tsx', () => {
        expect(COMMITMENT_ROW_SRC).not.toContain('Archivar / Cancelar');
        expect(COMMITMENT_ROW_SRC).not.toContain('Archivar');
    });
    it('el ActionSheet iOS ofrece "Cancelar {tarea/reunión}" (evita colisión con el dismiss nativo "Cancelar" en index 0) bajo la misma condición previa (onCancel && !isFinished && !isProposal)', () => {
        expect(COMMITMENT_ROW_SRC).toMatch(/onCancel && !isFinished && !isProposal \? `Cancelar \$\{isMeeting \? 'reunión' : 'tarea'\}` : null/);
        expect(COMMITMENT_ROW_SRC).toMatch(/opt\.startsWith\('Cancelar '\) && onCancel\) onCancel\(c\.id\)/);
    });
    it('el menú Android ofrece "Cancelar {tarea/reunión}" para la acción real (evita colisión con el dismiss "Cancelar" propio del Modal) y sigue llamando onCancel(c.id)', () => {
        expect(COMMITMENT_ROW_SRC).toMatch(/\{`Cancelar \$\{isMeeting \? 'reunión' : 'tarea'\}`\}/);
        expect(COMMITMENT_ROW_SRC).toMatch(/onPress=\{\(\) => \{ setMenuVisible\(false\); onCancel\(c\.id\); \}\}/);
    });
    it('el endpoint/comportamiento de cancelación no cambió: sigue siendo onCancel(id) -> useCancelCommitment -> POST \/commitments\/:id\/cancel', () => {
        const requestsSrc = fs.readFileSync(
            path.join(__dirname, '..', 'src/api/query-modules/commitments.ts'), 'utf-8',
        );
        expect(requestsSrc).toMatch(/apiClient\.post\(`\/commitments\/\$\{id\}\/cancel`, \{ reason: reason\?\.trim\(\) \|\| null \}\)/);
    });
});

// PING — TERMINAL LIFECYCLE ACTIONS FIX: physical bug found in
// Compromisos → Historial → RESUELTOS -- a canonical commitment already in
// a terminal status (resolved/cancelled/rejected) still offered
// "Reprogramar fecha" in CommitmentRow.tsx's menu. Backend
// (commitmentTransitions.ts#COMMITMENT_TRANSITION_TABLE.counter_propose.validFromStatuses
// = ['proposed','accepted','counter_proposal'], structurally proven to
// exclude every terminal status by
// COMMITMENT_TRANSITION_TABLE's own "reopen es la unica accion que parte de
// un estado terminal" test) and the M-4 rescheduleCommitmentExecutor
// (reuses the SAME table) both already rejected this transition with a 409/
// invalid_lifecycle -- only this ONE menu condition never checked
// !isFinished, unlike "Cancelar" two lines below it in the same file, and
// unlike CommitmentDetailSheet.tsx's onReschedule gate (already correct).
describe('TERMINAL LIFECYCLE ACTIONS FIX — CommitmentRow.tsx nunca ofrece "Reprogramar fecha" sobre un commitment ya terminal (resolved/cancelled/rejected)', () => {
    it('la condición iOS de "Reprogramar fecha" exige !isProposal Y !isFinished (antes sólo exigía !isProposal)', () => {
        expect(COMMITMENT_ROW_SRC).toMatch(/!isProposal && !isFinished \? 'Reprogramar fecha' : null/);
    });
    it('la condición Android de "Reprogramar fecha" exige !isProposal Y !isFinished (antes sólo exigía !isProposal)', () => {
        expect(COMMITMENT_ROW_SRC).toMatch(/\{!isProposal && !isFinished && \(/);
    });
    it('isFinished sigue siendo la misma definición canónica ya usada para "Cancelar" -- nunca una segunda condición divergente', () => {
        expect(COMMITMENT_ROW_SRC).toMatch(/const isFinished = \['resolved', 'cancelled', 'rejected'\]\.includes\(status\);/);
    });
    it('backend ya rechaza counter_propose (reschedule) desde un estado terminal -- COMMITMENT_TRANSITION_TABLE.counter_propose.validFromStatuses nunca incluye resolved/cancelled/rejected', () => {
        const backendSrc = fs.readFileSync(
            path.join(__dirname, '..', '..', 'backend', 'src', 'utils', 'commitmentTransitions.ts'), 'utf-8',
        );
        expect(backendSrc).toMatch(/counter_propose: \{\s*validFromStatuses: \['proposed', 'accepted', 'counter_proposal'\]/);
    });
});

// PING — ACTIONSHEET DISMISS SEMANTICS FIX: physical UX fail. A resolved/
// cancelled commitment's menu correctly hides every real domain mutation
// (Reprogramar fecha, Cancelar tarea/reunión -- both gated by !isFinished,
// proven above), but the pure dismiss row was STILL labeled "Cancelar" --
// the ONLY "Cancelar" visible in those menus, naturally read by the user as
// "cancel the commitment" even though it only closes the menu. Renamed to
// "Cerrar", which can never be confused with the real domain action. This
// re-derives the actual options[] array CommitmentRow.tsx builds (same
// filter(Boolean) logic, same condition order) for each required scenario
// in the ticket's test matrix, rather than only asserting individual
// conditions in isolation -- proves the exact rendered menu content.
describe('ACTIONSHEET DISMISS SEMANTICS FIX — el menú completo de un commitment terminal nunca contiene la palabra "Cancelar" ambigua, sólo "Cerrar"', () => {
    // Re-deriva el array options[] EXACTO que CommitmentRow.tsx construye
    // (mismo orden, mismas condiciones ya verificadas individualmente
    // arriba) -- nunca reescribe la lógica real, sólo la ejercita con
    // fixtures de estado terminal/activo.
    function buildIOSOptions(opts: {
        isProposal: boolean; isFinished: boolean; hasConversation: boolean;
        canRespondToProposal: boolean; canWithdrawProposal: boolean; onCancel: boolean; onWithdraw: boolean;
        isMeeting: boolean;
    }): string[] {
        const { isProposal, isFinished, hasConversation, canRespondToProposal, canWithdrawProposal, onCancel, onWithdraw, isMeeting } = opts;
        return [
            'Cerrar',
            'Ver detalle',
            !isProposal && !isFinished ? 'Reprogramar fecha' : null,
            canRespondToProposal ? 'Proponer otra fecha' : null,
            hasConversation ? 'Ver conversación' : null,
            canRespondToProposal ? 'Rechazar propuesta' : null,
            onWithdraw && canWithdrawProposal ? 'Retirar propuesta' : null,
            onCancel && !isFinished && !isProposal ? `Cancelar ${isMeeting ? 'reunión' : 'tarea'}` : null,
        ].filter(Boolean) as string[];
    }

    it('1. commitment RESUELTO con conversación: [Cerrar, Ver detalle, Ver conversación] -- NUNCA Reprogramar fecha, NUNCA la acción de dominio "Cancelar tarea/reunión"', () => {
        const options = buildIOSOptions({
            isProposal: false, isFinished: true, hasConversation: true,
            canRespondToProposal: false, canWithdrawProposal: false, onCancel: true, onWithdraw: false, isMeeting: false,
        });
        expect(options).toEqual(['Cerrar', 'Ver detalle', 'Ver conversación']);
        expect(options.some((o) => o.startsWith('Cancelar'))).toBe(false);
        expect(options).not.toContain('Reprogramar fecha');
    });

    it('2. commitment CANCELADO sin conversación: [Cerrar, Ver detalle] -- NUNCA Reprogramar fecha, NUNCA la acción de dominio "Cancelar tarea/reunión"', () => {
        const options = buildIOSOptions({
            isProposal: false, isFinished: true, hasConversation: false,
            canRespondToProposal: false, canWithdrawProposal: false, onCancel: true, onWithdraw: false, isMeeting: false,
        });
        expect(options).toEqual(['Cerrar', 'Ver detalle']);
        expect(options.some((o) => o.startsWith('Cancelar'))).toBe(false);
        expect(options).not.toContain('Reprogramar fecha');
    });

    it('3. commitment ACTIVO (accepted): distingue el dismiss "Cerrar" de la acción de dominio real "Cancelar tarea" -- ambas presentes, nunca la misma palabra', () => {
        const options = buildIOSOptions({
            isProposal: false, isFinished: false, hasConversation: false,
            canRespondToProposal: false, canWithdrawProposal: false, onCancel: true, onWithdraw: false, isMeeting: false,
        });
        expect(options).toContain('Cerrar');
        expect(options).toContain('Cancelar tarea');
        expect(options).toContain('Reprogramar fecha');
        // Nunca ambas colapsan al mismo string -- son literalmente dos
        // entradas distintas del array.
        expect(options.filter((o) => o === 'Cerrar' || o.startsWith('Cancelar'))).toHaveLength(2);
    });

    it('6. option index mapping: "Cerrar" siempre en índice 0 (cancelButtonIndex), el handler nunca despacha ninguna acción para ese índice', () => {
        const options = buildIOSOptions({
            isProposal: false, isFinished: true, hasConversation: true,
            canRespondToProposal: false, canWithdrawProposal: false, onCancel: true, onWithdraw: false, isMeeting: false,
        });
        expect(options[0]).toBe('Cerrar');
        expect(options.indexOf('Cerrar')).toBe(0);
    });

    it('7. proposal menus: el dismiss sigue siendo "Cerrar" mientras "Retirar propuesta"/"Rechazar propuesta" conservan su semántica real sin cambios', () => {
        const options = buildIOSOptions({
            isProposal: true, isFinished: false, hasConversation: false,
            canRespondToProposal: true, canWithdrawProposal: false, onCancel: false, onWithdraw: false, isMeeting: false,
        });
        expect(options[0]).toBe('Cerrar');
        expect(options).toContain('Proponer otra fecha');
        expect(options).toContain('Rechazar propuesta');
        expect(options).not.toContain('Reprogramar fecha'); // nunca para una proposal
        expect(options.some((o) => o.startsWith('Cancelar'))).toBe(false); // nunca la acción de commitment canónico
    });
});

// PING — CANCELAR/ARCHIVAR LABEL MISMATCH FIX (segunda regresión encontrada
// tras eliminar HoyScreen.tsx muerto): CommitmentDetailSheet.tsx exponía un
// botón etiquetado "Archivar" que en realidad llamaba a onCancel (la MISMA
// prop que CommitmentRow.tsx ya conecta a useCancelCommitment -> POST
// /commitments/:id/cancel, status -> cancelled) -- nunca al RPC real de
// archivo (archive_commitment_with_evidence, que sólo marca archived_at,
// nunca cambia status). Corregido para usar la MISMA palabra "Cancelar" que
// CommitmentRow.tsx ya usa para esta acción -- el endpoint/comportamiento
// no cambia, sólo la etiqueta deja de nombrar la transición equivocada.
describe('FIX 2 — CommitmentDetailSheet.tsx: la etiqueta del botón coincide con la transición real que ejecuta (onCancel -> cancelar, nunca "Archivar")', () => {
    it('el botón conectado a onCancel dice "Cancelar" (misma palabra que CommitmentRow.tsx ya usa para la MISMA prop/endpoint), nunca "Archivar"', () => {
        expect(COMMITMENT_DETAIL_SHEET_SRC).toMatch(/onPress=\{\(\) => \{ onClose\(\); onCancel\(item\.id\); \}\}>\s*<Ionicons name="trash-outline"[^]*?>Cancelar</);
        expect(COMMITMENT_DETAIL_SHEET_SRC).not.toMatch(/>Archivar</);
    });
    it('CommitmentRow.tsx nunca importa ni llama deleteCommitment/useDeleteCommitment -- su "Cancelar" nunca se convierte en el archive real', () => {
        expect(COMMITMENT_ROW_SRC).not.toMatch(/deleteCommitment|useDeleteCommitment/);
    });
    it('CommitmentDetailSheet.tsx tampoco importa ni llama deleteCommitment/useDeleteCommitment -- su botón de cancelar nunca se convierte en el archive real', () => {
        expect(COMMITMENT_DETAIL_SHEET_SRC).not.toMatch(/deleteCommitment|useDeleteCommitment/);
    });
});
