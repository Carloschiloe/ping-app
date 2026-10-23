// M-1G — Mobile client for the new read-only Ping Agent (POST /agent/respond,
// backend/src/controllers/agent.controller.ts). Deliberately separate from
// legacy-ai.ts (/ai/ask, ai_messages) -- the two coexist, this file never
// imports from or writes to the legacy module.
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
    type AgentSurfaceRequestInput,
} from '../agentSurfaceAdapter';
export { buildAgentSurfaceRequest, channelForSurface, publicPingSurface, surfaceForDeviceType, surfaceForTurn } from '../agentSurfaceAdapter';
export type { AgentAdapterChannel, AgentAdapterSurface, AgentSurfaceRequestContext, AgentSurfaceRequestInput } from '../agentSurfaceAdapter';

// M-1H: 'commitment_proposal' — un compromiso todavía no confirmado (tabla
// commitment_proposals, distinta de commitments) — ver backend
// types/retrieval.ts#RetrievalSourceType, misma unión.
export type AgentCitationSourceType = 'commitment' | 'commitment_proposal' | 'commitment_event' | 'message' | 'transcription' | 'attachment' | 'person';

export interface AgentCitation {
    sourceType: AgentCitationSourceType;
    sourceId: string;
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

export interface AgentRespondInput {
    input?: string;
    conversationId?: string;
    voiceInputToken?: string;
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

// Sección 2/9/11 del ticket: actorUserId NUNCA se envía (viene de
// requireAuth en el backend); channel="mobile" es sólo metadata; timezone/
// locale son los reales del dispositivo, nunca hardcodeados.
export function buildAgentRequestBody(input: AgentRespondInput): Record<string, unknown> {
    if (input.voiceInputToken) return { voiceInputToken: input.voiceInputToken };
    const body: Record<string, unknown> = {
        input: input.input?.trim(),
        channel: 'mobile',
        timezone: getDeviceTimeZone(),
        locale: getDeviceLocale(),
    };
    if (input.conversationId) body.conversationId = input.conversationId;
    return body;
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

    const citations: AgentCitation[] = obj.citations.filter(
        (c: any): c is AgentCitation => !!c && typeof c.sourceType === 'string' && typeof c.sourceId === 'string'
    );

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
                return 'Demasiadas consultas. Intenta nuevamente cuando se libere el límite.';
            }
            default: return 'No pude responder ahora. Intenta nuevamente.';
        }
    }
    if (error instanceof TypeError) return 'No hay conexión con Ping.';
    return 'No pude responder ahora. Intenta nuevamente.';
}

export function useAgentRespond() {
    return useMutation({
        mutationFn: async (input: AgentRespondInput): Promise<AgentRespondResult> => {
            const body = buildAgentRequestBody(input);
            const raw = await apiClient.post('/agent/respond', body);
            return parseAgentResponse(raw);
        },
    });
}

// ─── M-6: Unified Agent Turn (POST /agent/turn) ──────────────────────────────
// Single entry point. Core decides: response | plan | clarification | unsupported.
// Mobile renders based on kind discriminator — NO semantic routing heuristics.

export type AgentTurnKind = 'response' | 'plan' | 'clarification' | 'unsupported';
export type AgentConversationResultKind = AgentTurnKind | 'execution';

export interface AgentTurnDebugMetadata {
    traceId: string;
    dialogueScopeKey: string | null;
    stateFound: boolean;
    dialogueLifecycle: string | null;
    pendingClarificationField: string | null;
    openObjectiveType: string | null;
    dialogueVersion: number | null;
    turnSequence: number | null;
    clarificationAttempted: boolean;
    clarificationOutcome: string | null;
    routingDecision: string | null;
    personCandidateCount: number | null;
    responseKind: string | null;
    sourceRefCount: number | null;
}

export interface AgentTurnResponse {
    kind: 'response';
    response: AgentRespondResult;
    debug?: AgentTurnDebugMetadata;
}

export interface AgentPlanStepPresentation {
    stepId: string;
    toolId: string;
    headline: string;
    effectDescription: string;
    targetLabel?: string;
    recipientLabel?: string;
    contentPreview?: string;
    dateLabel?: string;
    riskLabel?: string;
    confirmationLabel: string;
    cancelLabel: string;
    requiresExplicitConfirmation: boolean;
    phase: 'immediate' | 'conditional';
    conditionLabel?: string;
}

export interface AgentPlanPresentation {
    headline: string;
    summary: string;
    effectDescription: string;
    targetLabel?: string;
    dateLabel?: string;
    riskLabel?: string;
    confirmationLabel: string;
    cancelLabel: string;
    stepPresentations: AgentPlanStepPresentation[];
    requiresExplicitConfirmation: boolean;
    expiresAt: string;
    planId: string;
    planDigest: string;
    objectiveType: string;
}

export interface AgentTurnPlan {
    kind: 'plan';
    confirmationRequested?: boolean;
    plan: {
        planId: string;
        status: string;
        objectiveType: string;
        humanReadableSummary: string;
        steps: {
            stepId: string;
            toolId: string;
            operation: string;
            dependsOn: string[];
            expectedEffect: string;
            sideEffectClass: string;
            riskLevel: 'low' | 'medium' | 'high';
            confirmationRequirement: string;
            conditionDescription: string;
        }[];
        canExecute: boolean;
        clarification?: { field: string; question: string; options?: { id: string; label: string }[] }[];
        failureMode?: string;
        failureMessage?: string;
        planDigest?: string;
    };
    presentation: AgentPlanPresentation;
    debug?: AgentTurnDebugMetadata;
}

export interface AgentTurnClarification {
    kind: 'clarification';
    questions: { field: string; question: string; options?: { id: string; label: string }[] }[];
    partialResponse?: AgentRespondResult;
    debug?: AgentTurnDebugMetadata;
}

export interface AgentTurnUnsupported {
    kind: 'unsupported';
    reason: string;
    supportedExamples?: string[];
    debug?: AgentTurnDebugMetadata;
}

export type AgentTurnResult =
    | AgentTurnResponse
    | AgentTurnPlan
    | AgentTurnClarification
    | AgentTurnUnsupported;

export interface AgentConversationTurnRecord {
    id: string;
    conversationId: string;
    actorUserId: string;
    clientTurnKey: string;
    inputText: string;
    inputMode: 'text' | 'voice' | 'reviewed_voice_text';
    resultKind: AgentConversationResultKind;
    result: AgentConversationEventResult;
    createdAt: string;
}

export interface AgentConversationHistoryMetadata {
    dialogueConversationId: string | null;
}

export interface AgentExecutionConversationEvent {
    kind: 'execution';
    execution: AgentExecutionResult;
    presentation: AgentPlanPresentation;
}

export type AgentConversationEventResult = AgentTurnResult | AgentExecutionConversationEvent;

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
    /** Explicit test-build capability opt-in; semantic meaning remains backend-owned. */
    readCapability?: 'commitment_count_v4';
}

export const READ_V4_EXACT_COUNT_OPT_IN = 'commitment_count_v4' as const;

export function createAgentTurnIdempotencyKey(): string {
    return `mobile-turn-${Date.now()}-${Math.random().toString(36).slice(2, 12)}`;
}

export function buildAgentTurnHeaders(input: AgentTurnInput): Record<string, string> {
    return input.idempotencyKey
        ? { 'Idempotency-Key': input.idempotencyKey }
        : {};
}

function enabledReadCapability(): typeof READ_V4_EXACT_COUNT_OPT_IN | undefined {
    return process.env.NODE_ENV !== 'production'
        && process.env.EXPO_PUBLIC_ENABLE_READ_V4_EXACT_COUNT === 'true'
        ? READ_V4_EXACT_COUNT_OPT_IN
        : undefined;
}

export function buildAgentTurnRequestBody(input: AgentTurnInput): Record<string, unknown> {
    if (input.voiceInputToken) return { voiceInputToken: input.voiceInputToken };
    if (input.reviewedVoiceInputToken) return {
        input: input.input?.trim(),
        reviewedVoiceInputToken: input.reviewedVoiceInputToken,
    };
    const body: Record<string, unknown> = {
        input: input.input?.trim(),
        channel: input.channel ?? 'mobile',
        timezone: getDeviceTimeZone(),
        locale: getDeviceLocale(),
    };
    if (input.conversationId) body.conversationId = input.conversationId;
    if (input.reviewedVoiceInputToken) body.reviewedVoiceInputToken = input.reviewedVoiceInputToken;
    if (input.readCapability) body.readCapability = input.readCapability;
    return body;
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

export function parseAgentTurnResult(raw: unknown): AgentTurnResult {
    if (!raw || typeof raw !== 'object') throw new Error('invalid_agent_turn_shape');
    const obj = raw as Record<string, unknown>;
    // Older production deploys returned the public response directly from
    // /agent/turn. Accepting that shape keeps a mixed Expo/Render rollout
    // usable while every current response continues through the discriminator.
    if (typeof obj.kind !== 'string'
        && typeof obj.status === 'string'
        && typeof obj.answer === 'string'
        && Array.isArray(obj.citations)) {
        return { kind: 'response', response: parseAgentResponse(obj) };
    }
    if (obj.kind === 'response') {
        parseAgentResponse(obj.response);
    } else if (obj.kind === 'read') {
        // READ V4 is an experimental server-side result. It can still be
        // replayed by the durable boundary, so project its exact-count and
        // terminal states into the public response contract instead of
        // collapsing a valid HTTP 200 into the generic retry error.
        const execution = obj.execution as Record<string, unknown> | undefined;
        if (!execution || typeof execution.status !== 'string') throw new Error('invalid_agent_turn_shape');
        if (execution.status === 'completed' && execution.conclusion === 'count') {
            const count = execution.count as Record<string, unknown> | undefined;
            if (!count || !Number.isInteger(count.value) || Number(count.value) < 0) {
                throw new Error('invalid_agent_turn_shape');
            }
            return {
                kind: 'response',
                response: {
                    status: 'answered',
                    answer: `Tienes ${count.value} compromiso${count.value === 1 ? '' : 's'} pendiente${count.value === 1 ? '' : 's'}.`,
                    citations: [],
                },
            };
        }
        if (execution.status === 'completed' && execution.conclusion === 'no_matching_fact') {
            return {
                kind: 'response',
                response: { status: 'no_evidence', answer: 'No encontré compromisos pendientes.', citations: [] },
            };
        }
        if (execution.status === 'unsupported' || execution.status === 'failed') {
            return {
                kind: 'response',
                response: {
                    status: 'capability_gap',
                    answer: 'No pude completar esa consulta ahora. Intenta nuevamente.',
                    citations: [],
                },
            };
        }
        throw new Error('invalid_agent_turn_shape');
    } else if (obj.kind === 'plan') {
        const plan = obj.plan as Record<string, unknown> | undefined;
        const presentation = obj.presentation as Record<string, unknown> | undefined;
        if (!plan || !presentation
            || typeof plan.planId !== 'string'
            || plan.status !== 'ready_for_authorization'
            || typeof plan.planDigest !== 'string'
            || !Array.isArray(plan.steps)
            || plan.steps.length === 0
            || presentation.planId !== plan.planId
            || presentation.planDigest !== plan.planDigest
            || typeof presentation.confirmationLabel !== 'string'
            || presentation.requiresExplicitConfirmation !== true
            || !Array.isArray(presentation.stepPresentations)) {
            throw new Error('invalid_agent_turn_shape');
        }
    } else if (obj.kind === 'clarification') {
        if (!Array.isArray(obj.questions) || obj.questions.some((question) => (
            !question || typeof question !== 'object' || typeof (question as Record<string, unknown>).question !== 'string'
        ))) throw new Error('invalid_agent_turn_shape');
    } else if (obj.kind === 'unsupported') {
        if (typeof obj.reason !== 'string') throw new Error('invalid_agent_turn_shape');
    } else {
        throw new Error('invalid_agent_turn_shape');
    }
    // The backend returns the full discriminated union — we trust the shape
    return obj as unknown as AgentTurnResult;
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
        // READ events are valid Core events but have a different renderer and
        // are intentionally omitted until the Ping preview exposes that card.
        if (row.resultKind === 'read') continue;
        try {
            let result: AgentConversationEventResult;
            if (row.resultKind === 'execution') {
                const event = row.result as Record<string, unknown>;
                const presentation = event?.presentation as Record<string, unknown> | undefined;
                if (!presentation
                    || typeof presentation.planId !== 'string'
                    || typeof presentation.planDigest !== 'string'
                    || typeof presentation.summary !== 'string'
                    || !Array.isArray(presentation.stepPresentations)) {
                    throw new Error('invalid_agent_execution_history_shape');
                }
                result = {
                    kind: 'execution',
                    execution: parseAgentExecution(event.execution),
                    presentation: presentation as unknown as AgentPlanPresentation,
                };
            } else {
                result = parseAgentTurnResult(row.result);
            }
            turns.push({
                id: row.id,
                conversationId: row.conversationId,
                actorUserId: row.actorUserId,
                clientTurnKey: row.clientTurnKey,
                inputText: row.inputText,
                inputMode: row.inputMode as AgentConversationTurnRecord['inputMode'],
                resultKind: row.resultKind as AgentConversationResultKind,
                result,
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
        retry: false,
    });
}

/**
 * Network adapter shared by mobile and future tablet/desktop surfaces. The
 * caller provides only the surface and user turn; capability flags, request
 * headers, parsing and diagnostic handling stay in one place.
 */
export async function requestAgentSurfaceTurn(input: AgentSurfaceTurnInput): Promise<AgentTurnResult> {
    const capability = input.readCapability ?? enabledReadCapability();
    const requestInput = capability === input.readCapability ? input : { ...input, readCapability: capability };
    const request = buildAgentSurfaceTurnRequest(requestInput);
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

export function useAgentTurn() {
    return useMutation({
        mutationFn: async (input: AgentTurnInput): Promise<AgentTurnResult> => {
            return requestAgentSurfaceTurn({
                ...input,
                surface: adapterSurfaceForTurn(input),
            });
        },
    });
}

// Type guards for discriminated union
export function isAgentTurnResponse(result: AgentTurnResult): result is AgentTurnResponse {
    return result.kind === 'response';
}

export function isAgentTurnPlan(result: AgentTurnResult): result is AgentTurnPlan {
    return result.kind === 'plan';
}

export function isAgentTurnClarification(result: AgentTurnResult): result is AgentTurnClarification {
    return result.kind === 'clarification';
}

export function isAgentTurnUnsupported(result: AgentTurnResult): result is AgentTurnUnsupported {
    return result.kind === 'unsupported';
}

// M-4 authorization/execution contracts consumed by the M-6 surface.
export interface AgentAuthorizationResult {
    authorizationId: string;
    status: 'authorized';
    expiresAt: string;
    authorizedStepIds: string[];
    confirmationLevel: string;
}

export type AgentExecutionFailureCode =
    | 'authorization_missing'
    | 'authorization_expired'
    | 'authorization_revoked'
    | 'authorization_mismatch'
    | 'plan_changed'
    | 'tool_not_executable'
    | 'not_authorized'
    | 'invalid_lifecycle'
    | 'entity_changed'
    | 'condition_not_met'
    | 'idempotent_replay'
    | 'verification_failed'
    | 'transient_failure'
    | 'policy_blocked';

export interface AgentExecutionStepResult {
    stepId: string;
    toolId: string;
    status: 'pending' | 'running' | 'succeeded' | 'failed_retryable' | 'failed_terminal' | 'skipped_condition' | 'blocked' | 'cancelled';
    failureCode?: AgentExecutionFailureCode;
    createdEntityRefs: { entityType: string; entityId: string }[];
    updatedEntityRefs: { entityType: string; entityId: string }[];
    messageSent: boolean;
    verified: boolean;
    idempotentReplay: boolean;
    waitingOn?: string;
}

export interface AgentExecutionResult {
    authorizationId: string;
    status: 'done' | 'partially_done' | 'waiting' | 'blocked' | 'needs_reauthorization' | 'failed';
    executedSteps: AgentExecutionStepResult[];
    failedSteps: AgentExecutionStepResult[];
    waitingSteps: AgentExecutionStepResult[];
    createdEntityRefs: { entityType: string; entityId: string }[];
    updatedEntityRefs: { entityType: string; entityId: string }[];
    messagesSent: number;
    requiresFurtherAuthorization: boolean;
    humanReadableSummary: string;
}

export function buildAgentAuthorizationRequestBody(source: AgentTurnInput, turn: AgentTurnPlan): Record<string, unknown> {
    return {
        ...buildAgentTurnRequestBody(source),
        planDigest: turn.plan.planDigest,
        stepIds: turn.plan.steps.map((step) => step.stepId),
        confirm: true,
    };
}

export function parseAgentAuthorization(raw: unknown): AgentAuthorizationResult {
    if (!raw || typeof raw !== 'object') throw new Error('invalid_agent_authorization_shape');
    const value = raw as Record<string, unknown>;
    if (typeof value.authorizationId !== 'string'
        || value.status !== 'authorized'
        || typeof value.expiresAt !== 'string'
        || !Array.isArray(value.authorizedStepIds)
        || value.authorizedStepIds.some((id) => typeof id !== 'string')
        || typeof value.confirmationLevel !== 'string') {
        throw new Error('invalid_agent_authorization_shape');
    }
    return value as unknown as AgentAuthorizationResult;
}

export function parseAgentExecution(raw: unknown): AgentExecutionResult {
    if (!raw || typeof raw !== 'object') throw new Error('invalid_agent_execution_shape');
    const value = raw as Record<string, unknown>;
    const validStatuses = new Set(['done', 'partially_done', 'waiting', 'blocked', 'needs_reauthorization', 'failed']);
    if (typeof value.authorizationId !== 'string'
        || typeof value.status !== 'string'
        || !validStatuses.has(value.status)
        || !Array.isArray(value.executedSteps)
        || !Array.isArray(value.failedSteps)
        || !Array.isArray(value.waitingSteps)
        || typeof value.humanReadableSummary !== 'string') {
        throw new Error('invalid_agent_execution_shape');
    }
    return value as unknown as AgentExecutionResult;
}

/**
 * Conversation history metadata is optional for the main Ping entry. The
 * backend accepts the pair only when both values exist; sending an orphaned
 * sourceTurnKey makes an otherwise valid authorized action fail validation
 * before the commitment executor is reached.
 */
export function buildAgentExecutionRequestBody(input: {
    authorizationId: string;
    conversationId?: string;
    sourceTurnKey?: string;
}): Record<string, unknown> {
    const body: Record<string, unknown> = { authorizationId: input.authorizationId };
    if (input.conversationId && input.sourceTurnKey) {
        body.conversationId = input.conversationId;
        body.sourceTurnKey = input.sourceTurnKey;
    }
    return body;
}

export function useAgentAuthorize() {
    return useMutation({
        mutationFn: async ({ source, turn }: { source: AgentTurnInput; turn: AgentTurnPlan }): Promise<AgentAuthorizationResult> => {
            const raw = await apiClient.post('/agent/authorize', buildAgentAuthorizationRequestBody(source, turn));
            return parseAgentAuthorization(raw);
        },
    });
}

// PING — STALE STATE AFTER AGENT EXECUTION FIX: this mutation can create or
// mutate a commitment, a commitment_proposal, or a message (any of the 5
// registered write tools -- send_message/create_commitment/
// respond_to_proposal/reschedule_commitment/complete_commitment), but had
// NO cache invalidation at all, unlike every other mutating flow in the app
// (see useCreateCommitment/useCreateSharedCommitmentProposal above, the
// established pattern this reuses verbatim). Without this, a screen the
// user navigates to AFTER the agent reports "Acción completada" (Compromisos,
// Hoy/insights dashboard, the originating chat) could keep showing
// pre-mutation cached data. Invalidates the same superset of query keys the
// app's own direct commitment/proposal mutations already invalidate --
// never a new invalidation concept, just applied where it was missing.
export function useAgentExecute() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: async (input: { authorizationId: string; conversationId?: string; sourceTurnKey?: string }): Promise<AgentExecutionResult> => {
            const raw = await apiClient.post('/agent/execute', buildAgentExecutionRequestBody(input));
            return parseAgentExecution(raw);
        },
        onSuccess: () => {
            invalidateCommitmentViews(queryClient, {
                includeAgreementProposals: true,
                includeAgentTurns: true,
            });
        },
    });
}
