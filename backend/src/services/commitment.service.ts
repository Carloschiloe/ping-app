import { supabaseAdmin } from '../lib/supabaseAdmin';
// import { schedulePushNotification } from './push-notification.service'; 

export const getCommitments = async (userId: string, status?: string) => {
    let query = supabaseAdmin
        .from('commitments')
        .select('*, message:message_id(id, conversation_id)')
        .eq('owner_user_id', userId)
        .order('due_at', { ascending: true });

    if (status) {
        query = query.eq('status', status);
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
        .select()
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
        .select()
        .single();

    if (error) throw error;
    return data;
};
