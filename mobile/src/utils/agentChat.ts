// M-1G — pure, renderer-free logic for the Agent Preview screen's local chat
// state. Mirrors AgentPreviewScreen.tsx exactly, same convention as
// chatKeyboard.ts / profile.ts — kept separate so it's testable without a
// React Native renderer (this repo's mobile tests never render components).
import type {
    AgentCitation,
    AgentFollowUp,
    AgentResponseStatus,
    AgentConversationTurnRecord,
    AgentActionDecision,
    AgentPendingAction,
    AgentTurnResult,
} from '../api/query-modules/agent';

export interface AgentChatMessage {
    id: string;
    role: 'user' | 'agent';
    text: string;
    status?: AgentResponseStatus;
    citations?: AgentCitation[];
    followUp?: AgentFollowUp;
    createdAt: number;
    error?: boolean;
    // The exact input that produced this message, kept ONLY on error
    // entries so "Reintentar" can resend it without guessing.
    retryInput?: string;
    retryIdempotencyKey?: string;
    retryAfterSeconds?: number;
    retryActionDecision?: AgentActionDecision;
    /** Assistant actions proposed by this answer, answered with Confirm/Cancel. */
    pendingActions?: AgentPendingAction[];
}

let idCounter = 0;
function nextId(prefix: string): string {
    idCounter += 1;
    return `${prefix}-${Date.now()}-${idCounter}`;
}

export function appendUserMessage(messages: AgentChatMessage[], text: string): AgentChatMessage[] {
    return [...messages, { id: nextId('u'), role: 'user', text, createdAt: Date.now() }];
}

export function appendErrorMessage(
    messages: AgentChatMessage[],
    text: string,
    retryInput: string,
    retryIdempotencyKey?: string,
    retryAfterSeconds?: number,
    retryActionDecision?: AgentActionDecision,
): AgentChatMessage[] {
    return [...messages, {
        id: nextId('e'), role: 'agent', text, createdAt: Date.now(), error: true,
        retryInput, retryIdempotencyKey, retryAfterSeconds, retryActionDecision,
    }];
}

export function appendAgentTurnMessage(messages: AgentChatMessage[], result: AgentTurnResult): AgentChatMessage[] {
    const { response, pendingActions } = result;
    return [...messages, {
        id: nextId('a'),
        role: 'agent',
        text: response.answer,
        status: response.status,
        citations: response.citations,
        followUp: response.followUp,
        createdAt: Date.now(),
        ...(pendingActions?.length ? { pendingActions } : {}),
    }];
}

export function restoreAgentConversationMessages(turns: AgentConversationTurnRecord[]): AgentChatMessage[] {
    const restored: AgentChatMessage[] = [];
    for (const turn of turns) {
        const createdAt = new Date(turn.createdAt).getTime();
        if (!turn.result.initiative) restored.push({ id: `${turn.id}:user`, role: 'user', text: turn.inputText, createdAt });
        const [result] = appendAgentTurnMessage([], turn.result);
        restored.push({ ...result, id: `${turn.id}:result`, createdAt });
    }
    return restored;
}

/**
 * Confirm/Cancel buttons belong to the latest answer only: once the user says
 * or taps anything else, the assistant decides what is still pending.
 */
export function isLatestAgentMessage(messages: AgentChatMessage[], id: string): boolean {
    return messages.length > 0 && messages[messages.length - 1].id === id;
}

// Sección 30/31 del ticket: nunca enviar vacío/sólo-espacios, y nunca
// permitir un segundo envío mientras uno está en curso.
export function canSendInput(input: string, isPending: boolean): boolean {
    return input.trim().length > 0 && !isPending;
}

const CITATION_TYPE_LABELS: Record<string, string> = {
    commitment: 'Compromiso',
    // M-1H: sin esta entrada, una cita a una commitment_proposal (caso real
    // "Entrenar") caía al fallback genérico 'Fuente' en vez de 'Compromiso'.
    commitment_proposal: 'Compromiso',
    commitment_event: 'Compromiso',
    message: 'Mensaje',
    transcription: 'Audio',
    attachment: 'Documento',
    person: 'Persona',
};

// Sección 14: nunca mostrar el UUID crudo -- sólo un conteo discreto y,
// dentro del sheet, las etiquetas de tipo (nunca el sourceId).
export function describeCitationsSummary(citations: AgentCitation[] | undefined): string | null {
    if (!citations || citations.length === 0) return null;
    return citations.length === 1 ? '1 fuente' : `${citations.length} fuentes`;
}

export function describeCitationTypes(citations: AgentCitation[] | undefined): string[] {
    if (!citations) return [];
    return citations.map((c) => CITATION_TYPE_LABELS[c.sourceType] ?? 'Fuente');
}

// PING — STATUS COLLAPSE FIX: AgentResponseStatus was captured on the chat
// message (appendAgentMessage above) but never read at render time --
// 'answered'/'no_evidence'/'capability_gap' all rendered through the exact
// same generic bubble, indistinguishable from each other. This can
// misrepresent an explicit absence-of-evidence or capability-gap response
// as an ordinary confident answer. 'answered' intentionally returns null
// (the normal case needs no extra label) -- only genuinely non-confident
// statuses get one.
export function describeStatusLabel(status: AgentResponseStatus | undefined): string | null {
    if (status === 'no_evidence') return 'Sin evidencia suficiente';
    if (status === 'capability_gap') return 'Esto todavía no lo puedo hacer';
    return null;
}

export const AGENT_SUGGESTED_STARTERS = [
    '¿Qué pendientes tengo esta semana?',
    '¿Qué habíamos hablado del viaje?',
    '¿Qué le prometí a Laura?',
    '¿Me enviaron algún contrato?',
] as const;
