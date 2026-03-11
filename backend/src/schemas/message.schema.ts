import { z } from 'zod';

export const sendMessageSchema = z.object({
    params: z.object({
        id: z.string().uuid(),
    }),
    body: z.object({
        text: z.string().min(1),
        reply_to_id: z.string().uuid().optional().nullable(),
        mentioned_user_id: z.string().uuid().optional().nullable(),
        meta: z.record(z.string(), z.any()).optional().nullable(),
    })
});
