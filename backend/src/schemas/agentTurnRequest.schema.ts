import { z } from 'zod';

// M-6 — POST /agent/turn request body.
// Same discipline as agentRequest.schema.ts: actorUserId/userId/tenantId
// never declared — the only real identity is req.user.id (requireAuth).
export const agentTurnRequestSchema = z.object({
    body: z.object({
        input: z.string().trim().min(1).max(2000).optional(),
        voiceInputToken: z.string().min(20).max(24000).optional(),
        conversationId: z.string().uuid().optional(),
        channel: z.string().trim().max(40).optional(),
        locale: z.string().trim().max(20).optional(),
        timezone: z.string().trim().max(60).optional(),
    }).superRefine((body, context) => {
        if (Boolean(body.input) === Boolean(body.voiceInputToken)) {
            context.addIssue({ code: z.ZodIssueCode.custom, message: 'Provide exactly one of input or voiceInputToken' });
        }
        if (body.voiceInputToken && (body.conversationId || body.channel || body.locale || body.timezone)) {
            context.addIssue({ code: z.ZodIssueCode.custom, message: 'Voice context is bound to the signed voice input token' });
        }
    }),
});