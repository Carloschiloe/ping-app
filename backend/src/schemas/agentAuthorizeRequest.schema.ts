import { z } from 'zod';

// M-4 — POST /agent/authorize request body. Deliberately NEVER accepts an
// arbitrary tool payload or a raw plan JSON (sección 3/9/74) — only the
// digest the client received from a genuine POST /agent/plan call, plus
// which steps to authorize and an explicit confirmation gesture. Same
// discipline as agentRequest.schema.ts/agentPlanRequest.schema.ts:
// actorUserId is never declared here — always req.user.id.
export const agentAuthorizeRequestSchema = z.object({
    body: z.object({
        input: z.string().trim().min(1).max(2000),
        conversationId: z.string().uuid().optional(),
        channel: z.string().trim().max(40).optional(),
        locale: z.string().trim().max(20).optional(),
        timezone: z.string().trim().max(60).optional(),
        planDigest: z.string().trim().length(64), // sha256 hex
        stepIds: z.array(z.string().trim().min(1).max(80)).min(1).max(8),
        confirm: z.literal(true),
        strongConfirm: z.boolean().optional(),
    }),
});
