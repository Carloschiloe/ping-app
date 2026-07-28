import { supabaseAdmin } from '../lib/supabaseAdmin';
import { extractCommitment, transcribeAudio } from './ai.service';
import { parseDateFromText } from './date-parser.service';
import { format, isValid } from 'date-fns';
import { es } from 'date-fns/locale';
import path from 'path';
import os from 'os';
import { toLegacyMessageShape, toLegacyMessageListShape } from '../utils/messageCompat';
import { downloadTrustedStorageFile, removeTemporaryFile } from '../utils/trustedMedia';
import {
    assertConversationParticipant,
    assertConversationParticipantReference,
    assertMessageInConversation,
} from '../utils/authz';

export const processUserMessage = async (
    userId: string,
    text: string,
    conversationId?: string,
    replyToId?: string,
    mentionedUserId?: string,
    incomingMeta?: any
) => {
    if (conversationId) {
        await assertConversationParticipant(userId, conversationId);
        if (replyToId) {
            await assertMessageInConversation(replyToId, conversationId);
        }
        if (mentionedUserId) {
            await assertConversationParticipantReference(mentionedUserId, conversationId);
        }
    } else if (replyToId || mentionedUserId) {
        throw new Error('Replies and mentions require a conversation');
    }

    let processingText = text;
    let meta: any = incomingMeta ? { ...incomingMeta } : {};
    let imageUrl: string | undefined;

    // 1. Handle Multimedia (Audio/Image/Video/Document)
    if (text.startsWith('[audio]')) {
        const audioUrl = text.slice(7);
        let tempFile: string | undefined;
        try {
            tempFile = path.join(os.tmpdir(), `ping_audio_${Date.now()}_${userId}.m4a`);
            await downloadTrustedStorageFile(audioUrl, tempFile);
            const transcript = await transcribeAudio(tempFile);
            if (transcript) {
                processingText = transcript;
                meta.transcript = transcript;
            }
        } catch (err) {
            console.warn('[Audio Processing] Rejected or failed');
        } finally {
            await removeTemporaryFile(tempFile);
        }
    } else if (text.startsWith('[imagen]')) {
        const parts = text.split(' ');
        imageUrl = parts[0].slice(8);
        const description = parts.slice(1).join(' ');
        processingText = description;
    } else if (text.startsWith('[video]')) {
        const parts = text.split(' ');
        imageUrl = parts[0].slice(7); // Use imageUrl even for video to provide context to AI (GPT-4o can handle it or we use it as key)
        const description = parts.slice(1).join(' ');
        processingText = description;
    } else if (text.startsWith('[document=')) {
        const match = text.match(/^\[document=([^\]]+)\]([^\s]+)(.*)$/);
        if (match) {
            const docName = match[1];
            const docUrl = match[2];
            const description = (match[3] || '').trim();
            processingText = description || `Documento: ${docName}`;
        }
    }

    // 2. Insert message immediately
    // V2: messages usa content/metadata (no text/meta) y sender_id unicamente
    // (no user_id, columna eliminada en el esquema V2).
    const { data: message, error: messageError } = await supabaseAdmin
        .from('messages')
        .insert({
            sender_id: userId,
            ...(conversationId ? { conversation_id: conversationId } : {}),
            ...(replyToId ? { reply_to_id: replyToId } : {}),
            content: text,
            metadata: meta,
        })
        .select()
        .single();

    if (messageError) throw messageError;

    // 3. Trigger Background Analysis (Non-blocking)
    analyzeAndSuggestTask(message.id, processingText, imageUrl, mentionedUserId, conversationId)
        .catch(err => console.error('[Background Analysis Error]', err));

    // Fetch message with joins for response
    const { data: fullMessage } = await supabaseAdmin
        .from('messages')
        .select('*, profiles!sender_id(id, email, full_name, avatar_url), reply_to:reply_to_id(id, content, profiles!sender_id(email)), message_reactions(*, profiles:user_id(id, email))')
        .eq('id', message.id)
        .single();

    return { message: toLegacyMessageShape(fullMessage) || toLegacyMessageShape(message) };
};

export const analyzeAndSuggestTask = async (
    messageId: string,
    text: string,
    imageUrl?: string,
    mentionedUserId?: string,
    conversationId?: string
) => {
    const timestamp = new Date().toISOString();
    // Smart Triggers: detect natural language indicators for tasks or schedules
    const taskKeywords = [
        'agenda', 'tarea', 'hacer', 'reunion', 'reunión', 'recordar', 'mañana', 'lunes', 'martes', 'miercoles',
        'miércoles', 'jueves', 'viernes', 'sabado', 'sábado', 'domingo', 'hoy', 'tienes', 'tengo', 'cita',
        'mantencion', 'mantención', 'llamado', 'llamar', 'enviar', 'pago', 'pagar', 'vence', 'vencimiento',
        'reunamos', 'vemos', 'juntamos', 'juntémonos'
    ];
    const hasKeywords = new RegExp(`\\b(${taskKeywords.join('|')})\\b`, 'i').test(text);
    const isTriggered = !!mentionedUserId || hasKeywords || (imageUrl && text.trim().length > 0);

    // If text is empty and no image, nothing to do
    if (!text && !imageUrl) return null;

    try {
        const ai = await extractCommitment(text, timestamp, imageUrl);

        if (ai.hasCommitment && ai.dueAt) {
            const dueDate = new Date(ai.dueAt);
            if (!isValid(dueDate)) return null;

            let finalAssigneeId = mentionedUserId || null;
            if (!finalAssigneeId && ai.assignedToName && conversationId) {
                // Fetch ALL participants to ensure we match even if they haven't spoken recently
                const { data: participants } = await supabaseAdmin
                    .from('conversation_participants')
                    .select('user_id, profiles!inner(full_name, email)')
                    .eq('conversation_id', conversationId);

                const detected = ai.assignedToName!.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");

                const match = (participants || []).find((p: any) => {
                    const fullName = (p.profiles?.full_name || '').toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
                    const emailPrefix = (p.profiles?.email || '').split('@')[0].toLowerCase();

                    return fullName.includes(detected) ||
                        detected.includes(fullName.split(' ')[0]) ||
                        emailPrefix.includes(detected);
                });

                if (match) {
                    finalAssigneeId = match.user_id;
                    console.log(`[AI] Matched assignee "${ai.assignedToName}" to user_id: ${finalAssigneeId}`);
                }
            }

            const suggestedTask = {
                title: ai.title,
                dueAt: ai.dueAt,
                assignedToUserId: finalAssigneeId,
                replyText: ai.replyText
            };

            console.info(`[AI] Saving a suggestion for message ${messageId}`);

            // Fetch current metadata to avoid overwriting (e.g. transcript or image info)
            const { data: currentMsg } = await supabaseAdmin
                .from('messages')
                .select('metadata')
                .eq('id', messageId)
                .single();

            const updatedMetadata = {
                ...(currentMsg?.metadata || {}),
                suggestedTask
            };

            const { data: updated } = await supabaseAdmin
                .from('messages')
                .update({ metadata: updatedMetadata })
                .eq('id', messageId)
                .select()
                .single();

            return suggestedTask;
        }
    } catch (err) {
        console.error('[AI Analysis] Failed:', err);
    }
    return null;
};

export const getMessages = async (userId: string, limit = 50, offset = 0) => {
    const { data, error, count } = await supabaseAdmin
        .from('messages')
        .select('*', { count: 'exact' })
        .eq('sender_id', userId)
        .order('created_at', { ascending: false })
        .range(offset, offset + limit - 1);

    if (error) throw error;
    return { messages: toLegacyMessageListShape(data), count };
};

// V2: mensajes sin remitente humano deben etiquetarse con system_event_type
// (constraint messages_origin_check). systemEventType tiene un default para
// no romper llamadas existentes (ej. operation.service.ts, fuera de alcance
// de esta fase) que todavia invocan esta funcion con la firma anterior.
export const insertSystemMessage = async (
    conversationId: string,
    text: string,
    userId?: string,
    extraMeta: any = {},
    systemEventType: string = 'system_notice'
) => {
    const { data, error } = await supabaseAdmin
        .from('messages')
        .insert({
            conversation_id: conversationId,
            sender_id: userId || null,
            content: text,
            metadata: { isSystem: true, ...extraMeta },
            system_event_type: systemEventType,
            status: 'sent'
        })
        .select()
        .single();

    if (error) {
        console.error('[System Message] Error inserting:', error);
        return null;
    }
    return toLegacyMessageShape(data);
};
