import { supabaseAdmin } from '../lib/supabaseAdmin';
import { extractCommitment, transcribeAudio } from './ai.service';
import { parseDateFromText } from './date-parser.service';
import { format, isValid } from 'date-fns';
import { es } from 'date-fns/locale';
import axios from 'axios';
import fs from 'fs';
import path from 'path';
import os from 'os';

async function downloadFile(url: string, targetPath: string) {
    const writer = fs.createWriteStream(targetPath);
    const response = await axios({
        url,
        method: 'GET',
        responseType: 'stream'
    });
    response.data.pipe(writer);
    return new Promise((resolve, reject) => {
        writer.on('finish', resolve);
        writer.on('error', reject);
    });
}

export const processUserMessage = async (userId: string, text: string, conversationId?: string, replyToId?: string, mentionedUserId?: string) => {
    let processingText = text;
    let meta: any = {};
    let imageUrl: string | undefined;

    // 1. Handle Multimedia (Audio/Image)
    if (text.startsWith('[audio]')) {
        const audioUrl = text.slice(7);
        try {
            const tempFile = path.join(os.tmpdir(), `ping_audio_${Date.now()}.m4a`);
            await downloadFile(audioUrl, tempFile);
            const transcript = await transcribeAudio(tempFile);
            if (transcript) {
                processingText = transcript;
                meta.transcript = transcript;
            }
            fs.unlinkSync(tempFile);
        } catch (err) {
            console.error('[Audio Processing] Failed:', err);
        }
    } else if (text.startsWith('[imagen]')) {
        const parts = text.split(' ');
        imageUrl = parts[0].slice(8);
        const description = parts.slice(1).join(' ');
        processingText = description;
    }

    // 2. Insert message immediately
    const { data: message, error: messageError } = await supabaseAdmin
        .from('messages')
        .insert({
            user_id: userId,
            sender_id: userId,
            ...(conversationId ? { conversation_id: conversationId } : {}),
            ...(replyToId ? { reply_to_id: replyToId } : {}),
            text,
            meta,
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
        .select('*, profiles!sender_id(id, email, full_name, avatar_url), reply_to:reply_to_id(id, text, profiles!sender_id(email)), message_reactions(*, profiles:user_id(id, email))')
        .eq('id', message.id)
        .single();

    return { message: fullMessage || message };
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
                const { data: participants } = await supabaseAdmin
                    .from('conversation_participants')
                    .select('user_id, profiles!inner(full_name)')
                    .eq('conversation_id', conversationId);

                const match = (participants || []).find((p: any) => {
                    const name = (p.profiles?.full_name || '').toLowerCase();
                    const detected = ai.assignedToName!.toLowerCase();
                    return name.includes(detected) || detected.includes(name.split(' ')[0]);
                });
                if (match) finalAssigneeId = match.user_id;
            }

            const suggestedTask = {
                title: ai.title,
                dueAt: ai.dueAt,
                assignedToUserId: finalAssigneeId,
                replyText: ai.replyText
            };

            console.log(`[AI] Saving suggestion to message ${messageId}: ${ai.title}`);

            // Fetch current meta to avoid overwriting (e.g. transcript or image info)
            const { data: currentMsg } = await supabaseAdmin
                .from('messages')
                .select('meta')
                .eq('id', messageId)
                .single();

            const updatedMeta = {
                ...(currentMsg?.meta || {}),
                suggestedTask
            };

            const { data: updated } = await supabaseAdmin
                .from('messages')
                .update({ meta: updatedMeta })
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
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .range(offset, offset + limit - 1);

    if (error) throw error;
    return { messages: data, count };
};
