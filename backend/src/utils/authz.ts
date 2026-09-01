import { supabaseAdmin } from '../lib/supabaseAdmin';
import { AppError } from './AppError';

export async function assertConversationParticipant(userId: string, conversationId: string) {
    const { data, error } = await supabaseAdmin
        .from('conversation_participants')
        .select('conversation_id, role')
        .eq('conversation_id', conversationId)
        .eq('user_id', userId)
        .maybeSingle();

    if (error) throw new AppError(error.message, 500);
    if (!data) throw new AppError('You do not have access to this conversation', 403);

    return data;
}

export async function assertMessageInConversation(messageId: string, conversationId: string) {
    const { data: message, error } = await supabaseAdmin
        .from('messages')
        .select('id, conversation_id, sender_id, metadata, deleted_at')
        .eq('id', messageId)
        .eq('conversation_id', conversationId)
        .maybeSingle();

    if (error) throw new AppError(error.message, 500);
    if (!message || message.deleted_at) throw new AppError('Message not found in this conversation', 404);

    return message;
}

export async function assertConversationParticipantReference(userId: string, conversationId: string) {
    const { data, error } = await supabaseAdmin
        .from('conversation_participants')
        .select('conversation_id, user_id')
        .eq('conversation_id', conversationId)
        .eq('user_id', userId)
        .maybeSingle();

    if (error) throw new AppError(error.message, 500);
    if (!data) throw new AppError('Referenced user is not a participant in this conversation', 400);

    return data;
}

export async function getSharedProfileIds(userId: string): Promise<string[]> {
    const { data: ownParticipations, error: ownError } = await supabaseAdmin
        .from('conversation_participants')
        .select('conversation_id')
        .eq('user_id', userId);

    if (ownError) throw new AppError(ownError.message, 500);
    const conversationIds = (ownParticipations || []).map((row) => row.conversation_id);
    if (conversationIds.length === 0) return [];

    const { data: participants, error: participantError } = await supabaseAdmin
        .from('conversation_participants')
        .select('user_id')
        .in('conversation_id', conversationIds);

    if (participantError) throw new AppError(participantError.message, 500);
    return Array.from(new Set(
        (participants || [])
            .map((row) => row.user_id)
            .filter((participantId) => participantId && participantId !== userId)
    ));
}

export async function assertCanReferenceProfiles(userId: string, profileIds: string[]) {
    const requestedIds = Array.from(new Set(profileIds.filter((id) => id && id !== userId)));
    if (requestedIds.length === 0) return;

    const allowedIds = new Set(await getSharedProfileIds(userId));
    const forbidden = requestedIds.find((id) => !allowedIds.has(id));
    if (forbidden) {
        throw new AppError('One or more people are outside your authorized relationship scope', 403);
    }
}

// V2: la autoridad de "administrador de conversacion" vive exclusivamente en
// conversation_participants.role (nunca en conversations.admin_id, que ya no
// existe, ni en un campo group_metadata inexistente que un bug historico
// intentaba leer en message.controller.ts). Centralizado aqui para que
// group.controller.ts y message.controller.ts no dupliquen esta consulta.
export async function isConversationAdmin(userId: string, conversationId: string): Promise<boolean> {
    const { data, error } = await supabaseAdmin
        .from('conversation_participants')
        .select('role')
        .eq('conversation_id', conversationId)
        .eq('user_id', userId)
        .maybeSingle();

    if (error || !data) return false;
    return data.role === 'admin';
}

export async function assertConversationAdmin(userId: string, conversationId: string) {
    const { data, error } = await supabaseAdmin
        .from('conversation_participants')
        .select('role')
        .eq('conversation_id', conversationId)
        .eq('user_id', userId)
        .maybeSingle();

    if (error) throw new AppError(error.message, 500);
    if (!data) throw new AppError('Participant not found', 404);
    if (data.role !== 'admin') throw new AppError('Only conversation admins can perform this action', 403);
}

export async function assertCommitmentConversationParticipant(userId: string, commitmentId: string) {
    const { data: commitment, error } = await supabaseAdmin
        .from('commitments')
        .select('id, conversation_id, owner_user_id, assigned_to_user_id, counterparty_contact_id')
        .eq('id', commitmentId)
        .maybeSingle();

    if (error) throw new AppError(error.message, 500);
    if (!commitment) throw new AppError('Commitment not found', 404);

    if (commitment.owner_user_id === userId || commitment.assigned_to_user_id === userId) {
        return commitment;
    }

    if (commitment.conversation_id) {
        await assertConversationParticipant(userId, commitment.conversation_id);
        return commitment;
    }

    throw new AppError('You do not have access to this commitment', 403);
}

export async function assertCommitmentOwner(userId: string, commitmentId: string) {
    const { data, error } = await supabaseAdmin
        .from('commitments')
        .select('id, owner_user_id, assigned_to_user_id, conversation_id')
        .eq('id', commitmentId)
        .maybeSingle();
    if (error) throw new AppError(error.message, 500);
    if (!data) throw new AppError('Commitment not found', 404);
    if (data.owner_user_id !== userId) {
        throw new AppError('Only the commitment owner can perform this action', 403);
    }
    return data;
}

export async function assertCommitmentOwnerOrResponsible(userId: string, commitmentId: string) {
    const { data, error } = await supabaseAdmin
        .from('commitments')
        .select('id, owner_user_id, assigned_to_user_id, conversation_id')
        .eq('id', commitmentId)
        .maybeSingle();
    if (error) throw new AppError(error.message, 500);
    if (!data) throw new AppError('Commitment not found', 404);
    if (data.owner_user_id !== userId && data.assigned_to_user_id !== userId) {
        throw new AppError('Only the owner or responsible person can perform this action', 403);
    }
    return data;
}

// V2: un contacto externo (tabla `contacts`) nunca tiene sesion ni RLS propia
// — solo su owner_user_id puede leerlo/usarlo. Esta funcion es la unica
// autoridad para decidir si `userId` puede referenciar `contactId` como
// counterparty_contact_id/waiting_on_contact_id de un commitment.
export async function assertOwnContact(userId: string, contactId: string) {
    const { data: contact, error } = await supabaseAdmin
        .from('contacts')
        .select('id, owner_user_id, display_name, phone, email, linked_user_id, created_at')
        .eq('id', contactId)
        .maybeSingle();

    if (error) throw new AppError(error.message, 500);
    if (!contact) throw new AppError('Contact not found', 404);
    if (contact.owner_user_id !== userId) throw new AppError('You do not have access to this contact', 403);

    return contact;
}

export async function assertCallConversationParticipant(userId: string, callId: string) {
    const { data: call, error } = await supabaseAdmin
        .from('calls')
        .select('id, conversation_id')
        .eq('id', callId)
        .maybeSingle();

    if (error) throw new AppError(error.message, 500);
    if (!call) throw new AppError('Call not found', 404);

    await assertConversationParticipant(userId, call.conversation_id);
    return call;
}

export async function assertCallInConversation(callId: string, conversationId: string) {
    const { data: call, error } = await supabaseAdmin
        .from('calls')
        .select('id, conversation_id')
        .eq('id', callId)
        .eq('conversation_id', conversationId)
        .maybeSingle();

    if (error) throw new AppError(error.message, 500);
    if (!call) throw new AppError('Call not found in this conversation', 404);

    return call;
}
