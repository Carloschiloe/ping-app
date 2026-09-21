import { describe, expect, it } from 'vitest';
import { agentVoiceTranscriptionRequestSchema } from '../src/schemas/agentVoiceRequest.schema';
import { resolveTextSurface } from '../src/services/agentInputEnvelope.service';
import { surfaceSupports } from '../src/types/agentInput';

const baseVoiceQuery = {
    durationMs: 1000,
    capturedAt: '2026-09-21T12:00:00.000Z',
    voiceSessionId: '11111111-1111-4111-8111-111111111111',
    deviceSessionId: '22222222-2222-4222-8222-222222222222',
    locale: 'es-CL',
    timezone: 'America/Santiago',
    consent: 'explicit_user_action' as const,
};

describe('Agent surface contract', () => {
    it('accepts tablet voice capture through the existing voice boundary', () => {
        const parsed = agentVoiceTranscriptionRequestSchema.safeParse({
            body: Buffer.from('audio'),
            query: { ...baseVoiceQuery, surface: 'tablet' },
        });
        expect(parsed.success).toBe(true);
    });

    it('rejects text-only and future surfaces from the voice boundary', () => {
        for (const surface of ['mobile_text', 'future']) {
            const parsed = agentVoiceTranscriptionRequestSchema.safeParse({
                body: Buffer.from('audio'),
                query: { ...baseVoiceQuery, surface },
            });
            expect(parsed.success).toBe(false);
        }
    });

    it('keeps channel mapping and capabilities server-owned', () => {
        expect(resolveTextSurface('tablet')).toBe('tablet');
        expect(resolveTextSurface('unknown-client-value')).toBe('mobile_text');
        expect(surfaceSupports('tablet', 'voice_input')).toBe(true);
        expect(surfaceSupports('tablet', 'conversation_scope')).toBe(true);
    });
});
