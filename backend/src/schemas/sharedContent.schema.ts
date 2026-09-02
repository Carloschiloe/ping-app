import { z } from 'zod';

export const getSharedContentSchema = z.object({
    params: z.object({ id: z.string().uuid() }),
    query: z.object({
        category: z.enum(['summary', 'visual', 'audio', 'document', 'link']).default('summary'),
        kind: z.enum(['image', 'video']).optional(),
        cursor: z.string().min(1).max(500).optional(),
        limit: z.coerce.number().int().min(1).max(100).default(30),
    }).refine((query) => !query.kind || query.category === 'visual', {
        message: 'kind is only available for visual shared content',
        path: ['kind'],
    }),
});
