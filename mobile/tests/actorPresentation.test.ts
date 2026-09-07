import { describe, expect, it } from 'vitest';
import { getProposalActorPresentation, getCommitmentActorPresentation, getActorPresentation } from '../src/utils/actorPresentation';

const CARLOS = 'carlos-id';
const ALEJANDRA = 'alejandra-id';
const PEDRO = 'pedro-id';
const OUTSIDER = 'outsider-id';

// COMMITMENT UX + ACTOR-AWARE SUGGESTIONS — PRESENTATION MATRIX (sección 22
// del ticket). Cada bloque certifica un estado real del matrix exigido:
// primary label (relationLabel), status copy (statusLabel), primary actions
// (primaryAction, reutilizado de getCommitmentPrimaryAction -- nunca
// reinventado aquí), y overflow (isViewOnly).

describe('PENDING PROPOSAL / proposer (caso real "ver peli", Carlos propuso)', () => {
    const verPeli = {
        id: 'pr-1', title: 'ver peli', status: 'pending', _isAgreementProposal: true,
        owner_user_id: CARLOS, assigned_to_user_id: CARLOS,
        due_at: '2026-09-10T18:00:00.000Z',
        agreement_responses: [
            { participant_user_id: CARLOS, status: 'approved' as const, participant: { full_name: 'Carlos' } },
            { participant_user_id: ALEJANDRA, status: 'pending' as const, participant: { full_name: 'Alejandra' } },
        ],
    };

    it('Carlos (proposer): "Tú propusiste" / "Esperando a Alejandra" / primaryAction=waiting / view-only', () => {
        const p = getProposalActorPresentation(verPeli, CARLOS);
        expect(p.relationLabel).toBe('Tú propusiste');
        expect(p.statusLabel).toBe('Esperando a Alejandra');
        expect(p.primaryAction).toBe('waiting');
        expect(p.isViewOnly).toBe(true);
    });
});

describe('PENDING PROPOSAL / required responder (Alejandra)', () => {
    const verPeli = {
        id: 'pr-1', title: 'ver peli', status: 'pending', _isAgreementProposal: true,
        owner_user_id: CARLOS, assigned_to_user_id: CARLOS,
        due_at: '2026-09-10T18:00:00.000Z',
        agreement_responses: [
            { participant_user_id: CARLOS, status: 'approved' as const, participant: { full_name: 'Carlos' } },
            { participant_user_id: ALEJANDRA, status: 'pending' as const, participant: { full_name: 'Alejandra' } },
        ],
    };

    it('Alejandra (participant, actorCanRespond): "Carlos propone" / "Necesita tu respuesta" / primaryAction=accept / actionable', () => {
        const p = getProposalActorPresentation(verPeli, ALEJANDRA);
        expect(p.relationLabel).toBe('Carlos propone');
        expect(p.statusLabel).toBe('Necesita tu respuesta');
        expect(p.primaryAction).toBe('accept');
        expect(p.isViewOnly).toBe(false);
    });
});

describe('PENDING PROPOSAL / unrelated viewer', () => {
    const verPeli = {
        id: 'pr-1', title: 'ver peli', status: 'pending', _isAgreementProposal: true,
        owner_user_id: CARLOS, assigned_to_user_id: CARLOS,
        agreement_responses: [
            { participant_user_id: CARLOS, status: 'approved' as const, participant: { full_name: 'Carlos' } },
            { participant_user_id: ALEJANDRA, status: 'pending' as const, participant: { full_name: 'Alejandra' } },
        ],
    };

    it('un tercero ajeno (Pedro, no proposer/responsible/participante): "Con Carlos", view-only, nunca accionable', () => {
        const p = getProposalActorPresentation(verPeli, PEDRO);
        expect(p.relationLabel).toBe('Con Carlos');
        expect(p.primaryAction).toBe('waiting');
        expect(p.isViewOnly).toBe(true);
    });
});

describe('PROPOSAL DATE PASSED but still awaiting response', () => {
    it('proposalDatePassed=true cuando due_at ya pasó y la proposal sigue pendiente', () => {
        const past = {
            id: 'pr-2', title: 'Levantarse', status: 'pending', _isAgreementProposal: true,
            owner_user_id: CARLOS, assigned_to_user_id: CARLOS,
            due_at: '2020-01-01T08:00:00.000Z',
            agreement_responses: [
                { participant_user_id: CARLOS, status: 'approved' as const, participant: { full_name: 'Carlos' } },
                { participant_user_id: ALEJANDRA, status: 'pending' as const, participant: { full_name: 'Alejandra' } },
            ],
        };
        const p = getProposalActorPresentation(past, ALEJANDRA);
        expect(p.proposalDatePassed).toBe(true);
        expect(p.statusLabel).toBe('Necesita tu respuesta'); // la fecha pasada nunca oculta que igual debe responder
    });
});

describe('MATERIALIZED COMMITMENT / owner=assignee', () => {
    it('Carlos (owner=assignee): "Tuyo", sin statusLabel fantasma, primaryAction real (complete)', () => {
        const commitment = {
            id: 'c-1', title: 'Entrenar', status: 'accepted', _isAgreementProposal: false,
            owner_user_id: CARLOS, assigned_to_user_id: CARLOS,
            owner: { full_name: 'Carlos' }, assignee: { full_name: 'Carlos' },
        };
        const p = getCommitmentActorPresentation(commitment, CARLOS);
        expect(p.relationLabel).toBe('Tuyo');
        expect(p.statusLabel).toBeNull();
        expect(p.primaryAction).toBe('complete');
        expect(p.isViewOnly).toBe(false);
    });
});

describe('MATERIALIZED COMMITMENT / assignee (no owner)', () => {
    it('Alejandra (asignada, Carlos delegó): "Asignado por Carlos"', () => {
        const commitment = {
            id: 'c-2', title: 'Comprar pan', status: 'accepted', _isAgreementProposal: false,
            owner_user_id: CARLOS, assigned_to_user_id: ALEJANDRA,
            owner: { full_name: 'Carlos' }, assignee: { full_name: 'Alejandra' },
        };
        const p = getCommitmentActorPresentation(commitment, ALEJANDRA);
        expect(p.relationLabel).toBe('Asignado por Carlos');
        expect(p.isViewOnly).toBe(false);
    });

    it('Carlos (owner, delegó a Alejandra, vista "Encargados"): "Encargado a Alejandra"', () => {
        const commitment = {
            id: 'c-2', title: 'Comprar pan', status: 'accepted', _isAgreementProposal: false,
            owner_user_id: CARLOS, assigned_to_user_id: ALEJANDRA,
            owner: { full_name: 'Carlos' }, assignee: { full_name: 'Alejandra' },
        };
        const p = getCommitmentActorPresentation(commitment, CARLOS);
        expect(p.relationLabel).toBe('Encargado a Alejandra');
    });
});

describe('MATERIALIZED COMMITMENT / former proposal participant view-only (BLOCKER A del ticket de participant visibility, ahora con copy correcto)', () => {
    it('Alejandra (participante original que sólo aprobó "Entrenar", nunca owner/assignee del commitment materializado): relación neutral, statusLabel NUNCA una proposal-waiting-badge reciclada (sección 12 explícito)', () => {
        const commitment = {
            id: 'c-3', title: 'Entrenar', status: 'accepted', _isAgreementProposal: false,
            owner_user_id: CARLOS, assigned_to_user_id: CARLOS,
            owner: { full_name: 'Carlos' }, assignee: { full_name: 'Carlos' },
            agreement_responses: [
                { participant_user_id: CARLOS, status: 'approved' as const },
                { participant_user_id: ALEJANDRA, status: 'approved' as const },
            ],
        };
        const p = getCommitmentActorPresentation(commitment, ALEJANDRA);
        expect(p.relationLabel).toBe('Responsable: Carlos');
        expect(p.statusLabel).toBe('Compromiso confirmado');
        expect(p.statusLabel).not.toMatch(/esperando/i);
        expect(p.isViewOnly).toBe(true);
    });
});

describe('COMPLETED / CANCELLED', () => {
    const base = {
        id: 'c-4', title: 'Entrenar', _isAgreementProposal: false,
        owner_user_id: CARLOS, assigned_to_user_id: CARLOS,
        owner: { full_name: 'Carlos' }, assignee: { full_name: 'Carlos' },
    };
    it('resolved -> "Completado"', () => {
        expect(getCommitmentActorPresentation({ ...base, status: 'resolved' }, CARLOS).statusLabel).toBe('Completado');
    });
    it('cancelled -> "Cancelado"', () => {
        expect(getCommitmentActorPresentation({ ...base, status: 'cancelled' }, CARLOS).statusLabel).toBe('Cancelado');
    });
    it('rejected -> "Rechazado"', () => {
        expect(getCommitmentActorPresentation({ ...base, status: 'rejected' }, CARLOS).statusLabel).toBe('Rechazado');
    });
});

describe('MATERIALIZED COMMITMENT con waiting_on_user_id real (counter-propose post-materialización, nunca confundido con proposal-waiting)', () => {
    it('Carlos (owner) esperando la respuesta de Alejandra tras un counter_propose sobre el commitment ya activo', () => {
        const commitment = {
            id: 'c-5', title: 'Entrenar', status: 'counter_proposal', _isAgreementProposal: false,
            owner_user_id: CARLOS, assigned_to_user_id: ALEJANDRA,
            owner: { full_name: 'Carlos' }, assignee: { full_name: 'Alejandra' },
            waiting_on_user_id: ALEJANDRA,
        };
        const p = getCommitmentActorPresentation(commitment, CARLOS);
        expect(p.statusLabel).toMatch(/alejandra/i);
    });

    it('Alejandra ve "Te corresponde actuar" cuando ELLA es quien bloquea el avance', () => {
        const commitment = {
            id: 'c-5', title: 'Entrenar', status: 'counter_proposal', _isAgreementProposal: false,
            owner_user_id: CARLOS, assigned_to_user_id: ALEJANDRA,
            owner: { full_name: 'Carlos' }, assignee: { full_name: 'Alejandra' },
            waiting_on_user_id: ALEJANDRA,
        };
        const p = getCommitmentActorPresentation(commitment, ALEJANDRA);
        expect(p.statusLabel).toBe('Te corresponde actuar');
    });
});

describe('getActorPresentation: entry point único, dispatch correcto por entityType (sección 19)', () => {
    it('_isAgreementProposal=true -> usa getProposalActorPresentation', () => {
        const proposal = { id: 'pr-1', _isAgreementProposal: true, owner_user_id: CARLOS, assigned_to_user_id: CARLOS, agreement_responses: [] };
        const viaEntry = getActorPresentation(proposal, CARLOS);
        const viaDirect = getProposalActorPresentation(proposal, CARLOS);
        expect(viaEntry).toEqual(viaDirect);
    });
    it('_isAgreementProposal=false -> usa getCommitmentActorPresentation', () => {
        const commitment = { id: 'c-1', _isAgreementProposal: false, status: 'accepted', owner_user_id: CARLOS, assigned_to_user_id: CARLOS };
        const viaEntry = getActorPresentation(commitment, CARLOS);
        const viaDirect = getCommitmentActorPresentation(commitment, CARLOS);
        expect(viaEntry).toEqual(viaDirect);
    });
});

describe('NO CLIENT-INVENTED AUTHORITY (sección 20): primaryAction siempre coincide con getCommitmentPrimaryAction real, nunca una segunda heurística', () => {
    it('Alejandra sin autoridad sobre un commitment ajeno (ni owner ni assignee, mero ex-participante) nunca recibe accept/complete', async () => {
        const { getCommitmentPrimaryAction } = await import('../src/utils/commitmentPrimaryAction');
        const commitment = {
            id: 'c-3', title: 'Entrenar', status: 'accepted', _isAgreementProposal: false,
            owner_user_id: CARLOS, assigned_to_user_id: CARLOS,
            owner: { full_name: 'Carlos' }, assignee: { full_name: 'Carlos' },
        };
        const presentation = getCommitmentActorPresentation(commitment, ALEJANDRA);
        const canonical = getCommitmentPrimaryAction({ ...commitment, _isAgreementProposal: false }, ALEJANDRA);
        expect(presentation.primaryAction).toBe(canonical);
        expect(presentation.primaryAction).not.toBe('accept');
        expect(presentation.primaryAction).not.toBe('complete');
    });
});
