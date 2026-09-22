import { z } from 'zod';

// M-4 — POST /agent/authorize request body. Deliberately NEVER accepts an
// arbitrary tool payload or a raw plan JSON (sección 3/9/74) — only the
// digest the client received from a genuine POST /agent/plan call, plus
// which steps to authorize and an explicit confirmation gesture. Same
// discipline as agentRequest.schema.ts/agentPlanRequest.schema.ts:
// actorUserId is never declared here — always req.user.id.
export const agentAuthorizeRequestSchema = z.object({
    body: z.object({
        input: z.string().trim().min(1).max(2000).optional(),
        voiceInputToken: z.string().min(20).max(24000).optional(),
        reviewedVoiceInputToken: z.string().min(20).max(24000).optional(),
        conversationId: z.string().uuid().optional(),
        channel: z.string().trim().max(40).optional(),
        locale: z.string().trim().max(20).optional(),
        timezone: z.string().trim().max(60).optional(),
        planDigest: z.string().trim().length(64), // sha256 hex
        stepIds: z.array(z.string().trim().min(1).max(80)).min(1).max(8),
        confirm: z.literal(true),
        strongConfirm: z.boolean().optional(),
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
