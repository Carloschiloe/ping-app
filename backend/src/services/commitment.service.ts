import { supabaseAdmin } from '../lib/supabaseAdmin';
import { insertSystemMessage } from './message.service';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
const SELECT_WITH_ASSIGNEE = `
    *,
    assignee:profiles!assigned_to_user_id (
        id,
        full_name,
        avatar_url,
        email
    ),
    message:messages!message_id(id, conversation_id)
`;

export const createCommitment = async (userId: string, data: any) => {
    const { data: commitment, error } = await supabaseAdmin
        .from('commitments')
        .insert({
            ...data,
            owner_user_id: userId,
            status: 'proposed' // Always start as proposed for negotiation
        })
        .select(SELECT_WITH_ASSIGNEE)
        .single();

    if (error) throw error;
    return commitment;
};

export const acceptCommitment = async (userId: string, commitmentId: string) => {
    const { data, error } = await supabaseAdmin
        .from('commitments')
        .update({ status: 'accepted' })
        .eq('id', commitmentId)
        .eq('assigned_to_user_id', userId)
        .select(SELECT_WITH_ASSIGNEE)
        .single();

    if (error) throw error;

    if (data && data.group_conversation_id) {
        const name = data.assignee?.full_name || 'Alguien';
        await insertSystemMessage(data.group_conversation_id, `✅ ${name} ha aceptado la tarea: "${data.title}"`, userId);
    }

    return data;
};

export const rejectCommitment = async (userId: string, commitmentId: string, reason: string) => {
    const { data, error } = await supabaseAdmin
        .from('commitments')
        .update({
            status: 'rejected',
            rejection_reason: reason
        })
        .eq('id', commitmentId)
        .eq('assigned_to_user_id', userId)
        .select(SELECT_WITH_ASSIGNEE)
        .single();

    if (error) throw error;

    if (data && data.group_conversation_id) {
        const name = data.assignee?.full_name || 'Alguien';
        await insertSystemMessage(data.group_conversation_id, `❌ ${name} ha rechazado la tarea: "${data.title}"\nMotivo: ${reason}`, userId);
    }

    return data;
};

export const postponeCommitment = async (userId: string, commitmentId: string, newDate: string) => {
    const { data, error } = await supabaseAdmin
        .from('commitments')
        .update({
            status: 'counter_proposal',
            proposed_due_at: newDate
        })
        .eq('id', commitmentId)
        .eq('assigned_to_user_id', userId)
        .select(SELECT_WITH_ASSIGNEE)
        .single();

    if (error) throw error;

    if (data && data.group_conversation_id) {
        const name = data.assignee?.full_name || 'Alguien';
        const formattedDate = format(new Date(newDate), "eeee d 'de' MMMM 'a las' HH:mm", { locale: es });
        await insertSystemMessage(data.group_conversation_id, `⏳ ${name} ha pospuesto la tarea: "${data.title}"\nNueva propuesta: ${formattedDate}`, userId);
    }

    return data;
};

export const getCommitments = async (userId: string, status?: string, conversationId?: string) => {
    // We want tasks where user is EITHER owner OR assignee
    let query = supabaseAdmin
        .from('commitments')
        .select(SELECT_WITH_ASSIGNEE)
        .or(`owner_user_id.eq.${userId},assigned_to_user_id.eq.${userId}`)
        .order('due_at', { ascending: true });

    if (status) {
        query = query.eq('status', status);
    }

    if (conversationId) {
        query = query.eq('group_conversation_id', conversationId);
    }

    const { data, error } = await query;
    if (error) throw error;
    return data;
};

export const updateCommitment = async (userId: string, commitmentId: string, updates: any) => {
    // Determine if user is owner or assignee
    const { data: commitment } = await supabaseAdmin
        .from('commitments')
        .select('owner_user_id, assigned_to_user_id')
        .eq('id', commitmentId)
        .single();

    if (!commitment) throw new Error('Commitment not found');

    const isOwner = commitment.owner_user_id === userId;
    const isAssignee = commitment.assigned_to_user_id === userId;

    if (!isOwner && !isAssignee) {
        throw new Error('Unauthorized update');
    }

    const { data, error } = await supabaseAdmin
        .from('commitments')
        .update(updates)
        .eq('id', commitmentId)
        .select(SELECT_WITH_ASSIGNEE)
        .single();

    if (error) throw error;
    return data;
};

export const deleteCommitment = async (userId: string, commitmentId: string) => {
    const { data, error } = await supabaseAdmin
        .from('commitments')
        .delete()
        .eq('id', commitmentId)
        .eq('owner_user_id', userId)
        .select(SELECT_WITH_ASSIGNEE)
        .single();

    if (error) throw error;
    return data;
};
