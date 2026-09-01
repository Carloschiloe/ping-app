import { supabaseAdmin } from '../lib/supabaseAdmin';
import { AppError } from '../utils/AppError';

export async function createConversationWithParticipants(input: {
    creatorUserId: string;
    type: 'direct' | 'group';
    participantUserIds: string[];
    name?: string;
    avatarUrl?: string | null;
    reuseExisting?: boolean;
}) {
    const { data, error } = await supabaseAdmin.rpc('create_conversation_with_participants', {
        p_creator_user_id: input.creatorUserId,
        p_conversation_type: input.type,
        p_participant_ids: input.participantUserIds,
        p_name: input.name || null,
        p_avatar_url: input.avatarUrl || null,
        p_reuse_existing: input.reuseExisting || false,
    });
    if (error) throw new AppError('Unable to create conversation', 500);
    if (!data) throw new AppError('Conversation was not created', 500);
    return String(data);
}

export async function tombstoneConversation(conversationId: string, actorUserId: string) {
    const { data, error } = await supabaseAdmin.rpc('tombstone_conversation', {
        p_conversation_id: conversationId,
        p_actor_user_id: actorUserId,
    });
    if (error) {
        const status = error.code === '42501' ? 403 : error.code === 'P0002' ? 404 : 500;
        throw new AppError(status === 500 ? 'Unable to delete conversation' : error.message, status);
    }
    return data;
}
