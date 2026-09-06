// M-1H v3 — CANONICAL OVERDUE SEMANTICS. Única fuente de verdad de "¿esto
// está vencido?" para todo el backend (Agent Context trace, Response
// Synthesizer) — antes existían DOS fórmulas backend independientes
// (agentResponseSynthesizer.service.ts#isCommitmentOverdue,
// agentContextBuilder.service.ts's diagnostic trace inline), y ninguna de
// las dos coincidía con la regla real ya shippeada dos veces en mobile
// (InsightsScreen "Mis Compromisos" + TaskDashboardScreen "Hoy").
//
// DECISIÓN DE PRODUCTO (sección 2 del ticket, no elegida por comodidad
// técnica): un compromiso cuya hora ya pasó HOY se considera "para hoy",
// nunca "vencido" -- vencido significa que se dejó pasar el DÍA completo,
// no el minuto exacto. Se elige esta regla (y no la inversa, "cualquier
// instante pasado ya es vencido") porque es la que YA estaba shippeada y
// probada en DOS superficies mobile activas (Mis Compromisos, Hoy) antes de
// este ticket -- cambiar esas dos pantallas para adoptar la regla más
// simple del Agent habría sido un cambio de UX visible y no solicitado para
// usuarios reales; unificar el Agent (una superficie más nueva, en
// preview) hacia el comportamiento ya establecido es el cambio de menor
// riesgo real.
//
// CANONICAL_OVERDUE_RULE:
//   isOverdue(item, now, actorTimezone) :=
//        item.dueAt existe
//     Y  item.status es "abierto" (proposed | accepted | counter_proposal —
//        resolved/cancelled/rejected NUNCA están vencidos, sin excepción)
//     Y  item.dueAt (instante) < now (instante)
//     Y  el día calendario de item.dueAt, en actorTimezone, es distinto
//        (anterior) al día calendario de now, en la MISMA zona.
// Aplica idéntico para entityType='commitment' y 'commitment_proposal' —
// ambos ya comparten el mismo CanonicalCommitmentStatus derivado (ver
// retrieval.service.ts#deriveProposalViewStatus).
import { isOpenCommitmentStatus } from './commitmentStatus';
import { isSameCalendarDay } from './timezone';

export function isCommitmentOverdue(
    dueAt: string | null,
    status: string,
    nowIso: string,
    timezone: string,
): boolean {
    if (!dueAt) return false;
    if (!isOpenCommitmentStatus(status)) return false;
    const due = new Date(dueAt);
    const now = new Date(nowIso);
    if (due.getTime() >= now.getTime()) return false;
    return !isSameCalendarDay(due, now, timezone);
}
