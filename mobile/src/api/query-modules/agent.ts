// M-1G — Mobile client for the new read-only Ping Agent (POST /agent/respond,
// backend/src/controllers/agent.controller.ts). Deliberately separate from
// legacy-ai.ts (/ai/ask, ai_messages) -- the two coexist, this file never
// imports from or writes to the legacy module.
import { useMutation } from '@tanstack/react-query';
import * as Localization from 'expo-localization';
import { apiClient, ApiError } from '../client';
import { getDeviceTimeZone } from '../../utils/timeZone';

export type AgentCitationSourceType = 'commitment' | 'commitment_event' | 'message' | 'transcription' | 'attachment' | 'person';

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
    input: string;
    conversationId?: string;
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
    const body: Record<string, unknown> = {
        input: input.input.trim(),
        channel: 'mobile',
        timezone: getDeviceTimeZone(),
        locale: getDeviceLocale(),
    };
    if (input.conversationId) body.conversationId = input.conversationId;
    return body;
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
