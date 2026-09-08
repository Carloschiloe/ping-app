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
    const response = await fetch(buildAgentVoiceTranscriptionUrl(input), {
        method: 'POST',
        headers: { Authorization: headers.Authorization, 'Content-Type': input.mimeType },
        body: new File(input.uri),
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
