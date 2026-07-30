import { z } from 'zod';

export const createInvitationSchema = z.object({
    body: z.object({
        inviteeEmail: z.string().trim().email().max(254),
    }),
});

export const acceptInvitationSchema = z.object({
    body: z.object({
        token: z.string().trim().min(20).max(1000),
    }),
});
