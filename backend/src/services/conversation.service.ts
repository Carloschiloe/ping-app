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
