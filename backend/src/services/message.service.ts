import { supabaseAdmin } from '../lib/supabaseAdmin';
import { extractCommitment, transcribeAudio } from './ai.service';
import { isValid } from 'date-fns';
import { randomUUID } from 'node:crypto';
import path from 'path';
import os from 'os';
import { downloadTrustedStorageFile, removeTemporaryFile } from '../utils/trustedMedia';
import {
    assertConversationParticipant,
    assertConversationParticipantReference,
    assertMessageInConversation,
} from '../utils/authz';
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
    analyzeAndSuggestTask(
        message.id,
        processingText,
        imageUrl,
        mentionedUserId,
        conversationId,
        { timeZone: meta.clientTimeZone },
    )
        .catch(err => console.error('[Background Analysis Error]', err));

    return persisted;
};

export const analyzeAndSuggestTask = async (
    messageId: string,
    text: string,
    imageUrl?: string,
    mentionedUserId?: string,
    conversationId?: string,
    options: { persist?: boolean; timeZone?: string | null } = {},
) => {
    const timestamp = new Date().toISOString();
    // La IA lee cada mensaje con texto o imagen y decide si hay un
    // compromiso; no hay lista de palabras que filtre antes.
    if (!text.trim() && !imageUrl) return null;

    try {
        const ai = await extractCommitment(text, timestamp, imageUrl, options.timeZone);

        if (ai.hasCommitment && ai.title && ai.dueAt) {
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
                replyText: 'Agendar',
                type: ai.type,
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
