import { supabaseAdmin } from '../lib/supabaseAdmin';
import { AppError } from '../utils/AppError';
import { assertConversationParticipant } from '../utils/authz';

// Adds the reaction, or removes it when the person already gave that same
// one (tapping an emoji twice takes it back). Only participants of the
// conversation can react, and never on a deleted message.
export async function toggleMessageReaction(
    userId: string,
    conversationId: string,
    messageId: string,
    reaction: string,
): Promise<{ reacted: boolean }> {
    await assertConversationParticipant(userId, conversationId);

    const { data: message, error: messageError } = await supabaseAdmin
        .from('messages')
        .select('id')
        .eq('id', messageId)
        .eq('conversation_id', conversationId)
        .is('deleted_at', null)
        .maybeSingle();
    if (messageError) throw new AppError(messageError.message, 500);
    if (!message) throw new AppError('Message not found', 404);

    const { data: existing, error: existingError } = await supabaseAdmin
        .from('message_reactions')
        .select('id')
        .eq('message_id', messageId)
        .eq('user_id', userId)
        .eq('reaction', reaction)
        .maybeSingle();
    if (existingError) throw new AppError(existingError.message, 500);

    if (existing) {
        const { error } = await supabaseAdmin.from('message_reactions').delete().eq('id', existing.id);
        if (error) throw new AppError(error.message, 500);
        return { reacted: false };
    }

    const { error } = await supabaseAdmin
        .from('message_reactions')
        .insert({ message_id: messageId, user_id: userId, reaction });
    if (error) throw new AppError(error.message, 500);
    return { reacted: true };
}
