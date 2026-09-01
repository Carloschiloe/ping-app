import { supabaseAdmin } from '../lib/supabaseAdmin';
import { extractCommitment, transcribeAudio } from './ai.service';
import { isValid } from 'date-fns';
import { randomUUID } from 'node:crypto';
import path from 'path';
import os from 'os';
import { toLegacyMessageListShape } from '../utils/messageCompat';
import { downloadTrustedStorageFile, removeTemporaryFile } from '../utils/trustedMedia';
import {
    assertConversationParticipant,
    assertConversationParticipantReference,
    assertMessageInConversation,
} from '../utils/authz';
import {
    buildDeterministicCommitmentSuggestion,
    reconcileCommitmentSuggestion,
} from '../utils/deterministicCommitmentSuggestion';
import { validatePrivateFileUploadReference } from './privateFile.service';
import { registerLegacyMessageAttachment } from './attachmentApplication.service';
import {
    persistSystemMessage,
    persistUserMessage,
} from './messagingApplication.service';

export const processUserMessage = async (
    userId: string,
    text: string,
    conversationId?: string,
    replyToId?: string,
    mentionedUserId?: string,
    incomingMeta?: any,
    clientMessageId?: string,
    attachment?: {
        bucket: string;
        objectPath: string;
        mimeType: string;
        fileName: string;
    },
    attachmentId?: string,
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

    if (attachment && attachmentId) {
        throw new Error('Use attachmentId or the legacy attachment payload, not both');
    }

    let canonicalAttachmentId = attachmentId;
    if (attachment) {
        if (!conversationId) throw new Error('Attachments require a conversation');
        const verified = await validatePrivateFileUploadReference(
            userId,
            'message_attachment',
            conversationId,
            attachment.bucket,
            attachment.objectPath
        );
        const safeFileName = attachment.fileName.replace(/[\\/\u0000-\u001f]/g, '_').slice(0, 200);
        meta.attachment = {
            mimeType: verified.mimeType,
            fileName: safeFileName,
            size: verified.size,
        };
        const registered = await registerLegacyMessageAttachment({
            actorUserId: userId,
            conversationId,
            bucket: attachment.bucket,
            objectPath: attachment.objectPath,
            mimeType: verified.mimeType,
            sizeBytes: verified.size,
            originalFilename: safeFileName,
            clientUploadId: clientMessageId || randomUUID(),
            metadata: { compatibility: 'legacy_bucket_path' },
        });
        canonicalAttachmentId = registered.id;
    }

    // 1. Handle Multimedia (Audio/Image/Video/Document)
    if (text.startsWith('[audio]') && !canonicalAttachmentId) {
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

    // Publish a high-confidence local suggestion with the original message.
    // This makes the "Agendar" action immediate; OpenAI may refine the title
    // or type later, but never blocks the first useful UI response.
    const immediateSuggestion = buildDeterministicCommitmentSuggestion(
        processingText,
        new Date()
    );
    if (immediateSuggestion && !meta.suggestedTask) {
        meta.suggestedTask = immediateSuggestion;
    }

    if (!conversationId) {
        throw new Error('A canonical message requires a conversation');
    }

    // El insert del mensaje y el snapshot de receptores quedan en la misma
    // transaccion mediante el trigger canonico de PostgreSQL.
    const persisted = await persistUserMessage({
        actorUserId: userId,
        conversationId,
        content: text,
        replyToId,
        clientMessageId,
        metadata: meta,
        attachmentId: canonicalAttachmentId,
    });
    const message = persisted.message;

    if (persisted.idempotentReplay) return persisted;

    const isCanonicalAudio = Boolean(
        canonicalAttachmentId
        && (
            message?.attachment?.kind === 'audio'
            || String(message?.attachment?.mimeType || '').startsWith('audio/')
        )
    );
    if (isCanonicalAudio) {
        import('./audioTranscriptionWorker.service')
            .then(({ wakeAudioTranscriptionWorker }) => wakeAudioTranscriptionWorker())
            .catch(() => console.error('[AudioWorker] Unable to schedule sweep'));
        return persisted;
    }

    // 3. Trigger Background Analysis (Non-blocking)
    analyzeAndSuggestTask(message.id, processingText, imageUrl, mentionedUserId, conversationId)
        .catch(err => console.error('[Background Analysis Error]', err));

    return persisted;
};

export const analyzeAndSuggestTask = async (
    messageId: string,
    text: string,
    imageUrl?: string,
    mentionedUserId?: string,
    conversationId?: string,
    options: { persist?: boolean } = {},
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
    const deterministicSuggestion = buildDeterministicCommitmentSuggestion(text, new Date(timestamp));
    const isTriggered = !!mentionedUserId || hasKeywords || !!deterministicSuggestion || (imageUrl && text.trim().length > 0);

    // If text is empty and no image, nothing to do
    if (!text && !imageUrl) return null;

    try {
        if (!isTriggered) return null;

        const ai = await extractCommitment(text, timestamp, imageUrl);

        // Una fecha explícita escrita por el usuario es evidencia más fuerte
        // que una fecha generada por IA. La IA puede mejorar el título o tipo,
        // pero no reemplazar "próximo miércoles a las 13:00" por otro día.
        const extractedSuggestion = reconcileCommitmentSuggestion(ai, deterministicSuggestion);

        if (extractedSuggestion?.title && extractedSuggestion.dueAt) {
            const dueDate = new Date(extractedSuggestion.dueAt);
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
                title: extractedSuggestion.title,
                dueAt: extractedSuggestion.dueAt,
                assignedToUserId: finalAssigneeId,
                replyText: 'Agendar',
                type: extractedSuggestion.type,
            };

            if (options.persist === false) return suggestedTask;

            console.info(`[AI] Saving a suggestion for message ${messageId}`);

            const { error: mergeError } = await supabaseAdmin.rpc('merge_message_suggested_task', {
                p_message_id: messageId,
                p_suggested_task: suggestedTask,
            });
            if (mergeError) throw mergeError;

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
        .select('*, message_receipts(*)', { count: 'exact' })
        .eq('sender_id', userId)
        .order('created_at', { ascending: false })
        .range(offset, offset + limit - 1);

    if (error) throw error;
    return { messages: toLegacyMessageListShape(data, userId), count };
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
    try {
        return await persistSystemMessage({
            conversationId,
            content: text,
            senderUserId: userId,
            metadata: extraMeta,
            systemEventType,
        });
    } catch (error) {
        console.error('[System Message] Error inserting');
        return null;
    }
};
