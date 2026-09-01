import { z } from 'zod';

const id = z.string().uuid();

export const createUploadIntentSchema = z.object({
    body: z.object({
        conversationId: id,
        mimeType: z.string().min(1).max(100),
        originalFilename: z.string().min(1).max(200),
        clientUploadId: id,
        durationMs: z.number().int().positive().max(14_400_000).optional(),
        metadata: z.record(z.string(), z.any()).optional(),
    }),
});

export const attachmentIdSchema = z.object({
    params: z.object({ id }),
});
