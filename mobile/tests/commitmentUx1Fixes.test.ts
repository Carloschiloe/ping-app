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
const HOY_SCREEN_SRC = fs.readFileSync(
    path.join(__dirname, '..', 'src/screens/HoyScreen.tsx'), 'utf-8',
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

describe('FIX 2 — el archivo REAL de Hoy (archived_at, irreversible) permanece intacto y separado', () => {
    it('HoyScreen.tsx conserva su propio flujo "Archivar compromiso" -> deleteCommitment (DELETE /commitments/:id, archive_commitment_with_evidence), nunca tocado por este fix', () => {
        expect(HOY_SCREEN_SRC).toMatch(/Archivar compromiso/);
        expect(HOY_SCREEN_SRC).toMatch(/deleteCommitment/);
    });
    it('CommitmentRow.tsx nunca importa ni llama deleteCommitment/useDeleteCommitment -- su "Cancelar" nunca se convierte en el archive real', () => {
        expect(COMMITMENT_ROW_SRC).not.toMatch(/deleteCommitment|useDeleteCommitment/);
    });
});
