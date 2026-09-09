// M-6 — Unified Agent Turn. Single entry point that Core routes deterministically
// to either a read-only response or a plan requiring authorization.
// Mobile MUST NOT decide semantically whether an utterance is a question or action.

import type { AgentPublicResponse } from './agent';
import type { AgentPlanPublicResponse } from './agentPlan';
import type { ClarificationQuestion } from './agentPlan';

export type AgentTurnKind = 'response' | 'plan' | 'clarification' | 'unsupported';

export interface AgentTurnResponse {
    kind: 'response';
    response: AgentPublicResponse;
}

export interface AgentTurnPlan {
    kind: 'plan';
    plan: AgentPlanPublicResponse;
    // Core-owned presentation projection — mobile renders this, never reconstructs from plan internals
    presentation: AgentPlanPresentation;
}

export interface AgentTurnClarification {
    kind: 'clarification';
    questions: ClarificationQuestion[];
    // Optional: partial context if Core retrieved some evidence before needing clarification
    partialResponse?: AgentPublicResponse;
}

export interface AgentTurnUnsupported {
    kind: 'unsupported';
    reason: string;
    // Guidance for the user on what IS supported
    supportedExamples?: string[];
}

export type AgentTurnResult =
    | AgentTurnResponse
    | AgentTurnPlan
    | AgentTurnClarification
    | AgentTurnUnsupported;

// ─── Plan Presentation (Core-owned) ─────────────────────────────────────────────
// Mobile renders this directly. Copy derives from FROZEN plan arguments,
// not from mobile-side heuristics. This prevents UI from diverging from
// what M-4 will actually execute.

export interface AgentPlanStepPresentation {
    stepId: string;
    toolId: string;
    headline: string;           // e.g. "Enviar mensaje a Alejandra"
    effectDescription: string;  // e.g. "Se enviará: 'Llegaré tarde.'"
    targetLabel?: string;       // e.g. "Alejandra Gómez"
    recipientLabel?: string;
    contentPreview?: string;    // e.g. "Llegaré tarde." (for send_message)
    dateLabel?: string;         // e.g. "mañana a las 08:00" (for commitments)
    riskLabel?: string;         // e.g. "Acción reversible" / "Requiere confirmación explícita"
    confirmationLabel: string;  // e.g. "Enviar" / "Crear" / "Mover" / "Completar" / "Aceptar"
    cancelLabel: string;        // e.g. "Cancelar"
    requiresExplicitConfirmation: boolean;
    phase: 'immediate' | 'conditional';
    conditionLabel?: string;
}

export interface AgentPlanPresentation {
    headline: string;                    // e.g. "Enviaré un mensaje a Alejandra"
    summary: string;                     // e.g. "Se enviará el mensaje: 'Llegaré tarde.'"
    effectDescription: string;           // Detailed: WHAT, WHO, WHEN, WHAT WILL CHANGE
    targetLabel?: string;                // Primary target (person/commitment)
    dateLabel?: string;                  // When applicable
    riskLabel?: string;                  // Risk level in human terms
    confirmationLabel: string;           // Button label for confirmation
    cancelLabel: string;                 // Button label for cancellation
    stepPresentations: AgentPlanStepPresentation[];
    requiresExplicitConfirmation: boolean; // true for all WRITE tools per M-4
    expiresAt: string;                   // ISO timestamp — planDigest TTL
    planId: string;
    planDigest: string;
    objectiveType: string;               // e.g. 'communicate_message'
}

export interface AgentTurnInput {
    actorUserId: string;
    input?: string;
    voiceInputToken?: string;
    conversationId?: string;
    channel?: string;
    locale?: string;
    timezone?: string;
    now?: Date;
    traceId?: string;
}

// Helper to check if turn result is a plan requiring authorization
export function isAgentTurnPlan(result: AgentTurnResult): result is AgentTurnPlan {
    return result.kind === 'plan';
}

export function isAgentTurnResponse(result: AgentTurnResult): result is AgentTurnResponse {
    return result.kind === 'response';
}

export function isAgentTurnClarification(result: AgentTurnResult): result is AgentTurnClarification {
    return result.kind === 'clarification';
}

export function isAgentTurnUnsupported(result: AgentTurnResult): result is AgentTurnUnsupported {
    return result.kind === 'unsupported';
}
