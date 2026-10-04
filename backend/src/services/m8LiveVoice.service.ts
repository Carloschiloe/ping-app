import { createHash, createHmac } from 'node:crypto';
import { AppError } from '../utils/AppError';
import type { M8LiveVoiceSessionRequest, M8LiveVoiceTelemetry } from '../schemas/m8LiveVoice.schema';
import { supabaseAdmin } from '../lib/supabaseAdmin';

const REALTIME_CALLS_URL = 'https://api.openai.com/v1/realtime/calls';
const DEFAULT_MODEL = 'gpt-realtime-2.1';
const MAX_TELEMETRY_EVENTS = 500;
const TELEMETRY_RETENTION_MS = 7 * 24 * 60 * 60 * 1000;
const DEFAULT_TELEMETRY_BUCKET = 'm8-live-voice-telemetry';

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
    conversationScopeHash?: string;
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

function telemetryPersistenceEnabled(): boolean {
    return process.env.PING_ENVIRONMENT === 'staging' && process.env.NODE_ENV !== 'test';
}

function conversationScopeHash(conversationId: string | undefined): string | undefined {
    if (!conversationId) return undefined;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
    if (!key) return undefined;
    return createHmac('sha256', key).update(`ping-staging-conversation:${conversationId}`).digest('hex');
}

function telemetryBucket(): string {
    const configured = process.env.M8_LIVE_VOICE_TELEMETRY_BUCKET?.trim() || DEFAULT_TELEMETRY_BUCKET;
    if (!/^[a-z0-9][a-z0-9-]{2,62}$/.test(configured)) throw new AppError('Invalid live voice telemetry storage configuration', 500);
    return configured;
}

let telemetryBucketReady: Promise<void> | null = null;
const telemetryWriteQueues = new Map<string, Promise<void>>();

async function ensureTelemetryBucket(): Promise<void> {
    if (!telemetryPersistenceEnabled()) return;
    telemetryBucketReady ??= (async () => {
        const { error } = await supabaseAdmin.storage.createBucket(telemetryBucket(), { public: false, fileSizeLimit: '2097152', allowedMimeTypes: ['application/json'] });
        if (error && !/already exists|duplicate/i.test(error.message || '')) throw new AppError('Live voice telemetry storage unavailable', 503);
    })();
    await telemetryBucketReady;
}

function actorTelemetryHash(actorUserId: string): string {
    return safetyIdentifier(actorUserId);
}

function telemetryPath(actorUserId: string, voiceSessionId: string): string {
    return `sessions/${actorTelemetryHash(actorUserId)}/${voiceSessionId}.json`;
}

function latestTelemetryPath(voiceSessionId: string): string {
    return `latest/${voiceSessionId}.json`;
}

async function downloadJson(path: string): Promise<Record<string, any> | null> {
    const { data, error } = await supabaseAdmin.storage.from(telemetryBucket()).download(path);
    if (error) {
        if (/not found|404|object does not exist/i.test(error.message || '')) return null;
        throw new AppError('Live voice telemetry storage unavailable', 503);
    }
    try {
        return JSON.parse(await data.text()) as Record<string, any>;
    } catch {
        throw new AppError('Live voice telemetry storage unavailable', 503);
    }
}

async function uploadJson(path: string, value: unknown): Promise<void> {
    const { error } = await supabaseAdmin.storage.from(telemetryBucket()).upload(path, Buffer.from(JSON.stringify(value)), { contentType: 'application/json', upsert: true });
    if (error) throw new AppError('Live voice telemetry persistence failed', 503);
}

async function cleanupExpiredTelemetry(): Promise<void> {
    const { data, error } = await supabaseAdmin.storage.from(telemetryBucket()).list('latest', { limit: 1000, sortBy: { column: 'updated_at', order: 'asc' } });
    if (error) throw new AppError('Live voice telemetry storage unavailable', 503);
    const cutoff = Date.now() - TELEMETRY_RETENTION_MS;
    const expired = (data || []).filter(item => item.updated_at && Date.parse(item.updated_at) < cutoff).map(item => item.name).filter(Boolean);
    if (!expired.length) return;
    const sessionPaths: string[] = [];
    for (const name of expired) {
        const marker = await downloadJson(`latest/${name}`);
        if (marker?.actorUserIdHash && marker.voiceSessionId) sessionPaths.push(`sessions/${marker.actorUserIdHash}/${marker.voiceSessionId}.json`);
    }
    await supabaseAdmin.storage.from(telemetryBucket()).remove([
        ...expired.map(name => `latest/${name}`),
        ...sessionPaths,
    ]);
}

async function persistTelemetryEvent(actorUserId: string, event: M8LiveVoiceTelemetry, payload: Record<string, unknown>): Promise<void> {
    if (!telemetryPersistenceEnabled()) return;
    await ensureTelemetryBucket();
    const previous = telemetryWriteQueues.get(event.voiceSessionId) || Promise.resolve();
    const next = previous.catch(() => undefined).then(async () => {
        const path = telemetryPath(actorUserId, event.voiceSessionId);
        const existing = await downloadJson(path);
        const events = Array.isArray(existing?.events) ? existing.events.slice(-MAX_TELEMETRY_EVENTS + 1) : [];
        const now = new Date().toISOString();
        const record = {
            voiceSessionId: event.voiceSessionId,
            deviceSessionId: event.deviceSessionId,
            actorUserIdHash: actorTelemetryHash(actorUserId),
            conversationScopeHash: conversationScopeHash(event.conversationId),
            createdAt: existing?.createdAt || now,
            lastEventAt: now,
            closed: existing?.closed === true || event.event === 'session_closed',
            eventCount: events.length + 1,
            events: [...events, payload],
            sideEffects: [...events, payload].some(item => Number(item?.sideEffects || 0) > 0) ? 1 : 0,
        };
        await uploadJson(path, record);
        await uploadJson(latestTelemetryPath(event.voiceSessionId), { actorUserIdHash: record.actorUserIdHash, voiceSessionId: event.voiceSessionId, updatedAt: now });
        await cleanupExpiredTelemetry();
    });
    telemetryWriteQueues.set(event.voiceSessionId, next);
    try { await next; } finally { if (telemetryWriteQueues.get(event.voiceSessionId) === next) telemetryWriteQueues.delete(event.voiceSessionId); }
}

function memoryTelemetry(existing: StoredTelemetry) {
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

export async function recordM8LiveVoiceTelemetry(actorUserId: string, event: M8LiveVoiceTelemetry): Promise<void> {
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
    const { conversationId, ...eventWithoutConversationId } = event;
    const sanitizedEvent = {
        ...eventWithoutConversationId,
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
    await persistTelemetryEvent(actorUserId, event, sanitizedEvent);
}

export async function getM8LiveVoiceTelemetry(actorUserId: string, voiceSessionId: string) {
    assertStagingLiveVoiceEnabled();
    if (telemetryPersistenceEnabled()) {
        await ensureTelemetryBucket();
        const data = await downloadJson(telemetryPath(actorUserId, voiceSessionId));
        if (!data) throw new AppError('Live voice telemetry unavailable', 404);
        return data;
    }
    const existing = telemetryByVoiceSession.get(voiceSessionId);
    if (!existing || existing.actorUserId !== actorUserId) throw new AppError('Live voice telemetry unavailable', 404);
    return memoryTelemetry(existing);
}

export async function getLatestM8LiveVoiceTelemetry(actorUserId: string) {
    assertStagingLiveVoiceEnabled();
    if (telemetryPersistenceEnabled()) {
        await ensureTelemetryBucket();
        const { data, error } = await supabaseAdmin.storage.from(telemetryBucket()).list(`sessions/${actorTelemetryHash(actorUserId)}`, { limit: 1000, sortBy: { column: 'updated_at', order: 'desc' } });
        if (error || !data?.[0]?.name) throw new AppError('Live voice telemetry unavailable', 404);
        const latest = await downloadJson(`sessions/${actorTelemetryHash(actorUserId)}/${data[0].name}`);
        if (!latest) throw new AppError('Live voice telemetry unavailable', 404);
        return latest;
    }
    const voiceSessionId = latestTelemetryByActor.get(actorUserId);
    if (!voiceSessionId) throw new AppError('Live voice telemetry unavailable', 404);
    return getM8LiveVoiceTelemetry(actorUserId, voiceSessionId);
}

export async function getLatestM8LiveVoiceTelemetryInternal() {
    assertStagingLiveVoiceEnabled();
    if (telemetryPersistenceEnabled()) {
        await ensureTelemetryBucket();
        const { data, error } = await supabaseAdmin.storage.from(telemetryBucket()).list('latest', { limit: 1000, sortBy: { column: 'updated_at', order: 'desc' } });
        if (error || !data?.[0]?.name) throw new AppError('Live voice telemetry unavailable', 404);
        const marker = await downloadJson(`latest/${data[0].name}`);
        if (!marker?.actorUserIdHash || !marker.voiceSessionId) throw new AppError('Live voice telemetry unavailable', 404);
        const session = await downloadJson(`sessions/${marker.actorUserIdHash}/${marker.voiceSessionId}.json`);
        if (!session) throw new AppError('Live voice telemetry unavailable', 404);
        return session;
    }
    if (!latestTelemetryGlobalVoiceSessionId) throw new AppError('Live voice telemetry unavailable', 404);
    const existing = telemetryByVoiceSession.get(latestTelemetryGlobalVoiceSessionId);
    if (!existing) throw new AppError('Live voice telemetry unavailable', 404);
    return memoryTelemetry(existing);
}

export function clearM8LiveVoiceTelemetryForTests(): void {
    telemetryByVoiceSession.clear();
    latestTelemetryByActor.clear();
    latestTelemetryGlobalVoiceSessionId = null;
}
