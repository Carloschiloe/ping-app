import { createHash } from 'node:crypto';
import { AppError } from '../utils/AppError';
import type { M8LiveVoiceSessionRequest, M8LiveVoiceTelemetry } from '../schemas/m8LiveVoice.schema';

const REALTIME_CALLS_URL = 'https://api.openai.com/v1/realtime/calls';
const DEFAULT_MODEL = 'gpt-realtime-2.1';
const MAX_TELEMETRY_EVENTS = 500;

type StoredTelemetry = {
    actorUserId: string;
    voiceSessionId: string;
    deviceSessionId: string;
    events: M8LiveVoiceTelemetry[];
};

const telemetryByVoiceSession = new Map<string, StoredTelemetry>();

function assertStagingLiveVoiceEnabled(): void {
    if (process.env.PING_ENVIRONMENT !== 'staging' || process.env.M8_LIVE_VOICE_ENABLED !== 'true') {
        throw new AppError('Live voice is not enabled in this environment', 404);
    }
}

function modelForStaging(): string {
    const model = process.env.M8_LIVE_VOICE_MODEL?.trim() || DEFAULT_MODEL;
    if (!/^[a-zA-Z0-9._-]{2,80}$/.test(model)) throw new AppError('Invalid live voice model configuration', 500);
    return model;
}

function coreToolDefinition() {
    return {
        type: 'function',
        name: 'ping_core_turn',
        description: 'Submit the user turn to Ping Core. Never execute an action directly from voice.',
        parameters: {
            type: 'object',
            properties: { input: { type: 'string', minLength: 1, maxLength: 4000 } },
            required: ['input'],
            additionalProperties: false,
        },
    };
}

function buildSessionConfig(input: M8LiveVoiceSessionRequest, model: string) {
    return {
        type: 'realtime',
        model,
        instructions: [
            'Eres la interfaz de voz de Ping, no un agente separado.',
            'Para cada turno del usuario debes llamar a ping_core_turn con la transcripción exacta que entendiste.',
            'No respondas con hechos, planes ni acciones antes de recibir el resultado de Ping Core.',
            'Describe los resultados del Core de forma breve y natural.',
            'Una propuesta nunca es una ejecución: conserva siempre la confirmación explícita requerida por el Core.',
            `Idioma preferido: ${input.locale || 'es-CL'}. Zona horaria: ${input.timezone || 'America/Santiago'}.`,
        ].join(' '),
        audio: {
            input: { turn_detection: { type: 'semantic_vad', eagerness: 'medium', create_response: true } },
            output: { voice: process.env.M8_LIVE_VOICE_OUTPUT_VOICE?.trim() || 'marin' },
        },
        tools: [coreToolDefinition()],
        tool_choice: 'required',
    };
}

function safetyIdentifier(actorUserId: string): string {
    return createHash('sha256').update(`ping-staging:${actorUserId}`).digest('hex');
}

export async function createM8LiveVoiceSession(input: {
    actorUserId: string;
    request: M8LiveVoiceSessionRequest;
}): Promise<{ sessionId: string; sdp: string; model: string; provider: 'openai_realtime_webrtc' }> {
    assertStagingLiveVoiceEnabled();
    const apiKey = process.env.OPENAI_API_KEY?.trim();
    if (!apiKey) throw new AppError('Live voice provider is not configured', 503);

    const model = modelForStaging();
    const form = new FormData();
    form.set('sdp', input.request.sdp);
    form.set('session', JSON.stringify(buildSessionConfig(input.request, model)));

    let response: Response;
    try {
        response = await fetch(REALTIME_CALLS_URL, {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${apiKey}`,
                'OpenAI-Safety-Identifier': safetyIdentifier(input.actorUserId),
            },
            body: form,
        });
    } catch {
        throw new AppError('Live voice provider is unavailable', 503);
    }

    const bodyText = await response.text();
    if (!response.ok) throw new AppError('Live voice provider rejected the session', 503);
    let body: any;
    try { body = JSON.parse(bodyText); } catch { throw new AppError('Live voice provider returned invalid session data', 503); }
    const sessionId = typeof body?.session?.id === 'string' ? body.session.id : null;
    const sdp = typeof body?.transport?.sdp === 'string' ? body.transport.sdp : null;
    if (!sessionId || !sdp) throw new AppError('Live voice provider returned incomplete session data', 503);
    return { sessionId, sdp, model, provider: 'openai_realtime_webrtc' };
}

export function recordM8LiveVoiceTelemetry(actorUserId: string, event: M8LiveVoiceTelemetry): void {
    const existing = telemetryByVoiceSession.get(event.voiceSessionId) ?? {
        actorUserId,
        voiceSessionId: event.voiceSessionId,
        deviceSessionId: event.deviceSessionId,
        events: [],
    };
    if (existing.actorUserId !== actorUserId || existing.deviceSessionId !== event.deviceSessionId) {
        throw new AppError('Live voice telemetry identity mismatch', 403);
    }
    existing.events.push(event);
    if (existing.events.length > MAX_TELEMETRY_EVENTS) existing.events.splice(0, existing.events.length - MAX_TELEMETRY_EVENTS);
    telemetryByVoiceSession.set(event.voiceSessionId, existing);
}

export function getM8LiveVoiceTelemetry(actorUserId: string, voiceSessionId: string) {
    const existing = telemetryByVoiceSession.get(voiceSessionId);
    if (!existing || existing.actorUserId !== actorUserId) throw new AppError('Live voice telemetry unavailable', 404);
    return {
        voiceSessionId: existing.voiceSessionId,
        deviceSessionId: existing.deviceSessionId,
        events: existing.events,
        sideEffects: existing.events.some((event) => (event.sideEffects ?? 0) > 0) ? 1 : 0,
    };
}

export function clearM8LiveVoiceTelemetryForTests(): void {
    telemetryByVoiceSession.clear();
}
