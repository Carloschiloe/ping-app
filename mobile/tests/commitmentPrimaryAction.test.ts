// M-1H v5 — CANONICAL PRIMARY ACTION DECISION + PARTICIPATION MODEL.
// Hallazgo real físico (caso "Entrenar"): Carlos (proposer + responsible)
// ya aprobó, Alejandra sigue pendiente -- CommitmentRow.tsx decidía el
// botón primario mirando ÚNICAMENTE `status==='proposed'`, así que Carlos
// veía "Confirmar" pese a no poder hacer nada más ahí. Estos tests
// certifican la función pura real (mismo módulo que usan
// CommitmentRow.tsx/TodayItemRow.tsx), sin necesitar un renderer.
import { describe, expect, it } from 'vitest';
import { getCommitmentPrimaryAction, isActorRelevantCommitmentItem } from '../src/utils/commitmentPrimaryAction';
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

// ─── PARTICIPANT VISIBILITY + ACTOR PERMISSIONS — cierre de raíz ──────────
// Root cause real confirmado por auditoría: InsightsScreen.tsx
// ("Pendientes") y TaskDashboardScreen.tsx ("Hoy") filtraban ANTES de llegar
// aquí, usando sólo el modelo de asignación única -- Alejandra
// (participante con respuesta pendiente, nunca "assigned_to_user_id")
// desaparecía de ambas superficies pese a que el backend SÍ la incluía.
// `isActorRelevantCommitmentItem` es la única función que ambas pantallas
// ahora reutilizan (nunca un filter() ad hoc divergente).
describe('PARTICIPANT VISIBILITY: isActorRelevantCommitmentItem (canonical cross-surface read-model)', () => {
    it('CASO REAL "Entrenar": Alejandra (participante, respuesta pendiente) SÍ es relevante -- root cause del bug físico', () => {
        expect(isActorRelevantCommitmentItem(entrenar, ALEJANDRA)).toBe(true);
    });

    it('CASO REAL "Entrenar": Carlos (proposer, ya aprobó, esperando a otros) SÍ es relevante -- coincide con la evidencia física (aparece en Pendientes con "Esperando a Alejandra")', () => {
        expect(isActorRelevantCommitmentItem(entrenar, CARLOS)).toBe(true);
    });

    it('un tercero sin ningún rol real (actor_role=none) NUNCA es relevante', () => {
        const withActorRole = { ...entrenar, actor_role: 'none' };
        expect(isActorRelevantCommitmentItem(withActorRole, 'alguien-mas-id')).toBe(false);
    });

    it('usa actor_role del backend cuando está presente (Core decide, mobile no re-deriva)', () => {
        const withActorRole = { ...entrenar, actor_role: 'participant' };
        expect(isActorRelevantCommitmentItem(withActorRole, ALEJANDRA)).toBe(true);
        const withNoneRole = { ...entrenar, actor_role: 'none' };
        // Aunque agreement_responses "diría" participant si se recalculara, se confía en actor_role tal cual cuando está presente.
        expect(isActorRelevantCommitmentItem(withNoneRole, ALEJANDRA)).toBe(false);
    });

    it('fallback: sin actor_role del backend, recalcula vía getProposalParticipationState (compat), nunca una tercera heurística', () => {
        const { actor_role, ...withoutActorRole } = entrenar as any;
        expect(isActorRelevantCommitmentItem(withoutActorRole, ALEJANDRA)).toBe(true);
        expect(isActorRelevantCommitmentItem(withoutActorRole, CARLOS)).toBe(true);
    });

    it('REGRESIÓN commitment plano: preserva EXACTAMENTE el modelo de asignación única ya certificado (Carlos assignee, Alejandra ajena)', () => {
        const plain = { _isAgreementProposal: false, owner_user_id: CARLOS, assigned_to_user_id: CARLOS };
        expect(isActorRelevantCommitmentItem(plain, CARLOS)).toBe(true);
        expect(isActorRelevantCommitmentItem(plain, ALEJANDRA)).toBe(false);
    });

    it('REGRESIÓN commitment plano "para todos" (assigned_to_user_id null): cualquier no-owner es relevante, igual que antes', () => {
        const everyone = { _isAgreementProposal: false, owner_user_id: CARLOS, assigned_to_user_id: null };
        expect(isActorRelevantCommitmentItem(everyone, ALEJANDRA)).toBe(true);
    });

    it('REGRESIÓN: un commitment plano delegado por mí a otra persona nunca es "mío" (isDelegatedByMe)', () => {
        const delegated = { _isAgreementProposal: false, owner_user_id: CARLOS, assigned_to_user_id: ALEJANDRA };
        expect(isActorRelevantCommitmentItem(delegated, CARLOS)).toBe(false);
    });
});

describe('PARTICIPANT VISIBILITY: wiring real en las pantallas (sección 7/8/9 del ticket)', async () => {
    const fs = await import('node:fs');
    const path = await import('node:path');

    it('InsightsScreen.tsx "Pendientes" usa isActorRelevantCommitmentItem (nunca un filter() ad hoc de asignación única para proposals)', () => {
        const src = fs.readFileSync(path.join(__dirname, '..', 'src/screens/InsightsScreen.tsx'), 'utf-8');
        expect(src).toMatch(/return isActorRelevantCommitmentItem\(c, user\?\.id\)/);
    });

    it('TaskDashboardScreen.tsx "Hoy" (myItems) usa isActorRelevantCommitmentItem -- mismo cálculo que Compromisos, nunca dos universos incompatibles', () => {
        const src = fs.readFileSync(path.join(__dirname, '..', 'src/screens/TaskDashboardScreen.tsx'), 'utf-8');
        expect(src).toMatch(/isActorRelevantCommitmentItem\(c, user\?\.id\)/);
    });

    it('TaskDashboardScreen.tsx: el header count ("N para hoy") y el chequeo de agenda vacía se derivan del MISMO dataset que se renderiza (myItems+delegatedItems), nunca de todayItems pre-división -- cierra la contradicción "1 para hoy" con agenda vacía', () => {
        const src = fs.readFileSync(path.join(__dirname, '..', 'src/screens/TaskDashboardScreen.tsx'), 'utf-8');
        expect(src).toMatch(/const visibleTodayCount = myItems\.length \+ delegatedItems\.length/);
        expect(src).toMatch(/totalToday=\{visibleTodayCount\}/);
        expect(src).toMatch(/\{visibleTodayCount === 0 \? \(/);
        // nunca vuelve a usar todayItems.length directamente para el conteo/empty-check
        expect(src).not.toMatch(/totalToday=\{todayItems\.length\}/);
        expect(src).not.toMatch(/\{todayItems\.length === 0 \? \(/);
    });
});

describe('CHAT-CARD PERMISSION BUG (sección 10/12 del ticket): GroupTaskCard nunca ofrece edición genérica a un no-owner sobre un commitment plano', async () => {
    const fs = await import('node:fs');
    const path = await import('node:path');
    const src = fs.readFileSync(path.join(__dirname, '..', 'src/components/GroupTaskCard.tsx'), 'utf-8');

    it('el ítem de reprogramar/contraproponer fecha para un commitment plano (!isAgreementProposal) exige isOwner, nunca isAssignee/isEveryone', () => {
        expect(src).toMatch(/!isAgreementProposal && isOwner && !isMeeting && \(isProposed \|\| isCounter \|\| isAccepted\)/);
        // el gate viejo (isOwner || isAssignee) para ESTE ítem específico ya no existe
        expect(src).not.toMatch(/\(isOwner \|\| isAssignee\) && !isMeeting && \(isProposed \|\| isCounter \|\| isAccepted\)/);
    });

    it('"Editar" sigue siendo exclusivamente isOwner (nunca se relajó, ya era correcto)', () => {
        expect(src).toMatch(/!isAgreementProposal && isOwner && !isDone && !isRejected && !isCancelled && \(/);
        expect(src).toMatch(/handleEdit\(\)/);
    });

    it('la verdadera contrapropuesta de un participante sobre una commitment_proposal COMPARTIDA sigue intacta (canRespondToAgreement, vía su propia fila de respuesta)', () => {
        expect(src).toMatch(/isAgreementProposal && canRespondToAgreement/);
    });
});

describe('Commitment canónico (nunca depende de participación... salvo la paridad real owner/assignee con el backend)', () => {
    it('status=proposed -> "accept" (Confirmar) para el owner=assignee, igual que antes de esta unificación', () => {
        expect(getCommitmentPrimaryAction({ status: 'proposed', _isAgreementProposal: false, owner_user_id: CARLOS, assigned_to_user_id: CARLOS }, CARLOS)).toBe('accept');
    });

    it('status=accepted -> "complete" (Listo) para el owner=assignee', () => {
        expect(getCommitmentPrimaryAction({ status: 'accepted', _isAgreementProposal: false, owner_user_id: CARLOS, assigned_to_user_id: CARLOS }, CARLOS)).toBe('complete');
    });

    it('resolved/cancelled/rejected -> "none"', () => {
        for (const status of ['resolved', 'cancelled', 'rejected']) {
            expect(getCommitmentPrimaryAction({ status, _isAgreementProposal: false, owner_user_id: CARLOS, assigned_to_user_id: CARLOS }, CARLOS)).toBe('none');
        }
    });

    // POST-MATERIALIZATION WRITE AUTHORITY (paridad real con
    // apply_commitment_transition_with_evidence, probada contra Postgres
    // local): un actor que NO es owner ni assignee del commitment canónico
    // (ej. Alejandra, participante de la proposal de origen que sólo aprobó)
    // nunca debe recibir "accept"/"complete" -- ambas acciones siempre
    // fallarían con 42501 en el backend real. Antes de este fix, esta
    // función devolvía 'accept'/'complete' para CUALQUIER actor mirando sólo
    // el status -- un falso affordance.
    it('un actor que no es owner ni assignee NUNCA recibe "accept" (status=proposed) -- recibe "waiting"', () => {
        expect(getCommitmentPrimaryAction({ status: 'proposed', _isAgreementProposal: false, owner_user_id: CARLOS, assigned_to_user_id: CARLOS }, ALEJANDRA)).toBe('waiting');
    });

    it('un actor que no es owner ni assignee NUNCA recibe "complete" (status=accepted) -- recibe "waiting"', () => {
        expect(getCommitmentPrimaryAction({ status: 'accepted', _isAgreementProposal: false, owner_user_id: CARLOS, assigned_to_user_id: CARLOS }, ALEJANDRA)).toBe('waiting');
    });

    it('un commitment "para todos" (assigned_to_user_id null) sin owner=actor tampoco ofrece "accept" (paridad real: el RPC rechaza incluso sin asignado)', () => {
        expect(getCommitmentPrimaryAction({ status: 'proposed', _isAgreementProposal: false, owner_user_id: CARLOS, assigned_to_user_id: null }, ALEJANDRA)).toBe('waiting');
    });

    it('el owner de un commitment "para todos" (sin asignado) SÍ recibe "accept" (self-claim real, nunca roto por este fix)', () => {
        expect(getCommitmentPrimaryAction({ status: 'proposed', _isAgreementProposal: false, owner_user_id: CARLOS, assigned_to_user_id: null }, CARLOS)).toBe('accept');
    });
});

// POST-MATERIALIZATION VISIBILITY (BLOCKER A, cierre absoluto del ticket
// final) — probado empíricamente contra Postgres local
// (finalize_approved_commitment_proposal + getCommitments +
// attachAgreementResponses): cuando "Entrenar" se materializa, el commitment
// canónico resultante tiene owner_user_id=assigned_to_user_id=Carlos
// (proposer+responsible) -- Alejandra (participante que sólo aprobó) NO es
// owner ni assignee, pero el backend YA le adjunta `agreement_responses` con
// su fila (attachAgreementResponses corre incondicionalmente sobre
// GET /commitments). Sin el bridge de isActorRelevantCommitmentItem, ella
// desaparecería de Compromisos/Hoy pese a que el backend sí se lo devuelve.
describe('POST-MATERIALIZATION VISIBILITY: isActorRelevantCommitmentItem reconoce al participante original vía agreement_responses (bridge proposal_id)', () => {
    const materializedEntrenar = {
        id: 'commitment-entrenar', status: 'accepted', _isAgreementProposal: false,
        owner_user_id: CARLOS, assigned_to_user_id: CARLOS,
        agreement_responses: [
            { participant_user_id: CARLOS, status: 'approved' as const, participant: { full_name: 'Carlos' } },
            { participant_user_id: ALEJANDRA, status: 'approved' as const, participant: { full_name: 'Alejandra' } },
        ],
    };

    it('Carlos (owner=assignee) sigue siendo relevante por la vía normal', () => {
        expect(isActorRelevantCommitmentItem(materializedEntrenar, CARLOS)).toBe(true);
    });

    it('Alejandra (participante original, nunca owner/assignee del commitment materializado) sigue siendo relevante vía el bridge de agreement_responses', () => {
        expect(isActorRelevantCommitmentItem(materializedEntrenar, ALEJANDRA)).toBe(true);
    });

    it('un cuarto usuario ajeno (ni owner/assignee ni fila en agreement_responses) nunca es relevante -- sin fuga de visibilidad', () => {
        expect(isActorRelevantCommitmentItem(materializedEntrenar, 'pedro-ajeno-id')).toBe(false);
    });

    it('un commitment plano normal (sin agreement_responses, el caso de toda la vida) sigue funcionando exactamente igual', () => {
        const plain = { id: 'c1', status: 'accepted', _isAgreementProposal: false, owner_user_id: CARLOS, assigned_to_user_id: CARLOS };
        expect(isActorRelevantCommitmentItem(plain, CARLOS)).toBe(true);
        expect(isActorRelevantCommitmentItem(plain, ALEJANDRA)).toBe(false);
    });
});
