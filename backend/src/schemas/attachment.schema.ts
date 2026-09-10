import { z } from 'zod';

const id = z.string().uuid();

// duration_ms is an audio-only contract end to end (see
// attachmentApplication.service.ts and the create_message_attachment_intent
// RPC, which rejects any duration on a non-audio kind). The audio capture
// boundary (mobile's resolveRecordingDurationMs) already normalizes native
// fractional milliseconds to a rounded integer before this request is ever
// built, so this schema requires a clean integer rather than coercing one —
// coercing here would silently paper over a bug at the wrong layer instead
// of surfacing it. Video/image/document callers must omit durationMs
// entirely; the API rejects it outright if mimeType is not audio, instead
// of silently discarding it as attachmentApplication.service.ts previously
// did.
const MAX_AUDIO_DURATION_MS = 14_400_000;

export const createUploadIntentSchema = z.object({
    body: z.object({
        conversationId: id,
        mimeType: z.string().min(1).max(100),
        originalFilename: z.string().min(1).max(200),
        clientUploadId: id,
        durationMs: z.number()
            .int()
            .finite()
            .positive()
            .max(MAX_AUDIO_DURATION_MS)
            .optional(),
        metadata: z.record(z.string(), z.any()).optional(),
    }).superRefine((value, ctx) => {
        if (value.durationMs !== undefined && !value.mimeType.startsWith('audio/')) {
            ctx.addIssue({
                code: z.ZodIssueCode.custom,
                path: ['durationMs'],
                message: 'durationMs is only accepted for audio attachments',
            });
        }
    }),
});

export const attachmentIdSchema = z.object({
    params: z.object({ id }),
});
