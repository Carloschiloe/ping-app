import { AsyncLocalStorage } from 'async_hooks';
import OpenAI from 'openai';
import { supabaseAdmin } from '../lib/supabaseAdmin';
import { safeErrorLog } from '../utils/safeError';

// Every OpenAI answer says how many tokens it used. The clients below read
// that number from the reply on its way back, price it and write one row to
// ai_usage, without touching the reply the rest of the code sees. The person
// is taken from the signed-in request that caused the call, when there is one.

export type AiFeature =
    | 'asistente'
    | 'voz_en_vivo'
    | 'voz_transcripcion'
    | 'transcripcion'
    | 'resumen_chat'
    | 'resumen_llamada'
    | 'compromisos'
    | 'muestra_voz';

// US dollars per 1M tokens (whisper: per minute), from
// developers.openai.com/api/docs/pricing, November 2026.
type Price = { input: number; cached: number; output: number; audioInput?: number; audioOutput?: number; audioCached?: number; perMinute?: number };
export const PRICES: Record<string, Price> = {
    'gpt-5.6-sol': { input: 4, cached: 0.4, output: 20 },
    'gpt-5.6-terra': { input: 2, cached: 0.2, output: 12 },
    'gpt-5.6-luna': { input: 0.2, cached: 0.02, output: 1.2 },
    'gpt-4o-mini-transcribe': { input: 1.25, cached: 1.25, output: 5, audioInput: 3 },
    'gpt-4o-transcribe': { input: 2.5, cached: 2.5, output: 10, audioInput: 6 },
    'gpt-4o-mini': { input: 0.15, cached: 0.075, output: 0.6 },
    'gpt-4o': { input: 2.5, cached: 1.25, output: 10 },
    'gpt-realtime-2.1': { input: 4, cached: 0.4, output: 24, audioInput: 32, audioOutput: 64, audioCached: 0.4 },
    'gpt-realtime': { input: 4, cached: 0.4, output: 16, audioInput: 32, audioOutput: 64, audioCached: 0.4 },
    'whisper-1': { input: 0, cached: 0, output: 0, perMinute: 0.006 },
    // Spoken output, priced by the minute of audio.
    'gpt-4o-mini-tts': { input: 0, cached: 0, output: 0, perMinute: 0.015 },
};

/** Dated or suffixed names ("gpt-4o-mini-2024-07-18") use their family's price. */
export function priceFor(model: string): Price | null {
    const name = model.toLowerCase();
    let best: string | null = null;
    for (const key of Object.keys(PRICES)) {
        if ((name === key || name.startsWith(`${key}-`)) && (!best || key.length > best.length)) best = key;
    }
    return best ? PRICES[best] : null;
}

export type AiUsage = {
    inputTokens?: number;
    cachedInputTokens?: number;
    outputTokens?: number;
    audioInputTokens?: number;
    cachedAudioInputTokens?: number;
    audioOutputTokens?: number;
    audioSeconds?: number;
};

const n = (value: unknown) => (typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : 0);

export function costFor(model: string, usage: AiUsage): number {
    const price = priceFor(model);
    if (!price) return 0;
    const textIn = Math.max(0, n(usage.inputTokens) - n(usage.cachedInputTokens));
    const audioIn = Math.max(0, n(usage.audioInputTokens) - n(usage.cachedAudioInputTokens));
    const perToken =
        textIn * price.input +
        n(usage.cachedInputTokens) * price.cached +
        audioIn * (price.audioInput ?? price.input) +
        n(usage.cachedAudioInputTokens) * (price.audioCached ?? price.cached) +
        n(usage.outputTokens) * price.output +
        n(usage.audioOutputTokens) * (price.audioOutput ?? price.output);
    return perToken / 1_000_000 + (price.perMinute ? (n(usage.audioSeconds) / 60) * price.perMinute : 0);
}

/** Reads the usage block of a Chat Completions, Responses or transcription reply. */
export function usageFromReply(body: any): AiUsage | null {
    if (!body || typeof body !== 'object') return null;
    const u = body.usage;
    if (u && typeof u === 'object') {
        if ('prompt_tokens' in u || 'completion_tokens' in u) {
            return { inputTokens: n(u.prompt_tokens), cachedInputTokens: n(u.prompt_tokens_details?.cached_tokens), outputTokens: n(u.completion_tokens) };
        }
        if ('input_tokens' in u || 'output_tokens' in u) {
            const details = u.input_token_details ?? u.input_tokens_details ?? {};
            const audio = n(details.audio_tokens);
            return {
                inputTokens: audio ? n(details.text_tokens) : n(u.input_tokens),
                cachedInputTokens: n(details.cached_tokens),
                audioInputTokens: audio,
                outputTokens: n(u.output_tokens),
            };
        }
        if (u.type === 'duration') return { audioSeconds: n(u.seconds) };
    }
    if (typeof body.duration === 'number') return { audioSeconds: n(body.duration) };
    return null;
}

// --- Who caused the call ----------------------------------------------------

const requestUser = new AsyncLocalStorage<{ userId: string }>();

/** requireAuth runs the rest of the request inside this, so usage knows the person. */
export function runAsUser<T>(userId: string, fn: () => T): T {
    return requestUser.run({ userId }, fn);
}

export function currentUserId(): string | null {
    return requestUser.getStore()?.userId ?? null;
}

// --- Writing ------------------------------------------------------------------

export function recordAiUsage(entry: { feature: AiFeature; model: string; usage: AiUsage; userId?: string | null }): void {
    if (process.env.NODE_ENV === 'test') return;
    const usage = entry.usage;
    const row = {
        user_id: entry.userId === undefined ? currentUserId() : entry.userId,
        feature: entry.feature,
        model: entry.model.slice(0, 80),
        input_tokens: Math.round(n(usage.inputTokens)),
        cached_input_tokens: Math.round(n(usage.cachedInputTokens) + n(usage.cachedAudioInputTokens)),
        output_tokens: Math.round(n(usage.outputTokens)),
        audio_input_tokens: Math.round(n(usage.audioInputTokens)),
        audio_output_tokens: Math.round(n(usage.audioOutputTokens)),
        audio_seconds: Math.round(n(usage.audioSeconds) * 100) / 100,
        cost_usd: Math.round(costFor(entry.model, usage) * 1_000_000) / 1_000_000,
    };
    void Promise.resolve(supabaseAdmin.from('ai_usage').insert(row)).then(
        ({ error }: any) => { if (error) console.warn('[AiUsage] not recorded:', safeErrorLog(error)); },
        (error: unknown) => console.warn('[AiUsage] not recorded:', safeErrorLog(error)),
    );
}

/**
 * fetch for the OpenAI client: passes the reply through untouched and, on the
 * side, reads its usage from a copy. Streams are left alone.
 */
export function meteredFetch(feature: AiFeature, fallbackModel: string, baseFetch: typeof fetch = fetch): typeof fetch {
    return async (input, init) => {
        const response = await baseFetch(input, init);
        try {
            if (response.ok && (response.headers.get('content-type') ?? '').includes('application/json')) {
                const userId = currentUserId();
                void response.clone().json().then((body: any) => {
                    const usage = usageFromReply(body);
                    if (usage) recordAiUsage({ feature, model: typeof body?.model === 'string' ? body.model : fallbackModel, usage, userId });
                }, () => undefined);
            }
        } catch {
            // Metering never gets in the way of the reply.
        }
        return response;
    };
}

export function createMeteredOpenAI(feature: AiFeature, fallbackModel: string, options: ConstructorParameters<typeof OpenAI>[0] = {}): OpenAI {
    return new OpenAI({ ...options, fetch: meteredFetch(feature, fallbackModel) as any });
}
