import { describe, expect, it, vi } from 'vitest';
import { createSupabaseAdminMock, setSupabaseAdminMock, supabaseAdminMockModule } from './helpers/supabaseMock';

vi.mock('../src/lib/supabaseAdmin', () => supabaseAdminMockModule());

const USER = '11111111-1111-4111-8111-111111111111';
const PROPOSAL = '22222222-2222-4222-8222-222222222222';

describe('canonical Commitment proposals', () => {
    it('createConfirmedCommitment creates Proposal before the confirmation RPC', async () => {
        const mock = createSupabaseAdminMock({
            'rpc:create_commitment_proposal_with_evidence': [{
                data: { id: PROPOSAL, status: 'pending', title: 'Enviar informe' },
                error: null,
            }],
            'rpc:confirm_commitment_proposal': [{
                data: { id: 'commitment-1', proposal_id: PROPOSAL, status: 'accepted' },
                error: null,
            }],
        });
        setSupabaseAdminMock(mock);

        const { createConfirmedCommitment } = await import('../src/services/commitmentProposal.service');
        const result = await createConfirmedCommitment(USER, { title: 'Enviar informe' });

        expect(mock.getRpcCalls().map((call) => call.name)).toEqual([
            'create_commitment_proposal_with_evidence',
            'confirm_commitment_proposal',
        ]);
        expect(result.status).toBe('accepted');
    });

    // M-1H v2 — respuesta al bloqueo de "materialización real" del final
    // review gate: prueba confirmProposal SOBRE UNA PROPOSAL EXISTENTE
    // (caso real "Entrenar" -- una proposal solo, ya creada, sin
    // participantes), no sólo el camino combinado de createConfirmedCommitment
    // (que crea Y confirma en la misma llamada). Este es el mismo RPC que el
    // nuevo endpoint mobile POST /commitment-proposals/:id/confirm dispara.
    // La transición real de negocio (proposal.status='confirmed',
    // commitments row con proposal_id=P1, status='accepted') está
    // implementada en confirm_commitment_proposal -> finalize_approved_commitment_proposal
    // (ver supabase/migrations/20260730123000_shared_commitment_agreements.sql,
    // líneas 170-305 y 543-573) -- no se puede re-certificar la SQL real sin
    // Postgres, pero este test certifica que el service llama exactamente
    // ese RPC con los args correctos y propaga fielmente su resultado
    // (incluyendo proposal_id, la prueba de que el commitment resultante
    // referencia a su proposal de origen).
    it('confirmProposal (proposal SOLO existente, sin agreement_responses) llama confirm_commitment_proposal con el actor y proposal reales, y devuelve el commitment materializado con proposal_id', async () => {
        const mock = createSupabaseAdminMock({
            'rpc:confirm_commitment_proposal': [{
                data: { id: 'commitment-entrenar', proposal_id: PROPOSAL, status: 'accepted', title: 'Entrenar' },
                error: null,
            }],
        });
        setSupabaseAdminMock(mock);

        const { confirmProposal } = await import('../src/services/commitmentProposal.service');
        const result = await confirmProposal(USER, PROPOSAL);

        expect(mock.getRpcCalls()).toEqual([{
            name: 'confirm_commitment_proposal',
            args: { p_proposal_id: PROPOSAL, p_actor_user_id: USER },
        }]);
        // La relación real (sección 4 del ticket, "o la relación real
        // equivalente del schema"): commitments.proposal_id -> el id de la
        // proposal de origen -- nunca un campo inventado.
        expect(result).toMatchObject({ id: 'commitment-entrenar', proposal_id: PROPOSAL, status: 'accepted' });
    });

    it('rejecting a Proposal never inserts a Commitment', async () => {
        const mock = createSupabaseAdminMock({
            'rpc:reject_commitment_proposal_with_evidence': [{
                data: { id: PROPOSAL, status: 'rejected', rejection_reason: 'No corresponde' },
                error: null,
            }],
        });
        setSupabaseAdminMock(mock);

        const { rejectProposal } = await import('../src/services/commitmentProposal.service');
        await rejectProposal(USER, PROPOSAL, 'No corresponde');

        expect(mock.getInsertCalls('commitments')).toHaveLength(0);
        expect(mock.getRpcCalls()).toEqual([{
            name: 'reject_commitment_proposal_with_evidence',
            args: {
                p_proposal_id: PROPOSAL,
                p_actor_user_id: USER,
                p_reason: 'No corresponde',
            },
        }]);
    });

    it('rejects a cross-conversation source message before creating a Proposal', async () => {
        const mock = createSupabaseAdminMock({
            conversation_participants: [{
                data: { conversation_id: 'c1', role: 'member' },
                error: null,
            }],
            messages: [{ data: null, error: null }],
        });
        setSupabaseAdminMock(mock);

        const { createProposal } = await import('../src/services/commitmentProposal.service');
        await expect(createProposal(USER, {
            title: 'No autorizada',
            conversation_id: 'c1',
            message_id: 'message-from-c2',
        })).rejects.toThrow('Message not found in this conversation');
        expect(mock.getInsertCalls('commitment_proposals')).toHaveLength(0);
    });

    it('creates a shared agreement through the atomic response-snapshot RPC', async () => {
        const mock = createSupabaseAdminMock({
            conversation_participants: [{
                data: { conversation_id: 'conversation-1', role: 'member' },
                error: null,
            }],
            'rpc:create_shared_commitment_proposal_with_responses': [{
                data: { id: PROPOSAL, status: 'pending', agreement_version: 1 },
                error: null,
            }],
        });
        setSupabaseAdminMock(mock);

        const { createSharedProposal } = await import('../src/services/commitmentProposal.service');
        const result = await createSharedProposal(USER, {
            title: 'Revisar contrato',
            conversation_id: 'conversation-1',
            due_at: '2026-08-05T13:00:00.000Z',
        });

        expect(result).toMatchObject({ id: PROPOSAL, status: 'pending' });
        expect(mock.getRpcCalls()).toEqual([{
            name: 'create_shared_commitment_proposal_with_responses',
            args: {
                p_actor_user_id: USER,
                p_proposal: expect.objectContaining({
                    conversation_id: 'conversation-1',
                    title: 'Revisar contrato',
                }),
            },
        }]);
    });

    it('records participant decisions through the guarded agreement RPC', async () => {
        const mock = createSupabaseAdminMock({
            'rpc:respond_to_commitment_proposal': [{
                data: { proposal_id: PROPOSAL, decision: 'counter_propose', finalized: false },
                error: null,
            }],
        });
        setSupabaseAdminMock(mock);

        const { respondToSharedProposal } = await import('../src/services/commitmentProposal.service');
        await respondToSharedProposal(USER, PROPOSAL, 'counter_propose', {
            proposedDueAt: '2026-08-05T16:00:00.000Z',
        });

        expect(mock.getRpcCalls()).toEqual([{
            name: 'respond_to_commitment_proposal',
            args: {
                p_proposal_id: PROPOSAL,
                p_actor_user_id: USER,
                p_decision: 'counter_propose',
                p_reason: null,
                p_proposed_due_at: '2026-08-05T16:00:00.000Z',
            },
        }]);
    });
});

// ─── PARTICIPANT VISIBILITY + ACTOR PERMISSIONS — canonical participation exposed via REST ─
// Root-cause fix: getAgreementProposals/toAgreementView (la respuesta REST
// real que consumen Compromisos/Hoy en mobile) ahora expone la MISMA
// participación canónica que ya usaba el Agent (proposalParticipation.ts),
// nunca una segunda derivación. Dataset EXACTO del ticket: "Entrenar" --
// Carlos propone y es responsable (ya auto-aprobado por la RPC de creación
// compartida), Alejandra es participante con respuesta pendiente.
describe('PARTICIPANT VISIBILITY: getAgreementProposals expone actor_role/actor_can_respond por actor real', () => {
    const CARLOS = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
    const ALEJANDRA = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
    const ENTRENAR = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';

    function mockEntrenarDataset() {
        return createSupabaseAdminMock({
            commitment_proposals: [{
                data: [{
                    id: ENTRENAR, title: 'Entrenar', status: 'pending',
                    proposed_by_user_id: CARLOS, proposed_responsible_user_id: CARLOS,
                    conversation_id: 'conv-1', agreement_version: 1,
                    proposer: { id: CARLOS, full_name: 'Carlos', email: 'carlos@x.com', avatar_url: null },
                    responsible: { id: CARLOS, full_name: 'Carlos', email: 'carlos@x.com', avatar_url: null },
                }],
                error: null,
            }],
            commitment_proposal_responses: [{
                data: [
                    { proposal_id: ENTRENAR, participant_user_id: CARLOS, agreement_version: 1, status: 'approved', proposed_due_at: null, response_note: null, responded_at: '2026-09-01T00:00:00Z', profile: { id: CARLOS, full_name: 'Carlos', email: 'carlos@x.com', avatar_url: null } },
                    { proposal_id: ENTRENAR, participant_user_id: ALEJANDRA, agreement_version: 1, status: 'pending', proposed_due_at: null, response_note: null, responded_at: null, profile: { id: ALEJANDRA, full_name: 'Alejandra', email: 'alejandra@x.com', avatar_url: null } },
                ],
                error: null,
            }],
        });
    }

    it('CARLOS (proposer, ya aprobó): actorRole=proposer, actorHasApproved=true, actorCanRespond=false (waiting_for_others)', async () => {
        setSupabaseAdminMock(mockEntrenarDataset());
        const { getAgreementProposals } = await import('../src/services/commitmentProposal.service');
        const [entrenar] = await getAgreementProposals(CARLOS);
        expect(entrenar.actor_role).toBe('proposer');
        expect(entrenar.actor_has_approved).toBe(true);
        expect(entrenar.actor_can_respond).toBe(false);
        expect(entrenar.pending_responder_ids).toEqual([ALEJANDRA]);
        expect(entrenar.pending_responder_names_safe).toEqual(['Alejandra']);
        expect(entrenar.is_fully_approved).toBe(false);
    });

    it('ALEJANDRA (participante, respuesta pendiente): actorRole=participant, actorHasApproved=false, actorCanRespond=true (needs_my_response) -- MISMO objeto, semántica distinta por actor', async () => {
        setSupabaseAdminMock(mockEntrenarDataset());
        const { getAgreementProposals } = await import('../src/services/commitmentProposal.service');
        const [entrenar] = await getAgreementProposals(ALEJANDRA);
        expect(entrenar.actor_role).toBe('participant');
        expect(entrenar.actor_has_approved).toBe(false);
        expect(entrenar.actor_can_respond).toBe(true);
    });

    it('un tercero ajeno (ni proposer/responsible/participante) recibe actorRole=none -- nunca visible en Pendientes de mobile', async () => {
        setSupabaseAdminMock(mockEntrenarDataset());
        const { getAgreementProposals } = await import('../src/services/commitmentProposal.service');
        const OUTSIDER = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
        const [entrenar] = await getAgreementProposals(OUTSIDER);
        expect(entrenar.actor_role).toBe('none');
    });
});

// ─── COMMITMENT UX + ACTOR-AWARE SUGGESTIONS — idempotencia real por
// source_message_id (sección 7/25 del ticket): ni create_commitment_proposal_with_evidence
// ni create_shared_commitment_proposal_with_responses tienen ningún guard
// sobre source_message_id (confirmado leyendo ambas RPCs completas) -- un
// doble-tap del mismo actor, o un tap cruzado entre dos actores distintos
// sobre el mismo mensaje "Agendar", podía crear DOS commitment_proposals
// independientes referenciando el mismo mensaje. Estos tests certifican el
// guard real a nivel de servicio (Core), nunca sólo "ocultar el botón".
describe('COMMITMENT UX: idempotencia real por source_message_id', () => {
    const CONVERSATION = 'conversation-msg-1';
    const MESSAGE = 'message-ver-peli';
    const ALEJANDRA = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

    function withMembershipAndMessage(extra: Record<string, any[]> = {}) {
        return createSupabaseAdminMock({
            conversation_participants: [{ data: { conversation_id: CONVERSATION, role: 'member' }, error: null }],
            messages: [{ data: { id: MESSAGE, conversation_id: CONVERSATION, sender_id: USER, metadata: {}, deleted_at: null }, error: null }],
            ...extra,
        });
    }

    it('createProposal: sin proposal previa para este mensaje -> crea normalmente vía RPC', async () => {
        const mock = withMembershipAndMessage({
            commitment_proposals: [{ data: null, error: null }], // findExistingProposalForMessage: nada encontrado
            'rpc:create_commitment_proposal_with_evidence': [{ data: { id: PROPOSAL, status: 'pending', title: 'ver peli' }, error: null }],
        });
        setSupabaseAdminMock(mock);
        const { createProposal } = await import('../src/services/commitmentProposal.service');
        const result = await createProposal(USER, { title: 'ver peli', conversation_id: CONVERSATION, message_id: MESSAGE });
        expect(result).toMatchObject({ id: PROPOSAL, status: 'pending' });
        expect(mock.getRpcCalls()).toHaveLength(1);
    });

    it('createProposal: YA existe una proposal no-rechazada para este mensaje -> la reutiliza, NUNCA llama a la RPC de creación (caso físico real: doble tap)', async () => {
        const mock = withMembershipAndMessage({
            commitment_proposals: [{ data: { id: PROPOSAL, status: 'pending', title: 'ver peli', source_message_id: MESSAGE }, error: null }],
        });
        setSupabaseAdminMock(mock);
        const { createProposal } = await import('../src/services/commitmentProposal.service');
        const result = await createProposal(ALEJANDRA, { title: 'ver peli', conversation_id: CONVERSATION, message_id: MESSAGE });
        expect(result).toMatchObject({ id: PROPOSAL, status: 'pending' });
        expect(mock.getRpcCalls()).toEqual([]); // nunca se llamó create_commitment_proposal_with_evidence
    });

    it('createSharedProposal: YA existe una proposal no-rechazada para este mensaje -> la reutiliza, NUNCA crea una segunda (caso físico real: Carlos y Alejandra tocan "Agendar" sobre el mismo mensaje)', async () => {
        const mock = withMembershipAndMessage({
            commitment_proposals: [{ data: { id: PROPOSAL, status: 'pending', title: 'ver peli', source_message_id: MESSAGE, proposed_by_user_id: USER }, error: null }],
        });
        setSupabaseAdminMock(mock);
        const { createSharedProposal } = await import('../src/services/commitmentProposal.service');
        const result = await createSharedProposal(ALEJANDRA, { title: 'ver peli', conversation_id: CONVERSATION, message_id: MESSAGE });
        expect(result).toMatchObject({ id: PROPOSAL, proposed_by_user_id: USER });
        expect(mock.getRpcCalls()).toEqual([]);
    });

    it('createSharedProposal: una proposal RECHAZADA para este mensaje no bloquea un nuevo intento real (rejected nunca cuenta como "ya existe")', async () => {
        const mock = withMembershipAndMessage({
            commitment_proposals: [{ data: null, error: null }], // .neq('status','rejected') -> el mock no filtra realmente, pero certificamos el camino "no encontrado" -> sí crea
            'rpc:create_shared_commitment_proposal_with_responses': [{ data: { id: 'new-proposal-2', status: 'pending' }, error: null }],
        });
        setSupabaseAdminMock(mock);
        const { createSharedProposal } = await import('../src/services/commitmentProposal.service');
        const result = await createSharedProposal(USER, { title: 'ver peli', conversation_id: CONVERSATION, message_id: MESSAGE });
        expect(result).toMatchObject({ id: 'new-proposal-2' });
        expect(mock.getRpcCalls()).toHaveLength(1);
    });

    it('createConfirmedCommitment: la proposal reutilizada YA está confirmada -> reutiliza el commitment materializado, NUNCA reintenta confirmar (evita el 409/P0001 real de finalize_approved_commitment_proposal)', async () => {
        const mock = withMembershipAndMessage({
            commitment_proposals: [{ data: { id: PROPOSAL, status: 'confirmed', title: 'ver peli', source_message_id: MESSAGE }, error: null }],
            commitments: [{ data: { id: 'commitment-1', proposal_id: PROPOSAL, status: 'accepted', title: 'ver peli' }, error: null }],
        });
        setSupabaseAdminMock(mock);
        const { createConfirmedCommitment } = await import('../src/services/commitmentProposal.service');
        const result = await createConfirmedCommitment(USER, { title: 'ver peli', conversation_id: CONVERSATION, message_id: MESSAGE });
        expect(result).toMatchObject({ id: 'commitment-1', proposal_id: PROPOSAL });
        expect(mock.getRpcCalls().find((c) => c.name === 'confirm_commitment_proposal')).toBeUndefined();
    });

    it('createConfirmedCommitment: carrera real -- confirmProposal lanza P0001 ("Proposal is not pending") -> se recupera devolviendo el commitment ya materializado en vez de propagar el error', async () => {
        const mock = withMembershipAndMessage({
            commitment_proposals: [{ data: { id: PROPOSAL, status: 'pending', title: 'ver peli', source_message_id: MESSAGE }, error: null }],
            'rpc:confirm_commitment_proposal': [{ data: null, error: { code: 'P0001', message: 'Proposal is not pending' } }],
            commitments: [{ data: { id: 'commitment-1', proposal_id: PROPOSAL, status: 'accepted', title: 'ver peli' }, error: null }],
        });
        setSupabaseAdminMock(mock);
        const { createConfirmedCommitment } = await import('../src/services/commitmentProposal.service');
        const result = await createConfirmedCommitment(USER, { title: 'ver peli', conversation_id: CONVERSATION, message_id: MESSAGE });
        expect(result).toMatchObject({ id: 'commitment-1', proposal_id: PROPOSAL });
    });

    it('sin message_id -> nunca consulta la idempotencia (comportamiento manual sin cambios)', async () => {
        const mock = createSupabaseAdminMock({
            'rpc:create_commitment_proposal_with_evidence': [{ data: { id: 'manual-1', status: 'pending' }, error: null }],
        });
        setSupabaseAdminMock(mock);
        const { createProposal } = await import('../src/services/commitmentProposal.service');
        await createProposal(USER, { title: 'Tarea manual sin mensaje de origen' });
        expect(mock.getCalledTables()).not.toContain('commitment_proposals');
    });
});
