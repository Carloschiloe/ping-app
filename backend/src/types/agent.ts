// M-1F — Agent Orchestrator + read-only endpoint. Transport-layer DTOs.
// The orchestrator itself is transport-agnostic (sección 38): this file is
// what an HTTP controller (today) or a future voice/device adapter
// (tomorrow) maps to/from — the Core (buildAgentContext/synthesizeAgentResponse)
// never sees these types directly.
import type { AgentChannel } from './agentContext';
import type { AgentCitation, AgentFollowUp, AgentResponse, AgentResponseDiagnostics, AgentResponseStatus } from './agentResponse';

// ─── Orchestrator input (sección 3) — ya resuelto por el caller (controller
// u otro adapter futuro). `actorUserId` NUNCA viene de aquí en el sentido de
// "confiado ciegamente" — el controller HTTP lo toma exclusivamente de
// `req.user.id`, nunca del body (sección 4). ──────────────────────────────────
export interface AgentOrchestratorInput {
    actorUserId: string;
    input: string;
    conversationId?: string;
    channel?: AgentChannel;
    locale?: string;
    timezone?: string;
    now?: string;
}

// Diagnostics del orquestador — envuelve (no reemplaza) los de M-1E, agrega
// sólo timing de las 2 etapas propias. Nunca se expone al cliente completo
// (sección 11/28) — el controller lo descarta al armar la respuesta pública.
export interface AgentOrchestratorDiagnostics extends AgentResponseDiagnostics {
    contextBuildMs: number;
    synthesisMs: number;
    totalMs: number;
}

export interface AgentOrchestratorResponse extends AgentResponse {
    diagnostics?: AgentOrchestratorDiagnostics;
}

// ─── HTTP request contract (sección 4) ──────────────────────────────────────
// `actorUserId`/`userId`/`tenantId` deliberadamente AUSENTES de este tipo —
// nunca se leen del body. El schema zod (agentRequest.schema.ts) tampoco los
// declara, así que ni siquiera sobreviven el parseo si un cliente los manda.
export interface AgentHttpRequestBody {
    input: string;
    conversationId?: string;
    channel?: string;
    locale?: string;
    timezone?: string;
}

// ─── Public response (secciones 11, 12, 13) — deliberadamente mínimo. Nunca
// expone: model, duraciones internas, retrieval plan, provenance completo,
// diagnostics internos, ni el detalle por-claim (`claims`) — sólo lo que un
// cliente necesita para mostrar la respuesta y, opcionalmente, "saltar a la
// fuente" con una referencia opaca (sourceType+sourceId, no un id "secreto":
// es el mismo tipo de id que el cliente ya maneja en otras pantallas, ej. un
// message id de la lista de mensajes — lo protegido es el CONTENIDO, no el
// id en sí). ──────────────────────────────────────────────────────────────────
export interface AgentPublicResponse {
    status: AgentResponseStatus;
    answer: string;
    citations: AgentCitation[];
    followUp?: AgentFollowUp;
}

export function toPublicAgentResponse(response: AgentResponse): AgentPublicResponse {
    return {
        status: response.status,
        answer: response.answer,
        citations: response.citations,
        followUp: response.followUp,
    };
}
