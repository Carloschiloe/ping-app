import { z } from 'zod';
import { AGENT_SURFACES } from '../types/agentInput';
import { MAX_AGENT_VOICE_BYTES, MAX_AGENT_VOICE_DURATION_MS, MIN_AGENT_VOICE_DURATION_MS } from '../services/agentVoice.service';

const VOICE_SURFACES = AGENT_SURFACES.filter((surface) => surface !== 'mobile_text' && surface !== 'future');

export const agentVoiceTranscriptionRequestSchema = z.object({
    body: z.instanceof(Buffer).refine((body) => body.length > 0 && body.length <= MAX_AGENT_VOICE_BYTES),
    query: z.object({
        durationMs: z.coerce.number().int().min(MIN_AGENT_VOICE_DURATION_MS).max(MAX_AGENT_VOICE_DURATION_MS),
        capturedAt: z.string().datetime({ offset: true }),
        voiceSessionId: z.string().uuid(),
        deviceSessionId: z.string().uuid(),
        surface: z.enum(VOICE_SURFACES as [typeof VOICE_SURFACES[number], ...typeof VOICE_SURFACES[number][]]),
        locale: z.string().trim().min(2).max(20).optional(),
        timezone: z.string().trim().min(1).max(60).optional(),
        activeScreen: z.enum(['agent_preview', 'chat', 'today', 'commitments', 'profile']).optional(),
        currentConversationId: z.string().uuid().optional(),
        currentCommitmentId: z.string().uuid().optional(),
        consent: z.literal('explicit_user_action'),
    }).strict(),
});
