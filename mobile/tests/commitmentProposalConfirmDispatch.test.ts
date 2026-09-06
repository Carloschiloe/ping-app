// M-1H v2 — CANONICAL COMMITMENT/PROPOSAL UNIFICATION, dynamic dispatch
// certification. Hallazgo real a nivel de RPC (no sólo de ruta HTTP): el
// botón "Confirmar" siempre llamaba POST /commitments/:id/accept sin
// importar el origen de la fila -- 404 "Commitment not found" para toda
// commitment_proposal (id real = proposal_id). La primera corrección (v1)
// despachaba TODA proposal a POST /commitment-proposals/:id/respond
// (RPC respond_to_commitment_proposal), copiando el patrón ya validado en
// GroupTaskCard.tsx#handleAccept -- pero ese RPC EXIGE una fila previa en
// commitment_proposal_responses ("Actor is not required for this
// agreement", 403 si no existe), fila que SÓLO existe para proposals
// COMPARTIDAS (creadas vía POST /commitment-proposals/shared). Una proposal
// SOLO (el caso real "Entrenar", creada vía POST /commitment-proposals)
// nunca tiene esa fila -- v1 sólo cambiaba el error de 404 a 403.
//
// El endpoint REAL para una proposal solo es
// POST /commitment-proposals/:id/confirm -> RPC confirm_commitment_proposal,
// cuyo único guard es "el actor es el owner" (ver
// supabase/migrations/20260730123000_shared_commitment_agreements.sql).
//
// Estos tests son DINÁMICOS, no sólo auditoría estática de strings: mockean
// apiClient.post y ejecutan las funciones de request REALES exportadas por
// src/api/query-modules/commitments.ts (extraídas de sus hooks
// específicamente para esto -- este repo no tiene @testing-library/react
// para renderizar hooks, así que la función de request plana es el punto de
// verificación real sin necesitar un renderer).
import { beforeEach, describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

vi.mock('../src/api/client', () => ({
    apiClient: { post: vi.fn(), get: vi.fn(), delete: vi.fn(), patch: vi.fn() },
    ApiError: class ApiError extends Error {},
}));

import { apiClient } from '../src/api/client';
// M-1H v2: importado del módulo aislado (no de commitments.ts) -- ese
// archivo tiene, en OTRA función no relacionada (useCancelCommitment), una
// llamada con type argument explícito que el transform SSR de este pipeline
// de vitest no logra parsear de forma aislada ("Expected 'from', got
// 'typeOf'"). Ver commitmentConfirmRequests.ts para el detalle completo.
import {
    acceptCommitmentRequest, respondToCommitmentProposalRequest, confirmCommitmentProposalRequest,
} from '../src/api/query-modules/commitmentConfirmRequests';
import { resolveCommitmentConfirmAction } from '../src/utils/commitmentConfirmDispatch';

function readSrc(relPath: string): string {
    return fs.readFileSync(path.join(__dirname, '..', relPath), 'utf-8');
}

beforeEach(() => {
    vi.mocked(apiClient.post).mockReset().mockResolvedValue({});
});

// Simula EXACTAMENTE lo que handleConfirm hace en InsightsScreen.tsx /
// TaskDashboardScreen.tsx: resuelve la acción y despacha a la función de
// request real correspondiente.
async function dispatchConfirm(commitment: any) {
    const action = resolveCommitmentConfirmAction(commitment);
    if (action.type === 'respondToProposal') {
        await respondToCommitmentProposalRequest({ id: action.id, decision: 'approve' });
    } else if (action.type === 'confirmProposal') {
        await confirmCommitmentProposalRequest(action.id);
    } else {
        await acceptCommitmentRequest(action.id);
    }
    return action;
}

describe('M-1H v2: resolveCommitmentConfirmAction — discriminador real (canonical / shared proposal / solo proposal)', () => {
    it('CASO A: commitment canónico (status=proposed, sin _isAgreementProposal) -> acceptCommitment', () => {
        const action = resolveCommitmentConfirmAction({ id: 'commitment-123', status: 'proposed' });
        expect(action).toEqual({ type: 'acceptCommitment', id: 'commitment-123' });
    });

    it('CASO B: proposal COMPARTIDA (agreement_responses no vacío) -> respondToProposal', () => {
        const action = resolveCommitmentConfirmAction({
            id: 'proposal-456', status: 'proposed', _isAgreementProposal: true,
            agreement_responses: [{ participant_user_id: 'u1', status: 'pending' }],
        });
        expect(action).toEqual({ type: 'respondToProposal', id: 'proposal-456' });
    });

    it('CASO C (real, "Entrenar"): proposal SOLO (agreement_responses vacío/ausente) -> confirmProposal, NUNCA respondToProposal', () => {
        const withEmptyArray = resolveCommitmentConfirmAction({
            id: 'proposal-entrenar', status: 'proposed', _isAgreementProposal: true, agreement_responses: [],
        });
        expect(withEmptyArray).toEqual({ type: 'confirmProposal', id: 'proposal-entrenar' });

        const withoutField = resolveCommitmentConfirmAction({
            id: 'proposal-entrenar', status: 'proposed', _isAgreementProposal: true,
        });
        expect(withoutField).toEqual({ type: 'confirmProposal', id: 'proposal-entrenar' });
    });
});

describe('M-1H v2: dispatch dinámico — método/path/payload REALES enviados a apiClient', () => {
    it('CASO A: commitment canónico -> POST /commitments/commitment-123/accept, payload {}', async () => {
        await dispatchConfirm({ id: 'commitment-123', status: 'proposed' });

        expect(apiClient.post).toHaveBeenCalledTimes(1);
        expect(apiClient.post).toHaveBeenCalledWith('/commitments/commitment-123/accept', {});
        expect(apiClient.get).not.toHaveBeenCalled();
        expect(apiClient.patch).not.toHaveBeenCalled();
        expect(apiClient.delete).not.toHaveBeenCalled();
    });

    it('CASO B: proposal compartida -> POST /commitment-proposals/proposal-456/respond, payload decision=approve', async () => {
        await dispatchConfirm({
            id: 'proposal-456', status: 'proposed', _isAgreementProposal: true,
            agreement_responses: [{ participant_user_id: 'u1', status: 'pending' }],
        });

        expect(apiClient.post).toHaveBeenCalledTimes(1);
        expect(apiClient.post).toHaveBeenCalledWith(
            '/commitment-proposals/proposal-456/respond',
            expect.objectContaining({ decision: 'approve' }),
        );
    });

    it('CASO C (real, "Entrenar"): proposal solo -> POST /commitment-proposals/proposal-entrenar/confirm, NUNCA /respond', async () => {
        await dispatchConfirm({
            id: 'proposal-entrenar', status: 'proposed', _isAgreementProposal: true, agreement_responses: [],
        });

        expect(apiClient.post).toHaveBeenCalledTimes(1);
        expect(apiClient.post).toHaveBeenCalledWith('/commitment-proposals/proposal-entrenar/confirm', {});
    });

    it('NUNCA, en ningún caso de proposal, se llama /commitments/:id/accept con un proposal_id (el 404 real original)', async () => {
        await dispatchConfirm({ id: 'proposal-456', status: 'proposed', _isAgreementProposal: true, agreement_responses: [{ participant_user_id: 'u1', status: 'pending' }] });
        await dispatchConfirm({ id: 'proposal-entrenar', status: 'proposed', _isAgreementProposal: true, agreement_responses: [] });

        const calledPaths = vi.mocked(apiClient.post).mock.calls.map((call) => call[0]);
        expect(calledPaths).not.toContain('/commitments/proposal-456/accept');
        expect(calledPaths).not.toContain('/commitments/proposal-entrenar/accept');
    });

    it('NUNCA se llama /commitment-proposals/:id/respond para una proposal solo (el 403 real de v1)', async () => {
        await dispatchConfirm({ id: 'proposal-entrenar', status: 'proposed', _isAgreementProposal: true, agreement_responses: [] });

        const calledPaths = vi.mocked(apiClient.post).mock.calls.map((call) => call[0]);
        expect(calledPaths).not.toContain('/commitment-proposals/proposal-entrenar/respond');
    });
});

describe('M-1H v2: paridad con GroupTaskCard.tsx (proposals compartidas siguen usando el mismo RPC/endpoint)', () => {
    it('GroupTaskCard.tsx sigue usando respondToProposal({decision:\'approve\'}) -- válido porque su botón sólo se muestra cuando canRespondToAgreement es true (siempre hay agreement_responses)', () => {
        const src = readSrc('src/components/GroupTaskCard.tsx');
        expect(src).toMatch(/canRespondToAgreement\s*=\s*isAgreementProposal\s*&&\s*currentAgreementResponse\?\.status\s*===\s*'pending'/);
        expect(src).toMatch(/respondToProposal\(\{[^}]*decision:\s*'approve'/);
    });
});

describe('M-1H v2: InsightsScreen.tsx / TaskDashboardScreen.tsx usan el resolver real, no un branch inline reinventado', () => {
    it('InsightsScreen.tsx importa y usa resolveCommitmentConfirmAction + useConfirmCommitmentProposal', () => {
        const src = readSrc('src/screens/InsightsScreen.tsx');
        expect(src).toMatch(/resolveCommitmentConfirmAction/);
        expect(src).toMatch(/useConfirmCommitmentProposal/);
        expect(src).toMatch(/confirmProposal\(action\.id\)/);
    });

    it('TaskDashboardScreen.tsx importa y usa resolveCommitmentConfirmAction + useConfirmCommitmentProposal', () => {
        const src = readSrc('src/screens/TaskDashboardScreen.tsx');
        expect(src).toMatch(/resolveCommitmentConfirmAction/);
        expect(src).toMatch(/useConfirmCommitmentProposal/);
        expect(src).toMatch(/confirmProposal\(action\.id\)/);
    });
});

describe('M-1H v2: CommitmentRow.tsx / TodayItemRow.tsx — onConfirm sigue recibiendo el objeto completo (necesario para agreement_responses)', () => {
    it('CommitmentRow: onConfirm tipa el commitment completo y despacha con el objeto, nunca sólo el id', () => {
        const src = readSrc('src/components/compromisos/CommitmentRow.tsx');
        expect(src).toMatch(/onConfirm:\s*\(commitment:\s*any\)\s*=>\s*void/);
        expect(src).toMatch(/onPress=\{\(\)\s*=>\s*onConfirm\(c\)\}/);
        expect(src).not.toMatch(/onConfirm\(c\.id\)/);
    });

    it('TodayItemRow: onConfirm tipa el commitment completo y despacha con el objeto, nunca sólo el id', () => {
        const src = readSrc('src/components/hoy/TodayItemRow.tsx');
        expect(src).toMatch(/onConfirm:\s*\(commitment:\s*any\)\s*=>\s*void/);
        expect(src).toMatch(/onPress=\{\(\)\s*=>\s*onConfirm\(c\)\}/);
        expect(src).not.toMatch(/onConfirm\(c\.id\)/);
    });
});

describe('M-1H v2: el endpoint /commitment-proposals/:id/confirm ahora SÍ tiene contraparte real en mobile', () => {
    it('confirmCommitmentProposalRequest apunta al endpoint real usado por confirm_commitment_proposal', async () => {
        await confirmCommitmentProposalRequest('proposal-entrenar');
        expect(apiClient.post).toHaveBeenCalledWith('/commitment-proposals/proposal-entrenar/confirm', {});
    });

    it('la función existe y se exporta como request plano (testeable sin renderer)', () => {
        const requestsSrc = readSrc('src/api/query-modules/commitmentConfirmRequests.ts');
        expect(requestsSrc).toMatch(/export const confirmCommitmentProposalRequest = \(id: string\) => apiClient\.post\(`\/commitment-proposals\/\$\{id\}\/confirm`, \{\}\)/);

        const commitmentsSrc = readSrc('src/api/query-modules/commitments.ts');
        expect(commitmentsSrc).toMatch(/export const useConfirmCommitmentProposal/);
    });
});
