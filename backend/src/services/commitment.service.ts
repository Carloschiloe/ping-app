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
    const { data, error } = await supabaseAdmin
        .from('commitments')
        .update(updates)
        .eq('id', commitmentId)
        .eq('owner_user_id', userId)
        .select()
        .single();

    if (error) throw error;
    return data;
};
