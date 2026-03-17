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

export async function assertCommitmentConversationParticipant(userId: string, commitmentId: string) {
    const { data: commitment, error } = await supabaseAdmin
        .from('commitments')
        .select('id, group_conversation_id, owner_user_id, assigned_to_user_id')
        .eq('id', commitmentId)
        .maybeSingle();

    if (error) throw new AppError(error.message, 500);
    if (!commitment) throw new AppError('Commitment not found', 404);

    if (commitment.group_conversation_id) {
        await assertConversationParticipant(userId, commitment.group_conversation_id);
    } else if (commitment.owner_user_id !== userId && commitment.assigned_to_user_id !== userId) {
        throw new AppError('You do not have access to this commitment', 403);
    }

    return commitment;
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
