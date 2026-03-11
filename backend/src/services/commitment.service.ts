import { supabaseAdmin } from '../lib/supabaseAdmin';
import { insertSystemMessage } from './message.service';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { sendPushNotification } from './push.service';
const SELECT_WITH_ASSIGNEE = `
    *,
    assignee:profiles!assigned_to_user_id (
        id,
        full_name,
        avatar_url,
        email
    ),
    owner:profiles!owner_user_id (
        id,
        full_name,
        avatar_url,
        email
    )
`;

export const createCommitment = async (userId: string, data: any) => {
    console.log('[createCommitment] Starting insert for user:', userId, 'data:', JSON.stringify(data));

    // Ensure status default if not provided
    const payload = {
        status: 'proposed',
        ...data,
        owner_user_id: userId,
    };

    const { data: commitment, error } = await supabaseAdmin
        .from('commitments')
        .insert(payload)
        .select()
        .single();

    if (error) {
        console.error('[createCommitment] DB Error:', JSON.stringify(error));
        throw error;
    }

    console.log('[createCommitment] Success:', commitment.id);
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
export const pingCommitment = async (userId: string, commitmentId: string) => {
    // 1. Get commitment details with assignee info
    const { data: commitment, error } = await supabaseAdmin
        .from('commitments')
        .select(SELECT_WITH_ASSIGNEE)
        .eq('id', commitmentId)
        .single();

    if (error || !commitment) throw new Error('Commitment not found');

    // 2. Only owner can ping, and only if there's an assignee
    if (commitment.owner_user_id !== userId) throw new Error('Unauthorized ping');
    if (!commitment.assigned_to_user_id) throw new Error('No assignee to ping');

    // 3. Get assignee's push token
    const { data: profile } = await supabaseAdmin
        .from('profiles')
        .select('expo_push_token, full_name')
        .eq('id', commitment.assigned_to_user_id)
        .single();

    const pushToken = profile?.expo_push_token;
    if (pushToken) {
        const ownerName = commitment.owner?.full_name || 'Alguien';
        await sendPushNotification(
            pushToken,
            '🚨 Recordatorio de Tarea',
            `${ownerName} te recuerda: "${commitment.title}"`
        );
    }

    return { success: true };
};
