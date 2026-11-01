import { describe, expect, it } from 'vitest';
import { agentTurnRequestSchema } from '../src/schemas/agentTurnRequest.schema';

describe('Agent Turn request — live voice input source', () => {
    it('keeps the voice input source and rejects unknown values', () => {
        const parsed = agentTurnRequestSchema.parse({ body: { input: 'sí', channel: 'mobile_voice', voiceInputSource: 'provider' } });
        expect(parsed.body.voiceInputSource).toBe('provider');
        expect(agentTurnRequestSchema.safeParse({ body: { input: 'sí', voiceInputSource: 'guess' } }).success).toBe(false);
    });
});

describe('Agent Turn request — action decision buttons', () => {
    it('accepts a button decision with its label and rejects malformed ones', () => {
        const parsed = agentTurnRequestSchema.parse({ body: { input: 'Confirmar', actionDecision: { action: 'a3', decision: 'confirm' } } });
        expect(parsed.body.actionDecision).toEqual({ action: 'a3', decision: 'confirm' });
        const bad = (actionDecision: unknown, input: string | undefined = 'Confirmar') => agentTurnRequestSchema.safeParse({ body: { input, actionDecision } }).success;
        expect(bad({ action: 'c1', decision: 'confirm' })).toBe(false);
        expect(bad({ action: 'a1', decision: 'maybe' })).toBe(false);
        expect(bad({ action: 'a1', decision: 'confirm', extra: 1 })).toBe(false);
        expect(agentTurnRequestSchema.safeParse({ body: { actionDecision: { action: 'a1', decision: 'confirm' } } }).success).toBe(false);
    });
});
