import { describe, expect, it } from 'vitest';
import { buildSemanticOpenAiRequest, getSemanticOpenAiTransportPolicy, sanitizeSemanticProviderError } from '../src/services/semanticOpenAiTransport.service';

const messages = [{ role: 'user' as const, content: 'test' }];
describe('shared Semantic OpenAI transport policy', () => {
    it('preserves legacy defaults', () => {
        const policy = getSemanticOpenAiTransportPolicy('legacy_chat');
        const request = buildSemanticOpenAiRequest({ modelName: 'gpt-4o-mini', messages, family: 'legacy_chat' });
        expect(policy).toMatchObject({ outputTokenParameter: 'max_tokens', outputTokenBudget: 300, temperature: 0.1, timeoutMs: 8000 });
        expect(request).toMatchObject({ max_tokens: 300, temperature: 0.1 });
        expect(request).not.toHaveProperty('max_completion_tokens');
    });
    it('uses modern reasoning parameters without temperature', () => {
        const policy = getSemanticOpenAiTransportPolicy('modern_reasoning');
        const request = buildSemanticOpenAiRequest({ modelName: 'gpt-6-luna', messages, family: 'modern_reasoning' });
        expect(policy.outputTokenBudget).toBeGreaterThan(300);
        expect(request).toMatchObject({ max_completion_tokens: 1024 });
        expect(request).not.toHaveProperty('temperature'); expect(request).not.toHaveProperty('max_tokens');
    });
    it('uses one policy for both adapter call sites', () => {
        expect(buildSemanticOpenAiRequest({ modelName: 'gpt-6-luna', messages, family: 'modern_reasoning' })).toEqual(buildSemanticOpenAiRequest({ modelName: 'gpt-6-luna', messages, family: 'modern_reasoning' }));
    });
    it('sanitizes provider errors without messages or secrets', () => {
        const secret = ['sk', 'test-secret-must-not-escape'].join('-');
        const sanitized = sanitizeSemanticProviderError(Object.assign(new Error(secret), { status: 400, code: 'unsupported_parameter', type: 'invalid_request_error' }));
        expect(sanitized).toEqual({ providerErrorClass: 'Error', providerHttpStatus: 400, providerErrorCode: 'unsupported_parameter', providerErrorType: 'invalid_request_error' });
        expect(JSON.stringify(sanitized)).not.toContain(secret);
    });
});
