import { describe, expect, it } from 'vitest';
import { agentTurnRequestSchema } from '../src/schemas/agentTurnRequest.schema';

describe('Agent Turn request — live voice input source', () => {
    it('keeps the voice input source and rejects unknown values', () => {
        const parsed = agentTurnRequestSchema.parse({ body: { input: 'sí', channel: 'mobile_voice', voiceInputSource: 'provider' } });
        expect(parsed.body.voiceInputSource).toBe('provider');
        expect(agentTurnRequestSchema.safeParse({ body: { input: 'sí', voiceInputSource: 'guess' } }).success).toBe(false);
    });
});
