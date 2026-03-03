import { supabaseAdmin } from '../lib/supabaseAdmin';
import { extractCommitment, transcribeAudio } from './ai.service';
import { parseDateFromText } from './date-parser.service';
import { format } from 'date-fns';
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

export const processUserMessage = async (userId: string, text: string, conversationId?: string, replyToId?: string) => {
    // 1. Insert original message
    const { data: message, error: messageError } = await supabaseAdmin
        .from('messages')
        .insert({
            user_id: userId,
            sender_id: userId,
            ...(conversationId ? { conversation_id: conversationId } : {}),
            ...(replyToId ? { reply_to_id: replyToId } : {}),
            text,
        })
        .select()
        .single();

    if (messageError) throw messageError;

    // Fetch the message again with joins to ensure frontend gets profiles and reply_to immediately
    const { data: fullMessage } = await supabaseAdmin
        .from('messages')
        .select('*, profiles!sender_id(id, email), reply_to:reply_to_id(id, text, profiles!sender_id(email)), message_reactions(*, profiles:user_id(id, email))')
        .eq('id', message.id)
        .single();

    const finalMessage = fullMessage || message;

    let commitmentCreated: any = null;
    let systemMessage: any = null;

    // 2. Try AI extraction first, fall back to regex
    const nowIso = new Date().toISOString();
    let title: string | null = null;
    let dueAt: Date | null = null;
    let replyText: string | null = null;

    let processingText = text;

    // 2.1 Handle Audio Transcription
    if (text.startsWith('[audio]')) {
        const audioUrl = text.slice(7);
        try {
            const tempFile = path.join(os.tmpdir(), `ping_audio_${Date.now()}.m4a`);
            await downloadFile(audioUrl, tempFile);
            const transcript = await transcribeAudio(tempFile);
            if (transcript) {
                processingText = transcript;
                // Optional: Update message text with transcript? 
                // For now, only use it for extraction context.
            }
            fs.unlinkSync(tempFile);
        } catch (err) {
            console.error('[Audio Processing] Failed:', err);
        }
    }

    if (process.env.OPENAI_API_KEY) {
        // AI path
        const ai = await extractCommitment(processingText, nowIso);
        if (ai.hasCommitment && ai.dueAt) {
            title = ai.title;
            dueAt = new Date(ai.dueAt);
            replyText = ai.replyText;
        }
    } else {
        // Fallback: regex date parser
        const parsed = parseDateFromText(text);
        if (parsed) {
            title = `Recordatorio: "${text.substring(0, 40)}..."`;
            dueAt = parsed.date;
            const formattedDate = format(dueAt, "EEEE d 'de' MMMM 'a las' HH:mm", { locale: es });
            replyText = `⏰ Te lo recordaré el ${formattedDate}.`;
        }
    }

    // 3. Save commitment if detected
    if (dueAt && title) {
        const { data: commitment, error: commError } = await supabaseAdmin
            .from('commitments')
            .insert({
                owner_user_id: userId,
                message_id: message.id,
                title,
                due_at: dueAt.toISOString(),
            })
            .select()
            .single();

        if (commError) {
            console.error('[Commitment] Error:', commError);
        } else {
            commitmentCreated = commitment;

            // 4. Save system reply in the same conversation
            const { data: sysMsg, error: sysError } = await supabaseAdmin
                .from('messages')
                .insert({
                    user_id: userId,
                    sender_id: null,
                    ...(conversationId ? { conversation_id: conversationId } : {}),
                    text: replyText || '✅ Compromiso guardado.',
                    meta: { isSystem: true, relatedCommitmentId: commitment.id }
                })
                .select()
                .single();

            if (!sysError) systemMessage = sysMsg;
        }
    }

    return { userMessage: finalMessage, systemMessage, commitment: commitmentCreated };
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
