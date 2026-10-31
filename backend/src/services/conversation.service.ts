import { createConversationWithParticipants } from './conversationApplication.service';
import { supabaseAdmin } from '../lib/supabaseAdmin';

export const getOrCreateSelfConversationId = async (userId: string): Promise<string> => {
    return createConversationWithParticipants({
        creatorUserId: userId,
        type: 'direct',
        participantUserIds: [userId],
        reuseExisting: true,
    });
};

// The actor's self conversation is the main Ping surface: its history lives
// there, but it is not a chat that narrows what the agent may read.
export const isSelfConversation = async (userId: string, conversationId: string): Promise<boolean> => {
    const { data, error } = await supabaseAdmin
        .from('conversation_participants')
        .select('user_id')
        .eq('conversation_id', conversationId)
        .limit(2);
    if (error) throw error;
    return data?.length === 1 && data[0].user_id === userId;
};

export const getOrCreateDirectConversationId = async (
    userId: string,
    otherUserId: string,
): Promise<string> => {
    return createConversationWithParticipants({
        creatorUserId: userId,
        type: 'direct',
        participantUserIds: [userId, otherUserId],
        reuseExisting: true,
    });
};
