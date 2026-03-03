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
    // 1. Determine if it moves to transcription first
    let processingText = text;
    let meta: any = {};

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
    }

    // 2. Insert message
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

    // Fetch the message again with joins
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
        const parsed = parseDateFromText(processingText);
        if (parsed) {
            title = `Recordatorio: "${processingText.substring(0, 40)}..."`;
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
                title,
                due_at: dueAt.toISOString(),
                status: 'pending',
                source_message_id: message.id
            })
            .select()
            .single();

        if (commError) {
            console.error('Error creating commitment:', commError);
        } else {
            commitmentCreated = commitment;

            // --- Phase 15: Autonomous Sync ---
            let syncNotice = '';
            try {
                const { syncCommitmentToCloud } = require('./calendar_sync.service');
                const syncResults = await syncCommitmentToCloud(userId, commitment);

                if (syncResults && syncResults.length > 0) {
                    const hasConflict = syncResults.some((r: any) => r.hasConflict);
                    if (hasConflict) {
                        syncNotice = '\n\n⚠️ ¡Ojo! Tienes otro evento a esa misma hora en tu calendario.';
                    } else {
                        syncNotice = '\n\n🌐 Sincronizado automáticamente con tu nube.';
                    }
                }
            } catch (syncErr) {
                console.error('[Auto-Sync Trigger] Error:', syncErr);
            }
            // ----------------------------------

            // Send reply if we have a title
            if (replyText) {
                const { data: sysMsg } = await supabaseAdmin
                    .from('messages')
                    .insert({
                        conversation_id: conversationId,
                        user_id: userId,
                        sender_id: userId,
                        text: replyText + syncNotice,
                        meta: { isSystem: true, related_commitment_id: commitment.id }
                    })
                    .select('*, profiles!sender_id(id, email)')
                    .single();
                systemMessage = sysMsg;
            }
        }
    }

    return { message: finalMessage, commitment: commitmentCreated, systemMessage };
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
