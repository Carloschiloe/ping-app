import { z } from 'zod';

export const m8LiveVoiceSessionSchema = z.object({
    body: z.object({
        sdp: z.string().trim().min(100).max(250_000),
        voiceSessionId: z.string().uuid(),
        deviceSessionId: z.string().uuid(),
        conversationId: z.string().uuid().optional(),
        locale: z.string().trim().min(2).max(20).optional(),
        timezone: z.string().trim().min(1).max(60).optional(),
    }).strict(),
});

export const m8LiveVoiceTelemetrySchema = z.object({
    body: z.object({
        voiceSessionId: z.string().uuid(),
        deviceSessionId: z.string().uuid(),
        event: z.enum([
            'session_setup_started',
            'session_connected',
            'first_useful_audio',
            'speech_started',
            'speech_stopped',
            'assistant_audio_started',
            'assistant_audio_stopped',
            'barge_in',
            'core_disposition',
            'confirmation_requested',
            'fallback',
            'session_closed',
            'error',
            'voice_stage',
        ]),
        atMs: z.number().int().min(0).max(86_400_000),
        sessionId: z.string().trim().min(1).max(160).optional(),
        coreKind: z.enum(['response', 'plan', 'clarification', 'unsupported', 'error']).optional(),
        confirmationRequired: z.boolean().optional(),
        sideEffects: z.number().int().min(0).max(0).optional(),
        detailCode: z.string().trim().max(80).optional(),
        stage: z.string().trim().max(80).optional(),
        httpStatus: z.number().int().min(100).max(599).optional(),
        errorName: z.string().trim().max(60).optional(),
        errorCode: z.string().trim().max(60).optional(),
        errorMessage: z.string().trim().max(120).optional(),
    }).strict(),
});

export type M8LiveVoiceSessionRequest = z.infer<typeof m8LiveVoiceSessionSchema>['body'];
export type M8LiveVoiceTelemetry = z.infer<typeof m8LiveVoiceTelemetrySchema>['body'];
