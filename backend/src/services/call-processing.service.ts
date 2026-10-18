import OpenAI from 'openai';
import fs from 'fs';
import { supabaseAdmin } from '../lib/supabaseAdmin';
import { transcribeAudio } from './transcription.service';
import { extractCommitment } from './commitment.service';
import { isLegacySatelliteWriterEnabled } from '../middleware/featureGate';
import { createProposal } from './commitmentApplication.service';
import { persistSystemMessage } from './messagingApplication.service';

let openai: OpenAI | null = null;
function getOpenAiClient(): OpenAI {
    const apiKey = process.env.OPENAI_API_KEY?.trim();
    if (!apiKey) throw new Error('OPENAI_API_KEY is not configured');
    if (!openai) openai = new OpenAI({ apiKey });
    return openai;
}

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

        const summaryResponse = await getOpenAiClient().chat.completions.create({
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

        if (!isLegacySatelliteWriterEnabled('ENABLE_CALLS')) {
            console.info('[Call Processing] Legacy Calls writers are disabled; call processing stopped before chat/commitment writes');
            return;
        }

        // 7. Persist the call summary through the canonical messaging adapter.
        // An AI extraction is only a proposal: it must never create a
        // confirmed Commitment without the user's explicit confirmation.
        const callerId = typeof call.meta?.callerId === 'string' ? call.meta.callerId : null;
        const summaryMessage = \`📞 **Resumen de la llamada**\\n\\n\${summary}\`;
        const summaryRecord = await persistSystemMessage({
            conversationId: call.conversation_id,
            senderUserId: callerId || undefined,
            content: summaryMessage,
            metadata: { is_ai_summary: true, callId },
            systemEventType: 'call_summary',
        });

        if (extraction.hasCommitment && callerId && summaryRecord?.id) {
            try {
                await createProposal(callerId, {
                    title: extraction.title || 'Compromiso detectado en llamada',
                    due_at: extraction.dueAt,
                    type: extraction.type,
                    conversation_id: call.conversation_id,
                    message_id: summaryRecord.id,
                    source_kind: 'ai_suggestion',
                });
            } catch (proposalError) {
                // The summary remains durable even if proposal creation has a
                // transient failure. No direct Commitment write is allowed.
                console.error('[Call Processing] Commitment proposal failed:', proposalError);
            }
        }
    } catch (err) {
        console.error('[Call Processing] Failed:', err);
    }
};
