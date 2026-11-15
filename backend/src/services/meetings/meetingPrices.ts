// List prices used to estimate what a meeting costs. Each one says where it
// came from and when, because prices change: check them again before
// budgeting. USD per million tokens, or per minute of audio.

export interface TokenPrice { input: number; output: number; source: string }
export interface AudioPrice { perMinute: number; source: string; minBilledSeconds?: number }

export const PRICES_CHECKED_ON = '2026-11-15';

// Language models (input / output per million tokens).
export const LLM_PRICES: Record<string, TokenPrice> = {
    'openai:gpt-4o': { input: 2.5, output: 10, source: 'OpenAI, modelo usado hoy por el resumen de llamadas' },
    'openai:gpt-4o-mini': { input: 0.15, output: 0.6, source: 'OpenAI' },
    'openai:gpt-5.6-luna': { input: 0.2, output: 1.2, source: 'OpenAI 2026-11-15' },
    'openai:gpt-6-luna': { input: 0.1, output: 0.5, source: 'OpenAI 2026-11-15' },
    'google:gemini-3.1-flash-lite': { input: 0.25, output: 1.5, source: 'Google AI Studio 2026-11-15 (audio 0,50)' },
    'google:gemini-3.5-flash-lite': { input: 0.3, output: 2.5, source: 'Google AI Studio 2026-11-15 (audio al mismo precio que texto; lote: 0,15/1,25)' },
    'google:gemini-3.8-flash': { input: 0.75, output: 3.75, source: 'Google AI Studio 2026-11-15; sube a 1,50/7,50 el 2027-01-01' },
    'openrouter:deepseek/deepseek-v4.1-flash': { input: 0.05, output: 0.2, source: 'lista de OpenRouter 2026-11-15' },
    'openrouter:qwen/qwen3.8-flash': { input: 0.15, output: 0.47, source: 'lista de OpenRouter 2026-11-15' },
    'openrouter:z-ai/glm-5.3-flash': { input: 0.04, output: 0.08, source: 'lista de OpenRouter 2026-11-15' },
    'openrouter:anthropic/claude-haiku-5.5': { input: 0.1, output: 0.5, source: 'lista de OpenRouter 2026-11-15' },
    'openrouter:openai/gpt-6-luna': { input: 0.1, output: 0.5, source: 'lista de OpenRouter 2026-11-15' },
    'openrouter:x-ai/grok-4.3': { input: 1.25, output: 2.5, source: 'lista de OpenRouter 2026-11-15' },
    'openrouter:mistralai/mistral-large-4-0': { input: 0.7, output: 2.1, source: 'lista de OpenRouter 2026-11-15' },
};

// Transcription (per minute of audio). Third-party lists, not yet confirmed
// on each company's own price page.
export const TRANSCRIPTION_PRICES: Record<string, AudioPrice> = {
    'openai:whisper-1': { perMinute: 0.006, source: 'OpenAI; modelo usado hoy' },
    'openai:gpt-transcribe': { perMinute: 0.0045, source: 'OpenAI 2026-11-15 (estimado por minuto)' },
    'openai:gpt-4o-mini-transcribe': { perMinute: 0.003, source: 'OpenAI 2026-11-15 (estimado por minuto)' },
    'openai:gpt-4o-transcribe': { perMinute: 0.006, source: 'OpenAI' },
    'openai:gpt-4o-transcribe-diarize': { perMinute: 0.006, source: 'OpenAI 2026-11-15; retiro anunciado 2027-02-26 (no confirmado en OpenAI)' },
    'groq:whisper-large-v3-turbo': { perMinute: 0.04 / 60, source: 'developersdigest.tech 2026; cobra mínimo 10 s por pedido', minBilledSeconds: 10 },
    'groq:whisper-large-v3': { perMinute: 0.111 / 60, source: 'developersdigest.tech 2026', minBilledSeconds: 10 },
    'deepgram:nova-3': { perMinute: 0.0043, source: 'Deepgram 2026-11-15 (diarización incluida; 200 USD de regalo al abrir cuenta)' },
    'assemblyai:universal-3-5-pro': { perMinute: 0.23 / 60, source: 'AssemblyAI 2026-11-10: 0,21 USD/h + 0,02 USD/h hablantes; 50 USD de regalo' },
    'assemblyai:universal-2': { perMinute: 0.17 / 60, source: 'AssemblyAI 2026-11-10: 0,15 USD/h + 0,02 USD/h hablantes' },
    'elevenlabs:scribe_v2': { perMinute: 0.2 / 60, source: 'ElevenLabs 2026-11-15 (Scribe v2 y v3, 0,20 USD/h)' },
    // Gemini bills audio as tokens (25 per second) plus the text it writes:
    // use llmCost with the tokens it reports.
};

// Recording and storage.
export const AGORA_CLOUD_RECORDING_AUDIO_PER_1000_MIN = 1.49; // agora.io pricing page (Conversational AI); other page says 0.99
export const AGORA_FREE_MINUTES_PER_MONTH = 10_000; // shared by all Agora usage
export const SUPABASE_STORAGE_PER_GB_MONTH = 0.0213; // Pro plan, beyond 100 GB included (supabase.com 2026-11-15)
export const AUDIO_MB_PER_MINUTE_AAC_48K = 0.36; // 48 kbit/s mono

export function llmCost(model: string, inputTokens: number, outputTokens: number): number | null {
    const price = LLM_PRICES[model];
    return price ? (inputTokens * price.input + outputTokens * price.output) / 1e6 : null;
}

export function transcriptionCost(model: string, seconds: number): number | null {
    const price = TRANSCRIPTION_PRICES[model];
    if (!price) return null;
    return (Math.max(seconds, price.minBilledSeconds || 0) / 60) * price.perMinute;
}
