import { z } from 'zod';

export const deleteAccountSchema = z.object({
    body: z.object({
        // The app asks the person to type this word, so a stray tap or a
        // replayed request without it never erases an account.
        confirm: z.literal('ELIMINAR'),
    }),
});

export const blockSchema = z.object({
    params: z.object({ userId: z.string().uuid() }),
});

export const chatBlockSchema = z.object({
    params: z.object({ id: z.string().uuid() }),
});

export const reportSchema = z.object({
    body: z.object({
        kind: z.enum(['user', 'message', 'assistant']),
        reason: z.enum(['spam', 'abuse', 'inappropriate', 'false', 'other']),
        details: z.string().max(1000).optional().nullable(),
        reportedUserId: z.string().uuid().optional().nullable(),
        conversationId: z.string().uuid().optional().nullable(),
        messageId: z.string().uuid().optional().nullable(),
        excerpt: z.string().max(2000).optional().nullable(),
        alsoBlock: z.boolean().optional(),
    }),
});

export const feedbackSchema = z.object({
    body: z.object({
        kind: z.enum(['idea', 'problem', 'other']),
        message: z.string().trim().min(1).max(2000),
        appVersion: z.string().max(40).optional().nullable(),
        platform: z.string().max(20).optional().nullable(),
    }),
});
