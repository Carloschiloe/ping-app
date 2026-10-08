import { describe, expect, it } from 'vitest';
import { buildSemanticOpenAiRequest, getSemanticOpenAiTransportPolicy, getSemanticRuntimeConfig, sanitizeSemanticProviderError } from '../src/services/semanticOpenAiTransport.service';
import { OpenAiAgentInputModel } from '../src/services/agentInputInterpreter.service';
import { OpenAiAgentObjectiveModel } from '../src/services/agentObjectiveInterpreter.service';

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
    it('resolves one configurable model for both semantic interpreters', () => {
        const previousModel = process.env.PING_SEMANTIC_MODEL;
        const previousFamily = process.env.PING_SEMANTIC_MODEL_FAMILY;
        process.env.PING_SEMANTIC_MODEL = 'gpt-6-luna';
        process.env.PING_SEMANTIC_MODEL_FAMILY = 'modern_reasoning';
        try {
            expect(getSemanticRuntimeConfig()).toMatchObject({ modelName: 'gpt-6-luna', modelFamily: 'modern_reasoning', policy: { outputTokenParameter: 'max_completion_tokens', temperature: null } });
            const input = new OpenAiAgentInputModel();
            const objective = new OpenAiAgentObjectiveModel();
            expect(input.modelName).toBe('gpt-6-luna');
            expect(objective.modelName).toBe('gpt-6-luna');
            expect(input.timeoutMs).toBe(objective.timeoutMs);
        } finally {
            if (previousModel === undefined) delete process.env.PING_SEMANTIC_MODEL;
            else process.env.PING_SEMANTIC_MODEL = previousModel;
            if (previousFamily === undefined) delete process.env.PING_SEMANTIC_MODEL_FAMILY;
            else process.env.PING_SEMANTIC_MODEL_FAMILY = previousFamily;
        }
    });
    it('sanitizes provider errors without messages or secrets', () => {
        const secret = ['sk', 'test-secret-must-not-escape'].join('-');
        const sanitized = sanitizeSemanticProviderError(Object.assign(new Error(secret), { status: 400, code: 'unsupported_parameter', type: 'invalid_request_error' }));
        expect(sanitized).toEqual({ providerErrorClass: 'Error', providerHttpStatus: 400, providerErrorCode: 'unsupported_parameter', providerErrorType: 'invalid_request_error' });
        expect(JSON.stringify(sanitized)).not.toContain(secret);
    });
});
