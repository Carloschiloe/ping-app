import type OpenAI from 'openai';
import { traceAgentDevice } from '../utils/agentDeviceTrace';

export type SemanticModelFamily = 'legacy_chat' | 'modern_reasoning';

export interface SemanticOpenAiTransportPolicy {
    family: SemanticModelFamily;
    outputTokenParameter: 'max_tokens' | 'max_completion_tokens';
    outputTokenBudget: number;
    temperature: number | null;
    timeoutMs: number;
    /** A second identical request starts when the first has not answered by then. */
    hedgeAfterMs: number;
}

export interface SemanticRuntimeConfig {
    modelName: string;
    modelFamily: SemanticModelFamily;
    policy: SemanticOpenAiTransportPolicy;
}

const SEMANTIC_PROVIDER_TRACE_ID = 'semantic-provider';

export function traceSemanticProvider(label: string, data: Record<string, unknown>): void {
    traceAgentDevice(SEMANTIC_PROVIDER_TRACE_ID, label, data);
}

export interface SemanticProviderErrorMetadata {
    providerErrorClass: string;
    providerHttpStatus: number | null;
    providerErrorCode: string | null;
    providerErrorType: string | null;
}

export interface SemanticProviderResponseMetadata {
    modelActual: string | null;
    inputTokens: number | null;
    outputTokens: number | null;
    reasoningTokens: number | null;
    cachedInputTokens: number | null;
    finishReason: string | null;
    contentPresent: boolean;
}

const LEGACY_POLICY: SemanticOpenAiTransportPolicy = {
    family: 'legacy_chat', outputTokenParameter: 'max_tokens', outputTokenBudget: 300,
    temperature: 0.1, timeoutMs: 8000, hedgeAfterMs: 4000,
};

const MODERN_REASONING_POLICY: SemanticOpenAiTransportPolicy = {
    family: 'modern_reasoning', outputTokenParameter: 'max_completion_tokens',
    outputTokenBudget: 1024, temperature: null, timeoutMs: 12000, hedgeAfterMs: 6000,
};

export function resolveSemanticModelFamily(): SemanticModelFamily {
    return process.env.PING_SEMANTIC_MODEL_FAMILY === 'modern_reasoning'
        ? 'modern_reasoning' : 'legacy_chat';
}

export function getSemanticOpenAiTransportPolicy(
    family: SemanticModelFamily = resolveSemanticModelFamily(),
): SemanticOpenAiTransportPolicy {
    return family === 'modern_reasoning' ? MODERN_REASONING_POLICY : LEGACY_POLICY;
}

/**
 * Single runtime selection for the productive semantic boundary. Production
 * receives its model explicitly from the deployment environment.
 */
export function getSemanticRuntimeConfig(overrides: {
    modelName?: string;
    modelFamily?: SemanticModelFamily;
} = {}): SemanticRuntimeConfig {
    const modelFamily = overrides.modelFamily ?? resolveSemanticModelFamily();
    return {
        modelName: overrides.modelName?.trim() || process.env.PING_SEMANTIC_MODEL?.trim() || 'gpt-4o-mini',
        modelFamily,
        policy: getSemanticOpenAiTransportPolicy(modelFamily),
    };
}

export interface SemanticOpenAiRequestOptions {
    modelName: string;
    messages: OpenAI.Chat.ChatCompletionMessageParam[];
    family?: SemanticModelFamily;
    responseFormat?: OpenAI.Chat.Completions.ChatCompletionCreateParams['response_format'];
}

export function buildSemanticOpenAiRequest({ modelName, messages, family = resolveSemanticModelFamily(), responseFormat }: SemanticOpenAiRequestOptions): Record<string, unknown> {
    const policy = getSemanticOpenAiTransportPolicy(family);
    const request: Record<string, unknown> = {
        model: modelName, messages, response_format: responseFormat ?? { type: 'json_object' },
    };
    if (policy.outputTokenParameter === 'max_completion_tokens') {
        request.max_completion_tokens = policy.outputTokenBudget;
    } else {
        request.temperature = policy.temperature;
        request.max_tokens = policy.outputTokenBudget;
    }
    return request;
}

function safeString(value: unknown): string | null {
    return typeof value === 'string' && value.length <= 160 ? value : null;
}

export function sanitizeSemanticProviderError(error: unknown): SemanticProviderErrorMetadata {
    const candidate = (error && typeof error === 'object' ? error : {}) as {
        constructor?: { name?: unknown }; status?: unknown; code?: unknown; type?: unknown; name?: unknown;
    };
    return {
        providerErrorClass: safeString(candidate.constructor?.name) || safeString(candidate.name) || 'UnknownError',
        providerHttpStatus: typeof candidate.status === 'number' ? candidate.status : null,
        providerErrorCode: safeString(candidate.code),
        providerErrorType: safeString(candidate.type),
    };
}

export function semanticProviderResponseMetadata(response: unknown): SemanticProviderResponseMetadata {
    const candidate = (response && typeof response === 'object' ? response : {}) as {
        model?: unknown;
        usage?: { prompt_tokens?: unknown; completion_tokens?: unknown; prompt_tokens_details?: { cached_tokens?: unknown } | null; completion_tokens_details?: { reasoning_tokens?: unknown } | null } | null;
        choices?: Array<{ finish_reason?: unknown; message?: { content?: unknown } | null }>;
    };
    const usage = candidate.usage;
    const choice = candidate.choices?.[0];
    return {
        modelActual: typeof candidate.model === 'string' ? candidate.model : null,
        inputTokens: typeof usage?.prompt_tokens === 'number' ? usage.prompt_tokens : null,
        outputTokens: typeof usage?.completion_tokens === 'number' ? usage.completion_tokens : null,
        reasoningTokens: typeof usage?.completion_tokens_details?.reasoning_tokens === 'number' ? usage.completion_tokens_details.reasoning_tokens : null,
        cachedInputTokens: typeof usage?.prompt_tokens_details?.cached_tokens === 'number' ? usage.prompt_tokens_details.cached_tokens : null,
        finishReason: typeof choice?.finish_reason === 'string' ? choice.finish_reason : null,
        contentPresent: typeof choice?.message?.content === 'string' && choice.message.content.length > 0,
    };
}

export interface HedgedSemanticRequestOptions {
    hedgeAfterMs: number;
    onHedge?: () => void;
}

/**
 * Provider latency has a long tail (a request that usually answers in ~3 s
 * occasionally takes 20 s). When the first request has not answered after
 * `hedgeAfterMs`, an identical second one starts and the first answer wins;
 * the other is aborted. A failure only surfaces when every started request
 * has failed.
 */
export function hedgedSemanticRequest<T>(
    send: (signal: AbortSignal) => Promise<T>,
    { hedgeAfterMs, onHedge }: HedgedSemanticRequestOptions,
): Promise<T> {
    return new Promise<T>((resolve, reject) => {
        const controllers: AbortController[] = [];
        let pending = 0;
        let settled = false;
        let lastError: unknown;
        let hedgeTimer: ReturnType<typeof setTimeout> | null = null;
        const start = () => {
            const controller = new AbortController();
            controllers.push(controller);
            pending += 1;
            send(controller.signal).then((value) => {
                if (settled) return;
                settled = true;
                if (hedgeTimer) clearTimeout(hedgeTimer);
                controllers.filter((other) => other !== controller).forEach((other) => other.abort());
                resolve(value);
            }, (error) => {
                pending -= 1;
                lastError = error;
                if (settled || pending > 0) return;
                // The SDK already retried; a failure before the hedge is final.
                if (hedgeTimer) clearTimeout(hedgeTimer);
                settled = true;
                reject(lastError);
            });
        };
        start();
        if (hedgeAfterMs > 0) {
            hedgeTimer = setTimeout(() => {
                hedgeTimer = null;
                if (settled) return;
                onHedge?.();
                start();
            }, hedgeAfterMs);
        }
    });
}
