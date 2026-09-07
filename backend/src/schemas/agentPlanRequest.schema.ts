import { z } from 'zod';

// M-3 — POST /agent/plan request body. Same discipline as
// agentRequest.schema.ts: `actorUserId`/`userId`/`tenantId` deliberately
// never declared — the only real identity is `req.user.id` (requireAuth),
// never the body.
export const agentPlanRequestSchema = z.object({
    body: z.object({
        input: z.string().trim().min(1).max(2000),
        conversationId: z.string().uuid().optional(),
        channel: z.string().trim().max(40).optional(),
        locale: z.string().trim().max(20).optional(),
        timezone: z.string().trim().max(60).optional(),
    }),
});
