import { z } from 'zod';

export const createCommitmentSchema = z.object({
    body: z.object({
        title: z.string().min(3).max(255),
        due_at: z.string().datetime().optional().nullable(),
        message_id: z.string().uuid().optional().nullable(),
        assigned_to_user_id: z.string().uuid().optional().nullable(),
        group_conversation_id: z.string().uuid().optional().nullable(),
        is_group_task: z.boolean().optional(),
        priority: z.string().optional().nullable(),
        status: z.string().optional().nullable(),
        meta: z.record(z.string(), z.any()).optional().nullable(),
    })
});

export const updateCommitmentSchema = z.object({
    params: z.object({
        id: z.string().uuid(),
    }),
    body: z.object({
        title: z.string().min(3).max(255).optional(),
        due_at: z.string().datetime().optional().nullable(),
        status: z.string().optional().nullable(),
        assigned_to_user_id: z.string().uuid().optional().nullable(),
        rejection_reason: z.string().optional().nullable(),
        proposed_due_at: z.string().datetime().optional().nullable(),
        meta: z.record(z.string(), z.any()).optional().nullable(),
    })
});
