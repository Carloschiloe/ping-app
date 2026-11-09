import { supabaseAdmin } from '../lib/supabaseAdmin';
import { AppError } from '../utils/AppError';
import { TtlCache } from '../utils/ttlCache';

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
