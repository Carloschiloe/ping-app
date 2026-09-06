// Funciones puras compartidas por GroupTaskCard.tsx e InsightsScreen.tsx
// para no duplicar (ni desincronizar) la logica de derivacion visual del
// dominio de commitments V2.
import { isSameDay, startOfDay } from 'date-fns';
import { normalizeCommitmentStatus } from './commitmentStatus';

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

// M-1H v3 — CANONICAL OVERDUE SEMANTICS. Única función de overdue para
// TODAS las superficies mobile activas (Mis Compromisos, Encargados, Hoy) —
// antes de esta unificación existían TRES reglas divergentes: Mis
// Compromisos y Hoy ya coincidían (con carve-out de mismo día), pero
// Encargados tenía una tercera regla propia, sin el carve-out y sin excluir
// 'cancelled'/'rejected' (sólo 'resolved'). Espejo exacto de la regla
// backend en utils/overdueSemantics.ts#isCommitmentOverdue (mismo contrato,
// código físicamente separado -- ver tests/overdueUiAgentParity.test.ts +
// backend/tests/overdueUiAgentParity.test.ts para la prueba de paridad).
//
// DECISIÓN DE PRODUCTO (no técnica): un commitment cuya hora ya pasó HOY es
// "para hoy", nunca "vencido" -- vencido significa que se dejó pasar el DÍA
// completo. Se eligió esta regla (y no "cualquier instante pasado ya es
// vencido") porque ya estaba shippeada en DOS superficies activas antes de
// este ticket; se unificó Encargados y el Agent hacia ella, no al revés.
//
// `referenceDay` (default = `now`) existe por TaskDashboardScreen: su
// selector de día navega a fechas distintas de "hoy real", y el "mismo día"
// para el carve-out debe compararse contra el día que el usuario está
// viendo (`selectedDate`), no contra la fecha real del reloj -- mientras que
// "¿ya pasó?" siempre se compara contra el reloj real (`now`). Mis
// Compromisos/Encargados usan el default (referenceDay = now).
//
// Timezone: en mobile, "hoy" del usuario ES la hora local del dispositivo
// (el teléfono corre en la zona real del usuario) -- por eso, a diferencia
// del backend (que corre en un servidor sin zona propia y necesita un IANA
// timezone explícito), aquí basta con Date/date-fns en hora local implícita.
// Nunca se debe forzar una zona fija (ej. UTC) aquí -- sería exactamente el
// "new Date() del servidor" que el contrato canónico prohíbe, sólo que del
// lado del cliente.
//
// Nota: esta regla NO es igual a classifyDueDate (arriba) -- esa función es
// una clasificación más simple (sin carve-out de día, sin excluir status
// cerrados) usada en otro contexto visual; ambas conviven a propósito.
//
// M-1H v5 — REGLA PRINCIPAL (hallazgo real físico, caso "Entrenar": Carlos
// ya aprobó, Alejandra sigue pendiente, y esto se mostraba como "VENCIDO"):
// una commitment_proposal aún no completamente aprobada NUNCA está vencida,
// sin importar su status o due_at -- "vencido" sólo aplica a un commitment
// YA materializado/aceptado. Se detecta con el MISMO discriminador ya usado
// en el resto de mobile (`_isAgreementProposal`, ver
// commitmentConfirmDispatch.ts) -- también se acepta `entityType` por si el
// caller ya trae el shape honesto del backend (Agent/tests espejo). Ver
// isProposalDatePassed para la señal separada y honesta ("la fecha
// propuesta ya pasó") que SÍ aplica a una proposal.
export function isCommitmentOverdue(
    commitment: { status?: string | null; due_at?: string | null; _isAgreementProposal?: boolean; entityType?: string },
    now: Date = new Date(),
    referenceDay: Date = now,
): boolean {
    if (commitment._isAgreementProposal === true || commitment.entityType === 'commitment_proposal') return false;
    const status = normalizeCommitmentStatus(commitment.status);
    if (['resolved', 'cancelled', 'rejected'].includes(status)) return false;
    if (!commitment.due_at) return false;
    const date = new Date(commitment.due_at);
    return date < now && !isSameDay(date, startOfDay(referenceDay));
}

// M-1H v5 — señal separada y honesta para una proposal cuya fecha propuesta
// ya pasó, SIN llamarla "vencida" (espejo de
// backend/utils/overdueSemantics.ts#isProposalDatePassed). No depende de
// status ni de zona/mismo-día -- "pasó" es simplemente instante < now.
export function isProposalDatePassed(dueAt: string | null | undefined, now: Date = new Date()): boolean {
    if (!dueAt) return false;
    return new Date(dueAt) < now;
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
