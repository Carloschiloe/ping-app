// M-1G — pure, renderer-free logic for the Agent Preview screen's local chat
// state. Mirrors AgentPreviewScreen.tsx exactly, same convention as
// chatKeyboard.ts / profile.ts — kept separate so it's testable without a
// React Native renderer (this repo's mobile tests never render components).
import type { AgentCitation, AgentFollowUp, AgentRespondResult, AgentResponseStatus } from '../api/query-modules/agent';

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
}

let idCounter = 0;
function nextId(prefix: string): string {
    idCounter += 1;
    return `${prefix}-${Date.now()}-${idCounter}`;
}

export function appendUserMessage(messages: AgentChatMessage[], text: string): AgentChatMessage[] {
    return [...messages, { id: nextId('u'), role: 'user', text, createdAt: Date.now() }];
}

export function appendAgentMessage(messages: AgentChatMessage[], result: AgentRespondResult): AgentChatMessage[] {
    return [...messages, {
        id: nextId('a'),
        role: 'agent',
        text: result.answer,
        status: result.status,
        citations: result.citations,
        followUp: result.followUp,
        createdAt: Date.now(),
    }];
}

export function appendErrorMessage(messages: AgentChatMessage[], text: string, retryInput: string): AgentChatMessage[] {
    return [...messages, { id: nextId('e'), role: 'agent', text, createdAt: Date.now(), error: true, retryInput }];
}

// Sección 30/31 del ticket: nunca enviar vacío/sólo-espacios, y nunca
// permitir un segundo envío mientras uno está en curso.
export function canSendInput(input: string, isPending: boolean): boolean {
    return input.trim().length > 0 && !isPending;
}

const CITATION_TYPE_LABELS: Record<string, string> = {
    commitment: 'Compromiso',
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

export const AGENT_SUGGESTED_STARTERS = [
    '¿Qué pendientes tengo esta semana?',
    '¿Qué habíamos hablado del viaje?',
    '¿Qué le prometí a Laura?',
    '¿Me enviaron algún contrato?',
] as const;
