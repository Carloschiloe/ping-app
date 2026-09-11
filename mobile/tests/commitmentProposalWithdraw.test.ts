import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { normalizeCommitmentStatus } from '../src/utils/commitmentStatus';

// PROPOSAL UX — WIRE PROPOSER WITHDRAW ACTION. Mismo patrón de source-text ya
// establecido por commitmentRowRedesign.test.ts (mobile/vitest.config.ts: sin
// renderer de componentes) -- verifica el cableado real de "Retirar
// propuesta" (proposer-only, proposal pending) contra el endpoint/RPC ya
// existente (reject_commitment_proposal_with_evidence), y que el dismiss
// nativo "Cancelar" (index 0 del ActionSheet) nunca se confunde con esa
// acción de negocio.
const COMMITMENT_ROW_SRC = fs.readFileSync(
    path.join(__dirname, '..', 'src/components/compromisos/CommitmentRow.tsx'), 'utf-8',
);
const REQUESTS_SRC = fs.readFileSync(
    path.join(__dirname, '..', 'src/api/query-modules/commitmentConfirmRequests.ts'), 'utf-8',
);
const COMMITMENTS_MODULE_SRC = fs.readFileSync(
    path.join(__dirname, '..', 'src/api/query-modules/commitments.ts'), 'utf-8',
);
const INSIGHTS_SCREEN_SRC = fs.readFileSync(
    path.join(__dirname, '..', 'src/screens/InsightsScreen.tsx'), 'utf-8',
);

describe('proposer ve "Retirar propuesta"', () => {
    it('CommitmentRow.tsx deriva isProposer/canWithdrawProposal y los usa como condición del item de menú', () => {
        expect(COMMITMENT_ROW_SRC).toMatch(/const isProposer = isProposal && c\.owner_user_id === currentUserId;/);
        // ROOT-CAUSE FIX (hallazgo físico real "Entrenar"): mobile nunca recibe
        // el status crudo 'pending' de commitment_proposals -- toAgreementView
        // (backend) lo remapea a 'proposed' antes de serializar. La condición
        // real debe comparar contra el `status` YA NORMALIZADO (línea 77,
        // normalizeCommitmentStatus(c.status)), nunca c.status crudo por
        // segunda vez con un valor que el wire contract nunca produce.
        expect(COMMITMENT_ROW_SRC).toMatch(/const canWithdrawProposal = isProposer && status === 'proposed';/);
        expect(COMMITMENT_ROW_SRC).not.toMatch(/canWithdrawProposal = isProposer && c\.status === 'pending'/);
    });
    it('el ActionSheet iOS ofrece "Retirar propuesta" gated por onWithdraw && canWithdrawProposal', () => {
        expect(COMMITMENT_ROW_SRC).toMatch(/onWithdraw && canWithdrawProposal \? 'Retirar propuesta' : null/);
        expect(COMMITMENT_ROW_SRC).toMatch(/opt === 'Retirar propuesta' && onWithdraw\) onWithdraw\(c\)/);
    });
    it('el menú Android (Modal) ofrece el mismo item bajo la misma condición', () => {
        expect(COMMITMENT_ROW_SRC).toMatch(/\{onWithdraw && canWithdrawProposal && \(/);
        expect(COMMITMENT_ROW_SRC).toMatch(/Retirar propuesta<\/Text>/);
    });
});

describe('responder NO recibe el withdraw proposer-only', () => {
    it('canWithdrawProposal exige isProposer (owner_user_id===currentUserId) -- nunca sólo isProposal', () => {
        // La condición real vive en una sola expresión booleana: isProposer ya
        // exige owner_user_id===currentUserId, así que un responder
        // (currentUserId !== owner_user_id) nunca puede satisfacer
        // canWithdrawProposal sin importar el status de la proposal.
        expect(COMMITMENT_ROW_SRC).toMatch(/const isProposer = isProposal && c\.owner_user_id === currentUserId;/);
        expect(COMMITMENT_ROW_SRC).not.toMatch(/canWithdrawProposal = isProposal &&(?! isProposer)/);
    });
    it('"Retirar propuesta" nunca se ofrece junto a "Rechazar propuesta" para el mismo actor en una proposal SOLO (FIX 1: canRespondToProposal ahora exige también actorHasRecordedResponse, ausente en el caso solo)', () => {
        // canRespondToProposal exige primaryAction==='accept' Y
        // actorHasRecordedResponse (commitmentPrimaryAction.ts +
        // agreement.ts) -- para una proposal SOLO (caso "Entrenar" como
        // proposer) nunca hay fila de commitment_proposal_responses, así que
        // canRespondToProposal es false pese a que primaryAction sí es
        // 'accept'. Ambas gates leen de fuentes de verdad distintas
        // (participación real vs owner_user_id), nunca se solapan para el
        // mismo actor sobre la misma proposal solo.
        expect(COMMITMENT_ROW_SRC).toMatch(/const canRespondToProposal = isProposal && primaryAction === 'accept' && !!proposalParticipation\?\.actorHasRecordedResponse;/);
    });
});

describe('tapping "Retirar propuesta" llama al endpoint de proposal reject', () => {
    it('withdrawCommitmentProposalRequest llama POST /commitment-proposals/:id/reject -- el mismo endpoint ya auditado, nunca uno nuevo', () => {
        expect(REQUESTS_SRC).toMatch(/export const withdrawCommitmentProposalRequest = \(id: string\) => apiClient\.post\(`\/commitment-proposals\/\$\{id\}\/reject`, \{\}\);/);
    });
    it('useWithdrawCommitmentProposal usa withdrawCommitmentProposalRequest como mutationFn', () => {
        expect(COMMITMENTS_MODULE_SRC).toMatch(/export const useWithdrawCommitmentProposal = \(\) => \{/);
        expect(COMMITMENTS_MODULE_SRC).toMatch(/mutationFn: withdrawCommitmentProposalRequest,/);
    });
    it('InsightsScreen.tsx wirea onWithdraw={handleWithdrawProposal} sobre CommitmentRow, y handleWithdrawProposal llama withdrawProposal(commitment.id)', () => {
        expect(INSIGHTS_SCREEN_SRC).toMatch(/onWithdraw=\{handleWithdrawProposal\}/);
        expect(INSIGHTS_SCREEN_SRC).toMatch(/await withdrawProposal\(commitment\.id\);/);
    });
    it('la mutation invalida las mismas query keys que useConfirmCommitmentProposal/useRespondToCommitmentProposal (mismo lifecycle de proposal), para que Compromisos refresque al estado canónico', () => {
        const withdrawBlockMatch = COMMITMENTS_MODULE_SRC.match(
            /export const useWithdrawCommitmentProposal = \(\) => \{[\s\S]*?\n\};/
        );
        expect(withdrawBlockMatch).not.toBeNull();
        const block = withdrawBlockMatch![0];
        for (const key of ['agreement-proposals', 'commitments', 'all-commitments-dashboard', 'group-tasks', 'group-tasks-conv', 'conversation-messages', 'insights']) {
            expect(block).toContain(`['${key}']`);
        }
    });
});

describe('el path canónico de cancelación de commitment permanece intacto', () => {
    it('onCancel sigue gated por !isProposal (nunca reutilizado por el withdraw de proposal)', () => {
        expect(COMMITMENT_ROW_SRC).toMatch(/onCancel && !isFinished && !isProposal \? `Cancelar \$\{isMeeting \? 'reunión' : 'tarea'\}` : null/);
        expect(COMMITMENT_ROW_SRC).toMatch(/\{onCancel && !isFinished && !isProposal && \(/);
    });
    it('el handler onWithdraw es una prop y una rama de código separadas de onCancel -- nunca la misma función ni el mismo endpoint', () => {
        expect(COMMITMENT_ROW_SRC).toMatch(/onWithdraw\?: \(commitment: any\) => void;/);
        expect(COMMITMENT_ROW_SRC).toMatch(/onCancel\?: \(id: string\) => void;/);
        expect(COMMITMENT_ROW_SRC).not.toMatch(/onWithdraw\(c\.id\)/);
    });
    it('InsightsScreen.tsx sigue wireando onCancel={handleCancel} (useCancelCommitment) sin cambios de firma', () => {
        expect(INSIGHTS_SCREEN_SRC).toMatch(/onCancel=\{handleCancel\}/);
        expect(INSIGHTS_SCREEN_SRC).toMatch(/const handleCancel = useCallback\(\(id: string\) => \{\s*cancelCommitment\(\{ id \}\);\s*\}, \[cancelCommitment\]\);/);
    });
});

describe('elegibilidad real de "Retirar propuesta" contra fixtures con wire status (toAgreementView), nunca el status crudo de commitment_proposals', () => {
    // Re-deriva la MISMA expresión que CommitmentRow.tsx usa realmente,
    // extraída por regex del source (nunca hand-duplicada/reescrita) --
    // así un futuro cambio en la condición real rompe este test en vez de
    // quedar silenciosamente desincronizado. normalizeCommitmentStatus es la
    // misma función pura que CommitmentRow.tsx importa (línea 77).
    const CARLOS = 'carlos-id';
    const ALEJANDRA = 'alejandra-id';

    function evalCanWithdrawProposal(c: { _isAgreementProposal?: boolean; owner_user_id?: string; status?: string }, currentUserId: string) {
        const isProposedMatch = COMMITMENT_ROW_SRC.match(/const isProposal = (c\._isAgreementProposal === true);/);
        const isProposerMatch = COMMITMENT_ROW_SRC.match(/const isProposer = isProposal && (c\.owner_user_id === currentUserId);/);
        const canWithdrawMatch = COMMITMENT_ROW_SRC.match(/const canWithdrawProposal = isProposer && (status === 'proposed');/);
        expect(isProposedMatch).not.toBeNull();
        expect(isProposerMatch).not.toBeNull();
        expect(canWithdrawMatch).not.toBeNull();

        const status = normalizeCommitmentStatus(c.status);
        const isProposal = c._isAgreementProposal === true;
        const isProposer = isProposal && c.owner_user_id === currentUserId;
        return isProposer && status === 'proposed';
    }

    it('wire status "proposed" + proposer => elegible ("Retirar propuesta" visible)', () => {
        const entrenar = { id: 'pr-entrenar', _isAgreementProposal: true, status: 'proposed', owner_user_id: CARLOS };
        expect(evalCanWithdrawProposal(entrenar, CARLOS)).toBe(true);
    });

    it('wire status "proposed" + NO proposer (responder) => no elegible (oculto)', () => {
        const entrenar = { id: 'pr-entrenar', _isAgreementProposal: true, status: 'proposed', owner_user_id: CARLOS };
        expect(evalCanWithdrawProposal(entrenar, ALEJANDRA)).toBe(false);
    });

    it('proposal "rejected" (ya retirada/rechazada) => no elegible (oculto), aun siendo proposer', () => {
        const rejected = { id: 'pr-rejected', _isAgreementProposal: true, status: 'rejected', owner_user_id: CARLOS };
        expect(evalCanWithdrawProposal(rejected, CARLOS)).toBe(false);
    });

    it('proposal "counter_proposal" (contrapropuesta en curso) => no elegible (oculto), aun siendo proposer', () => {
        const countered = { id: 'pr-countered', _isAgreementProposal: true, status: 'counter_proposal', owner_user_id: CARLOS };
        expect(evalCanWithdrawProposal(countered, CARLOS)).toBe(false);
    });

    it('el status crudo "pending" (nunca producido por el wire contract real) ya no es el string comparado -- reproduce exactamente el bug físico si se revirtiera', () => {
        // Si alguien revirtiera el fix a comparar c.status==='pending', esta
        // fixture con el wire status REAL ('proposed') seguiría siendo
        // elegible bajo la condición correcta, pero un regreso al bug haría
        // que este mismo caso (el real, físico) fallara -- éste es el caso
        // que estaba físicamente roto en staging antes de este fix.
        const entrenarReal = { id: '0d718396-bab7-424a-834f-24ab19630f8b', _isAgreementProposal: true, status: 'proposed', owner_user_id: CARLOS };
        expect(evalCanWithdrawProposal(entrenarReal, CARLOS)).toBe(true);
    });
});

describe('el botón de dismiss nativo "Cancelar" no envía ninguna request', () => {
    it('cancelButtonIndex sigue apuntando a index 0, y el handler retorna antes de despachar cualquier acción para ese índice', () => {
        expect(COMMITMENT_ROW_SRC).toMatch(/\{ options, cancelButtonIndex: 0, destructiveButtonIndex, title: c\.title \}/);
        expect(COMMITMENT_ROW_SRC).toMatch(/\(idx\) => \{\s*if \(idx === 0\) return;/);
    });
    it('el primer elemento del array options sigue siendo el literal "Cancelar" del dismiss, no renombrado a la acción de negocio', () => {
        const optionsBlockMatch = COMMITMENT_ROW_SRC.match(/const options = \[([\s\S]*?)\]\.filter\(Boolean\)/);
        expect(optionsBlockMatch).not.toBeNull();
        const firstEntry = optionsBlockMatch![1].trim().split('\n')[0].trim();
        expect(firstEntry).toBe("'Cancelar',");
    });
    it('el Modal Android conserva su propio dismiss "Cancelar" separado, con onPress que sólo cierra el menú (setMenuVisible(false)), sin llamar ninguna mutation', () => {
        expect(COMMITMENT_ROW_SRC).toMatch(/onPress=\{\(\) => setMenuVisible\(false\)\}>\s*<Ionicons name="close-outline"/);
    });
});
