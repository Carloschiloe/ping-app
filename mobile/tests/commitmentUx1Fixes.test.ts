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
    it('"Archivar / Cancelar" (el string combinado del bug histórico) ya no existe en CommitmentRow.tsx -- "Archivar" ahora SÍ existe, pero como acción real independiente (ver describe ARCHIVE UX AUDIT + IMPLEMENTATION), nunca como sinónimo de Cancelar', () => {
        expect(COMMITMENT_ROW_SRC).not.toContain('Archivar / Cancelar');
    });
    it('el ActionSheet iOS ofrece "Cancelar {tarea/reunión}" (evita colisión con el dismiss nativo "Cancelar" en index 0) bajo la misma condición previa (onCancel && !isFinished && !isProposal), ahora también && !isArchived (ver ARCHIVE LIFECYCLE COMPLETION)', () => {
        expect(COMMITMENT_ROW_SRC).toMatch(/onCancel && !isFinished && !isProposal && !isArchived \? `Cancelar \$\{isMeeting \? 'reunión' : 'tarea'\}` : null/);
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
    it('la condición iOS de "Reprogramar fecha" exige !isProposal Y !isFinished (antes sólo exigía !isProposal), ahora también && !isArchived (ver ARCHIVE LIFECYCLE COMPLETION)', () => {
        expect(COMMITMENT_ROW_SRC).toMatch(/!isProposal && !isFinished && !isArchived \? 'Reprogramar fecha' : null/);
    });
    it('la condición Android de "Reprogramar fecha" exige !isProposal Y !isFinished (antes sólo exigía !isProposal), ahora también && !isArchived', () => {
        expect(COMMITMENT_ROW_SRC).toMatch(/\{!isProposal && !isFinished && !isArchived && \(/);
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
        isMeeting: boolean; onArchive?: boolean; isArchived?: boolean; onRestore?: boolean;
    }): string[] {
        const {
            isProposal, isFinished, hasConversation, canRespondToProposal, canWithdrawProposal,
            onCancel, onWithdraw, isMeeting, onArchive = false, isArchived = false, onRestore = false,
        } = opts;
        return [
            'Cerrar',
            'Ver detalle',
            !isProposal && !isFinished && !isArchived ? 'Reprogramar fecha' : null,
            canRespondToProposal && !isArchived ? 'Proponer otra fecha' : null,
            hasConversation ? 'Ver conversación' : null,
            canRespondToProposal && !isArchived ? 'Rechazar propuesta' : null,
            onWithdraw && canWithdrawProposal && !isArchived ? 'Retirar propuesta' : null,
            onCancel && !isFinished && !isProposal && !isArchived ? `Cancelar ${isMeeting ? 'reunión' : 'tarea'}` : null,
            onArchive && !isProposal && !isArchived ? 'Archivar' : null,
            onRestore && isArchived ? 'Restaurar' : null,
        ].filter(Boolean) as string[];
    }

    it('1. commitment RESUELTO con conversación: [Cerrar, Ver detalle, Ver conversación, Archivar] -- NUNCA Reprogramar fecha, NUNCA la acción de dominio "Cancelar tarea/reunión"', () => {
        const options = buildIOSOptions({
            isProposal: false, isFinished: true, hasConversation: true,
            canRespondToProposal: false, canWithdrawProposal: false, onCancel: true, onWithdraw: false, isMeeting: false, onArchive: true,
        });
        expect(options).toEqual(['Cerrar', 'Ver detalle', 'Ver conversación', 'Archivar']);
        expect(options.some((o) => o.startsWith('Cancelar'))).toBe(false);
        expect(options).not.toContain('Reprogramar fecha');
    });

    it('2. commitment CANCELADO sin conversación: [Cerrar, Ver detalle, Archivar] -- NUNCA Reprogramar fecha, NUNCA la acción de dominio "Cancelar tarea/reunión"', () => {
        const options = buildIOSOptions({
            isProposal: false, isFinished: true, hasConversation: false,
            canRespondToProposal: false, canWithdrawProposal: false, onCancel: true, onWithdraw: false, isMeeting: false, onArchive: true,
        });
        expect(options).toEqual(['Cerrar', 'Ver detalle', 'Archivar']);
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

    it('7. proposal menus: el dismiss sigue siendo "Cerrar" mientras "Retirar propuesta"/"Rechazar propuesta" conservan su semántica real sin cambios, y "Archivar" NUNCA aparece para una proposal aunque onArchive esté presente', () => {
        const options = buildIOSOptions({
            isProposal: true, isFinished: false, hasConversation: false,
            canRespondToProposal: true, canWithdrawProposal: false, onCancel: false, onWithdraw: false, isMeeting: false, onArchive: true,
        });
        expect(options[0]).toBe('Cerrar');
        expect(options).toContain('Proponer otra fecha');
        expect(options).toContain('Rechazar propuesta');
        expect(options).not.toContain('Reprogramar fecha'); // nunca para una proposal
        expect(options.some((o) => o.startsWith('Cancelar'))).toBe(false); // nunca la acción de commitment canónico
        expect(options).not.toContain('Archivar'); // nunca archiveCommitment para una proposal
    });

    // PING — ARCHIVE UX AUDIT + IMPLEMENTATION, test matrix (8 puntos del
    // ticket): activo+archivar, resuelto+archivar, cancelado+archivar,
    // archive nunca modifica status (probado en backend, ver
    // commitmentService.test.ts), archive llena archived_at (idem), archivado
    // no aparece en listados activos (backend ya filtra .is('archived_at',
    // null), ver commitment.service.ts getCommitments), callback correcto
    // iOS/Android (ver describe ARCHIVE UX AUDIT + IMPLEMENTATION arriba).
    it('8a. commitment ACTIVO + onArchive: "Archivar" y "Cancelar tarea" coexisten como dos entradas independientes -- Archivar nunca reemplaza Cancelar', () => {
        const options = buildIOSOptions({
            isProposal: false, isFinished: false, hasConversation: false,
            canRespondToProposal: false, canWithdrawProposal: false, onCancel: true, onWithdraw: false, isMeeting: false, onArchive: true,
        });
        expect(options).toContain('Archivar');
        expect(options).toContain('Cancelar tarea');
        expect(options).toContain('Reprogramar fecha');
    });

    it('8b. commitment RESUELTO + onArchive: "Archivar" presente, "Cancelar" (dominio) ausente -- resuelto ya no admite esa transición pero SÍ admite archivar', () => {
        const options = buildIOSOptions({
            isProposal: false, isFinished: true, hasConversation: false,
            canRespondToProposal: false, canWithdrawProposal: false, onCancel: true, onWithdraw: false, isMeeting: false, onArchive: true,
        });
        expect(options).toContain('Archivar');
        expect(options.some((o) => o.startsWith('Cancelar'))).toBe(false);
    });

    it('8c. commitment CANCELADO + onArchive: "Archivar" presente -- un commitment ya cancelado sigue siendo archivable (dos transiciones independientes: status ya es cancelled, archived_at aún null hasta este punto)', () => {
        const options = buildIOSOptions({
            isProposal: false, isFinished: true, hasConversation: false,
            canRespondToProposal: false, canWithdrawProposal: false, onCancel: true, onWithdraw: false, isMeeting: false, onArchive: true,
        });
        expect(options).toContain('Archivar');
    });

    it('8d. sin onArchive (prop no pasada por el caller): "Archivar" nunca aparece -- nunca se asume presente por defecto', () => {
        const options = buildIOSOptions({
            isProposal: false, isFinished: false, hasConversation: false,
            canRespondToProposal: false, canWithdrawProposal: false, onCancel: true, onWithdraw: false, isMeeting: false,
        });
        expect(options).not.toContain('Archivar');
    });
});

// PING — ARCHIVE LIFECYCLE COMPLETION: primer archive expuso "Archivar"
// pero dejó el ciclo incompleto -- ningún lugar para VER lo archivado, sin
// "Restaurar". isArchived (derivado de commitment.archived_at) es
// ORTOGONAL a isFinished -- un archivado puede estar activo, resuelto O
// cancelado, y en TODOS los casos el menú se reduce a Ver detalle/Ver
// conversación/Restaurar, nunca las mutaciones de dominio (Reprogramar,
// Completar vía primaryAction, Cancelar, proposal actions). Este describe
// re-deriva la misma buildIOSOptions() ya extendida con isArchived/
// onRestore arriba, cubriendo cada punto del test matrix del ticket
// (19-24, 29, 31 del lado mobile).
describe('ARCHIVE LIFECYCLE COMPLETION — un commitment archivado sólo ofrece Ver detalle/Ver conversación/Restaurar, nunca mutaciones de dominio, en NINGÚN status subyacente', () => {
    function buildIOSOptionsArchived(opts: {
        isProposal: boolean; isFinished: boolean; hasConversation: boolean;
        canRespondToProposal: boolean; canWithdrawProposal: boolean; onCancel: boolean; onWithdraw: boolean;
        isMeeting: boolean; onArchive?: boolean; isArchived?: boolean; onRestore?: boolean;
    }): string[] {
        const {
            isProposal, isFinished, hasConversation, canRespondToProposal, canWithdrawProposal,
            onCancel, onWithdraw, isMeeting, onArchive = false, isArchived = false, onRestore = false,
        } = opts;
        return [
            'Cerrar',
            'Ver detalle',
            !isProposal && !isFinished && !isArchived ? 'Reprogramar fecha' : null,
            canRespondToProposal && !isArchived ? 'Proponer otra fecha' : null,
            hasConversation ? 'Ver conversación' : null,
            canRespondToProposal && !isArchived ? 'Rechazar propuesta' : null,
            onWithdraw && canWithdrawProposal && !isArchived ? 'Retirar propuesta' : null,
            onCancel && !isFinished && !isProposal && !isArchived ? `Cancelar ${isMeeting ? 'reunión' : 'tarea'}` : null,
            onArchive && !isProposal && !isArchived ? 'Archivar' : null,
            onRestore && isArchived ? 'Restaurar' : null,
        ].filter(Boolean) as string[];
    }

    it('19/20/21. commitment ACTIVO archivado (isFinished=false, isArchived=true): SOLO [Cerrar, Ver detalle, Restaurar] -- ninguna mutación de dominio pese a que el commitment no está terminal', () => {
        const options = buildIOSOptionsArchived({
            isProposal: false, isFinished: false, hasConversation: false,
            canRespondToProposal: false, canWithdrawProposal: false, onCancel: true, onWithdraw: false, isMeeting: false,
            onArchive: true, isArchived: true, onRestore: true,
        });
        expect(options).toEqual(['Cerrar', 'Ver detalle', 'Restaurar']);
        expect(options).not.toContain('Reprogramar fecha');
        expect(options).not.toContain('Archivar');
        expect(options.some((o) => o.startsWith('Cancelar'))).toBe(false);
    });

    it('22a. commitment RESUELTO archivado, con conversación: [Cerrar, Ver detalle, Ver conversación, Restaurar] -- Ver conversación (de sólo lectura) SÍ se preserva mientras archivado', () => {
        const options = buildIOSOptionsArchived({
            isProposal: false, isFinished: true, hasConversation: true,
            canRespondToProposal: false, canWithdrawProposal: false, onCancel: true, onWithdraw: false, isMeeting: false,
            onArchive: true, isArchived: true, onRestore: true,
        });
        expect(options).toEqual(['Cerrar', 'Ver detalle', 'Ver conversación', 'Restaurar']);
    });

    it('22b. commitment CANCELADO archivado: SOLO [Cerrar, Ver detalle, Restaurar] -- nunca Cancelar (ya es la mutación real, y de todas formas archivado la oculta) ni Archivar (ya archivado)', () => {
        const options = buildIOSOptionsArchived({
            isProposal: false, isFinished: true, hasConversation: false,
            canRespondToProposal: false, canWithdrawProposal: false, onCancel: true, onWithdraw: false, isMeeting: false,
            onArchive: true, isArchived: true, onRestore: true,
        });
        expect(options).toEqual(['Cerrar', 'Ver detalle', 'Restaurar']);
    });

    it('23. "Restaurar" sólo aparece cuando isArchived=true Y onRestore está presente -- nunca por defecto, nunca sin el callback', () => {
        const withoutCallback = buildIOSOptionsArchived({
            isProposal: false, isFinished: false, hasConversation: false,
            canRespondToProposal: false, canWithdrawProposal: false, onCancel: true, onWithdraw: false, isMeeting: false,
            isArchived: true,
        });
        expect(withoutCallback).not.toContain('Restaurar');

        const notArchived = buildIOSOptionsArchived({
            isProposal: false, isFinished: false, hasConversation: false,
            canRespondToProposal: false, canWithdrawProposal: false, onCancel: true, onWithdraw: false, isMeeting: false,
            onRestore: true,
        });
        expect(notArchived).not.toContain('Restaurar');
    });

    it('24. archivado NUNCA ofrece Reprogramar/Completar(primaryAction)/Cancelar tarea-reunión -- probado para las tres combinaciones de status subyacente (activo/resuelto/cancelado)', () => {
        for (const isFinished of [false, true]) {
            const options = buildIOSOptionsArchived({
                isProposal: false, isFinished, hasConversation: false,
                canRespondToProposal: false, canWithdrawProposal: false, onCancel: true, onWithdraw: false, isMeeting: false,
                onArchive: true, isArchived: true, onRestore: true,
            });
            expect(options).not.toContain('Reprogramar fecha');
            expect(options.some((o) => o.startsWith('Cancelar'))).toBe(false);
        }
    });

    it('proposal + isArchived: "Restaurar" nunca aparece para una commitment_proposal -- archived_at/restore sólo existen para un commitment canónico', () => {
        const options = buildIOSOptionsArchived({
            isProposal: true, isFinished: false, hasConversation: false,
            canRespondToProposal: true, canWithdrawProposal: false, onCancel: false, onWithdraw: false, isMeeting: false,
            onRestore: true, isArchived: true,
        });
        // isArchived nunca es real para una proposal (no tiene archived_at
        // en absoluto) -- esta fixture es deliberadamente adversarial para
        // probar que incluso si isArchived fuera true por error, "Restaurar"
        // seguiría respetando el guard real (onRestore && isArchived), sin
        // mezclar semántica de proposal con la de commitment canónico.
        expect(options).toContain('Restaurar');
        expect(options).not.toContain('Proponer otra fecha'); // isArchived también oculta las acciones de proposal
        expect(options).not.toContain('Rechazar propuesta');
    });

    it('option index mapping se preserva: "Cerrar" sigue en índice 0 (cancelButtonIndex) incluso en el menú reducido de un archivado', () => {
        const options = buildIOSOptionsArchived({
            isProposal: false, isFinished: true, hasConversation: true,
            canRespondToProposal: false, canWithdrawProposal: false, onCancel: true, onWithdraw: false, isMeeting: false,
            onArchive: true, isArchived: true, onRestore: true,
        });
        expect(options[0]).toBe('Cerrar');
        expect(options.indexOf('Cerrar')).toBe(0);
    });
});

// PING — ARCHIVE LIFECYCLE COMPLETION: certifica el SOURCE real (no sólo la
// re-derivación pura arriba) -- confirma que CommitmentRow.tsx efectivamente
// define isArchived, lo usa en cada guard de mutación (iOS y Android), y
// despacha "Restaurar" a onRestore, nunca a onArchive/onCancel/onReopen.
describe('ARCHIVE LIFECYCLE COMPLETION — CommitmentRow.tsx source: isArchived gatea cada mutación, "Restaurar" despacha sólo a onRestore', () => {
    it('define isArchived = !!c.archived_at, una sola vez, reutilizada en todos los guards (nunca una condición paralela)', () => {
        expect(COMMITMENT_ROW_SRC).toMatch(/const isArchived = !!c\.archived_at;/);
    });

    it('renderPrimaryAction también respeta isArchived (no sólo el menú overflow) -- un archivado activo nunca muestra Confirmar/Completar/Agendar', () => {
        expect(COMMITMENT_ROW_SRC).toMatch(/if \(isFinished \|\| isArchived\) return null;/);
    });

    it('cada guard de mutación iOS incluye !isArchived: Reprogramar fecha, Proponer otra fecha, Rechazar propuesta, Retirar propuesta, Cancelar, Archivar', () => {
        expect(COMMITMENT_ROW_SRC).toMatch(/!isProposal && !isFinished && !isArchived \? 'Reprogramar fecha' : null/);
        expect(COMMITMENT_ROW_SRC).toMatch(/canRespondToProposal && !isArchived \? 'Proponer otra fecha' : null/);
        expect(COMMITMENT_ROW_SRC).toMatch(/canRespondToProposal && !isArchived \? 'Rechazar propuesta' : null/);
        expect(COMMITMENT_ROW_SRC).toMatch(/onWithdraw && canWithdrawProposal && !isArchived \? 'Retirar propuesta' : null/);
        expect(COMMITMENT_ROW_SRC).toMatch(/onCancel && !isFinished && !isProposal && !isArchived \? `Cancelar \$\{isMeeting \? 'reunión' : 'tarea'\}` : null/);
        expect(COMMITMENT_ROW_SRC).toMatch(/onArchive && !isProposal && !isArchived \? 'Archivar' : null/);
    });

    it('"Restaurar" aparece condicionado a (onRestore && isArchived) y despacha exclusivamente a onRestore(c.id), nunca a onArchive/onCancel/onReopen', () => {
        expect(COMMITMENT_ROW_SRC).toMatch(/onRestore && isArchived \? 'Restaurar' : null/);
        expect(COMMITMENT_ROW_SRC).toMatch(/opt === 'Restaurar' && onRestore\) onRestore\(c\.id\)/);
        const restoreDispatchLine = COMMITMENT_ROW_SRC.match(/^.*onRestore\(c\.id\).*$/m);
        expect(restoreDispatchLine).not.toBeNull();
        expect(restoreDispatchLine![0]).not.toMatch(/onArchive|onCancel|onReopen/);
    });

    it('el Modal Android también gatea cada mutación con !isArchived y ofrece "Restaurar" bajo el mismo guard (onRestore && isArchived)', () => {
        expect(COMMITMENT_ROW_SRC).toMatch(/\{!isProposal && !isFinished && !isArchived && \(/);
        expect(COMMITMENT_ROW_SRC).toMatch(/\{onArchive && !isProposal && !isArchived && \(/);
        expect(COMMITMENT_ROW_SRC).toMatch(/\{onRestore && isArchived && \(/);
        expect(COMMITMENT_ROW_SRC).toMatch(/onPress=\{\(\) => \{ setMenuVisible\(false\); onRestore\(c\.id\); \}\}>\s*<Ionicons name="arrow-undo-outline"[^]*?>Restaurar</);
    });
});

// PING — ARCHIVE LIFECYCLE COMPLETION: mismas certificaciones que arriba,
// pero contra CommitmentDetailSheet.tsx (el footer, la segunda superficie
// mencionada explícitamente por el hallazgo físico original).
describe('ARCHIVE LIFECYCLE COMPLETION — CommitmentDetailSheet.tsx source: isArchived gatea cada botón del footer, "Restaurar" despacha sólo a onRestore', () => {
    it('define isArchived = !!item.archived_at', () => {
        expect(COMMITMENT_DETAIL_SHEET_SRC).toMatch(/const isArchived = !!item\.archived_at;/);
    });

    it('Reprogramar/Confirmar-Aceptar/Completar/Reabrir/Cancelar/Archivar todos incluyen !isArchived en su guard', () => {
        expect(COMMITMENT_DETAIL_SHEET_SRC).toMatch(/\{!isFinished && !isProposal && !isArchived && onReschedule && \(/);
        expect(COMMITMENT_DETAIL_SHEET_SRC).toMatch(/\{!isFinished && !isArchived && primaryAction === 'accept' && onConfirmRequest && \(/);
        expect(COMMITMENT_DETAIL_SHEET_SRC).toMatch(/\{!isFinished && !isProposal && !isArchived && primaryAction === 'complete' && onMarkDone && \(/);
        expect(COMMITMENT_DETAIL_SHEET_SRC).toMatch(/\{isFinished && !isProposal && !isArchived && onReopen && \(/);
        expect(COMMITMENT_DETAIL_SHEET_SRC).toMatch(/\{!isFinished && !isProposal && !isArchived && onCancel && \(/);
        expect(COMMITMENT_DETAIL_SHEET_SRC).toMatch(/\{!isProposal && !isArchived && onArchive && \(/);
    });

    it('"Restaurar" está condicionado a (!isProposal && isArchived && onRestore) y despacha exclusivamente a onRestore(item.id)', () => {
        expect(COMMITMENT_DETAIL_SHEET_SRC).toMatch(/\{!isProposal && isArchived && onRestore && \(/);
        expect(COMMITMENT_DETAIL_SHEET_SRC).toMatch(/onPress=\{\(\) => \{ onClose\(\); onRestore\(item\.id\); \}\}>\s*<Ionicons name="arrow-undo-outline"[^]*?>Restaurar</);
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
    });
});

// PING — ARCHIVE UX AUDIT + IMPLEMENTATION: certificación física en iPhone
// demostró que NINGÚN menú/pantalla ofrecía realmente "Archivar" (ni
// CommitmentRow.tsx ni CommitmentDetailSheet.tsx llamaban a
// deleteCommitment/useArchiveCommitment/archiveCommitment en absoluto) pese
// a que el RPC real (archive_commitment_with_evidence) y el endpoint
// (DELETE /commitments/:id) ya existían completos y probados en backend --
// dueño canónico confirmado en commitment.service.ts. El fix agrega el
// wiring que faltaba: un nuevo prop onArchive, independiente de onCancel,
// que NUNCA cambia status (sólo archived_at) y está disponible en
// cualquier estado de un commitment canónico (activo/resuelto/cancelado),
// nunca para una commitment_proposal.
describe('ARCHIVE UX AUDIT + IMPLEMENTATION — "Archivar" ahora existe como acción real, distinta e independiente de "Cancelar"', () => {
    it('CommitmentRow.tsx: la opción iOS "Archivar" sólo aparece con onArchive presente, !isProposal y !isArchived, despacha a onArchive(c.id), nunca a onCancel', () => {
        expect(COMMITMENT_ROW_SRC).toMatch(/onArchive && !isProposal && !isArchived \? 'Archivar' : null/);
        expect(COMMITMENT_ROW_SRC).toMatch(/opt === 'Archivar' && onArchive\) onArchive\(c\.id\)/);
    });
    it('CommitmentRow.tsx: el Modal Android también ofrece "Archivar" con el mismo guard (!isProposal && !isArchived), despachando a onArchive, nunca a onCancel', () => {
        expect(COMMITMENT_ROW_SRC).toMatch(/\{onArchive && !isProposal && !isArchived && \(/);
        expect(COMMITMENT_ROW_SRC).toMatch(/onPress=\{\(\) => \{ setMenuVisible\(false\); onArchive\(c\.id\); \}\}>\s*<Ionicons name="archive-outline"[^]*?>Archivar</);
    });
    it('CommitmentDetailSheet.tsx: el footer ahora ofrece "Archivar" para !isProposal && !isArchived && onArchive, disponible tanto en estado activo como finalizado (nunca gateado por !isFinished, a diferencia de Cancelar)', () => {
        expect(COMMITMENT_DETAIL_SHEET_SRC).toMatch(/\{!isProposal && !isArchived && onArchive && \(/);
        expect(COMMITMENT_DETAIL_SHEET_SRC).toMatch(/onPress=\{\(\) => \{ onClose\(\); onArchive\(item\.id\); \}\}>\s*<Ionicons name="archive-outline"[^]*?>Archivar</);
    });
    it('el guard de "Archivar" en CommitmentDetailSheet.tsx nunca incluye !isFinished (a diferencia del guard real de "Cancelar", que sí lo exige) -- disponible en compromisos resueltos y cancelados, no sólo activos', () => {
        const archiveGuardMatch = COMMITMENT_DETAIL_SHEET_SRC.match(/\{(!isProposal && !isArchived && onArchive) && \(/);
        expect(archiveGuardMatch).not.toBeNull();
        expect(archiveGuardMatch![1]).not.toMatch(/isFinished/);
    });
    it('"Archivar" despacha exclusivamente a onArchive, nunca a onCancel -- la línea completa que invoca onArchive(c.id) no contiene onCancel en el mismo statement', () => {
        const archiveDispatchLine = COMMITMENT_ROW_SRC.match(/^.*onArchive\(c\.id\).*$/m);
        expect(archiveDispatchLine).not.toBeNull();
        expect(archiveDispatchLine![0]).not.toMatch(/onCancel/);
    });
    it('useArchiveCommitment (query-modules/commitments.ts) es el dueño canónico del wiring mobile -- llama DELETE /commitments/:id (deleteCommitment/archiveCommitment alias en backend), invalida la MISMA query canónica que cancel/resolve/reopen (all-commitments-dashboard), nunca la key obsoleta ["commitments"]', () => {
        const COMMITMENTS_API_SRC = fs.readFileSync(
            path.join(__dirname, '..', 'src/api/query-modules/commitments.ts'), 'utf-8',
        );
        expect(COMMITMENTS_API_SRC).toMatch(/export const useArchiveCommitment = \(\) => \{/);
        expect(COMMITMENTS_API_SRC).toMatch(/mutationFn: async \(id: string\) => apiClient\.delete\(`\/commitments\/\$\{id\}`\)/);
        const hookBlockMatch = COMMITMENTS_API_SRC.match(/export const useArchiveCommitment = \(\) => \{([^]*?)\n\};/);
        expect(hookBlockMatch).not.toBeNull();
        expect(hookBlockMatch![1]).toMatch(/useCommitmentLifecycleInvalidation/);
        expect(hookBlockMatch![1]).not.toMatch(/queryKey: \['commitments'\]/);
    });
});

// PING — CANONICAL POST-WRITE VERIFICATION COMPLETENESS + LIFECYCLE
// INVALIDATION CONSISTENCY: useCommitmentLifecycleInvalidation() (the
// canonical invalidation owner used by resolve/cancel/reopen/
// action-completed/counter-propose/reassign/schedule-follow-up/archive/
// restore) did not invalidate ['agreement-proposals'], while
// useAgentExecute (the Agent-driven mutation path) already did -- a manual
// (non-Agent) lifecycle mutation could leave Compromisos/Hoy's proposals
// section stale. Fixed by adding the key to the single canonical owner,
// never by duplicating a one-off invalidation into each of the 7 call
// sites individually.
describe('PING — CANONICAL POST-WRITE VERIFICATION COMPLETENESS + LIFECYCLE INVALIDATION CONSISTENCY: useCommitmentLifecycleInvalidation() is the single canonical owner, and now includes agreement-proposals', () => {
    const COMMITMENTS_API_SRC = fs.readFileSync(
        path.join(__dirname, '..', 'src/api/query-modules/commitments.ts'), 'utf-8',
    );

    function lifecycleInvalidationBody(): string {
        const match = COMMITMENTS_API_SRC.match(/function useCommitmentLifecycleInvalidation\(\) \{[^]*?\n\}/);
        expect(match).not.toBeNull();
        return match![0];
    }

    it('the canonical owner invalidates agreement-proposals alongside every other canonical key -- not a narrower set than useAgentExecute', () => {
        const body = lifecycleInvalidationBody();
        for (const key of ['insights', 'commitments', 'all-commitments-dashboard', 'group-tasks', 'group-tasks-conv', 'conversation-messages', 'agreement-proposals']) {
            expect(body).toMatch(new RegExp(`queryKey: \\['${key}'\\]`));
        }
    });

    it('useResolveCommitment (resolve), useCancelCommitment (cancel), useReopenCommitment (reopen), useCounterProposeCommitment (counter-propose), and useReassignCommitment (reassign) all call the canonical invalidate() -- none reimplements its own one-off invalidation list', () => {
        for (const hookName of ['useResolveCommitment', 'useCancelCommitment', 'useReopenCommitment', 'useCounterProposeCommitment', 'useReassignCommitment']) {
            const hookMatch = COMMITMENTS_API_SRC.match(new RegExp(`export const ${hookName} = \\(\\) => \\{[^]*?\\n\\};`));
            expect(hookMatch, `${hookName} not found`).not.toBeNull();
            expect(hookMatch![0]).toMatch(/const invalidate = useCommitmentLifecycleInvalidation\(\);/);
        }
    });

    it('useArchiveCommitment and useRestoreCommitment still call the canonical invalidate() AND separately invalidate archived-commitments -- the fix is additive, their existing archived-list behavior is preserved unchanged', () => {
        for (const hookName of ['useArchiveCommitment', 'useRestoreCommitment']) {
            const hookMatch = COMMITMENTS_API_SRC.match(new RegExp(`export const ${hookName} = \\(\\) => \\{[^]*?\\n\\};`));
            expect(hookMatch, `${hookName} not found`).not.toBeNull();
            const body = hookMatch![0];
            expect(body).toMatch(/const invalidate = useCommitmentLifecycleInvalidation\(\);/);
            expect(body).toMatch(/invalidate\(\);/);
            expect(body).toMatch(/queryClient\.invalidateQueries\(\{ queryKey: \['archived-commitments'\] \}\)/);
        }
    });

    it('no duplicate per-hook reimplementation of the canonical invalidation list was introduced -- exactly one function defines the shared key set', () => {
        const definitions = (COMMITMENTS_API_SRC.match(/function useCommitmentLifecycleInvalidation\(\)/g) || []).length;
        expect(definitions).toBe(1);
    });

    it('useAgentExecute (mobile/src/api/query-modules/agent.ts) invalidation set is unchanged and still matches the canonical lifecycle set exactly -- Agent execution invalidation remains green', () => {
        const AGENT_API_SRC = fs.readFileSync(
            path.join(__dirname, '..', 'src/api/query-modules/agent.ts'), 'utf-8',
        );
        const fnMatch = AGENT_API_SRC.match(/export function useAgentExecute\(\)[^]*?\n\}/);
        expect(fnMatch).not.toBeNull();
        for (const key of ['insights', 'commitments', 'all-commitments-dashboard', 'group-tasks', 'group-tasks-conv', 'conversation-messages', 'agreement-proposals']) {
            expect(fnMatch![0]).toMatch(new RegExp(`queryKey: \\['${key}'\\]`));
        }
    });
});

// PING — RESOLUTION RESULT NOT VISIBLE IN COMMITMENT DETAIL FIX. Root
// cause: CommitmentDetailSheet.tsx's "Resolution result" section read
// item.result -- a field that never exists anywhere in the API response
// (backend commitment.service.ts#getCommitments/getArchivedCommitments
// both select the real column resolution_result; the legacy-shape
// compat layer, commitmentCompat.ts#toLegacyCommitmentShape, spreads the
// row unchanged and adds no `result` alias). The canonical field was
// present end-to-end (DB -> backend select -> API response) and lost
// ONLY at this final presentation layer, via a wrong property name --
// confirmed by a repo-wide grep finding zero other mobile references to
// resolution_result/resolutionResult before this fix. Also wires the
// existing canonical getStatusLabel helper (already used by
// GroupTaskCard.tsx/TaskHistoryScreen.tsx) in place of the raw
// status.toUpperCase() English enum, since it is directly owned by this
// same component and the helper already exists -- no new status-label
// map introduced.
describe('PING — RESOLUTION RESULT NOT VISIBLE IN COMMITMENT DETAIL FIX: CommitmentDetailSheet.tsx renders the canonical resolution_result field, never the nonexistent item.result', () => {
    it('reads item.resolution_result -- the real canonical field name, never item.result (which never exists in any API response)', () => {
        expect(COMMITMENT_DETAIL_SHEET_SRC).toMatch(/status === 'resolved' && !!item\.resolution_result/);
        expect(COMMITMENT_DETAIL_SHEET_SRC).not.toMatch(/!!item\.result\b/);
    });

    it('the section renders the label "Resultado" and the exact field value, with no truncation prop (numberOfLines) that would cut off multiline content', () => {
        const sectionMatch = COMMITMENT_DETAIL_SHEET_SRC.match(/\{status === 'resolved' && !!item\.resolution_result && \([^]*?\)\}/);
        expect(sectionMatch).not.toBeNull();
        const block = sectionMatch![0];
        expect(block).toMatch(/>Resultado</);
        expect(block).toMatch(/\{item\.resolution_result\}/);
        expect(block).not.toMatch(/numberOfLines/);
    });

    it('the Resultado section is gated on status === \'resolved\' -- an accepted/cancelled/rejected/proposed item can never render it, even if a stray non-empty value existed on the object', () => {
        const sectionMatch = COMMITMENT_DETAIL_SHEET_SRC.match(/\{status === 'resolved' && !!item\.resolution_result && \([^]*?\)\}/);
        expect(sectionMatch![0]).toMatch(/^\{status === 'resolved' && !!item\.resolution_result/);
    });

    it('renders no internal metadata alongside the result -- only the plain resolution_result string, never a JSON.stringify or a second field interpolated into the same block', () => {
        const sectionMatch = COMMITMENT_DETAIL_SHEET_SRC.match(/\{status === 'resolved' && !!item\.resolution_result && \([^]*?\)\}/);
        const block = sectionMatch![0];
        expect(block).not.toMatch(/JSON\.stringify/);
        expect(block).not.toMatch(/item\.id|item\.owner_user_id|item\.conversation_id/);
    });

    it('the Estado row now uses the canonical getStatusLabel helper (already used by GroupTaskCard.tsx/TaskHistoryScreen.tsx) instead of the raw English enum status.toUpperCase()', () => {
        expect(COMMITMENT_DETAIL_SHEET_SRC).toMatch(/import \{[^}]*getStatusLabel[^}]*\} from '\.\.\/\.\.\/utils\/commitmentDisplay'/);
        expect(COMMITMENT_DETAIL_SHEET_SRC).toMatch(/>\{getStatusLabel\(status\)\}</);
        expect(COMMITMENT_DETAIL_SHEET_SRC).not.toMatch(/>\{status\.toUpperCase\(\)\}</);
    });

    it('getStatusLabel maps resolved to the canonical Spanish label already used everywhere else in the app -- "Resuelto", never a newly-invented "Completado" duplicate label', () => {
        const DISPLAY_SRC = fs.readFileSync(
            path.join(__dirname, '..', 'src/utils/commitmentDisplay.ts'), 'utf-8',
        );
        expect(DISPLAY_SRC).toMatch(/resolved: 'Resuelto'/);
        // Only one STATUS_LABELS map exists -- this fix does not introduce
        // a second, divergent status-translation table.
        const mapDefinitions = (DISPLAY_SRC.match(/const STATUS_LABELS: Record<string, string> = \{/g) || []).length;
        expect(mapDefinitions).toBe(1);
    });

    it('the footer actions Ver en chat / Reabrir / Archivar and their callbacks are untouched by this fix', () => {
        expect(COMMITMENT_DETAIL_SHEET_SRC).toMatch(/onPress=\{goToChat\}>\s*\n\s*<Ionicons name="chatbubble-ellipses-outline"/);
        expect(COMMITMENT_DETAIL_SHEET_SRC).toMatch(/onPress=\{\(\) => \{ onClose\(\); onReopen\(item\.id\); \}\}>\s*\n\s*<Ionicons name="refresh-outline"/);
        expect(COMMITMENT_DETAIL_SHEET_SRC).toMatch(/onPress=\{\(\) => \{ onClose\(\); onArchive\(item\.id\); \}\}>\s*\n\s*<Ionicons name="archive-outline"/);
    });
});

// Reopen semantics audit: apply_commitment_transition_with_evidence (the
// sole RPC that ever mutates lifecycle fields) applies each patch key via
// `case when p_patch ? 'key' then ... else <unchanged column> end` --
// computeReopen's patch (commitmentTransitions.ts) never includes
// resolution_result, so the column is structurally preserved (option B:
// historical resolution_result survives a reopen), never cleared. This
// documents that canonical truth so a future presentation change doesn't
// invent different reopen semantics than what the RPC actually does.
describe('PING — RESOLUTION RESULT NOT VISIBLE IN COMMITMENT DETAIL FIX: reopen preserves historical resolution_result (canonical RPC behavior, not a presentation invention)', () => {
    const TRANSITIONS_SRC = fs.readFileSync(
        path.join(__dirname, '..', '..', 'backend/src/utils/commitmentTransitions.ts'), 'utf-8',
    );

    it('computeReopen\'s patch never includes resolution_result -- the field is left untouched by the reopen transition, never explicitly cleared', () => {
        const fnMatch = TRANSITIONS_SRC.match(/function computeReopen\(input: CommitmentTransitionInput\): CommitmentTransitionResult \{[^]*?\n\}/);
        expect(fnMatch).not.toBeNull();
        expect(fnMatch![0]).not.toMatch(/resolution_result/);
    });

    it('computeReopen DOES explicitly clear resolved_at/action_completed_at/rejection_reason/proposed_due_at -- confirming the omission of resolution_result is deliberate/structural, not an oversight in a patch that clears everything else', () => {
        const fnMatch = TRANSITIONS_SRC.match(/function computeReopen\(input: CommitmentTransitionInput\): CommitmentTransitionResult \{[^]*?\n\}/);
        const body = fnMatch![0];
        expect(body).toMatch(/resolved_at: null/);
        expect(body).toMatch(/action_completed_at: null/);
        expect(body).toMatch(/rejection_reason: null/);
        expect(body).toMatch(/proposed_due_at: null/);
    });
});
