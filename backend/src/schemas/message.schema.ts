import { z } from 'zod';

export const sendMessageSchema = z.object({
    params: z.object({
        id: z.string().uuid(),
    }),
    body: z.object({
        text: z.string().trim().min(1).max(4000),
        reply_to_id: z.string().uuid().optional().nullable(),
        mentioned_user_id: z.string().uuid().optional().nullable(),
        client_message_id: z.string().uuid().optional(),
        attachmentId: z.string().uuid().optional().nullable(),
        meta: z.record(z.string(), z.any()).optional().nullable(),
        attachment: z.object({
            bucket: z.literal('chat-media'),
            objectPath: z.string().min(1).max(500),
            mimeType: z.string().min(1).max(100),
            fileName: z.string().min(1).max(200),
        }).optional().nullable(),
    }).refine((body) => !(body.attachmentId && body.attachment), {
        message: 'Use attachmentId or the legacy attachment payload, not both',
        path: ['attachmentId'],
    })
});

// The legacy self-chat adapter has no conversation id in its URL, so it needs
// its own body contract instead of bypassing validation entirely.
export const createLegacyMessageSchema = z.object({
    body: z.object({
        text: z.string().trim().min(1).max(4000),
        reply_to_id: z.string().uuid().optional().nullable(),
    }),
});
