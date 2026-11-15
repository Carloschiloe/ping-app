// One door to any language model that speaks the OpenAI chat format
// (OpenAI, Google Gemini, OpenRouter, Groq, DeepSeek, Mistral...). The
// meeting analysis asks for JSON through it, so changing the model or the
// company behind it is a configuration change, not a code change.
import OpenAI from 'openai';
import { MeetingProviderError } from './meetingTypes';

export const MEETING_LLM_PROVIDERS: Record<string, { baseURL?: string; keyEnv: string }> = {
    openai: { keyEnv: 'OPENAI_API_KEY' },
    google: { baseURL: 'https://generativelanguage.googleapis.com/v1beta/openai/', keyEnv: 'GEMINI_API_KEY' },
    openrouter: { baseURL: 'https://openrouter.ai/api/v1', keyEnv: 'OPENROUTER_API_KEY' },
    groq: { baseURL: 'https://api.groq.com/openai/v1', keyEnv: 'GROQ_API_KEY' },
    deepseek: { baseURL: 'https://api.deepseek.com', keyEnv: 'DEEPSEEK_API_KEY' },
    mistral: { baseURL: 'https://api.mistral.ai/v1', keyEnv: 'MISTRAL_API_KEY' },
};

export interface MeetingLlmTarget {
    provider: string;
    model: string;
    effort?: string; // reasoning effort, for models that take it
}

/** "google:gemini-3.5-flash-lite" or "openai:gpt-5.6-luna@low" → target. */
export function parseLlmTarget(spec: string): MeetingLlmTarget {
    const [provider, rest] = spec.includes(':') ? [spec.slice(0, spec.indexOf(':')), spec.slice(spec.indexOf(':') + 1)] : ['openai', spec];
    const [model, effort] = rest.split('@');
    return { provider, model, ...(effort ? { effort } : {}) };
}

export interface JsonCompletion {
    json: unknown;
    raw: string;
    inputTokens: number;
    outputTokens: number;
    latencyMs: number;
    attempts: number;
    costUsd: number | null; // what the provider says it charged, when it says so
}

export interface MeetingLlm {
    completeJson(target: MeetingLlmTarget, system: string, user: string, options?: { timeoutMs?: number; maxAttempts?: number }): Promise<JsonCompletion>;
}

const clients = new Map<string, OpenAI>();
function clientFor(provider: string, timeoutMs: number): OpenAI {
    const config = MEETING_LLM_PROVIDERS[provider];
    if (!config) throw new MeetingProviderError('unknown_provider', false, `Unknown provider ${provider}`);
    const apiKey = process.env[config.keyEnv]?.trim();
    if (!apiKey) throw new MeetingProviderError('provider_not_configured', false, `Missing ${config.keyEnv}`);
    const key = `${provider}:${timeoutMs}`;
    if (!clients.has(key)) clients.set(key, new OpenAI({ apiKey, baseURL: config.baseURL, timeout: timeoutMs, maxRetries: 0 }));
    return clients.get(key)!;
}

/** Pulls the JSON object out of an answer, also when wrapped in ``` fences. */
export function extractJson(text: string): unknown {
    const trimmed = text.trim().replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '');
    try { return JSON.parse(trimmed); } catch { /* look for the outer braces */ }
    const start = trimmed.indexOf('{');
    const end = trimmed.lastIndexOf('}');
    if (start >= 0 && end > start) {
        try { return JSON.parse(trimmed.slice(start, end + 1)); } catch { /* fall through */ }
    }
    throw new MeetingProviderError('invalid_json', true);
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export const openAiCompatibleLlm: MeetingLlm = {
    async completeJson(target, system, user, options = {}) {
        const timeoutMs = options.timeoutMs ?? 120_000;
        const maxAttempts = options.maxAttempts ?? 3;
        const client = clientFor(target.provider, timeoutMs);
        let lastError: unknown;
        for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
            const started = Date.now();
            try {
                const response: any = await client.chat.completions.create({
                    model: target.model,
                    messages: [{ role: 'system', content: system }, { role: 'user', content: user }],
                    response_format: { type: 'json_object' },
                    ...(target.effort ? { reasoning_effort: target.effort as any } : {}),
                } as any);
                const raw = response.choices?.[0]?.message?.content || '';
                const json = extractJson(raw);
                return {
                    json,
                    raw,
                    inputTokens: response.usage?.prompt_tokens || 0,
                    outputTokens: response.usage?.completion_tokens || 0,
                    latencyMs: Date.now() - started,
                    attempts: attempt,
                    costUsd: typeof response.usage?.cost === 'number' ? response.usage.cost : null,
                };
            } catch (error: any) {
                lastError = error;
                const status = Number(error?.status || 0);
                const retryable = error instanceof MeetingProviderError
                    ? error.retryable
                    : status === 0 || status === 408 || status === 409 || status === 429 || status >= 500;
                if (!retryable || attempt >= maxAttempts) break;
                await sleep(Math.min(30_000, 2_000 * 2 ** (attempt - 1)));
            }
        }
        if (lastError instanceof MeetingProviderError) throw lastError;
        const status = Number((lastError as any)?.status || 0);
        throw new MeetingProviderError(status === 429 ? 'provider_rate_limited' : status === 402 ? 'provider_no_credit' : 'provider_unavailable', status !== 400 && status !== 401 && status !== 402, String((lastError as any)?.message || lastError).slice(0, 300));
    },
};
