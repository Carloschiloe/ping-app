import OpenAI from 'openai';
import fs from 'fs';
import { supabaseAdmin } from '../lib/supabaseAdmin';
import { transcribeAudio } from './transcription.service';
import { extractCommitment } from './commitment.service';

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

/**
 * Processes a completed call recording.
 */
export const processCallRecording = async (callId: string): Promise<void> => {
    try {
        console.log(`[Call Processing] Starting: ${callId}`);

        // 1. Get call details
        const { data: call, error: fetchErr } = await supabaseAdmin
            .from('calls')
            .select('*')
            .eq('id', callId)
            .single();

        if (fetchErr || !call) throw new Error('Call not found');

        // 2. Wait for Agora to finish uploading with retry logic
        let files: any[] = [];
        let attempts = 0;
        const maxAttempts = 3;
        const delayMs = 30000;

        const channelName = (call.meta?.channelName || call.conversation_id).replace(/-/g, '');
        const prefix = `calls/${channelName}`;

        while (attempts < maxAttempts) {
            attempts++;
            const { data: foundFiles, error: listErr } = await supabaseAdmin.storage
                .from('recordings')
                .list(prefix, { sortBy: { column: 'created_at', order: 'desc' }, limit: 10 });

            if (!listErr && foundFiles && foundFiles.length > 0) {
                const mediaFiles = foundFiles.filter(f => f.name.endsWith('.mp4') || f.name.endsWith('.m4a') || f.name.endsWith('.ts') || f.name.endsWith('.aac'));
                if (mediaFiles.length > 0) {
                    files = foundFiles;
                    break;
                }
            }
            if (attempts < maxAttempts) await new Promise(resolve => setTimeout(resolve, delayMs));
        }

        if (files.length === 0) {
            await supabaseAdmin.from('calls').update({ status: 'no_recording' }).eq('id', callId);
            return;
        }

        const recordingFile = files.find(f => f.name.endsWith('.mp4') || f.name.endsWith('.m4a') || f.name.endsWith('.ts'));
        if (!recordingFile) return;

        const fullPath = `${prefix}/${recordingFile.name}`;
        const { data: fileBlob, error: downloadErr } = await supabaseAdmin.storage.from('recordings').download(fullPath);

        if (downloadErr || !fileBlob) throw new Error(`Download failed: ${downloadErr?.message}`);

        const tmpPath = `/tmp/${callId}_${recordingFile.name}`;
        const buffer = Buffer.from(await fileBlob.arrayBuffer());
        fs.writeFileSync(tmpPath, buffer);

        // 4. Transcribe
        const transcript = await transcribeAudio(tmpPath);
        if (fs.existsSync(tmpPath)) fs.unlinkSync(tmpPath);

        if (!transcript) return;

        // 5. Summarize
        const summaryPrompt = `Analiza esta transcripción de una llamada de voz/video y genera un resumen ejecutivo.
Identifica también cualquier compromiso o tarea acordada.

Transcripción:
"${transcript}"`;

        const summaryResponse = await openai.chat.completions.create({
            model: 'gpt-4o',
            messages: [{ role: 'user', content: summaryPrompt }],
            temperature: 0.3,
        });

        const summary = summaryResponse.choices[0]?.message?.content || 'Sin resumen.';
        const nowIso = new Date().toISOString();
        const extraction = await extractCommitment(transcript, nowIso);

        // 6. Update Call Record
        await supabaseAdmin.from('calls').update({
            transcript,
            summary,
            status: 'processed'
        }).eq('id', callId);

        // 7. Post to chat
        const summaryMessage = `📞 **Resumen de la llamada**\n\n${summary}`;
        const { data: msgData } = await supabaseAdmin.from('messages').insert({
            conversation_id: call.conversation_id,
            user_id: call.meta?.callerId,
            text: summaryMessage,
            meta: { is_ai_summary: true, callId }
        }).select().single();

        if (extraction.hasCommitment && msgData) {
            await supabaseAdmin.from('commitments').insert({
                title: extraction.title,
                due_at: extraction.dueAt,
                assigned_to_user_id: call.conversation_id, 
                message_id: msgData.id,
                status: 'pending'
            });
        }
    } catch (err) {
        console.error('[Call Processing] Failed:', err);
    }
};
