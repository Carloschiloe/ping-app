// Funciones puras compartidas por GroupTaskCard.tsx e InsightsScreen.tsx
// para no duplicar (ni desincronizar) la logica de derivacion visual del
// dominio de commitments V2.

export interface MinimalContact {
    id: string;
    display_name: string;
}

export interface WaitingLabelInput {
    owner_user_id?: string | null;
    assigned_to_user_id?: string | null;
    waiting_on_user_id?: string | null;
    waiting_on_contact_id?: string | null;
    owner?: { full_name?: string | null } | null;
    assignee?: { full_name?: string | null } | null;
}

// V2: "esperando" se deriva SIEMPRE de waiting_on_user_id/waiting_on_contact_id
// — nunca existe un status='waiting'. Devuelve null cuando nadie bloquea el avance.
export function getWaitingLabel(
    commitment: WaitingLabelInput,
    currentUserId: string | null | undefined,
    contacts: MinimalContact[] = [],
    participants: { id?: string; full_name?: string }[] = []
): string | null {
    const normalizedCurrentUserId = currentUserId?.toLowerCase() || null;

    if (commitment.waiting_on_user_id) {
        if (normalizedCurrentUserId && commitment.waiting_on_user_id.toLowerCase() === normalizedCurrentUserId) {
            return 'Te corresponde actuar';
        }
        const waitingId = commitment.waiting_on_user_id.toLowerCase();
        let name: string | null | undefined = null;
        if (waitingId === commitment.owner_user_id?.toLowerCase()) {
            name = commitment.owner?.full_name;
        } else if (waitingId === commitment.assigned_to_user_id?.toLowerCase()) {
            name = commitment.assignee?.full_name;
        } else {
            name = participants.find((p) => p.id?.toLowerCase() === waitingId)?.full_name;
        }
        return `Esperando respuesta de ${name || 'alguien'}`;
    }

    if (commitment.waiting_on_contact_id) {
        const contact = contacts.find((c) => c.id === commitment.waiting_on_contact_id);
        return `Esperando a ${contact?.display_name || 'contacto externo'}`;
    }

    return null;
}

// Parte 10: accion realizada y asunto resuelto son conceptos independientes.
export function isActionCompletedPendingResolution(commitment: { action_completed_at?: string | null; resolved_at?: string | null }): boolean {
    return !!commitment.action_completed_at && !commitment.resolved_at;
}

// V2: conversation_id es la columna real; group_conversation_id es solo el
// alias temporal de compatibilidad del backend (nunca escribir a partir de
// este valor, solo leer).
export function resolveConversationId(commitment: { conversation_id?: string | null; group_conversation_id?: string | null }): string | null {
    return commitment.conversation_id ?? commitment.group_conversation_id ?? null;
}

// Parte 15: el boton "Ver conversación" solo debe existir cuando hay tanto
// mensaje de origen como conversacion — sin ambos, el compromiso debe seguir
// siendo completamente utilizable sin ese boton.
export function canViewOriginConversation(commitment: { message_id?: string | null; conversation_id?: string | null; group_conversation_id?: string | null }): boolean {
    return !!commitment.message_id && !!resolveConversationId(commitment);
}

export type DueDateBucket = 'noDate' | 'overdue' | 'upcoming';

// Clasificacion simplificada de un solo commitment (espejo conceptual de
// classifyOpenCommitment en backend/src/controllers/insights.controller.ts,
// sin los buckets que dependen de waiting_on/action_completed_at — esos ya
// los resuelve directamente el backend).
export function classifyDueDate(commitment: { due_at?: string | null }, nowMs: number = Date.now()): DueDateBucket {
    if (!commitment.due_at) return 'noDate';
    return new Date(commitment.due_at).getTime() < nowMs ? 'overdue' : 'upcoming';
}

// Contrapropuesta: la fecha a resaltar es proposed_due_at, no due_at (que
// todavia guarda la ultima fecha confirmada).
export function getDisplayDueAt(commitment: { status?: string | null; due_at?: string | null; proposed_due_at?: string | null }): string | null {
    if (commitment.status === 'counter_proposal' && commitment.proposed_due_at) {
        return commitment.proposed_due_at;
    }
    return commitment.due_at ?? null;
}

// rejection_reason ya es columna real V2 de primera clase; meta.rejection_reason
// se conserva solo como fallback de compatibilidad con datos legacy.
export function getRejectionReason(commitment: { rejection_reason?: string | null; meta?: { rejection_reason?: string | null } | null }): string | null {
    return commitment.rejection_reason ?? commitment.meta?.rejection_reason ?? null;
}

export function resolveContactName(contactId: string | null | undefined, contacts: MinimalContact[] = []): string | null {
    if (!contactId) return null;
    return contacts.find((c) => c.id === contactId)?.display_name || 'Contacto externo';
}

const STATUS_LABELS: Record<string, string> = {
    proposed: 'Propuesto',
    accepted: 'Aceptado',
    counter_proposal: 'Contrapropuesta',
    rejected: 'Rechazado',
    resolved: 'Resuelto',
    cancelled: 'Cancelado',
};

export function getStatusLabel(status: string): string {
    return STATUS_LABELS[status] || STATUS_LABELS.proposed;
}

// Los 6 bloques abiertos reales que devuelve GET /insights. Los alias de
// Operación (myFocuses/inProgress/groupsSummary/teamStatusByGroup) quedan
// deliberadamente fuera: nunca deben considerarse "bloques" a renderizar,
// tengan o no contenido.
export const OPEN_COMMITMENT_BLOCK_KEYS = [
    'actionDonePendingResolution', 'needsAttention', 'overdue', 'awaitingResponse', 'upcoming', 'noDate',
] as const;

export function getNonEmptyBlocks<T extends Record<string, any[] | undefined>>(
    insights: T,
    keys: readonly (keyof T)[] = OPEN_COMMITMENT_BLOCK_KEYS as unknown as readonly (keyof T)[]
): (keyof T)[] {
    return keys.filter((key) => (insights[key] || []).length > 0);
}
