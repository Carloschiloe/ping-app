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

// Token counts the live voice page reads from the voice service's own reply events.
const count = z.number().int().min(0).max(1_000_000).optional();
const details = z.object({
    text_tokens: count,
    audio_tokens: count,
    cached_tokens: count,
    cached_tokens_details: z.object({ text_tokens: count, audio_tokens: count }).partial().optional(),
}).partial().optional();

export const liveVoiceUsageSchema = z.object({
    body: z.object({
        voiceSessionId: z.string().max(120).optional(),
        kind: z.enum(['voz_en_vivo', 'voz_transcripcion']),
        // Which live voice service answered; without it, OpenAI.
        provider: z.enum(['openai', 'gemini']).optional(),
        usage: z.object({
            input_tokens: count,
            output_tokens: count,
            input_token_details: details,
            output_token_details: details,
        }),
    }),
});
