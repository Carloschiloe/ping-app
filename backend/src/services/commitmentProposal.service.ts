import { supabaseAdmin } from '../lib/supabaseAdmin';
import { AppError } from '../utils/AppError';
import {
    assertConversationParticipant,
    assertConversationParticipantReference,
    assertMessageInConversation,
    assertOwnContact,
} from '../utils/authz';
import { readLegacyAssignedToUserId, readLegacyConversationId, readLegacyDueAt } from '../utils/commitmentCompat';
import { buildCommitmentProposalVisibilityFilter, getParticipantProposalIds } from '../utils/commitmentVisibility';
import { dispatchCommitmentStatusMemoryEvent } from './canonicalMemoryEvents.service';
import { getProposalParticipationState, type ProposalResponseRow } from '../utils/proposalParticipation';

export async function createProposal(userId: string, input: any) {
    const conversationId = readLegacyConversationId(input);
    const sourceMessageId = input.message_id || input.messageId || null;
    const requestedResponsibleUserId = readLegacyAssignedToUserId(input);
    const contactId = input.counterparty_contact_id || input.counterpartyContactId || null;
    const responsibleUserId = contactId ? null : (requestedResponsibleUserId || userId);

    if (requestedResponsibleUserId && contactId) {
        throw new AppError('A proposal cannot reference both a responsible user and an external contact', 400);
    }
    let sourceMessage: any = null;
    if (conversationId) {
        await assertConversationParticipant(userId, conversationId);
        if (sourceMessageId) {
            sourceMessage = await assertMessageInConversation(sourceMessageId, conversationId);
        }
        if (responsibleUserId && responsibleUserId !== userId) {
            await assertConversationParticipantReference(responsibleUserId, conversationId);
        }
    } else if (sourceMessageId) {
        throw new AppError('A source message requires its conversation context', 400);
    } else if (responsibleUserId && responsibleUserId !== userId) {
        throw new AppError('A related responsible person requires an authorized conversation', 400);
    }
    if (contactId) await assertOwnContact(userId, contactId);

    const sourceKind = input.source_kind
        || input.sourceKind
        || (sourceMessage?.metadata?.suggestedTask
            ? 'ai_suggestion'
            : sourceMessageId
                ? 'conversation_message'
                : 'manual');
    if (!['manual', 'conversation_message', 'ai_suggestion'].includes(sourceKind)) {
        throw new AppError('Invalid proposal source kind', 400);
    }

    const proposalPayload = {
            proposed_by_user_id: userId,
            proposed_responsible_user_id: contactId ? null : responsibleUserId,
            counterparty_contact_id: contactId,
            conversation_id: conversationId,
            source_message_id: sourceMessageId,
            source_kind: sourceKind,
            title: input.title,
            description: input.description || null,
            due_at: readLegacyDueAt(input),
            type: input.type || 'task',
            priority: input.priority || null,
            expected_result: input.expected_result || input.expectedResult || null,
            status: 'pending',
    };
    const { data: proposal, error } = await supabaseAdmin
        .rpc('create_commitment_proposal_with_evidence', {
            p_actor_user_id: userId,
            p_proposal: proposalPayload,
        });
    if (error) throw error;
    return proposal;
}

export async function createSharedProposal(userId: string, input: any) {
    const conversationId = readLegacyConversationId(input);
    if (!conversationId) {
        throw new AppError('A shared proposal requires a conversation', 400);
    }

    await assertConversationParticipant(userId, conversationId);
    const sourceMessageId = input.message_id || input.messageId || null;
    const sourceMessage = sourceMessageId
        ? await assertMessageInConversation(sourceMessageId, conversationId)
        : null;

    const requestedResponsibleUserId = readLegacyAssignedToUserId(input);
    const contactId = input.counterparty_contact_id || input.counterpartyContactId || null;
    if (requestedResponsibleUserId && contactId) {
        throw new AppError('A proposal cannot reference both a responsible user and an external contact', 400);
    }
    if (requestedResponsibleUserId && requestedResponsibleUserId !== userId) {
        await assertConversationParticipantReference(requestedResponsibleUserId, conversationId);
    }
    if (contactId) await assertOwnContact(userId, contactId);

    const sourceKind = input.source_kind
        || input.sourceKind
        || (sourceMessage?.metadata?.suggestedTask
            ? 'ai_suggestion'
            : sourceMessageId
                ? 'conversation_message'
                : 'manual');
    if (!['manual', 'conversation_message', 'ai_suggestion'].includes(sourceKind)) {
        throw new AppError('Invalid proposal source kind', 400);
    }
    const proposalPayload = {
        proposed_by_user_id: userId,
        proposed_responsible_user_id: contactId
            ? null
            : (requestedResponsibleUserId || userId),
        counterparty_contact_id: contactId,
        conversation_id: conversationId,
        source_message_id: sourceMessageId,
        source_kind: sourceKind,
        title: input.title,
        description: input.description || null,
        due_at: readLegacyDueAt(input),
        type: input.type || 'task',
        priority: input.priority || null,
        expected_result: input.expected_result || input.expectedResult || null,
        status: 'pending',
    };

    const { data, error } = await supabaseAdmin.rpc(
        'create_shared_commitment_proposal_with_responses',
        {
            p_actor_user_id: userId,
            p_proposal: proposalPayload,
        }
    );
    if (error) throw error;
    return data;
}

export async function respondToSharedProposal(
    userId: string,
    proposalId: string,
    decision: 'approve' | 'reject' | 'counter_propose',
    options: { reason?: string | null; proposedDueAt?: string | null } = {}
) {
    const { data, error } = await supabaseAdmin.rpc(
        'respond_to_commitment_proposal',
        {
            p_proposal_id: proposalId,
            p_actor_user_id: userId,
            p_decision: decision,
            p_reason: options.reason?.trim() || null,
            p_proposed_due_at: options.proposedDueAt || null,
        }
    );
    if (error) throw error;

    // M-2 FINAL — respond_to_commitment_proposal es el único funnel real de
    // approve/reject/counter_propose sobre proposals compartidas; su jsonb
    // de retorno ya trae la proposal actualizada y (si la decisión completó
    // todas las aprobaciones requeridas) el commitment recién creado.
    if (data?.proposal) {
        await dispatchCommitmentStatusMemoryEvent({
            ownerUserId: data.proposal.proposed_by_user_id,
            sourceType: 'commitment_proposal',
            sourceId: data.proposal.id,
            title: data.proposal.title,
            newStatus: data.proposal.status,
            conversationId: data.proposal.conversation_id ?? null,
        });
    }
    if (data?.commitment) {
        await dispatchCommitmentStatusMemoryEvent({
            ownerUserId: data.commitment.owner_user_id,
            sourceType: 'commitment',
            sourceId: data.commitment.id,
            title: data.commitment.title,
            newStatus: data.commitment.status,
            conversationId: data.commitment.conversation_id ?? null,
        });
    }

    return data;
}

// PARTICIPANT VISIBILITY + ACTOR PERMISSIONS — cierre de raíz: hasta ahora
// `toAgreementView` (la serialización REAL que consumen Compromisos/Hoy en
// mobile) nunca exponía la participación del actor -- esa lógica canónica ya
// existía (proposalParticipation.ts), pero sólo estaba cableada al pipeline
// del Agent (retrieval.service.ts#toRetrievalCommitmentFromProposal), nunca
// a esta respuesta REST. Mobile, sin esta señal, sólo podía inferir
// visibilidad/acciones desde el modelo de asignación única
// (owner_user_id/assigned_to_user_id) -- el motivo real por el que
// Alejandra (participante, no asignada) desaparecía de Pendientes/Hoy pese
// a que el backend SÍ la incluía en la lista. `actorUserId` es SIEMPRE el
// actor autenticado real (nunca un valor de cliente) -- mismo principio que
// el resto de esta función.
function toAgreementView(proposal: any, responses: any[], actorUserId: string) {
    const isRejected = proposal.status === 'rejected';
    const isCounterProposal = proposal.status === 'pending'
        && !!proposal.latest_counterproposal_due_at;

    const responseRows: ProposalResponseRow[] = responses.map((r) => ({
        participant_user_id: r.participant_user_id,
        status: r.status,
    }));
    const participation = getProposalParticipationState(
        { proposed_by_user_id: proposal.proposed_by_user_id, proposed_responsible_user_id: proposal.proposed_responsible_user_id, responses: responseRows },
        actorUserId,
    );
    // Nombres seguros a partir del mismo join ya disponible (`response.profile`)
    // -- nunca se exponen uuids crudos como "nombre", y nunca se hace una
    // consulta adicional sólo para esto (el join ya trae full_name/email).
    const nameById = new Map<string, string>();
    for (const r of responses) {
        if (r.participant_user_id && r.profile) {
            nameById.set(r.participant_user_id, r.profile.full_name || r.profile.email || 'Alguien');
        }
    }

    return {
        id: proposal.id,
        proposal_id: proposal.id,
        title: proposal.title,
        description: proposal.description,
        due_at: proposal.due_at,
        proposed_due_at: proposal.latest_counterproposal_due_at,
        status: isRejected
            ? 'rejected'
            : isCounterProposal
                ? 'counter_proposal'
                : 'proposed',
        type: proposal.type,
        priority: proposal.priority,
        expected_result: proposal.expected_result,
        owner_user_id: proposal.proposed_by_user_id,
        assigned_to_user_id: proposal.proposed_responsible_user_id,
        counterparty_contact_id: proposal.counterparty_contact_id,
        conversation_id: proposal.conversation_id,
        message_id: proposal.source_message_id,
        rejection_reason: proposal.rejection_reason,
        agreement_version: proposal.agreement_version,
        latest_counterproposal_by_user_id: proposal.latest_counterproposal_by_user_id,
        latest_counterproposal_due_at: proposal.latest_counterproposal_due_at,
        created_at: proposal.created_at,
        updated_at: proposal.updated_at,
        owner: proposal.proposer,
        assignee: proposal.responsible,
        agreement_responses: responses.map((response) => ({
            ...response,
            participant: response.profile || null,
            profile: undefined,
        })),
        _isAgreementProposal: true,
        // CANONICAL PARTICIPATION CONTRACT (Core-resuelto, nunca inferido en
        // mobile): visibility/actions ya no pueden depender de
        // owner_user_id/assigned_to_user_id solamente -- estos campos son la
        // única fuente de verdad real de "¿qué soy yo en esta proposal y qué
        // puedo hacer?", igual que ya recibe el Agent.
        actor_role: participation.actorRole,
        actor_has_approved: participation.actorHasApproved,
        actor_can_respond: participation.actorCanRespond,
        pending_responder_ids: participation.pendingResponderIds,
        pending_responder_names_safe: participation.pendingResponderIds.map((id) => nameById.get(id) || 'Alguien'),
        approved_responder_ids: participation.approvedResponderIds,
        rejected_responder_ids: participation.rejectedResponderIds,
        is_fully_approved: participation.isFullyApproved,
        requires_more_responses: participation.requiresMoreResponses,
    };
}

export async function getAgreementProposals(
    userId: string,
    conversationId?: string
) {
    if (conversationId) {
        await assertConversationParticipant(userId, conversationId);
    }

    // M-1H: usa la MISMA función de autorización que el Agent
    // (retrieval.service.ts#retrieveCommitmentProposals) — antes esta lógica
    // vivía inline aquí, duplicada. Sin conversationId, la visibilidad real
    // es "yo la propuse O soy participante con una respuesta registrada";
    // dentro de una conversación ya autorizada (assertConversationParticipant
    // arriba), se ve todo lo de esa conversación sin filtro adicional.
    let query = supabaseAdmin
        .from('commitment_proposals')
        .select(`
            *,
            proposer:proposed_by_user_id(id, full_name, email, avatar_url),
            responsible:proposed_responsible_user_id(id, full_name, email, avatar_url)
        `)
        .neq('status', 'confirmed');

    if (conversationId) {
        query = query.eq('conversation_id', conversationId);
    } else {
        const participantProposalIds = await getParticipantProposalIds(userId);
        query = query.or(buildCommitmentProposalVisibilityFilter(userId, participantProposalIds));
    }

    const { data: proposals, error } = await query.order('created_at', { ascending: false });
    if (error) throw error;
    if (!proposals?.length) return [];

    const proposalIds = proposals.map((proposal: any) => proposal.id);
    const { data: responses, error: responsesError } = await supabaseAdmin
        .from('commitment_proposal_responses')
        .select(`
            proposal_id,
            participant_user_id,
            agreement_version,
            status,
            proposed_due_at,
            response_note,
            responded_at,
            profile:participant_user_id(id, full_name, email, avatar_url)
        `)
        .in('proposal_id', proposalIds);
    if (responsesError) throw responsesError;

    const responsesByProposal = new Map<string, any[]>();
    for (const response of responses || []) {
        const list = responsesByProposal.get(response.proposal_id) || [];
        list.push(response);
        responsesByProposal.set(response.proposal_id, list);
    }

    return proposals.map((proposal: any) => toAgreementView(
        proposal,
        responsesByProposal.get(proposal.id) || [],
        userId,
    ));
}

export async function attachAgreementResponses<T extends Record<string, any>>(
    commitments: T[]
): Promise<T[]> {
    const proposalIds = commitments
        .map((commitment) => commitment.proposal_id)
        .filter(Boolean);
    if (proposalIds.length === 0) return commitments;

    const { data: responses, error } = await supabaseAdmin
        .from('commitment_proposal_responses')
        .select(`
            proposal_id,
            participant_user_id,
            agreement_version,
            status,
            proposed_due_at,
            response_note,
            responded_at,
            profile:participant_user_id(id, full_name, email, avatar_url)
        `)
        .in('proposal_id', proposalIds);
    if (error) throw error;

    const responsesByProposal = new Map<string, any[]>();
    for (const response of responses || []) {
        const list = responsesByProposal.get(response.proposal_id) || [];
        list.push(response);
        responsesByProposal.set(response.proposal_id, list);
    }

    return commitments.map((commitment) => ({
        ...commitment,
        agreement_responses: (responsesByProposal.get(commitment.proposal_id) || []).map((response) => ({
            ...response,
            participant: response.profile || null,
            profile: undefined,
        })),
    }));
}

export async function confirmProposal(userId: string, proposalId: string) {
    const { data, error } = await supabaseAdmin.rpc('confirm_commitment_proposal', {
        p_proposal_id: proposalId,
        p_actor_user_id: userId,
    });
    if (error) throw error;

    // M-2 FINAL — confirm_commitment_proposal devuelve el `commitments` ya
    // creado (returns public.commitments), no la proposal -- la proposal en
    // sí SÍ cambió a 'confirmed' dentro de la misma transacción SQL, así que
    // se registran AMBOS hechos: la proposal terminal (nunca vuelve a ser
    // 'pending') y el commitment recién nacido con su estado inicial real.
    await dispatchCommitmentStatusMemoryEvent({
        ownerUserId: data.owner_user_id, sourceType: 'commitment_proposal', sourceId: proposalId,
        title: data.title, newStatus: 'confirmed', conversationId: data.conversation_id ?? null,
    });
    await dispatchCommitmentStatusMemoryEvent({
        ownerUserId: data.owner_user_id, sourceType: 'commitment', sourceId: data.id,
        title: data.title, newStatus: data.status, conversationId: data.conversation_id ?? null,
    });

    return data;
}

export async function rejectProposal(userId: string, proposalId: string, reason?: string | null) {
    const { data, error } = await supabaseAdmin
        .rpc('reject_commitment_proposal_with_evidence', {
            p_proposal_id: proposalId,
            p_actor_user_id: userId,
            p_reason: reason || null,
        });
    if (error) throw error;
    if (!data) throw new AppError('Pending proposal not found', 404);

    await dispatchCommitmentStatusMemoryEvent({
        ownerUserId: data.proposed_by_user_id, sourceType: 'commitment_proposal', sourceId: data.id,
        title: data.title, newStatus: data.status, conversationId: data.conversation_id ?? null,
    });

    return data;
}

// POST /commitments is retained as a beta compatibility endpoint. Calling it
// is the user's explicit confirmation: Proposal is persisted first and only
// the database transaction below creates Commitment plus its first event.
export async function createConfirmedCommitment(userId: string, input: any) {
    const proposal = await createProposal(userId, input);
    return confirmProposal(userId, proposal.id);
}
