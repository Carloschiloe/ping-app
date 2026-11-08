import { z } from 'zod';

const version = z.string().trim().max(40).optional().nullable();

export const helloSchema = z.object({
    body: z.object({
        installId: z.string().regex(/^[A-Za-z0-9_-]{8,64}$/),
        platform: z.enum(['android', 'ios', 'web', 'other']),
        appVersion: version,
        osVersion: version,
    }),
});

export const appErrorSchema = z.object({
    body: z.object({
        title: z.string().trim().min(1).max(200),
        detail: z.string().max(2000).optional().nullable(),
        location: z.string().max(200).optional().nullable(),
        appVersion: version,
        platform: z.string().max(20).optional().nullable(),
    }),
});
