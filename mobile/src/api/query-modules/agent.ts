// Mobile client for the Ping assistant (POST /agent/turn) and the voice
// transcription it accepts. Deliberately separate from legacy-ai.ts (/ai/ask,
// ai_messages) -- this file never imports from or writes to the legacy module.
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import * as Localization from 'expo-localization';
import { File } from 'expo-file-system';
import { apiClient, ApiError, AGENT_TURN_REQUEST_TIMEOUT_MS, API_URL, getAuthHeaders } from '../client';
import { invalidateCommitmentViews } from '../query-invalidation';
import { getDeviceTimeZone } from '../../utils/timeZone';
import {
    buildAgentSurfaceRequest,
    surfaceForTurn,
    type AgentAdapterSurface,
    type AgentActionDecision,
    type AgentSurfaceRequestInput,
} from '../agentSurfaceAdapter';
export { buildAgentSurfaceRequest, channelForSurface, publicPingSurface, surfaceForDeviceType, surfaceForTurn } from '../agentSurfaceAdapter';
export type { AgentActionDecision, AgentAdapterChannel, AgentAdapterSurface, AgentSurfaceRequestContext, AgentSurfaceRequestInput } from '../agentSurfaceAdapter';

// M-1H: 'commitment_proposal' — un compromiso todavía no confirmado (tabla
// commitment_proposals, distinta de commitments) — ver backend
// types/retrieval.ts#RetrievalSourceType, misma unión.
export type AgentCitationSourceType = 'commitment' | 'commitment_proposal' | 'commitment_event' | 'message' | 'memory' | 'transcription' | 'attachment' | 'person';

export interface AgentCitation {
    sourceType: AgentCitationSourceType;
    sourceId: string;
    label?: string;
}

export interface AgentFollowUpOption {
    id: string;
    label: string;
}

export interface AgentFollowUp {
    type: string;
    question: string;
    options?: AgentFollowUpOption[];
}

export type AgentResponseStatus = 'answered' | 'needs_clarification' | 'no_evidence' | 'capability_gap';

export interface AgentRespondResult {
    status: AgentResponseStatus;
    answer: string;
    citations: AgentCitation[];
    followUp?: AgentFollowUp;
}

// Sección 10 del ticket: locale real del dispositivo, nunca forzado a
// español. `languageTag` ya viene en el formato "es-CL"/"en-US" que el
// backend espera; se compone manualmente sólo si expo-localization no lo
// provee en el entorno actual.
export function getDeviceLocale(): string {
    try {
        const locales = Localization.getLocales?.();
        const first = locales && locales.length > 0 ? locales[0] : null;
        if (first?.languageTag) return first.languageTag;
        if (first?.languageCode) return first.regionCode ? `${first.languageCode}-${first.regionCode}` : first.languageCode;
    } catch {
        // Localization no disponible (ej. entorno de test) -- cae al default de abajo.
    }
    return 'en-US';
}


export interface AgentVoiceTranscriptResult {
    status: 'final';
    transcript: {
        transcriptId: string;
        audioRef: string;
        text: string;
        language: string | null;
        confidence: number | null;
        provider: string;
        observedAt: string;
        source: 'agent_voice';
    };
    voiceInputToken: string;
    tokenExpiresAt: string;
    agentSessionId: string;
}

export interface AgentVoiceCaptureRequest {
    uri: string;
    mimeType: 'audio/m4a' | 'audio/mp4' | 'audio/aac' | 'audio/mpeg' | 'audio/wav';
    durationMs: number;
    capturedAt: string;
    voiceSessionId: string;
    deviceSessionId: string;
    conversationId?: string;
    currentCommitmentId?: string;
    surface?: Exclude<AgentAdapterSurface, 'mobile_text'>;
    signal?: AbortSignal;
}

export function buildAgentVoiceTranscriptionUrl(input: Omit<AgentVoiceCaptureRequest, 'uri' | 'mimeType'>): string {
    const params: Record<string, string> = {
        durationMs: String(Math.round(input.durationMs)),
        capturedAt: input.capturedAt,
        voiceSessionId: input.voiceSessionId,
        deviceSessionId: input.deviceSessionId,
        surface: input.surface ?? 'mobile_voice',
        locale: getDeviceLocale(),
        timezone: getDeviceTimeZone(),
        activeScreen: 'agent_preview',
        consent: 'explicit_user_action',
    };
    if (input.conversationId) params.currentConversationId = input.conversationId;
    if (input.currentCommitmentId) params.currentCommitmentId = input.currentCommitmentId;
    const query = Object.entries(params).map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value)}`).join('&');
    return `${API_URL.replace(/\/$/, '')}/agent/voice/transcribe?${query}`;
}

export function parseAgentVoiceTranscript(raw: unknown): AgentVoiceTranscriptResult {
    if (!raw || typeof raw !== 'object') throw new Error('invalid_voice_transcript_shape');
    const value = raw as AgentVoiceTranscriptResult;
    if (value.status !== 'final'
        || !value.transcript
        || typeof value.transcript.transcriptId !== 'string'
        || typeof value.transcript.audioRef !== 'string'
        || typeof value.transcript.text !== 'string'
        || !value.transcript.text.trim()
        || value.transcript.source !== 'agent_voice'
        || typeof value.voiceInputToken !== 'string'
        || typeof value.agentSessionId !== 'string') {
        throw new Error('invalid_voice_transcript_shape');
    }
    return value;
}

export async function transcribeAgentVoice(input: AgentVoiceCaptureRequest): Promise<AgentVoiceTranscriptResult> {
    const headers = await getAuthHeaders();
    // En Android, fetch(file://...) no es una forma fiable de leer el archivo
    // que acaba de cerrar expo-audio: según la versión del sistema puede
    // devolver Network request failed aunque el archivo exista. Usa la API
    // nativa de expo-file-system para obtener los bytes directamente.
    const audioFile = new File(input.uri);
    let body: ArrayBuffer;
    // El fallback conserva compatibilidad con mocks/entornos antiguos que no
    // exponen la API moderna de File. En la APK de producción se usa el
    // lector nativo de File cuando está disponible.
    if (typeof audioFile.arrayBuffer === 'function') {
        if ((audioFile as File & { exists?: boolean }).exists === false) {
            throw new Error('No se pudo leer el archivo de audio local.');
        }
        body = await audioFile.arrayBuffer();
    } else {
        const localResponse = await fetch(input.uri);
        if (!localResponse.ok) throw new Error('No se pudo leer el archivo de audio local.');
        body = await localResponse.arrayBuffer();
    }
    if (body.byteLength === 0) throw new Error('El archivo de audio está vacío.');
    const response = await fetch(buildAgentVoiceTranscriptionUrl(input), {
        method: 'POST',
        headers: { Authorization: headers.Authorization, 'Content-Type': input.mimeType },
        body,
        signal: input.signal,
    });
    const responseText = await response.text();
    let raw: unknown;
    try { raw = responseText ? JSON.parse(responseText) : null; } catch { raw = null; }
    if (!response.ok) {
        const code = raw && typeof raw === 'object' && typeof (raw as any).error === 'string'
            ? (raw as any).error
            : response.status === 413 ? 'audio_too_large' : 'transcription_failed';
        throw new ApiError(code, response.status, false);
    }
    return parseAgentVoiceTranscript(raw);
}

const VALID_STATUSES = new Set<string>(['answered', 'needs_clarification', 'no_evidence', 'capability_gap']);

// Sección 32 del ticket: validación defensiva del shape -- si el backend
// alguna vez devolviera algo inesperado, esto lanza un error genérico
// manejable en vez de dejar que un `undefined.answer` crashee la pantalla.
export function parseAgentResponse(raw: unknown): AgentRespondResult {
    if (!raw || typeof raw !== 'object') throw new Error('invalid_agent_response_shape');
    const obj = raw as Record<string, unknown>;
    if (typeof obj.status !== 'string' || !VALID_STATUSES.has(obj.status)) throw new Error('invalid_agent_response_shape');
    if (typeof obj.answer !== 'string') throw new Error('invalid_agent_response_shape');
    if (!Array.isArray(obj.citations)) throw new Error('invalid_agent_response_shape');

    const citations: AgentCitation[] = obj.citations
        .filter((c: any) => !!c && typeof c.sourceType === 'string' && typeof c.sourceId === 'string')
        .map((c: any): AgentCitation => ({
            sourceType: c.sourceType,
            sourceId: c.sourceId,
            ...(typeof c.label === 'string' && c.label.trim() ? { label: c.label.trim() } : {}),
        }));

    let followUp: AgentFollowUp | undefined;
    if (obj.followUp && typeof obj.followUp === 'object') {
        const f = obj.followUp as Record<string, unknown>;
        if (typeof f.type === 'string' && typeof f.question === 'string') {
            const options = Array.isArray(f.options)
                ? f.options.filter((o: any): o is AgentFollowUpOption => !!o && typeof o.id === 'string' && typeof o.label === 'string')
                : undefined;
            followUp = { type: f.type, question: f.question, options };
        }
    }

    return { status: obj.status as AgentResponseStatus, answer: obj.answer, citations, followUp };
}

// Sección 18 del ticket: copy seguro por status HTTP, nunca detalle de
// proveedor/infra. `ApiError` (mobile/src/api/client.ts) es lo único que
// carga un `.status` real -- cualquier otro throw (fetch de red, JSON
// inválido) cae al genérico/red.
export function mapAgentErrorMessage(error: unknown): string {
    if (error instanceof ApiError) {
        switch (error.status) {
            case 401: return 'Tu sesión expiró. Vuelve a iniciar sesión.';
            case 403: return 'No tienes acceso a ese contexto.';
            case 429: {
                const retryAfter = error.retryAfterSeconds;
                if (retryAfter !== undefined && retryAfter > 0 && retryAfter < 120) {
                    return `Demasiadas consultas. Reintenta en ${retryAfter} segundos.`;
                }
                if (retryAfter !== undefined && retryAfter >= 120) {
                    const minutes = Math.max(1, Math.ceil(retryAfter / 60));
                    return `Demasiadas consultas. Reintenta en aproximadamente ${minutes} minutos.`;
                }
                return 'Demasiadas consultas. Intenta nuevamente cuando se libere el límite.';
            }
            default: return 'No pude responder ahora. Intenta nuevamente.';
        }
    }
    if (error instanceof TypeError) return 'No hay conexión con Ping.';
    return 'No pude responder ahora. Intenta nuevamente.';
}

// ─── Agent Turn (POST /agent/turn) ───────────────────────────────────────────
// Every surface talks to the assistant through this one entry point. It
// answers in text and may propose actions that wait for Confirm/Cancel.

export interface AgentTurnDebugMetadata {
    traceId: string;
    [key: string]: unknown;
}

export interface AgentTurnResponse {
    kind: 'response';
    response: AgentRespondResult;
    /** Assistant actions proposed in this turn that wait for Confirm/Cancel. */
    pendingActions?: AgentPendingAction[];
    /** Set when this turn executed a confirmed action; views showing commitments refresh. */
    changed?: true;
    /** Ping wrote this turn on its own initiative: there is no user message. */
    initiative?: { kind: string };
    debug?: AgentTurnDebugMetadata;
}

export interface AgentPendingAction {
    ref: string;
    summary: string;
}

export type AgentTurnResult = AgentTurnResponse;

export interface AgentConversationTurnRecord {
    id: string;
    conversationId: string;
    actorUserId: string;
    clientTurnKey: string;
    inputText: string;
    inputMode: 'text' | 'voice' | 'reviewed_voice_text';
    result: AgentTurnResponse;
    createdAt: string;
}

export interface AgentTurnInput {
    input?: string;
    voiceInputToken?: string;
    /** Signed provenance retained after the user reviews the visible transcript. */
    reviewedVoiceInputToken?: string;
    conversationId?: string;
    /** Delivery surface metadata; semantic routing remains backend-owned. */
    channel?: 'mobile' | 'web' | 'desktop' | 'tablet' | 'car' | 'device';
    /** Stable across retries of one logical turn; never sent in the body. */
    idempotencyKey?: string;
    /** Confirm/Cancel button answering one pending assistant action; `input` is the button label. */
    actionDecision?: AgentActionDecision;
}

export function createAgentTurnIdempotencyKey(): string {
    return `mobile-turn-${Date.now()}-${Math.random().toString(36).slice(2, 12)}`;
}

export type AgentSurfaceTurnInput = AgentSurfaceRequestInput;

/**
 * Surface-neutral adapter contract. A future tablet/desktop client can reuse
 * this request construction without reimplementing idempotency or changing
 * the Core-owned response semantics.
 */
export function buildAgentSurfaceTurnRequest(input: AgentSurfaceTurnInput): {
    body: Record<string, unknown>;
    headers: Record<string, string>;
} {
    return buildAgentSurfaceRequest(input, {
        timezone: getDeviceTimeZone(),
        locale: getDeviceLocale(),
    });
}

export function adapterSurfaceForTurn(input: AgentTurnInput): AgentAdapterSurface {
    return surfaceForTurn(input);
}

/**
 * Turns saved before the assistant (plans, clarifications, executions) are
 * shown as their plain text; they can no longer be confirmed.
 */
function legacyTurnText(obj: Record<string, unknown>): string | null {
    const text = (value: unknown) => (typeof value === 'string' && value.trim() ? value : null);
    if (obj.kind === 'plan') {
        return text((obj.presentation as any)?.summary) ?? text((obj.plan as any)?.humanReadableSummary);
    }
    if (obj.kind === 'clarification' && Array.isArray(obj.questions)) {
        return text(obj.questions.map((question: any) => question?.question).filter(Boolean).join('\n'));
    }
    if (obj.kind === 'unsupported') return text(obj.reason);
    if (obj.kind === 'execution') return text((obj.execution as any)?.humanReadableSummary);
    return null;
}

export function parseAgentTurnResult(raw: unknown): AgentTurnResult {
    if (!raw || typeof raw !== 'object') throw new Error('invalid_agent_turn_shape');
    const obj = raw as Record<string, unknown>;
    if (obj.kind !== 'response') {
        const answer = legacyTurnText(obj);
        if (!answer) throw new Error('invalid_agent_turn_shape');
        return { kind: 'response', response: { status: 'answered', answer, citations: [] } };
    }
    const result: AgentTurnResponse = { kind: 'response', response: parseAgentResponse(obj.response) };
    const pendingActions = Array.isArray(obj.pendingActions)
        ? obj.pendingActions.filter((action: any): action is AgentPendingAction => (
            !!action && typeof action.ref === 'string' && typeof action.summary === 'string'))
        : [];
    if (pendingActions.length) result.pendingActions = pendingActions;
    if (obj.changed === true) result.changed = true;
    const initiative = obj.initiative as Record<string, unknown> | undefined;
    if (initiative && typeof initiative.kind === 'string') result.initiative = { kind: initiative.kind };
    if (obj.debug && typeof obj.debug === 'object') result.debug = obj.debug as AgentTurnDebugMetadata;
    return result;
}

export function parseAgentConversationTurns(raw: unknown): {
    enabled: boolean;
    turns: AgentConversationTurnRecord[];
} {
    if (!raw || typeof raw !== 'object') throw new Error('invalid_agent_conversation_history_shape');
    const value = raw as Record<string, unknown>;
    if (typeof value.enabled !== 'boolean' || !Array.isArray(value.turns)) {
        throw new Error('invalid_agent_conversation_history_shape');
    }

    const turns: AgentConversationTurnRecord[] = [];
    for (const rawTurn of value.turns) {
        if (!rawTurn || typeof rawTurn !== 'object') continue;
        const row = rawTurn as Record<string, unknown>;
        if (typeof row.id !== 'string'
            || typeof row.conversationId !== 'string'
            || typeof row.actorUserId !== 'string'
            || typeof row.clientTurnKey !== 'string'
            || typeof row.inputText !== 'string'
            || !['text', 'voice', 'reviewed_voice_text'].includes(String(row.inputMode))
            || typeof row.createdAt !== 'string') continue;
        try {
            turns.push({
                id: row.id,
                conversationId: row.conversationId,
                actorUserId: row.actorUserId,
                clientTurnKey: row.clientTurnKey,
                inputText: row.inputText,
                inputMode: row.inputMode as AgentConversationTurnRecord['inputMode'],
                result: parseAgentTurnResult(row.result),
                createdAt: row.createdAt,
            });
        } catch {
            // A single future/unknown event must not erase the usable history.
        }
    }
    return { enabled: value.enabled, turns };
}

export function isAgentConversationEventsEnabled(): boolean {
    // The backend is the rollout authority and returns `{ enabled: false }`
    // when the persistence contract is disabled. Keeping the client default
    // enabled is required for Expo Go and for OTA-compatible builds where this
    // optional flag is not present in the local environment.
    return process.env.EXPO_PUBLIC_ENABLE_AGENT_CONVERSATION_EVENTS !== 'false';
}

export function useAgentConversationTurns(conversationId?: string) {
    return useQuery({
        queryKey: ['agent-conversation-turns', conversationId],
        queryFn: async () => parseAgentConversationTurns(
            await apiClient.get(`/conversations/${conversationId}/agent-turns`)
        ),
        enabled: Boolean(conversationId && isAgentConversationEventsEnabled()),
        staleTime: 60_000,
        // Durable history is the continuity source for restarts and other
        // devices. A transient mobile/network failure must not turn into a
        // permanent empty conversation until the user manually remounts it.
        refetchOnMount: true,
        refetchOnReconnect: 'always',
        retry: 2,
        retryDelay: attemptIndex => Math.min(1_000 * (2 ** attemptIndex), 5_000),
        refetchInterval: 60_000,
        refetchIntervalInBackground: false,
    });
}

/**
 * Network adapter shared by mobile and future tablet/desktop surfaces. The
 * caller provides only the surface and user turn; request headers, parsing
 * and diagnostic handling stay in one place.
 */
export async function requestAgentSurfaceTurn(input: AgentSurfaceTurnInput): Promise<AgentTurnResult> {
    const request = buildAgentSurfaceTurnRequest(input);
    const raw = await apiClient.post('/agent/turn', request.body, request.headers, {
        timeoutMs: AGENT_TURN_REQUEST_TIMEOUT_MS,
    });
    const result = parseAgentTurnResult(raw);
    // Expo/RN provides __DEV__ at runtime, while pure Node tests do not.
    // Keep diagnostics enabled during development without making the
    // shared adapter depend on a native global.
    const isDevelopmentRuntime = typeof __DEV__ !== 'undefined' && __DEV__;
    if (isDevelopmentRuntime && result.debug) {
        console.log('PING_DEVICE_TRACE', result.debug);
    }
    return result;
}

/**
 * Commitments, proposals and the originating chat can change when a turn
 * executes a confirmed action, so the same views every direct commitment
 * mutation refreshes are refreshed here too.
 */
export function useAgentTurn() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: async (input: AgentTurnInput): Promise<AgentTurnResult> => {
            return requestAgentSurfaceTurn({
                ...input,
                surface: adapterSurfaceForTurn(input),
            });
        },
        onSuccess: (result) => {
            if (!result.changed) return;
            invalidateCommitmentViews(queryClient, {
                includeAgreementProposals: true,
                includeAgentTurns: true,
            });
        },
    });
}
