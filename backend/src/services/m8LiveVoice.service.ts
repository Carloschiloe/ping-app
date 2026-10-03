import { createHash } from 'node:crypto';
import { AppError } from '../utils/AppError';
import type { M8LiveVoiceSessionRequest, M8LiveVoiceTelemetry } from '../schemas/m8LiveVoice.schema';

const REALTIME_CALLS_URL = 'https://api.openai.com/v1/realtime/calls';
const DEFAULT_MODEL = 'gpt-realtime-2.1';
const MAX_TELEMETRY_EVENTS = 500;

function providerError(response: Response, bodyText: string): AppError {
    let body: any = null;
    try { body = JSON.parse(bodyText); } catch { /* keep a generic sanitized diagnostic */ }
    const provider = body?.error ?? body;
    const error = new AppError('Live voice provider rejected the session', 503) as AppError & {
        status?: number;
        code?: string;
        providerErrorType?: string;
        providerErrorMessage?: string;
    };
    error.status = response.status;
    if (typeof provider?.code === 'string') error.code = provider.code.slice(0, 80);
    if (typeof provider?.type === 'string') error.providerErrorType = provider.type.slice(0, 80);
    if (typeof provider?.message === 'string') {
        error.providerErrorMessage = provider.message
            .replace(/Bearer\s+[^\s]+/gi, 'Bearer [redacted]')
            .replace(/https?:\/\/[^\s]+/gi, '[url redacted]')
            .slice(0, 160);
    }
    return error;
}

type StoredTelemetry = {
    actorUserId: string;
    voiceSessionId: string;
    deviceSessionId: string;
    createdAt: string;
    lastEventAt: string;
    closed: boolean;
    events: M8LiveVoiceTelemetry[];
};

const telemetryByVoiceSession = new Map<string, StoredTelemetry>();
const latestTelemetryByActor = new Map<string, string>();
let latestTelemetryGlobalVoiceSessionId: string | null = null;

function assertStagingLiveVoiceEnabled(): void {
    if (process.env.PING_ENVIRONMENT !== 'staging' || process.env.M8_LIVE_VOICE_ENABLED !== 'true') {
        throw new AppError('Live voice is not enabled in this environment', 404);
    }
}

function sanitizeTelemetryText(value: string | undefined, maxLength: number): string | undefined {
    if (typeof value !== 'string') return undefined;
    return value
        .replace(/Bearer\s+[^\s]+/gi, 'Bearer [redacted]')
        .replace(/https?:\/\/[^\s]+/gi, '[url redacted]')
        .replace(/(api[_-]?key|access[_-]?token|refresh[_-]?token|authorization|password|secret)\s*[:=]\s*[^\s,;]+/gi, '$1=[redacted]')
        .slice(0, maxLength);
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
            'Antes de recibir el resultado de Ping Core no produzcas texto narrativo, audio, hechos, razones ni explicaciones.',
            'Después de recibir core_presentation, verbaliza únicamente authorizedText y conserva confirmationRequired, confirmationLabel y cancelLabel. No agregues hechos, razones, capacidades, accesos, memoria, resultados ni acciones.',
            'Una propuesta nunca es una ejecución: conserva siempre la confirmación explícita requerida por el Core.',
            `Idioma preferido: ${input.locale || 'es-CL'}. Zona horaria: ${input.timezone || 'America/Santiago'}.`,
        ].join(' '),
        audio: {
            input: { turn_detection: { type: 'semantic_vad', eagerness: 'medium', create_response: false, interrupt_response: true } },
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
    // The unified WebRTC endpoint expects the SDP offer and serialized
    // session configuration as ordinary multipart fields. Blob parts add
    // file metadata that the provider rejects as invalid form data.
    // The unified WebRTC endpoint expects ordinary multipart fields. Blob
    // parts add file metadata that the provider rejects as invalid form data.
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
    if (!response.ok) throw providerError(response, bodyText);
    // The WebRTC calls endpoint returns the SDP answer as the response body;
    // the provider call identifier is carried by the Location header. It is
    // not the JSON session envelope used by other Realtime APIs.
    const location = response.headers.get('location');
    let sessionId = location ? location.split('/').filter(Boolean).pop() : null;
    let sdp = bodyText.trim();
    if (!sdp.startsWith('v=')) {
        // Keep a narrow compatibility path for provider/test doubles that
        // still return the older JSON envelope, without treating arbitrary
        // response text as a valid SDP answer.
        try {
            const body = JSON.parse(bodyText);
            sessionId = typeof body?.session?.id === 'string' ? body.session.id : sessionId;
            sdp = typeof body?.transport?.sdp === 'string' ? body.transport.sdp.trim() : '';
        } catch { sdp = ''; }
    }
    if (!sessionId || !sdp) throw new AppError('Live voice provider returned incomplete session data', 503);
    return { sessionId, sdp, model, provider: 'openai_realtime_webrtc' };
}

export function recordM8LiveVoiceTelemetry(actorUserId: string, event: M8LiveVoiceTelemetry): void {
    assertStagingLiveVoiceEnabled();
    const now = new Date().toISOString();
    const existing = telemetryByVoiceSession.get(event.voiceSessionId) ?? {
        actorUserId,
        voiceSessionId: event.voiceSessionId,
        deviceSessionId: event.deviceSessionId,
        createdAt: now,
        lastEventAt: now,
        closed: false,
        events: [],
    };
    if (existing.actorUserId !== actorUserId || existing.deviceSessionId !== event.deviceSessionId) {
        throw new AppError('Live voice telemetry identity mismatch', 403);
    }
    const sanitizedEvent = {
        ...event,
        transcript: sanitizeTelemetryText(event.transcript, 500),
        coreAnswer: sanitizeTelemetryText(event.coreAnswer, 800),
    };
    existing.events.push(sanitizedEvent);
    existing.lastEventAt = now;
    if (event.event === 'session_closed') existing.closed = true;
    if (existing.events.length > MAX_TELEMETRY_EVENTS) existing.events.splice(0, existing.events.length - MAX_TELEMETRY_EVENTS);
    telemetryByVoiceSession.set(event.voiceSessionId, existing);
    latestTelemetryByActor.set(actorUserId, event.voiceSessionId);
    latestTelemetryGlobalVoiceSessionId = event.voiceSessionId;
}

export function getM8LiveVoiceTelemetry(actorUserId: string, voiceSessionId: string) {
    assertStagingLiveVoiceEnabled();
    const existing = telemetryByVoiceSession.get(voiceSessionId);
    if (!existing || existing.actorUserId !== actorUserId) throw new AppError('Live voice telemetry unavailable', 404);
    return {
        voiceSessionId: existing.voiceSessionId,
        deviceSessionId: existing.deviceSessionId,
        createdAt: existing.createdAt,
        lastEventAt: existing.lastEventAt,
        closed: existing.closed,
        eventCount: existing.events.length,
        events: existing.events,
        sideEffects: existing.events.some((event) => (event.sideEffects ?? 0) > 0) ? 1 : 0,
    };
}

export function getLatestM8LiveVoiceTelemetry(actorUserId: string) {
    assertStagingLiveVoiceEnabled();
    const voiceSessionId = latestTelemetryByActor.get(actorUserId);
    if (!voiceSessionId) throw new AppError('Live voice telemetry unavailable', 404);
    return getM8LiveVoiceTelemetry(actorUserId, voiceSessionId);
}

export function getLatestM8LiveVoiceTelemetryInternal() {
    assertStagingLiveVoiceEnabled();
    if (!latestTelemetryGlobalVoiceSessionId) throw new AppError('Live voice telemetry unavailable', 404);
    const existing = telemetryByVoiceSession.get(latestTelemetryGlobalVoiceSessionId);
    if (!existing) throw new AppError('Live voice telemetry unavailable', 404);
    return {
        voiceSessionId: existing.voiceSessionId,
        deviceSessionId: existing.deviceSessionId,
        createdAt: existing.createdAt,
        lastEventAt: existing.lastEventAt,
        closed: existing.closed,
        eventCount: existing.events.length,
        events: existing.events,
        sideEffects: existing.events.some((event) => (event.sideEffects ?? 0) > 0) ? 1 : 0,
    };
}

export function clearM8LiveVoiceTelemetryForTests(): void {
    telemetryByVoiceSession.clear();
    latestTelemetryByActor.clear();
    latestTelemetryGlobalVoiceSessionId = null;
}
