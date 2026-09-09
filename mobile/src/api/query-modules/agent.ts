// M-1G — Mobile client for the new read-only Ping Agent (POST /agent/respond,
// backend/src/controllers/agent.controller.ts). Deliberately separate from
// legacy-ai.ts (/ai/ask, ai_messages) -- the two coexist, this file never
// imports from or writes to the legacy module.
import { useMutation } from '@tanstack/react-query';
import * as Localization from 'expo-localization';
import { apiClient, ApiError } from '../client';
import { API_URL, getAuthHeaders } from '../client';
import { File } from 'expo-file-system';
import { getDeviceTimeZone } from '../../utils/timeZone';

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
    signal?: AbortSignal;
}

export function buildAgentVoiceTranscriptionUrl(input: Omit<AgentVoiceCaptureRequest, 'uri' | 'mimeType'>): string {
    const params: Record<string, string> = {
        durationMs: String(Math.round(input.durationMs)),
        capturedAt: input.capturedAt,
        voiceSessionId: input.voiceSessionId,
        deviceSessionId: input.deviceSessionId,
        surface: 'mobile_voice',
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
    const localResponse = await fetch(input.uri);
    if (!localResponse.ok) throw new Error('No se pudo leer el archivo de audio local.');
    const body = await localResponse.arrayBuffer();
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
            case 429: return 'Demasiadas consultas. Intenta en unos minutos.';
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

export interface AgentTurnResponse {
    kind: 'response';
    response: AgentRespondResult;
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
    plan: {
        planId: string;
        status: string;
        objectiveType: string;
        humanReadableSummary: string;
        steps: Array<{
            stepId: string;
            toolId: string;
            operation: string;
            dependsOn: string[];
            expectedEffect: string;
            sideEffectClass: string;
            riskLevel: 'low' | 'medium' | 'high';
            confirmationRequirement: string;
            conditionDescription: string;
        }>;
        canExecute: boolean;
        clarification?: Array<{ field: string; question: string; options?: Array<{ id: string; label: string }> }>;
        failureMode?: string;
        failureMessage?: string;
        planDigest?: string;
    };
    presentation: AgentPlanPresentation;
}

export interface AgentTurnClarification {
    kind: 'clarification';
    questions: Array<{ field: string; question: string; options?: Array<{ id: string; label: string }> }>;
    partialResponse?: AgentRespondResult;
}

export interface AgentTurnUnsupported {
    kind: 'unsupported';
    reason: string;
    supportedExamples?: string[];
}

export type AgentTurnResult =
    | AgentTurnResponse
    | AgentTurnPlan
    | AgentTurnClarification
    | AgentTurnUnsupported;

export interface AgentTurnInput {
    input?: string;
    voiceInputToken?: string;
    conversationId?: string;
}

export function buildAgentTurnRequestBody(input: AgentTurnInput): Record<string, unknown> {
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

export function parseAgentTurnResult(raw: unknown): AgentTurnResult {
    if (!raw || typeof raw !== 'object') throw new Error('invalid_agent_turn_shape');
    const obj = raw as Record<string, unknown>;
    if (obj.kind === 'response') {
        parseAgentResponse(obj.response);
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

export function useAgentTurn() {
    return useMutation({
        mutationFn: async (input: AgentTurnInput): Promise<AgentTurnResult> => {
            const body = buildAgentTurnRequestBody(input);
            const raw = await apiClient.post('/agent/turn', body);
            return parseAgentTurnResult(raw);
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
    createdEntityRefs: Array<{ entityType: string; entityId: string }>;
    updatedEntityRefs: Array<{ entityType: string; entityId: string }>;
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
    createdEntityRefs: Array<{ entityType: string; entityId: string }>;
    updatedEntityRefs: Array<{ entityType: string; entityId: string }>;
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

export function useAgentAuthorize() {
    return useMutation({
        mutationFn: async ({ source, turn }: { source: AgentTurnInput; turn: AgentTurnPlan }): Promise<AgentAuthorizationResult> => {
            const raw = await apiClient.post('/agent/authorize', buildAgentAuthorizationRequestBody(source, turn));
            return parseAgentAuthorization(raw);
        },
    });
}

export function useAgentExecute() {
    return useMutation({
        mutationFn: async (authorizationId: string): Promise<AgentExecutionResult> => {
            const raw = await apiClient.post('/agent/execute', { authorizationId });
            return parseAgentExecution(raw);
        },
    });
}
