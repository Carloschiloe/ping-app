// Bench-only: the assistant's brain on another provider's OpenAI-compatible
// chat endpoint, to compare quality, speed and cost with the same frozen
// conversations. Never used by the running server.
import OpenAI from 'openai';
import type { AssistantChatMessage, AssistantModel, AssistantModelResponse, AssistantToolDefinition } from '../../src/services/assistant/assistantTypes';

export const BENCH_PROVIDERS: Record<string, { baseURL: string; keyEnv: string }> = {
    google: { baseURL: 'https://generativelanguage.googleapis.com/v1beta/openai/', keyEnv: 'GEMINI_API_KEY' },
    xai: { baseURL: 'https://api.x.ai/v1', keyEnv: 'XAI_API_KEY' },
    groq: { baseURL: 'https://api.groq.com/openai/v1', keyEnv: 'GROQ_API_KEY' },
    cerebras: { baseURL: 'https://api.cerebras.ai/v1', keyEnv: 'CEREBRAS_API_KEY' },
    deepseek: { baseURL: 'https://api.deepseek.com', keyEnv: 'DEEPSEEK_API_KEY' },
    mistral: { baseURL: 'https://api.mistral.ai/v1', keyEnv: 'MISTRAL_API_KEY' },
    anthropic: { baseURL: 'https://api.anthropic.com/v1/', keyEnv: 'ANTHROPIC_API_KEY' },
    openrouter: { baseURL: 'https://openrouter.ai/api/v1', keyEnv: 'OPENROUTER_API_KEY' },
};

export interface BenchUsage { calls: number; inputTokens: number; cachedTokens: number; outputTokens: number; modelMs: number[]; waitMs: number }
export const benchUsage: BenchUsage = { calls: 0, inputTokens: 0, cachedTokens: 0, outputTokens: 0, modelMs: [], waitMs: 0 };

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export class BenchChatModel implements AssistantModel {
    private readonly client: OpenAI;
    public constructor(public readonly modelName: string, provider: string, private readonly effort?: string) {
        const config = BENCH_PROVIDERS[provider];
        if (!config) throw new Error(`Unknown bench provider ${provider}`);
        const apiKey = process.env[config.keyEnv];
        if (!apiKey) throw new Error(`Missing ${config.keyEnv} in backend/.env`);
        this.client = new OpenAI({ apiKey, baseURL: config.baseURL, timeout: 45_000, maxRetries: 0 });
    }

    async complete(messages: AssistantChatMessage[], tools: AssistantToolDefinition[]): Promise<AssistantModelResponse> {
        const body: any = {
            model: this.modelName,
            messages: messages.map((m: any) => m.role === 'assistant'
                ? { role: 'assistant', content: m.content ?? null, ...(m.tool_calls?.length ? { tool_calls: m.tool_calls } : {}) }
                : m),
            tools,
            tool_choice: 'auto',
            ...(this.effort ? { reasoning_effort: this.effort } : {}),
        };
        // A free account answers "too many" or "busy" often: wait and retry,
        // and keep that waiting out of the speed figures.
        for (let attempt = 0; ; attempt += 1) {
            const started = Date.now();
            try {
                const response: any = await this.client.chat.completions.create(body);
                benchUsage.modelMs.push(Date.now() - started);
                const usage = response.usage || {};
                benchUsage.calls += 1;
                benchUsage.inputTokens += usage.prompt_tokens || 0;
                benchUsage.cachedTokens += usage.prompt_tokens_details?.cached_tokens || usage.prompt_cache_hit_tokens || 0;
                benchUsage.outputTokens += usage.completion_tokens || 0;
                const message = response.choices?.[0]?.message || {};
                return { content: message.content || null, toolCalls: (message.tool_calls || []).map((call: any) => ({ ...call, type: 'function' as const })) };
            } catch (error: any) {
                const status = error?.status;
                const retryable = status === 429 || status === 503 || status === 500 || error?.name === 'APIConnectionTimeoutError';
                if (!retryable || attempt >= 8) throw error;
                const wait = Math.min(60_000, 5_000 * 2 ** Math.min(attempt, 3));
                benchUsage.waitMs += (Date.now() - started) + wait;
                await sleep(wait);
            }
        }
    }
}

export function benchModelFromEnv(): AssistantModel | null {
    const provider = process.env.M9_BENCH_PROVIDER?.trim();
    if (!provider || provider === 'openai') return null;
    return new BenchChatModel(process.env.PING_ASSISTANT_MODEL?.trim() || '', provider, process.env.M9_BENCH_EFFORT?.trim() || undefined);
}
