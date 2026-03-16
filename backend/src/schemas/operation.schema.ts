import { z } from 'zod';

export const updateConversationModeSchema = z.object({
    params: z.object({
        id: z.string().uuid(),
    }),
    body: z.object({
        mode: z.enum(['chat', 'operation']),
    }),
});

export const setPinnedMessageSchema = z.object({
    params: z.object({
        id: z.string().uuid(),
    }),
    body: z.object({
        messageId: z.string().uuid().nullable(),
    }),
});

export const setActiveCommitmentSchema = z.object({
    params: z.object({
        id: z.string().uuid(),
    }),
    body: z.object({
        commitmentId: z.string().uuid().nullable(),
    }),
});

export const saveChecklistSchema = z.object({
    params: z.object({
        id: z.string().uuid(),
    }),
    body: z.object({
        title: z.string().min(2).max(120),
        items: z.array(z.string().min(1).max(160)).min(1).max(12),
    }),
});

export const toggleChecklistItemSchema = z.object({
    params: z.object({
        id: z.string().uuid(),
    }),
    body: z.object({
        is_checked: z.boolean(),
    }),
});

export const createShiftReportSchema = z.object({
    params: z.object({
        id: z.string().uuid(),
    }),
    body: z.object({
        body: z.string().min(3).max(4000),
        source: z.enum(['text', 'audio']).optional(),
        meta: z.record(z.string(), z.any()).optional().nullable(),
    }),
});

export const commitmentOperationActionSchema = z.object({
    params: z.object({
        id: z.string().uuid(),
    }),
    body: z.object({
        action: z.enum(['acknowledged', 'arrived', 'completed']),
        location_message_id: z.string().uuid().optional().nullable(),
    }),
});
