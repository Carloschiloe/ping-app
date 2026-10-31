import { describe, expect, it, vi } from 'vitest';
import { buildSemanticOpenAiRequest, getSemanticOpenAiTransportPolicy, getSemanticRuntimeConfig, sanitizeSemanticProviderError, hedgedSemanticRequest } from '../src/services/semanticOpenAiTransport.service';
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
    it('forwards a strict structured response format without changing the shared default', () => {
        const responseFormat = {
            type: 'json_schema' as const,
            json_schema: {
                name: 'objective',
                strict: true,
                schema: {
                    type: 'object',
                    properties: { value: { type: 'string' } },
                    required: ['value'],
                    additionalProperties: false,
                },
            },
        };
        const request = buildSemanticOpenAiRequest({ modelName: 'gpt-4o-mini', messages, responseFormat });
        expect(request.response_format).toEqual(responseFormat);
        expect(buildSemanticOpenAiRequest({ modelName: 'gpt-4o-mini', messages }).response_format).toEqual({ type: 'json_object' });
    });
    it('resolves one configurable model for both semantic interpreters', () => {
        const previousModel = process.env.PING_SEMANTIC_MODEL;
        const previousFamily = process.env.PING_SEMANTIC_MODEL_FAMILY;
        const previousEnvironment = process.env.PING_ENVIRONMENT;
        process.env.PING_SEMANTIC_MODEL = 'gpt-6-luna';
        process.env.PING_SEMANTIC_MODEL_FAMILY = 'modern_reasoning';
        process.env.PING_ENVIRONMENT = 'staging';
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
            if (previousEnvironment === undefined) delete process.env.PING_ENVIRONMENT;
            else process.env.PING_ENVIRONMENT = previousEnvironment;
        }
    });
    it('uses the safe legacy fallback when the production model is not configured', () => {
        const previousModel = process.env.PING_SEMANTIC_MODEL;
        const previousEnvironment = process.env.PING_ENVIRONMENT;
        delete process.env.PING_SEMANTIC_MODEL;
        process.env.PING_ENVIRONMENT = 'production';
        try {
            expect(getSemanticRuntimeConfig().modelName).toBe('gpt-4o-mini');
            expect(getSemanticRuntimeConfig().modelFamily).toBe('legacy_chat');
        } finally {
            if (previousModel === undefined) delete process.env.PING_SEMANTIC_MODEL;
            else process.env.PING_SEMANTIC_MODEL = previousModel;
            if (previousEnvironment === undefined) delete process.env.PING_ENVIRONMENT;
            else process.env.PING_ENVIRONMENT = previousEnvironment;
        }
    });
    it('sanitizes provider errors without messages or secrets', () => {
        const secret = ['sk', 'test-secret-must-not-escape'].join('-');
        const sanitized = sanitizeSemanticProviderError(Object.assign(new Error(secret), { status: 400, code: 'unsupported_parameter', type: 'invalid_request_error' }));
        expect(sanitized).toEqual({ providerErrorClass: 'Error', providerHttpStatus: 400, providerErrorCode: 'unsupported_parameter', providerErrorType: 'invalid_request_error' });
        expect(JSON.stringify(sanitized)).not.toContain(secret);
    });
});

describe('hedgedSemanticRequest', () => {
    const deferred = <T>() => {
        let resolve!: (value: T) => void;
        let reject!: (error: unknown) => void;
        const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej; });
        return { promise, resolve, reject };
    };

    it('sends one request when the first answers before the hedge delay', async () => {
        vi.useFakeTimers();
        const send = vi.fn(async () => 'first');
        const onHedge = vi.fn();
        await expect(hedgedSemanticRequest(send, { hedgeAfterMs: 4000, onHedge })).resolves.toBe('first');
        await vi.advanceTimersByTimeAsync(5000);
        expect(send).toHaveBeenCalledTimes(1);
        expect(onHedge).not.toHaveBeenCalled();
        vi.useRealTimers();
    });

    it('starts a second request after the delay, keeps the first answer and aborts the other', async () => {
        vi.useFakeTimers();
        const slow = deferred<string>();
        const fast = deferred<string>();
        const signals: AbortSignal[] = [];
        const send = vi.fn((signal: AbortSignal) => { signals.push(signal); return signals.length === 1 ? slow.promise : fast.promise; });
        const result = hedgedSemanticRequest(send, { hedgeAfterMs: 4000 });
        await vi.advanceTimersByTimeAsync(4000);
        expect(send).toHaveBeenCalledTimes(2);
        fast.resolve('second');
        await expect(result).resolves.toBe('second');
        expect(signals[0].aborted).toBe(true);
        expect(signals[1].aborted).toBe(false);
        vi.useRealTimers();
    });

    it('survives one failed request while the other answers', async () => {
        vi.useFakeTimers();
        const first = deferred<string>();
        const second = deferred<string>();
        let calls = 0;
        const result = hedgedSemanticRequest(() => (++calls === 1 ? first.promise : second.promise), { hedgeAfterMs: 1000 });
        await vi.advanceTimersByTimeAsync(1000);
        first.reject(new Error('aborted upstream'));
        second.resolve('second');
        await expect(result).resolves.toBe('second');
        vi.useRealTimers();
    });

    it('reports a failure before the hedge delay without a second request', async () => {
        vi.useFakeTimers();
        const send = vi.fn(async () => { throw new Error('401'); });
        await expect(hedgedSemanticRequest(send, { hedgeAfterMs: 4000 })).rejects.toThrow('401');
        await vi.advanceTimersByTimeAsync(5000);
        expect(send).toHaveBeenCalledTimes(1);
        vi.useRealTimers();
    });
});
