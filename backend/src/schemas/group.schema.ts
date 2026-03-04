import { z } from 'zod';

export const createGroupSchema = z.object({
    body: z.object({
        name: z.string().min(1, 'Group name is required'),
        participantIds: z.array(z.string().uuid()),
        avatarUrl: z.string().url().optional().nullable()
    })
});

export const addParticipantsSchema = z.object({
    params: z.object({
        id: z.string().uuid()
    }),
    body: z.object({
        newParticipantIds: z.array(z.string().uuid())
    })
});

export const updateGroupSchema = z.object({
    params: z.object({
        id: z.string().uuid()
    }),
    body: z.object({
        name: z.string().min(1).optional(),
        avatar_url: z.string().url().optional().nullable()
    })
});

export const deleteGroupSchema = z.object({
    params: z.object({
        id: z.string().uuid()
    })
});
