import { supabaseAdmin } from '../lib/supabaseAdmin';
import { parseDateFromText } from './date-parser.service';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';

export const processUserMessage = async (userId: string, text: string, conversationId?: string) => {
    // 1. Insert original message
    const { data: message, error: messageError } = await supabaseAdmin
        .from('messages')
        .insert({
            user_id: userId,
            sender_id: userId,
            ...(conversationId ? { conversation_id: conversationId } : {}),
            text,
        })
        .select()
        .single();

    if (messageError) throw messageError;

    let commitmentCreated: any = null;
    let systemReplyText = null;
    let systemMessage: any = null;

    // 2. Parse date for commitments
    const parsedDate = parseDateFromText(text);
    if (parsedDate) {
        // 3. Create commitment
        const title = `Recordatorio: "${text.substring(0, 30)}..."`;

        const { data: commitment, error: commError } = await supabaseAdmin
            .from('commitments')
            .insert({
                owner_user_id: userId,
                message_id: message.id,
                title,
                due_at: parsedDate.date.toISOString(),
            })
            .select()
            .single();

        if (commError) {
            console.error('Error creating commitment', commError);
        } else {
            commitmentCreated = commitment;

            // Create a system message reply acknowledging the commitment
            const formattedDate = format(parsedDate.date, "EEEE d 'de' MMMM 'a las' HH:mm", { locale: es });
            systemReplyText = `Te lo recordaré el ${formattedDate}.`;

            const { data: sysMsg, error: sysError } = await supabaseAdmin
                .from('messages')
                .insert({
                    user_id: userId,
                    text: systemReplyText,
                    meta: { isSystem: true, relatedCommitmentId: commitment.id }
                })
                .select()
                .single();

            if (!sysError) {
                systemMessage = sysMsg;
            }
        }
    }

    return {
        userMessage: message,
        systemMessage,
        commitment: commitmentCreated,
    };
};

export const getMessages = async (userId: string, limit = 50, offset = 0) => {
    const { data, error, count } = await supabaseAdmin
        .from('messages')
        .select('*', { count: 'exact' })
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .range(offset, offset + limit - 1);

    if (error) throw error;
    return { messages: data, count };
};
