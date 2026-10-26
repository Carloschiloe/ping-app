import { createHash, createHmac } from 'node:crypto';
import { AppError } from '../utils/AppError';
import type { M8LiveVoiceSessionRequest, M8LiveVoiceTelemetry } from '../schemas/m8LiveVoice.schema';
import { supabaseAdmin } from '../lib/supabaseAdmin';

const REALTIME_CALLS_URL = 'https://api.openai.com/v1/realtime/calls';
const DEFAULT_MODEL = 'gpt-realtime-2.1';
const MAX_TELEMETRY_EVENTS = 500;
const TELEMETRY_RETENTION_MS = 7 * 24 * 60 * 60 * 1000;
const DEFAULT_TELEMETRY_BUCKET = 'm8-live-voice-telemetry';
const IN_MEMORY_SESSION_MAX_AGE_MS = 30 * 60 * 1000;
const TELEMETRY_WRITE_MAX_ATTEMPTS = 3;
const TELEMETRY_WRITE_RETRY_DELAYS_MS = [75, 200] as const;

function realtimeLanguage(locale: string | undefined): string {
    const language = (locale || 'es-CL').trim().split(/[-_]/)[0]?.toLowerCase() ?? '';
    return /^[a-z]{2}$/.test(language) ? language : 'es';
}

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

/**
 * WebRTC implementations are allowed to emit LF-only SDP, while the
 * Realtime calls endpoint expects a conventional SDP payload. Keep the
 * offer content intact and only canonicalize line endings/trailing blanks.
 */
function normalizeOfferSdp(value: string): string {
    const crlf = String.fromCharCode(13, 10);
    const lf = String.fromCharCode(10);
    const cr = String.fromCharCode(13);
    const lines = String(value).replaceAll(crlf, lf).replaceAll(cr, lf).split(lf);
    while (lines.length && lines[lines.length - 1] === '') lines.pop();
    return `${lines.join(crlf)}${crlf}`;
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

function sweepInMemoryTelemetry(): void {
    const cutoff = Date.now() - IN_MEMORY_SESSION_MAX_AGE_MS;
    for (const [sessionId, session] of telemetryByVoiceSession) {
        const lastEventAt = Date.parse(session.lastEventAt);
        if (!Number.isFinite(lastEventAt) || lastEventAt < cutoff) {
            telemetryByVoiceSession.delete(sessionId);
            if (latestTelemetryGlobalVoiceSessionId === sessionId) {
                latestTelemetryGlobalVoiceSessionId = null;
            }
            if (latestTelemetryByActor.get(session.actorUserId) === sessionId) {
                latestTelemetryByActor.delete(session.actorUserId);
            }
        }
    }
}

const telemetryCleanupTimer = setInterval(sweepInMemoryTelemetry, 60 * 1000);
telemetryCleanupTimer.unref?.();

function assertLiveVoiceEnabled(): void {
    if (process.env.PING_ENVIRONMENT !== 'production' || process.env.M8_LIVE_VOICE_ENABLED !== 'true') {
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

function modelForLiveVoice(): string {
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
    const language = realtimeLanguage(input.locale);
    return {
        type: 'realtime',
        model,
        instructions: [
            'Eres la interfaz de voz de Ping, no un agente separado.',
            'Habla siempre en español de Chile, con una dicción natural, cálida y clara. No cambies al inglés por defecto aunque el dispositivo tenga otro idioma.',
            'Para cada turno del usuario espera la transcripción finalizada y llama a ping_core_turn con esa transcripción exacta. No resumas, corrijas, traduzcas ni sustituyas palabras del usuario; conserva especialmente fechas, horas, números y términos como mañana.',
            'Antes de recibir el resultado de Ping Core no produzcas texto narrativo, audio, hechos, razones ni explicaciones.',
            'Después de recibir core_presentation, verbaliza únicamente authorizedText y conserva confirmationRequired, confirmationLabel y cancelLabel. No agregues hechos, razones, capacidades, accesos, memoria, resultados ni acciones.',
            'Una propuesta nunca es una ejecución: conserva siempre la confirmación explícita requerida por el Core.',
            `Idioma de transcripción y respuesta: ${language}. Zona horaria: ${input.timezone || 'America/Santiago'}.`,
        ].join(' '),
        audio: {
            input: {
                transcription: {
                    model: process.env.M8_LIVE_VOICE_TRANSCRIPTION_MODEL?.trim() || 'gpt-4o-mini-transcribe',
                    language,
                    prompt: 'Transcribe en español de Chile. Conserva nombres propios, fechas, horas y números; no traduzcas ni agregues palabras.',
                },
                turn_detection: { type: 'semantic_vad', eagerness: 'medium', create_response: false, interrupt_response: true },
            },
            // OpenAI currently recommends marin or cedar for highest quality;
            // cedar is the default here because the previous marin baseline
            // was reported as unnatural in the physical production probe.
            output: { voice: process.env.M8_LIVE_VOICE_OUTPUT_VOICE?.trim() || 'cedar' },
        },
        tools: [coreToolDefinition()],
        tool_choice: 'required',
    };
}

function safetyIdentifier(actorUserId: string): string {
    return createHash('sha256').update(`ping-production:${actorUserId}`).digest('hex');
}

function telemetryPersistenceEnabled(): boolean {
    return process.env.M8_LIVE_VOICE_TELEMETRY_PERSISTENCE === 'true'
        && process.env.NODE_ENV !== 'test';
}

function conversationScopeHash(conversationId: string | undefined): string | undefined {
    if (!conversationId) return undefined;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
    if (!key) return undefined;
    return createHmac('sha256', key).update(`ping-production-conversation:${conversationId}`).digest('hex');
}

function telemetryBucket(): string {
    const configured = process.env.M8_LIVE_VOICE_TELEMETRY_BUCKET?.trim() || DEFAULT_TELEMETRY_BUCKET;
    if (!/^[a-z0-9][a-z0-9-]{2,62}$/.test(configured)) throw new AppError('Invalid live voice telemetry storage configuration', 500);
    return configured;
}

let telemetryBucketReady: Promise<void> | null = null;
const telemetryWriteQueues = new Map<string, Promise<void>>();
type TelemetryPersistenceState = 'unknown' | 'ready' | 'degraded';
let telemetryPersistenceState: TelemetryPersistenceState = 'unknown';
let telemetryPersistenceLastSuccessAt: string | null = null;
let telemetryPersistenceLastFailureAt: string | null = null;
let telemetryPersistenceLastFailureCode: string | number | null = null;

function markTelemetryPersistenceReady(): void {
    telemetryPersistenceState = 'ready';
    telemetryPersistenceLastSuccessAt = new Date().toISOString();
}

function markTelemetryPersistenceDegraded(error: unknown): void {
    telemetryPersistenceState = 'degraded';
    telemetryPersistenceLastFailureAt = new Date().toISOString();
    telemetryPersistenceLastFailureCode = error instanceof AppError ? error.statusCode : 'unknown';
}

type TelemetryStorageError = AppError & { storageDiagnostic?: string };

function telemetryStorageError(message: string, providerError?: { message?: string } | null): TelemetryStorageError {
    const error = new AppError(message, 503) as TelemetryStorageError;
    const providerValue = providerError as ({ message?: unknown; statusCode?: unknown; code?: unknown; name?: unknown } | null | undefined);
    const providerMessage = typeof providerValue?.message === 'string'
        ? providerValue.message
        : [providerValue?.name, providerValue?.code, providerValue?.statusCode]
            .filter((value) => value !== undefined && value !== null && String(value).trim())
            .join(' ');
    const detail = providerMessage
        ? providerMessage
            .replace(/Bearer\s+[^\s]+/gi, 'Bearer [redacted]')
            .replace(/https?:\/\/[^\s]+/gi, '[url redacted]')
            .replace(/(api[_-]?key|access[_-]?token|refresh[_-]?token|authorization|password|secret)\s*[:=]\s*[^\s,;]+/gi, '$1=[redacted]')
            .slice(0, 160)
        : undefined;
    if (detail) error.storageDiagnostic = detail;
    return error;
}

function telemetryErrorDiagnostic(error: unknown): string | undefined {
    const value = error as { storageDiagnostic?: unknown; message?: unknown } | null;
    if (typeof value?.storageDiagnostic === 'string') return value.storageDiagnostic;
    if (typeof value?.message === 'string') return value.message.slice(0, 160);
    return undefined;
}

export function getM8LiveVoiceTelemetryPersistenceStatus() {
    const configured = telemetryPersistenceEnabled();
    return {
        configured,
        state: configured ? telemetryPersistenceState : 'disabled' as const,
        last_success_at: telemetryPersistenceLastSuccessAt,
        last_failure_at: telemetryPersistenceLastFailureAt,
        last_failure_code: telemetryPersistenceLastFailureCode,
    };
}

async function ensureTelemetryBucket(): Promise<void> {
    if (!telemetryPersistenceEnabled()) return;
    if (!telemetryBucketReady) {
        const pending = (async () => {
            const bucketName = telemetryBucket();
            // Storage provisioning is an infrastructure concern and must not
            // happen from the request path. Verify the explicitly provisioned
            // private bucket; a missing bucket is a configuration failure that
            // must remain visible instead of being masked by an admin-level
            // createBucket attempt.
            const listed = await supabaseAdmin.storage.listBuckets();
            if (listed.error) throw telemetryStorageError('Live voice telemetry storage unavailable', listed.error);
            const exists = (listed.data || []).some((bucket) => bucket.name === bucketName);
            if (!exists) throw telemetryStorageError('Live voice telemetry bucket is not configured', { message: `bucket_not_configured:${bucketName}` });
            markTelemetryPersistenceReady();
        })();
        // Do not permanently cache a transient provider/storage failure. A
        // later voice session must be able to recover without a process restart.
        telemetryBucketReady = pending.catch((error) => {
            markTelemetryPersistenceDegraded(error);
            telemetryBucketReady = null;
            throw error;
        });
    }
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

function mergeTelemetryEvents(...sources: Array<unknown[]>): M8LiveVoiceTelemetry[] {
    const seen = new Set<string>();
    const merged: M8LiveVoiceTelemetry[] = [];
    for (const source of sources) {
        for (const item of source) {
            if (!item || typeof item !== 'object') continue;
            const event = item as M8LiveVoiceTelemetry;
            const identity = JSON.stringify(event);
            if (seen.has(identity)) continue;
            seen.add(identity);
            merged.push(event);
        }
    }
    return merged.slice(-MAX_TELEMETRY_EVENTS);
}

async function downloadJson(path: string): Promise<Record<string, any> | null> {
    const { data, error } = await supabaseAdmin.storage.from(telemetryBucket()).download(path);
    if (error) {
        if (/not found|404|object does not exist/i.test(error.message || '')) return null;
        throw telemetryStorageError('Live voice telemetry storage unavailable', error);
    }
    try {
        return JSON.parse(await data.text()) as Record<string, any>;
    } catch {
        throw telemetryStorageError('Live voice telemetry storage unavailable');
    }
}

function isTransientTelemetryStorageError(error: { message?: string; statusCode?: number | string } | null): boolean {
    const statusCode = Number(error?.statusCode);
    if (statusCode === 408 || statusCode === 429 || (Number.isFinite(statusCode) && statusCode >= 500)) return true;
    return /network|timeout|timed out|temporar(?:y|ily).*unavailable|service unavailable|connection reset|connection refused/i
        .test(error?.message ?? '');
}

async function waitForTelemetryWriteRetry(attempt: number): Promise<void> {
    const delay = TELEMETRY_WRITE_RETRY_DELAYS_MS[attempt - 1];
    if (delay === undefined) return;
    await new Promise<void>((resolve) => setTimeout(resolve, delay));
}

async function uploadJson(path: string, value: unknown): Promise<void> {
    let error: { message?: string; statusCode?: number | string } | null = null;
    for (let attempt = 1; attempt <= TELEMETRY_WRITE_MAX_ATTEMPTS; attempt += 1) {
        const response = await supabaseAdmin.storage.from(telemetryBucket()).upload(path, Buffer.from(JSON.stringify(value)), { contentType: 'application/json', upsert: true });
        error = response.error;
        if (!error || !isTransientTelemetryStorageError(error) || attempt === TELEMETRY_WRITE_MAX_ATTEMPTS) break;
        await waitForTelemetryWriteRetry(attempt);
    }
    if (error) throw telemetryStorageError('Live voice telemetry persistence failed', error);
}

async function cleanupExpiredTelemetry(): Promise<void> {
    const { data, error } = await supabaseAdmin.storage.from(telemetryBucket()).list('latest', { limit: 1000, sortBy: { column: 'updated_at', order: 'asc' } });
    if (error) throw telemetryStorageError('Live voice telemetry storage unavailable', error);
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
    try {
        await ensureTelemetryBucket();
    } catch (error) {
        markTelemetryPersistenceDegraded(error);
        console.warn('[M8_TELEMETRY_DEGRADED]', {
            voiceSessionIdHash: safetyIdentifier(event.voiceSessionId),
            errorCode: error instanceof AppError ? error.statusCode : 'unknown',
            errorMessage: telemetryErrorDiagnostic(error),
        });
        return;
    }
    const previous = telemetryWriteQueues.get(event.voiceSessionId) || Promise.resolve();
    const next = previous.catch(() => undefined).then(async () => {
        const path = telemetryPath(actorUserId, event.voiceSessionId);
        const existing = await downloadJson(path);
        // If Storage was temporarily unavailable, the in-process event ledger
        // is the authoritative recovery source until the next successful
        // upload. This prevents the first recovered write from silently
        // discarding the events collected during the outage.
        const inMemory = telemetryByVoiceSession.get(event.voiceSessionId);
        const recordEvents = mergeTelemetryEvents(
            Array.isArray(existing?.events) ? existing.events : [],
            inMemory?.events ?? [],
            [payload],
        );
        const now = new Date().toISOString();
        const record = {
            voiceSessionId: event.voiceSessionId,
            deviceSessionId: event.deviceSessionId,
            actorUserIdHash: actorTelemetryHash(actorUserId),
            conversationScopeHash: conversationScopeHash(event.conversationId),
            createdAt: existing?.createdAt || inMemory?.createdAt || now,
            lastEventAt: now,
            closed: existing?.closed === true || inMemory?.closed === true || event.event === 'session_closed',
            eventCount: recordEvents.length,
            events: recordEvents,
            sideEffects: recordEvents.some(item => Number(item?.sideEffects || 0) > 0) ? 1 : 0,
        };
        await uploadJson(path, record);
        await uploadJson(latestTelemetryPath(event.voiceSessionId), { actorUserIdHash: record.actorUserIdHash, voiceSessionId: event.voiceSessionId, updatedAt: now });
        await cleanupExpiredTelemetry();
        markTelemetryPersistenceReady();
    });
    telemetryWriteQueues.set(event.voiceSessionId, next);
    try {
        await next;
    } catch (error) {
        markTelemetryPersistenceDegraded(error);
        // Telemetry is diagnostic side-effect, never a prerequisite for the
        // live voice turn. Keep the sanitized in-memory ledger and allow a
        // later event to retry Storage; the voice client must still receive
        // 202 so a Supabase incident cannot look like a broken conversation.
        console.warn('[M8_TELEMETRY_DEGRADED]', {
            voiceSessionIdHash: safetyIdentifier(event.voiceSessionId),
            errorCode: error instanceof AppError ? error.statusCode : 'unknown',
            errorMessage: telemetryErrorDiagnostic(error),
        });
    } finally {
        if (telemetryWriteQueues.get(event.voiceSessionId) === next) telemetryWriteQueues.delete(event.voiceSessionId);
    }
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
    assertLiveVoiceEnabled();
    const apiKey = process.env.OPENAI_API_KEY?.trim();
    if (!apiKey) throw new AppError('Live voice provider is not configured', 503);

    const model = modelForLiveVoice();
    const form = new FormData();
    // The unified WebRTC endpoint expects the SDP offer and serialized
    // session configuration as ordinary multipart fields. Blob parts add
    // file metadata that the provider rejects as invalid form data.
    // The unified WebRTC endpoint expects ordinary multipart fields. Blob
    // parts add file metadata that the provider rejects as invalid form data.
    form.set('sdp', normalizeOfferSdp(input.request.sdp));
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
    assertLiveVoiceEnabled();
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
    assertLiveVoiceEnabled();
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
    assertLiveVoiceEnabled();
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
    assertLiveVoiceEnabled();
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
    telemetryBucketReady = null;
    telemetryPersistenceState = 'unknown';
    telemetryPersistenceLastSuccessAt = null;
    telemetryPersistenceLastFailureAt = null;
    telemetryPersistenceLastFailureCode = null;
}
