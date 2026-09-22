import { z } from 'zod';

// M-6 — POST /agent/turn request body.
// Same discipline as agentRequest.schema.ts: actorUserId/userId/tenantId
// never declared — the only real identity is req.user.id (requireAuth).
export const agentTurnRequestSchema = z.object({
    body: z.object({
        input: z.string().trim().min(1).max(2000).optional(),
        voiceInputToken: z.string().min(20).max(24000).optional(),
        reviewedVoiceInputToken: z.string().min(20).max(24000).optional(),
        conversationId: z.string().uuid().optional(),
        channel: z.string().trim().max(40).optional(),
        locale: z.string().trim().max(20).optional(),
        timezone: z.string().trim().max(60).optional(),
        readCapability: z.string().trim().max(80).optional(),
    }).superRefine((body, context) => {
        if (body.voiceInputToken && (body.input || body.reviewedVoiceInputToken)) {
            context.addIssue({ code: z.ZodIssueCode.custom, message: 'A fresh voice token cannot be combined with text or a reviewed voice token' });
        } else if (body.reviewedVoiceInputToken && !body.input) {
            context.addIssue({ code: z.ZodIssueCode.custom, message: 'Reviewed voice input requires the reviewed transcript text' });
        } else if (!body.input && !body.voiceInputToken) {
            context.addIssue({ code: z.ZodIssueCode.custom, message: 'Provide input, voiceInputToken, or reviewedVoiceInputToken with input' });
        }
        if (body.voiceInputToken && (body.conversationId || body.channel || body.locale || body.timezone)) {
            context.addIssue({ code: z.ZodIssueCode.custom, message: 'Voice context is bound to the signed voice input token' });
        }
        if (body.reviewedVoiceInputToken && (body.conversationId || body.channel || body.locale || body.timezone)) {
            context.addIssue({ code: z.ZodIssueCode.custom, message: 'Reviewed voice context is bound to the signed voice input token' });
        }
    }),
});
