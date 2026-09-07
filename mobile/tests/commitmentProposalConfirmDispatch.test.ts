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
import { resolveCommitmentConfirmAction, performCommitmentConfirm } from '../src/utils/commitmentConfirmDispatch';

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

// M-1H v4: desde el refactor del modal obligatorio, ambas pantallas ya NO
// llaman resolveCommitmentConfirmAction directamente -- delegan TODO el
// despacho (resolución + ejecución) a performCommitmentConfirm (única
// función real, ver describe "M-1H v4: performCommitmentConfirm" más abajo).
describe('M-1H v4: InsightsScreen.tsx / TaskDashboardScreen.tsx usan performCommitmentConfirm (único punto de ejecución), no un branch inline reinventado', () => {
    it('InsightsScreen.tsx importa y usa performCommitmentConfirm + useConfirmCommitmentProposal', () => {
        const src = readSrc('src/screens/InsightsScreen.tsx');
        expect(src).toMatch(/performCommitmentConfirm/);
        expect(src).toMatch(/useConfirmCommitmentProposal/);
        expect(src).toMatch(/\{ acceptCommitment, respondToProposal, confirmProposal \}/);
    });

    it('TaskDashboardScreen.tsx importa y usa performCommitmentConfirm + useConfirmCommitmentProposal', () => {
        const src = readSrc('src/screens/TaskDashboardScreen.tsx');
        expect(src).toMatch(/performCommitmentConfirm/);
        expect(src).toMatch(/useConfirmCommitmentProposal/);
        expect(src).toMatch(/\{ acceptCommitment, respondToProposal, confirmProposal \}/);
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

// ─── M-1H v4 — hallazgo real de staging (caso "Entrenar"): tocar "Confirmar"
// ejecutaba la escritura de inmediato, sin modal/loading/feedback -- si la
// request fallaba o tardaba en refrescar, era indistinguible de "no pasó
// nada". performCommitmentConfirm es ahora el ÚNICO punto de ejecución real
// (compartido entre InsightsScreen.tsx y TaskDashboardScreen.tsx, invocado
// sólo desde ConfirmCommitmentModal), y NUNCA traga un error -- lo propaga
// siempre, para que el caller (el modal) pueda mostrar feedback real.
describe('M-1H v4: performCommitmentConfirm — única ejecución real, inyectando las 3 requests (sin apiClient, sin renderer)', () => {
    function mockRequests(overrides: Partial<Record<'acceptCommitment' | 'respondToProposal' | 'confirmProposal', any>> = {}) {
        return {
            acceptCommitment: vi.fn().mockResolvedValue({}),
            respondToProposal: vi.fn().mockResolvedValue({}),
            confirmProposal: vi.fn().mockResolvedValue({}),
            ...overrides,
        };
    }

    it('CASO A: commitment canónico -> llama acceptCommitment(id), nunca las otras dos', async () => {
        const requests = mockRequests();
        await performCommitmentConfirm({ id: 'commitment-123', status: 'proposed' }, requests);
        expect(requests.acceptCommitment).toHaveBeenCalledWith('commitment-123');
        expect(requests.respondToProposal).not.toHaveBeenCalled();
        expect(requests.confirmProposal).not.toHaveBeenCalled();
    });

    it('CASO B: proposal compartida -> llama respondToProposal({id, decision:approve}), nunca las otras dos', async () => {
        const requests = mockRequests();
        await performCommitmentConfirm({
            id: 'proposal-456', _isAgreementProposal: true,
            agreement_responses: [{ participant_user_id: 'u1', status: 'pending' }],
        }, requests);
        expect(requests.respondToProposal).toHaveBeenCalledWith({ id: 'proposal-456', decision: 'approve' });
        expect(requests.acceptCommitment).not.toHaveBeenCalled();
        expect(requests.confirmProposal).not.toHaveBeenCalled();
    });

    it('CASO C (real, "Entrenar"): proposal solo -> llama confirmProposal(id), nunca las otras dos', async () => {
        const requests = mockRequests();
        await performCommitmentConfirm({ id: 'proposal-entrenar', _isAgreementProposal: true, agreement_responses: [] }, requests);
        expect(requests.confirmProposal).toHaveBeenCalledWith('proposal-entrenar');
        expect(requests.acceptCommitment).not.toHaveBeenCalled();
        expect(requests.respondToProposal).not.toHaveBeenCalled();
    });

    it('NUNCA traga un error -- lo propaga siempre para que el caller pueda mostrar feedback (sección 3/7 del ticket)', async () => {
        const boom = new Error('Network request failed');
        const requests = mockRequests({ confirmProposal: vi.fn().mockRejectedValue(boom) });
        await expect(
            performCommitmentConfirm({ id: 'proposal-entrenar', _isAgreementProposal: true, agreement_responses: [] }, requests)
        ).rejects.toThrow('Network request failed');
    });
});

describe('M-1H v4: tap primario de la fila NUNCA ejecuta la escritura -- sólo abre el modal (sección 4 del ticket)', () => {
    it('InsightsScreen.tsx: onConfirm apunta a handleRequestConfirm (abre modal), no a una ejecución directa', () => {
        const src = readSrc('src/screens/InsightsScreen.tsx');
        expect(src).toMatch(/onConfirm=\{handleRequestConfirm\}/);
        expect(src).not.toMatch(/onConfirm=\{handleConfirm\}/);
        // handleRequestConfirm sólo debe fijar estado, nunca llamar a performCommitmentConfirm directamente.
        const handleRequestConfirmBody = src.match(/const handleRequestConfirm = useCallback\(\(commitment: any\) => \{([\s\S]*?)\}, \[\]\);/);
        expect(handleRequestConfirmBody).not.toBeNull();
        expect(handleRequestConfirmBody![1]).not.toMatch(/performCommitmentConfirm|acceptCommitment\(|respondToProposal\(|confirmProposal\(/);
    });

    it('TaskDashboardScreen.tsx: onConfirm apunta a handleRequestConfirm (abre modal), no a una ejecución directa', () => {
        const src = readSrc('src/screens/TaskDashboardScreen.tsx');
        expect(src).toMatch(/onConfirm=\{handleRequestConfirm\}/);
        expect(src).not.toMatch(/onConfirm=\{handleConfirm\}/);
        const handleRequestConfirmBody = src.match(/const handleRequestConfirm = useCallback\(\(commitment: any\) => \{([\s\S]*?)\}, \[\]\);/);
        expect(handleRequestConfirmBody).not.toBeNull();
        expect(handleRequestConfirmBody![1]).not.toMatch(/performCommitmentConfirm|acceptCommitment\(|respondToProposal\(|confirmProposal\(/);
    });

    it('ambas pantallas llaman performCommitmentConfirm ÚNICAMENTE dentro de handleConfirmSubmit (invocado por el modal, nunca por el tap primario)', () => {
        for (const relPath of ['src/screens/InsightsScreen.tsx', 'src/screens/TaskDashboardScreen.tsx']) {
            const src = readSrc(relPath);
            const occurrences = src.match(/performCommitmentConfirm\(/g) || [];
            // Una vez en el import (comentario/nombre no cuenta), una vez en la llamada real dentro de handleConfirmSubmit.
            expect(occurrences.length).toBe(1);
            expect(src).toMatch(/const handleConfirmSubmit = useCallback\(async \(\) => \{[\s\S]*?performCommitmentConfirm\(/);
        }
    });
});

describe('M-1H v4: semántica de producto -- Confirmar (proposal->accepted) y Listo (accepted->resolved) son flujos distintos, nunca fusionados', () => {
    it('CommitmentRow: el botón "Listo" (status=accepted) llama onMarkDone(c.id), nunca onConfirm', () => {
        const src = readSrc('src/components/compromisos/CommitmentRow.tsx');
        expect(src).toMatch(/onPress=\{\(\)\s*=>\s*onMarkDone\(c\.id\)\}/);
    });

    it('InsightsScreen/TaskDashboardScreen: handleMarkDone usa useResolveCommitment, un hook y endpoint totalmente distinto de performCommitmentConfirm', () => {
        for (const relPath of ['src/screens/InsightsScreen.tsx', 'src/screens/TaskDashboardScreen.tsx']) {
            const src = readSrc(relPath);
            expect(src).toMatch(/const handleMarkDone = useCallback\(\(id: string\) => \{\s*resolveCommitment\(/);
        }
    });
});

describe('M-1H v4: ConfirmCommitmentModal — modal obligatorio, loading state, feedback (secciones 4-7 del ticket)', () => {
    const src = readSrc('src/components/compromisos/ConfirmCommitmentModal.tsx');

    it('título y contenido del modal muestran el título real del compromiso, nunca un id crudo', () => {
        expect(src).toMatch(/¿Confirmar compromiso\?/);
        expect(src).toMatch(/commitment\?\.title/);
        expect(src).toMatch(/Al confirmar, este compromiso quedará aceptado y activo\./);
    });

    it('muestra una advertencia adicional cuando el compromiso está vencido', () => {
        expect(src).toMatch(/isOverdueItem/);
        expect(src).toMatch(/Este compromiso está vencido\./);
    });

    it('ambos botones (Cancelar/Confirmar) se deshabilitan mientras isPending es true, y Confirmar muestra un spinner', () => {
        expect(src).toMatch(/disabled=\{isPending\}/g);
        expect((src.match(/disabled=\{isPending\}/g) || []).length).toBeGreaterThanOrEqual(2);
        expect(src).toMatch(/ActivityIndicator/);
    });

    it('cerrar el modal (overlay/onRequestClose) está bloqueado mientras isPending es true -- no se puede cancelar a mitad de la escritura', () => {
        expect(src).toMatch(/if \(!isPending\) onCancel\(\)/g);
    });

    it('nunca ejecuta ninguna request directamente -- sólo invoca los callbacks onCancel/onConfirm recibidos por props', () => {
        expect(src).not.toMatch(/apiClient|performCommitmentConfirm|acceptCommitment\(|respondToProposal\(|confirmProposal\(/);
    });
});

describe('M-1H v4: feedback de éxito/error siempre visible (secciones 6-7 del ticket)', () => {
    it('ambas pantallas muestran un Alert de éxito visible tras confirmar, nunca un cierre silencioso', () => {
        for (const relPath of ['src/screens/InsightsScreen.tsx', 'src/screens/TaskDashboardScreen.tsx']) {
            const src = readSrc(relPath);
            expect(src).toMatch(/Alert\.alert\('Compromiso confirmado'/);
        }
    });

    it('ambas pantallas muestran un Alert de error claro si la confirmación falla, nunca un catch vacío', () => {
        for (const relPath of ['src/screens/InsightsScreen.tsx', 'src/screens/TaskDashboardScreen.tsx']) {
            const src = readSrc(relPath);
            expect(src).toMatch(/Alert\.alert\('No se pudo confirmar el compromiso'/);
        }
    });

    it('el modal permanece abierto en caso de error (setConfirmItem(null) sólo ocurre en el camino de éxito) -- permite reintentar sin re-tocar Confirmar en la fila', () => {
        for (const relPath of ['src/screens/InsightsScreen.tsx', 'src/screens/TaskDashboardScreen.tsx']) {
            const src = readSrc(relPath);
            const submitBody = src.match(/const handleConfirmSubmit = useCallback\(async \(\) => \{([\s\S]*?)\n    \}, \[/);
            expect(submitBody).not.toBeNull();
            const [, body] = submitBody!;
            const trySection = body.split('catch')[0];
            const catchSection = body.split('catch')[1];
            expect(trySection).toMatch(/setConfirmItem\(null\)/);
            expect(catchSection).not.toMatch(/setConfirmItem\(null\)/);
        }
    });
});

// M-1H v5 — CANONICAL PRIMARY ACTION DECISION: CommitmentRow.tsx/
// TodayItemRow.tsx decidían el botón primario mirando ÚNICAMENTE
// `status==='proposed'` (caso real "Entrenar": Carlos ya aprobado veía
// "Confirmar" igual). Certifica que ambos componentes usan la función
// canónica, nunca un chequeo de status inline reinventado.
describe('M-1H v5: CommitmentRow.tsx / TodayItemRow.tsx usan getCommitmentPrimaryAction (nunca status===\'proposed\' inline)', () => {
    it('CommitmentRow.tsx importa y usa getCommitmentPrimaryAction, no una comparación de status inline para decidir Confirmar/Listo', () => {
        const src = readSrc('src/components/compromisos/CommitmentRow.tsx');
        expect(src).toMatch(/getCommitmentPrimaryAction/);
        expect(src).not.toMatch(/if \(status === 'proposed'\)/);
        expect(src).not.toMatch(/if \(status === 'accepted'\)/);
    });

    it('TodayItemRow.tsx importa y usa getCommitmentPrimaryAction, no una comparación de status inline para decidir Confirmar/Listo', () => {
        const src = readSrc('src/components/hoy/TodayItemRow.tsx');
        expect(src).toMatch(/getCommitmentPrimaryAction/);
        expect(src).not.toMatch(/if \(status === 'proposed'\)/);
        expect(src).not.toMatch(/if \(status === 'accepted'\)/);
    });

    it('ambos muestran una etiqueta "Esperando" (nunca Confirmar/Completar) cuando primaryAction==="waiting" -- ahora vía getActorPresentation (COMMITMENT UX + ACTOR-AWARE SUGGESTIONS, sección 19), que internamente reutiliza getProposalWaitingLabel', () => {
        for (const relPath of ['src/components/compromisos/CommitmentRow.tsx', 'src/components/hoy/TodayItemRow.tsx']) {
            const src = readSrc(relPath);
            expect(src).toMatch(/primaryAction === 'waiting'/);
            expect(src).toMatch(/getActorPresentation/);
        }
        // La reutilización real de getProposalWaitingLabel vive ahora DENTRO
        // del helper canónico, nunca reimplementada por fila.
        const helperSrc = readSrc('src/utils/actorPresentation.ts');
        expect(helperSrc).toMatch(/getProposalWaitingLabel/);
    });

    it('CommitmentRow.tsx ya no tiene su propia (cuarta) fórmula de overdue -- usa isCommitmentOverdue canónico', () => {
        const src = readSrc('src/components/compromisos/CommitmentRow.tsx');
        expect(src).toMatch(/isOverdueItem = isCommitmentOverdue\(c\)/);
        expect(src).not.toMatch(/import \{[^}]*dateFnsIsPast/); // ya no se importa -- sólo queda mencionado en un comentario histórico
    });
});

// ─── M-1H v6 — GAP A (final proposal lifecycle gate), sección 7: test
// dinámico de las 3 decisiones reales sobre una proposal COMPARTIDA.
// Fixture: Carlos (proposer/responsible, ya aprobó), Alejandra (pendiente).
// Como CARLOS ninguna de las 3 debe estar disponible (getCommitmentPrimaryAction
// devuelve 'waiting'); como ALEJANDRA las 3 deben mapear al request real
// correcto -- mismo flujo ya existente (respond_to_commitment_proposal),
// nunca un endpoint nuevo.
describe('M-1H v6: las 3 decisiones reales sobre una proposal compartida (Aceptar/Proponer otra fecha/Rechazar)', () => {
    const entrenar = {
        id: 'pr-entrenar', title: 'Entrenar', status: 'proposed', _isAgreementProposal: true,
        owner_user_id: 'carlos-id', assigned_to_user_id: 'carlos-id',
        agreement_responses: [
            { participant_user_id: 'carlos-id', status: 'approved' as const },
            { participant_user_id: 'alejandra-id', status: 'pending' as const },
        ],
    };

    it('CARLOS: ninguna de las 3 decisiones está disponible (ya aprobó, sólo espera a Alejandra)', async () => {
        const { getCommitmentPrimaryAction } = await import('../src/utils/commitmentPrimaryAction');
        expect(getCommitmentPrimaryAction(entrenar, 'carlos-id')).toBe('waiting');
        // canRespondToProposal (la guarda real de CommitmentRow.tsx/TodayItemRow.tsx
        // que decide si se muestran "Proponer otra fecha"/"Rechazar propuesta") es
        // exactamente esta misma condición -- nunca true para Carlos aquí.
    });

    it('ALEJANDRA — A) Aceptar: POST /commitment-proposals/pr-entrenar/respond, decision=approve', async () => {
        await respondToCommitmentProposalRequest({ id: 'pr-entrenar', decision: 'approve' });
        expect(apiClient.post).toHaveBeenCalledWith(
            '/commitment-proposals/pr-entrenar/respond',
            expect.objectContaining({ decision: 'approve' }),
        );
    });

    it('ALEJANDRA — B) Proponer otra fecha: POST /commitment-proposals/pr-entrenar/respond, decision=counter_propose, con la nueva fecha', async () => {
        await respondToCommitmentProposalRequest({ id: 'pr-entrenar', decision: 'counter_propose', proposedDueAt: '2026-10-01T00:00:00Z' });
        expect(apiClient.post).toHaveBeenCalledWith(
            '/commitment-proposals/pr-entrenar/respond',
            expect.objectContaining({ decision: 'counter_propose', proposedDueAt: '2026-10-01T00:00:00Z' }),
        );
    });

    it('ALEJANDRA — C) Rechazar: POST /commitment-proposals/pr-entrenar/respond, decision=reject', async () => {
        await respondToCommitmentProposalRequest({ id: 'pr-entrenar', decision: 'reject' });
        expect(apiClient.post).toHaveBeenCalledWith(
            '/commitment-proposals/pr-entrenar/respond',
            expect.objectContaining({ decision: 'reject' }),
        );
    });

    it('las 3 decisiones son SIEMPRE sobre la propia fila de respuesta del actor autenticado -- el actor real lo decide el backend (req.user.id), nunca el payload del cliente', () => {
        // Certificado a nivel RPC en el backend (respond_to_commitment_proposal
        // sólo busca (proposal_id, participant_user_id=p_actor_user_id), el
        // actor NUNCA viaja como campo editable desde mobile -- ver
        // respondToCommitmentProposalRequest: su firma no acepta un actorUserId.
        const src = readSrc('src/api/query-modules/commitmentConfirmRequests.ts');
        expect(src).not.toMatch(/actorUserId|participant_user_id/); // el cliente nunca elige de quién es la respuesta
    });
});

describe('M-1H v6: UI wiring — "Proponer otra fecha"/"Rechazar propuesta" reutilizan el flujo real, nunca uno nuevo', () => {
    it('CommitmentRow.tsx: ambas opciones sólo aparecen cuando canRespondToProposal es true, y usan onOpenReschedule/onReject existentes', () => {
        const src = readSrc('src/components/compromisos/CommitmentRow.tsx');
        expect(src).toMatch(/canRespondToProposal = isProposal && primaryAction === 'accept'/);
        expect(src).toMatch(/canRespondToProposal \? 'Proponer otra fecha' : null/);
        expect(src).toMatch(/canRespondToProposal \? 'Rechazar propuesta' : null/);
        // "Reprogramar fecha"/"Archivar" (transiciones de commitment activo)
        // nunca se ofrecen para una proposal.
        expect(src).toMatch(/!isProposal \? 'Reprogramar fecha' : null/);
        expect(src).toMatch(/onCancel && !isFinished && !isProposal/);
    });

    it('TodayItemRow.tsx: mismo patrón (canRespondToProposal), mismas 2 opciones condicionadas', () => {
        const src = readSrc('src/components/hoy/TodayItemRow.tsx');
        expect(src).toMatch(/canRespondToProposal = c\._isAgreementProposal === true && primaryAction === 'accept'/);
        expect(src).toMatch(/canRespondToProposal && onOpenReschedule \? 'Proponer otra fecha' : null/);
        expect(src).toMatch(/canRespondToProposal && onReject \? 'Rechazar propuesta' : null/);
    });

    it('InsightsScreen.tsx: handleSaveDate distingue proposal (counter_propose) de commitment canónico (updateCommitment) -- nunca PATCH /commitments/:id con un proposal_id', () => {
        const src = readSrc('src/screens/InsightsScreen.tsx');
        expect(src).toMatch(/if \(rescheduleItem\?\.\_isAgreementProposal\)/);
        expect(src).toMatch(/decision: 'counter_propose', proposedDueAt: newDateIso/);
        expect(src).toMatch(/await updateCommitment\(\{ id, data: \{ due_at: newDateIso \} \}\)/);
    });

    it('InsightsScreen.tsx: handleRejectProposal pide confirmación nativa "¿Rechazar propuesta?" antes de ejecutar el write', () => {
        const src = readSrc('src/screens/InsightsScreen.tsx');
        expect(src).toMatch(/'¿Rechazar propuesta\?'/);
        expect(src).toMatch(/decision: 'reject'/);
    });

    it('TaskDashboardScreen.tsx (Hoy): mismo patrón -- RescheduleModal + handleSaveDate + handleRejectProposal, mismo flujo real', () => {
        const src = readSrc('src/screens/TaskDashboardScreen.tsx');
        expect(src).toMatch(/<RescheduleModal/);
        expect(src).toMatch(/if \(rescheduleItem\?\.\_isAgreementProposal\)/);
        expect(src).toMatch(/'¿Rechazar propuesta\?'/);
    });
});

// ═══════════════════════════════════════════════════════════════════════════
// M-1H v6 (GAP B, sección 16 del ticket final) — PARIDAD UI-AGENT: Carlos
// SIEMPRE ve el equivalente de "Esperando a Alejandra" y Alejandra SIEMPRE
// ve el equivalente de "Pendiente de tu respuesta", nunca contradictorio,
// en las 5 superficies: Compromisos, Hoy, Detalle (dinámico, vía
// getProposalWaitingLabel/getCommitmentPrimaryAction reales, mismo dataset
// "Entrenar" del backend), Conversation card (auditoría estática de su
// mecanismo paralelo pre-existente), y Agent (ya certificado en
// backend/tests/agentResponseSynthesizer.test.ts + agentContextBuilder.test.ts
// -- referenciado aquí, no re-implementado).
// ═══════════════════════════════════════════════════════════════════════════
describe('M-1H v6: paridad UI-Agent — Compromisos/Hoy/Detalle (dinámico, mismo dataset "Entrenar")', () => {
    const CARLOS = 'carlos-id';
    const ALEJANDRA = 'alejandra-id';
    const entrenar = {
        id: 'pr-entrenar', title: 'Entrenar', status: 'proposed', _isAgreementProposal: true,
        owner_user_id: CARLOS, assigned_to_user_id: CARLOS,
        agreement_responses: [
            { participant_user_id: CARLOS, status: 'approved' as const, participant: { full_name: 'Carlos' } },
            { participant_user_id: ALEJANDRA, status: 'pending' as const, participant: { full_name: 'Alejandra' } },
        ],
    };

    it('Carlos: getCommitmentPrimaryAction -> "waiting" (nunca "accept"/"complete") -- ninguna superficie le ofrece actuar', async () => {
        const { getCommitmentPrimaryAction } = await import('../src/utils/commitmentPrimaryAction');
        expect(getCommitmentPrimaryAction(entrenar, CARLOS)).toBe('waiting');
    });

    it('Carlos: getProposalWaitingLabel -> "Esperando a Alejandra" (la misma etiqueta que renderizan CommitmentRow/TodayItemRow/CommitmentDetailSheet)', async () => {
        const { getProposalWaitingLabel } = await import('../src/utils/agreement');
        expect(getProposalWaitingLabel(entrenar, CARLOS)).toBe('Esperando a Alejandra');
    });

    it('Carlos: NUNCA se le presenta como vencido -- isCommitmentOverdue excluye toda commitment_proposal por regla principal', async () => {
        const { isCommitmentOverdue } = await import('../src/utils/commitmentDisplay');
        const overdueEntrenar = { ...entrenar, due_at: '2026-07-31T00:00:00Z' };
        expect(isCommitmentOverdue(overdueEntrenar as any)).toBe(false);
    });

    it('Alejandra: getCommitmentPrimaryAction -> "accept" (Pendiente de tu respuesta) -- la única de las dos a quien se le ofrece actuar', async () => {
        const { getCommitmentPrimaryAction } = await import('../src/utils/commitmentPrimaryAction');
        expect(getCommitmentPrimaryAction(entrenar, ALEJANDRA)).toBe('accept');
    });

    it('Alejandra: NUNCA ve "Esperando a Alejandra" (esperar a sí misma no tiene sentido) -- getProposalWaitingLabel sólo se invoca cuando primaryAction !== \'accept\', que para ella es falso', async () => {
        const { getCommitmentPrimaryAction } = await import('../src/utils/commitmentPrimaryAction');
        // Certifica la guarda real de CommitmentRow.tsx/TodayItemRow.tsx: el
        // label de espera sólo se calcula cuando la acción primaria NO es
        // 'accept' -- para Alejandra es 'accept', así que en la UI real
        // nunca se llega a invocar getProposalWaitingLabel con su propio id.
        expect(getCommitmentPrimaryAction(entrenar, ALEJANDRA)).not.toBe('waiting');
    });

    it('contrato nunca contradictorio: para el mismo item, Carlos y Alejandra jamás obtienen la misma acción primaria', async () => {
        const { getCommitmentPrimaryAction } = await import('../src/utils/commitmentPrimaryAction');
        expect(getCommitmentPrimaryAction(entrenar, CARLOS)).not.toBe(getCommitmentPrimaryAction(entrenar, ALEJANDRA));
    });
});

describe('M-1H v6: paridad UI-Agent — Conversation card (GroupTaskCard.tsx, mecanismo paralelo pre-existente)', () => {
    // ACTUALIZACIÓN (COMMITMENT UX + ACTOR-AWARE SUGGESTIONS, sección 16/19):
    // el hallazgo honesto documentado aquí en el ticket anterior ("GroupTaskCard.tsx
    // NUNCA fue migrado a los helpers canónicos, calcula su propio
    // agreementWaitingLabel en paralelo") queda CERRADO por este ticket --
    // agreementWaitingLabel ahora es literalmente
    // `getProposalActorPresentation(commitment, user?.id).statusLabel`
    // (mobile/src/utils/actorPresentation.ts), que a su vez reutiliza
    // getProposalWaitingLabel (agreement.ts) para el caso "esperando a X" --
    // nunca una cuarta heurística independiente. canRespondToAgreement sigue
    // derivándose de la misma fuente de verdad real (agreement_responses),
    // sin cambios.
    it('canRespondToAgreement usa currentAgreementResponse?.status===\'pending\' -- misma fuente de verdad real (agreement_responses), nunca duplica el estado', () => {
        const src = readSrc('src/components/GroupTaskCard.tsx');
        expect(src).toMatch(/canRespondToAgreement = isAgreementProposal && currentAgreementResponse\?\.status === 'pending'/);
    });

    it('el botón de aprobar ("Aprobar propuesta") sólo se ofrece quien puede responder (canRespondToAgreement/isAssignee), nunca a quien ya aprobó', () => {
        const src = readSrc('src/components/GroupTaskCard.tsx');
        expect(src).toMatch(/isAgreementProposal \? 'Aprobar propuesta' : `Aceptar/);
    });

    it('nunca computa isOverdue/vencido internamente para una proposal -- "isPast" es una prop externa, y su único call site real (MessageItem.tsx) nunca la pasa', () => {
        const src = readSrc('src/components/GroupTaskCard.tsx');
        expect(src).not.toMatch(/isOverdue|isCommitmentOverdue/);
        const callerSrc = readSrc('src/components/MessageItem.tsx');
        const groupTaskCardUsage = callerSrc.slice(callerSrc.indexOf('<GroupTaskCard'), callerSrc.indexOf('<GroupTaskCard') + 800);
        expect(groupTaskCardUsage).not.toMatch(/isPast=/);
    });

    it('agreementWaitingLabel ahora reutiliza getProposalActorPresentation (canónico, sección 19) -- nunca su propia fórmula independiente, y nunca dice "vencido" para una proposal', () => {
        const src = readSrc('src/components/GroupTaskCard.tsx');
        expect(src).toMatch(/import \{ getProposalActorPresentation \} from '\.\.\/utils\/actorPresentation'/);
        expect(src).toMatch(/const agreementWaitingLabel = proposalPresentation\?\.statusLabel \?\? null;/);
        expect(src).not.toMatch(/agreementWaitingLabel[\s\S]{0,120}vencido/i);
    });
});

// El quinto surface -- Agent -- ya está certificado dinámicamente en el
// backend (no duplicable aquí sin un renderer/red real): ver
// backend/tests/agentContextBuilder.test.ts ("GAP B — filterByProposalFocus")
// y backend/tests/agentResponseSynthesizer.test.ts ("DATASET REAL (sección 25)"
// + "PERMITIDO (sección 15)"), que certifican exactamente el mismo dataset
// "Entrenar" (Carlos aprobado/Alejandra pendiente) con el mismo resultado
// semántico: Carlos recibe "esperando a Alejandra", Alejandra recibe
// evidencia de que a ella le corresponde responder, y ninguno de los dos
// puede recibir "vencido" para esta proposal.
