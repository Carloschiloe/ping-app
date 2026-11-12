import { AppError } from '../utils/AppError';
import type { M8LiveVoiceGeminiSessionRequest } from '../schemas/m8LiveVoice.schema';
import { geminiLiveModel } from './m8LiveVoice.service';
import type { GeminiVoice } from './voiceSettings.service';

// Google's live voice. The server mints a one-use pass that lasts one minute
// and locks Vorian's instructions, tool and voice into it: the Google key never
// reaches the phone, and the phone cannot change what the voice is told.

const AUTH_TOKENS_URL = 'https://generativelanguage.googleapis.com/v1beta/auth_tokens';
export const GEMINI_LIVE_WS_URL = 'wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContentConstrained';

/** Text the page sends so Vorian says it as is (greeting, morning summary). */
export const GEMINI_SAY_PREFIX = '[VORIAN-DI]';

/**
 * Vorian re-reads the conversation on every reply. Keeping only the latest
 * exchange cut the cost of a six-turn test from 6 to 3 US cents with the same
 * understanding: Vorian's own memory of the chat lives on the server, not here.
 */
const HISTORY_TRIGGER_TOKENS = 1000;
const HISTORY_TARGET_TOKENS = 500;

export function geminiInstructions(input: Pick<M8LiveVoiceGeminiSessionRequest, 'timezone'>): string {
    return [
        'Eres la interfaz de voz de Vorian, no un agente separado.',
        'Habla siempre en español de Chile, con una dicción natural, cálida y clara, como en una conversación entre personas: entonación expresiva, ritmo tranquilo y pausas naturales. No cambies al inglés aunque el dispositivo tenga otro idioma.',
        'Para cada turno del usuario llama a ping_core_turn con su transcripción exacta. No resumas, corrijas, traduzcas ni sustituyas palabras del usuario; conserva especialmente fechas, horas, números y términos como mañana.',
        'En intent juzga la intención según el sentido y el contexto de la conversación, no por palabras exactas: usa end_conversation si la persona quiere terminar de hablar ahora (se despide, ya no necesita nada, te llamó sin querer, te pide cerrarte o callarte, o responde que nada cuando le ofreces algo más), aunque lo diga con sus propias palabras o con rabia. Si además pide o pregunta algo, usa request.',
        'Antes de recibir el resultado de ping_core_turn no digas nada.',
        'Cuando recibas core_presentation, di únicamente authorizedText, completo y en el mismo orden, sin agregar ni quitar nada; di horas, fechas y números como se dicen hablando (15:00 es las tres de la tarde) y no leas comillas ni paréntesis. No agregues hechos, razones, capacidades, accesos, memoria, resultados ni acciones.',
        'Una propuesta nunca es una ejecución: conserva siempre la pregunta de confirmación que trae authorizedText.',
        `Cuando recibas un mensaje que empieza con ${GEMINI_SAY_PREFIX}, di en voz alta exactamente el texto que sigue, sin llamar herramientas ni agregar nada.`,
        'Si solo oyes ruido, música o personas que no te hablan a ti, no digas nada.',
        `Zona horaria del usuario: ${input.timezone || 'America/Santiago'}.`,
    ].join(' ');
}

/** The whole configuration, locked inside the pass. */
export function buildGeminiSetup(input: Pick<M8LiveVoiceGeminiSessionRequest, 'timezone'>, model: string, voice: GeminiVoice) {
    return {
        model: `models/${model}`,
        generationConfig: {
            responseModalities: ['AUDIO'],
            speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: voice } } },
        },
        systemInstruction: { parts: [{ text: geminiInstructions(input) }] },
        tools: [{
            functionDeclarations: [{
                name: 'ping_core_turn',
                description: 'Submit the user turn to Vorian Core. Never execute an action directly from voice.',
                parameters: {
                    type: 'object',
                    properties: {
                        input: { type: 'string' },
                        intent: {
                            type: 'string',
                            enum: ['request', 'end_conversation'],
                            description: 'end_conversation when the person, in any words, wants to stop talking to Vorian now: says goodbye, says they need nothing else, that they called by mistake, asks it to close or be quiet, or answers "nothing" to "anything else?". request for everything else, including any goodbye that also asks for something.',
                        },
                    },
                    required: ['input', 'intent'],
                },
            }],
        }],
        inputAudioTranscription: {},
        outputAudioTranscription: {},
        contextWindowCompression: { triggerTokens: HISTORY_TRIGGER_TOKENS, slidingWindow: { targetTokens: HISTORY_TARGET_TOKENS } },
    };
}

export async function createGeminiLiveSession(input: {
    request: M8LiveVoiceGeminiSessionRequest;
    voice: GeminiVoice;
}): Promise<{ token: string; model: string; url: string; provider: 'gemini_live_ws' }> {
    const apiKey = process.env.GEMINI_API_KEY?.trim();
    if (!apiKey) throw new AppError('Live voice provider is not configured', 503);
    const model = geminiLiveModel();
    const now = Date.now();
    let response: Response;
    try {
        response = await fetch(AUTH_TOKENS_URL, {
            method: 'POST',
            headers: { 'x-goog-api-key': apiKey, 'Content-Type': 'application/json' },
            body: JSON.stringify({
                uses: 1,
                // A conversation may last up to 30 minutes; it must start within one.
                expireTime: new Date(now + 30 * 60_000).toISOString(),
                newSessionExpireTime: new Date(now + 60_000).toISOString(),
                bidiGenerateContentSetup: buildGeminiSetup(input.request, model, input.voice),
            }),
            signal: AbortSignal.timeout(15_000),
        });
    } catch {
        throw new AppError('Live voice provider is unavailable', 503);
    }
    const text = await response.text();
    if (!response.ok) {
        let message = '';
        try { message = String(JSON.parse(text)?.error?.status || ''); } catch { /* not JSON */ }
        throw new AppError(`Live voice provider rejected the session${message ? ` (${message.slice(0, 40)})` : ''}`, 503);
    }
    let token = '';
    try { token = String(JSON.parse(text)?.name || ''); } catch { /* handled below */ }
    if (!token) throw new AppError('Live voice provider returned incomplete session data', 503);
    return { token, model, url: GEMINI_LIVE_WS_URL, provider: 'gemini_live_ws' };
}
