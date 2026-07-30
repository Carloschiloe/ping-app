import { supabaseAdmin } from '../lib/supabaseAdmin';

// Devuelve el id de la conversacion self-chat del usuario (una conversacion
// 'direct' con un unico participante: el propio usuario), creandola si no
// existe todavia. Extraido de conversation.controller.ts (createSelf) para
// que tambien pueda reutilizarse desde procesos de backend sin pasar por
// una request HTTP (ej. morningRoutine.service.ts).
export const getOrCreateSelfConversationId = async (userId: string): Promise<string> => {
    const { data: myConvs } = await supabaseAdmin
        .from('conversation_participants')
        .select('conversation_id')
        .eq('user_id', userId);

    const myConvIds = (myConvs || []).map((p) => p.conversation_id);

    if (myConvIds.length > 0) {
        for (const convId of myConvIds) {
            const { count } = await supabaseAdmin
                .from('conversation_participants')
                .select('*', { count: 'exact', head: true })
                .eq('conversation_id', convId);
            if (count === 1) {
                return convId;
            }
        }
    }

    const { data: conv, error: convError } = await supabaseAdmin
        .from('conversations')
        .insert({ conversation_type: 'direct', created_by: userId })
        .select()
        .single();

    if (convError) throw convError;

    const { error: partError } = await supabaseAdmin
        .from('conversation_participants')
        .insert([{ conversation_id: conv.id, user_id: userId, role: 'admin' }]);

    if (partError) throw partError;

    return conv.id;
};

export const getOrCreateDirectConversationId = async (
    userId: string,
    otherUserId: string
): Promise<string> => {
    const { data: myConversations, error: myError } = await supabaseAdmin
        .from('conversation_participants')
        .select('conversation_id')
        .eq('user_id', userId);
    if (myError) throw myError;

    const myConversationIds = (myConversations || []).map((row) => row.conversation_id);
    if (myConversationIds.length > 0) {
        const { data: shared, error: sharedError } = await supabaseAdmin
            .from('conversation_participants')
            .select('conversation_id')
            .eq('user_id', otherUserId)
            .in('conversation_id', myConversationIds);
        if (sharedError) throw sharedError;

        const sharedIds = (shared || []).map((row) => row.conversation_id);
        if (sharedIds.length > 0) {
            const { data: existing, error: existingError } = await supabaseAdmin
                .from('conversations')
                .select('id')
                .in('id', sharedIds)
                .eq('conversation_type', 'direct')
                .limit(1)
                .maybeSingle();
            if (existingError) throw existingError;
            if (existing) return existing.id;
        }
    }

    const { data: conversation, error: conversationError } = await supabaseAdmin
        .from('conversations')
        .insert({ conversation_type: 'direct', created_by: userId })
        .select('id')
        .single();
    if (conversationError || !conversation) throw conversationError;

    const { error: participantError } = await supabaseAdmin
        .from('conversation_participants')
        .insert([
            { conversation_id: conversation.id, user_id: userId, role: 'member' },
            { conversation_id: conversation.id, user_id: otherUserId, role: 'member' },
        ]);
    if (participantError) throw participantError;
    return conversation.id;
};
