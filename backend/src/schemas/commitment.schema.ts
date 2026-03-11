import { z } from 'zod';

export const createCommitmentSchema = z.object({
    body: z.object({
        title: z.string().min(3).max(255),
        dueAt: z.string().datetime().optional().nullable(),
        message_id: z.string().uuid().optional().nullable(),
        assignedToUserId: z.string().uuid().optional().nullable(),
        groupConversationId: z.string().uuid().optional().nullable(),
        isGroupTask: z.boolean().optional(),
        meta: z.record(z.any()).optional().nullable(),
    })
});

export const updateCommitmentSchema = z.object({
    params: z.object({
        id: z.string().uuid(),
    }),
    body: z.object({
        title: z.string().min(3).max(255).optional(),
        dueAt: z.string().datetime().optional().nullable(),
        status: z.enum(['pending', 'accepted', 'rejected', 'completed', 'postponed', 'proposed', 'counter_proposal']).optional(),
        assignedToUserId: z.string().uuid().optional().nullable(),
        rejectionReason: z.string().optional().nullable(),
        proposedDueAt: z.string().datetime().optional().nullable(),
        meta: z.record(z.any()).optional().nullable(),
    })
});
