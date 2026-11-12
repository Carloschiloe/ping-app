import { supabaseAdmin } from '../lib/supabaseAdmin';
import { AppError } from '../utils/AppError';
import { TtlCache } from '../utils/ttlCache';
import { recordAiUsage } from './aiUsage.service';

// Which OpenAI voice the assistant speaks with, and how fast. Chosen in the
// admin panel so the owner can compare voices on the phone without a deploy.
// cedar and marin are OpenAI's most natural voices.

export const VOICES = ['cedar', 'marin', 'ash', 'ballad', 'coral', 'sage', 'verse', 'alloy', 'echo', 'shimmer'] as const;
export type VoiceName = (typeof VOICES)[number];
export type VoiceSettings = { voice: VoiceName; speed: number };

const DEFAULT_VOICE: VoiceName = 'cedar';
const cache = new TtlCache<VoiceSettings>(60_000, 1);

function fallback(): VoiceSettings {
    const fromEnv = process.env.M8_LIVE_VOICE_OUTPUT_VOICE?.trim() as VoiceName | undefined;
    return { voice: fromEnv && VOICES.includes(fromEnv) ? fromEnv : DEFAULT_VOICE, speed: 1 };
}

export function clampSpeed(value: unknown): number {
    const speed = Number(value);
    if (!Number.isFinite(speed)) return 1;
    return Math.round(Math.min(1.2, Math.max(0.8, speed)) * 100) / 100;
}

/** Never fails: if the setting cannot be read, the default voice speaks. */
export async function getVoiceSettings(): Promise<VoiceSettings> {
    const hit = cache.get('voice');
    if (hit) return hit;
    try {
        const { data, error } = await supabaseAdmin.from('app_settings').select('voice_name, voice_speed').eq('id', true).maybeSingle();
        if (error || !data) return fallback();
        const row = data as { voice_name?: string; voice_speed?: number | string };
        const settings: VoiceSettings = {
            voice: VOICES.includes(row.voice_name as VoiceName) ? (row.voice_name as VoiceName) : fallback().voice,
            speed: clampSpeed(row.voice_speed ?? 1),
        };
        cache.set('voice', settings);
        return settings;
    } catch {
        return fallback();
    }
}

// --- Samples for the panel -------------------------------------------------------

export const SAMPLE_TEXT = 'Hola, soy Vorian. Mañana tienes dos cosas: la reunión con Ana a las tres de la tarde y pagar la luz. ¿Quieres que te avise una hora antes?';
const SAMPLE_STYLE = 'Habla en español de Chile, como una persona cercana en una conversación: voz cálida, ritmo tranquilo, entonación expresiva y pausas naturales.';
const SAMPLE_MODEL = 'gpt-4o-mini-tts';
const samples = new TtlCache<Buffer>(24 * 60 * 60_000, VOICES.length);

/**
 * A short sample of a voice, made once per day and kept in memory. Each one
 * costs a fraction of a cent and shows up in Gastos as "Muestras de voz".
 */
export async function voiceSample(voice: VoiceName): Promise<Buffer> {
    const hit = samples.get(voice);
    if (hit) return hit;
    const apiKey = process.env.OPENAI_API_KEY?.trim();
    if (!apiKey) throw new AppError('Voice samples are not available', 503);
    const res = await fetch('https://api.openai.com/v1/audio/speech', {
        method: 'POST',
        headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: SAMPLE_MODEL, voice, input: SAMPLE_TEXT, instructions: SAMPLE_STYLE, response_format: 'mp3' }),
        signal: AbortSignal.timeout(20_000),
    });
    if (!res.ok) throw new AppError('Voice sample unavailable', 502);
    const audio = Buffer.from(await res.arrayBuffer());
    // Spoken Spanish runs at about 15 characters a second.
    recordAiUsage({ feature: 'muestra_voz', model: SAMPLE_MODEL, usage: { audioSeconds: SAMPLE_TEXT.length / 15 }, userId: null });
    samples.set(voice, audio);
    return audio;
}

export async function updateVoiceSettings(input: VoiceSettings): Promise<VoiceSettings> {
    const { error } = await supabaseAdmin.from('app_settings').upsert({
        id: true,
        voice_name: input.voice,
        voice_speed: clampSpeed(input.speed),
        updated_at: new Date().toISOString(),
    }, { onConflict: 'id' });
    if (error) throw new AppError('Unable to save settings', 500);
    cache.clear();
    return getVoiceSettings();
}

// --- Which service speaks ------------------------------------------------------
// Google's live voice costs about a third of OpenAI's and the owner preferred
// its voices in a blind test (2026-11-12). OpenAI stays as the fallback: the
// phone switches to it on its own when Google cannot start.

export const VOICE_PROVIDERS = ['gemini', 'openai'] as const;
export type VoiceProvider = (typeof VOICE_PROVIDERS)[number];
/** Google's voices, the owner's favourites first. */
export const GEMINI_VOICES = ['Aoede', 'Sulafat', 'Kore', 'Leda', 'Despina', 'Achernar', 'Callirrhoe', 'Puck', 'Charon', 'Orus'] as const;
export type GeminiVoice = (typeof GEMINI_VOICES)[number];
export type VoiceProviderSettings = { provider: VoiceProvider; geminiVoice: GeminiVoice; geminiAvailable: boolean };

const providerCache = new TtlCache<VoiceProviderSettings>(60_000, 1);

export function geminiConfigured(): boolean {
    return Boolean(process.env.GEMINI_API_KEY?.trim());
}

function providerFallback(): VoiceProviderSettings {
    const fromEnv = process.env.M8_LIVE_VOICE_PROVIDER?.trim() as VoiceProvider | undefined;
    const provider: VoiceProvider = fromEnv && VOICE_PROVIDERS.includes(fromEnv) ? fromEnv : 'openai';
    return { provider: geminiConfigured() ? provider : 'openai', geminiVoice: 'Aoede', geminiAvailable: geminiConfigured() };
}

/**
 * Never fails. Without the Google key the answer is always OpenAI. Until the
 * owner picks Google in the panel, OpenAI keeps speaking as before.
 */
export async function getVoiceProvider(): Promise<VoiceProviderSettings> {
    const hit = providerCache.get('provider');
    if (hit) return hit;
    const fallback = providerFallback();
    try {
        const { data, error } = await supabaseAdmin.from('app_settings').select('voice_provider, gemini_voice').eq('id', true).maybeSingle();
        if (error || !data) return fallback;
        const row = data as { voice_provider?: string; gemini_voice?: string };
        const chosen = VOICE_PROVIDERS.includes(row.voice_provider as VoiceProvider) ? (row.voice_provider as VoiceProvider) : fallback.provider;
        const settings: VoiceProviderSettings = {
            provider: geminiConfigured() ? chosen : 'openai',
            geminiVoice: GEMINI_VOICES.includes(row.gemini_voice as GeminiVoice) ? (row.gemini_voice as GeminiVoice) : 'Aoede',
            geminiAvailable: geminiConfigured(),
        };
        providerCache.set('provider', settings);
        return settings;
    } catch {
        return fallback;
    }
}

export async function updateVoiceProvider(input: { provider: VoiceProvider; geminiVoice: GeminiVoice }): Promise<VoiceProviderSettings> {
    const { error } = await supabaseAdmin.from('app_settings').upsert({
        id: true,
        voice_provider: input.provider,
        gemini_voice: input.geminiVoice,
        updated_at: new Date().toISOString(),
    }, { onConflict: 'id' });
    if (error) throw new AppError('Unable to save settings', 500);
    providerCache.clear();
    return getVoiceProvider();
}
