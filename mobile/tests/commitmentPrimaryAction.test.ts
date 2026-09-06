// M-1H v5 — CANONICAL PRIMARY ACTION DECISION + PARTICIPATION MODEL.
// Hallazgo real físico (caso "Entrenar"): Carlos (proposer + responsible)
// ya aprobó, Alejandra sigue pendiente -- CommitmentRow.tsx decidía el
// botón primario mirando ÚNICAMENTE `status==='proposed'`, así que Carlos
// veía "Confirmar" pese a no poder hacer nada más ahí. Estos tests
// certifican la función pura real (mismo módulo que usan
// CommitmentRow.tsx/TodayItemRow.tsx), sin necesitar un renderer.
import { describe, expect, it } from 'vitest';
import { getCommitmentPrimaryAction } from '../src/utils/commitmentPrimaryAction';
import { getProposalParticipationState, getProposalWaitingLabel } from '../src/utils/agreement';

const CARLOS = 'carlos-id';
const ALEJANDRA = 'alejandra-id';

// Shape real de una proposal compartida tal como toAgreementView la entrega
// (owner_user_id/assigned_to_user_id/agreement_responses).
const entrenar = {
    id: 'pr-entrenar', title: 'Entrenar', status: 'proposed', _isAgreementProposal: true,
    owner_user_id: CARLOS, assigned_to_user_id: CARLOS,
    agreement_responses: [
        { participant_user_id: CARLOS, status: 'approved' as const, participant: { full_name: 'Carlos' } },
        { participant_user_id: ALEJANDRA, status: 'pending' as const, participant: { full_name: 'Alejandra' } },
    ],
};

describe('CASO REAL "Entrenar" (sección 4/10/21 del ticket): Carlos ya aprobó, Alejandra pendiente', () => {
    it('getProposalParticipationState — vista de Carlos', () => {
        const state = getProposalParticipationState(entrenar, CARLOS);
        expect(state.actorRole).toBe('proposer');
        expect(state.actorHasApproved).toBe(true);
        expect(state.actorCanRespond).toBe(false);
        expect(state.pendingResponderIds).toEqual([ALEJANDRA]);
        expect(state.isFullyApproved).toBe(false);
    });

    it('getProposalParticipationState — vista de Alejandra', () => {
        const state = getProposalParticipationState(entrenar, ALEJANDRA);
        expect(state.actorRole).toBe('participant');
        expect(state.actorHasApproved).toBe(false);
        expect(state.actorCanRespond).toBe(true);
    });

    it('CASO CARLOS (sección 10): getCommitmentPrimaryAction devuelve "waiting", NUNCA "accept"/"complete"', () => {
        expect(getCommitmentPrimaryAction(entrenar, CARLOS)).toBe('waiting');
    });

    it('CASO ALEJANDRA (sección 11): getCommitmentPrimaryAction devuelve "accept" (Aceptar disponible)', () => {
        expect(getCommitmentPrimaryAction(entrenar, ALEJANDRA)).toBe('accept');
    });

    it('getProposalWaitingLabel: Carlos ve "Esperando a Alejandra", nunca "Vencido"', () => {
        expect(getProposalWaitingLabel(entrenar, CARLOS)).toBe('Esperando a Alejandra');
    });
});

describe('CASO FULL APPROVAL (sección 22): tras la aceptación de Alejandra', () => {
    const fullyApproved = {
        ...entrenar,
        agreement_responses: [
            { participant_user_id: CARLOS, status: 'approved' as const },
            { participant_user_id: ALEJANDRA, status: 'approved' as const },
        ],
    };
    it('isFullyApproved=true, ningún actor puede ya "aceptar" de nuevo', () => {
        const state = getProposalParticipationState(fullyApproved, CARLOS);
        expect(state.isFullyApproved).toBe(true);
        expect(getCommitmentPrimaryAction(fullyApproved, CARLOS)).toBe('waiting');
        expect(getCommitmentPrimaryAction(fullyApproved, ALEJANDRA)).toBe('waiting');
    });
});

describe('CASO COUNTERPROPOSAL (sección 12/23): Alejandra propone nueva fecha', () => {
    it('Carlos vuelve a poder responder (actorCanRespond=true) tras el reset de su fila a pending', () => {
        const afterCounter = {
            ...entrenar,
            status: 'counter_proposal',
            agreement_responses: [
                { participant_user_id: CARLOS, status: 'pending' as const },
                { participant_user_id: ALEJANDRA, status: 'counter_proposed' as const },
            ],
        };
        expect(getCommitmentPrimaryAction(afterCounter, CARLOS)).toBe('accept');
    });
});

describe('CASO REJECT (sección 24)', () => {
    it('proposal rechazada -> getCommitmentPrimaryAction siempre "none", nunca accionable', () => {
        const rejected = { ...entrenar, status: 'rejected' };
        expect(getCommitmentPrimaryAction(rejected, CARLOS)).toBe('none');
        expect(getCommitmentPrimaryAction(rejected, ALEJANDRA)).toBe('none');
    });
});

describe('Proposal SOLO (sin agreement_responses)', () => {
    const solo = { id: 'pr-solo', status: 'proposed', _isAgreementProposal: true, owner_user_id: CARLOS, assigned_to_user_id: CARLOS, agreement_responses: [] };

    it('el owner puede confirmarla directamente -> "accept"', () => {
        expect(getCommitmentPrimaryAction(solo, CARLOS)).toBe('accept');
    });

    it('alguien que no es el owner nunca puede actuar sobre una proposal solo ajena -> "waiting"', () => {
        expect(getCommitmentPrimaryAction(solo, ALEJANDRA)).toBe('waiting');
    });
});

describe('M-1H v5: ConfirmCommitmentModal — copy adaptado según entityType (sección 28 del ticket)', () => {
    it('para una proposal, el título es "¿Aceptar propuesta?" y el label del botón es "Aceptar", nunca "¿Confirmar compromiso?"', async () => {
        const fs = await import('node:fs');
        const path = await import('node:path');
        const src = fs.readFileSync(path.join(__dirname, '..', 'src/components/compromisos/ConfirmCommitmentModal.tsx'), 'utf-8');
        expect(src).toMatch(/¿Aceptar propuesta\?/);
        expect(src).toMatch(/¿Confirmar compromiso\?/);
        expect(src).toMatch(/isProposalAccept\s*=\s*commitment\?\.\_isAgreementProposal === true/);
        expect(src).toMatch(/isOverdueItem && \(/); // advertencia "vencido" sólo para commitment canónico
        expect(src).toMatch(/datePassed && \(/); // advertencia separada y honesta para proposal
    });
});

describe('M-1H v5: CommitmentDetailSheet — nunca ofrece Completar/Archivar/Reprogramar para una proposal pendiente (sección 17 del ticket)', async () => {
    const fs = await import('node:fs');
    const path = await import('node:path');
    const src = fs.readFileSync(path.join(__dirname, '..', 'src/components/compromisos/CommitmentDetailSheet.tsx'), 'utf-8');

    it('Reprogramar/Completar/Archivar están todos condicionados a "!isProposal"', () => {
        expect(src).toMatch(/!isFinished && !isProposal && onReschedule/);
        expect(src).toMatch(/!isFinished && !isProposal && primaryAction === 'complete' && onMarkDone/);
        expect(src).toMatch(/!isFinished && !isProposal && onCancel/);
    });

    it('ofrece "Aceptar"/"Confirmar" vía onConfirmRequest cuando primaryAction==="accept" (mismo modal que la fila)', () => {
        expect(src).toMatch(/primaryAction === 'accept' && onConfirmRequest/);
        expect(src).toMatch(/isProposal \? 'Aceptar' : 'Confirmar'/);
    });

    it('muestra a quién le corresponde responder cuando el actor está esperando', () => {
        expect(src).toMatch(/isProposal && primaryAction === 'waiting'/);
        expect(src).toMatch(/proposalWaitingLabel/);
    });

    it('InsightsScreen.tsx conecta onConfirmRequest={handleRequestConfirm} (mismo modal, nunca un flujo nuevo)', () => {
        const screenSrc = fs.readFileSync(path.join(__dirname, '..', 'src/screens/InsightsScreen.tsx'), 'utf-8');
        expect(screenSrc).toMatch(/onConfirmRequest=\{handleRequestConfirm\}/);
    });
});

describe('M-1H v5: InsightsScreen "Por confirmar" — proposals nunca se clasifican junto a Vencidos/Hoy/etc. (sección 8/27 del ticket)', async () => {
    const fs = await import('node:fs');
    const path = await import('node:path');
    const src = fs.readFileSync(path.join(__dirname, '..', 'src/screens/InsightsScreen.tsx'), 'utf-8');

    it('separa "porConfirmar" (proposals no rechazadas) de "regularCommitments" ANTES de clasificar por fecha', () => {
        expect(src).toMatch(/const porConfirmar = list\.filter\(\(c: any\) => c\._isAgreementProposal === true/);
        expect(src).toMatch(/const regularCommitments = list\.filter/);
        expect(src).toMatch(/regularCommitments\.forEach/);
    });

    it('agrega la sección "📝 Por confirmar" como parte de las secciones reales de Mis Compromisos', () => {
        expect(src).toMatch(/title: '📝 Por confirmar', data: porConfirmarOrdenado/);
    });

    it('dentro de "Por confirmar", lo accionable (Pendiente de tu respuesta) se ordena antes que lo que sólo espera a otra persona', () => {
        expect(src).toMatch(/getCommitmentPrimaryAction\(a, user\?\.id\) === 'accept'/);
    });
});

describe('Commitment canónico (nunca depende de participación)', () => {
    it('status=proposed -> "accept" (Confirmar), igual que antes de esta unificación', () => {
        expect(getCommitmentPrimaryAction({ status: 'proposed', _isAgreementProposal: false }, CARLOS)).toBe('accept');
    });

    it('status=accepted -> "complete" (Listo)', () => {
        expect(getCommitmentPrimaryAction({ status: 'accepted', _isAgreementProposal: false }, CARLOS)).toBe('complete');
    });

    it('resolved/cancelled/rejected -> "none"', () => {
        for (const status of ['resolved', 'cancelled', 'rejected']) {
            expect(getCommitmentPrimaryAction({ status, _isAgreementProposal: false }, CARLOS)).toBe('none');
        }
    });
});
