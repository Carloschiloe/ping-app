// M-1H v3/v5 — CANONICAL OVERDUE SEMANTICS. Única fuente de verdad de "¿esto
// está vencido?" para todo el backend (Agent Context trace, Response
// Synthesizer) — antes existían DOS fórmulas backend independientes
// (agentResponseSynthesizer.service.ts#isCommitmentOverdue,
// agentContextBuilder.service.ts's diagnostic trace inline), y ninguna de
// las dos coincidía con la regla real ya shippeada dos veces en mobile
// (InsightsScreen "Mis Compromisos" + TaskDashboardScreen "Hoy").
//
// DECISIÓN DE PRODUCTO v3 (sección 2 del ticket, no elegida por comodidad
// técnica): un compromiso cuya hora ya pasó HOY se considera "para hoy",
// nunca "vencido" -- vencido significa que se dejó pasar el DÍA completo,
// no el minuto exacto.
//
// DECISIÓN DE PRODUCTO v5 (regla principal, hallazgo real físico: "Entrenar"
// -- Carlos ya aprobó, Alejandra sigue pendiente, y el Agent/UI la mostraban
// como "vencida"): una commitment_proposal AÚN NO completamente aprobada NO
// es un commitment activo -- es una PROPUESTA. "Vencido" es un concepto que
// sólo aplica a una obligación ya materializada/aceptada (entityType=
// 'commitment'). Una proposal (entityType='commitment_proposal') NUNCA está
// "vencida", sin importar su status derivado o su due_at -- aunque su fecha
// propuesta ya haya pasado. Esa señal existe por separado, ver
// isProposalDatePassed: "la fecha propuesta ya pasó" (dato informativo) NO
// es lo mismo que "compromiso vencido" (estado operativo real).
//
// CANONICAL_OVERDUE_RULE:
//   isOverdue(item, now, actorTimezone) :=
//        item.entityType === 'commitment'   (nunca 'commitment_proposal')
//     Y  item.dueAt existe
//     Y  item.status es "abierto" (proposed | accepted | counter_proposal —
//        resolved/cancelled/rejected NUNCA están vencidos, sin excepción)
//     Y  item.dueAt (instante) < now (instante)
//     Y  el día calendario de item.dueAt, en actorTimezone, es distinto
//        (anterior) al día calendario de now, en la MISMA zona.
import { isOpenCommitmentStatus } from './commitmentStatus';
import { isSameCalendarDay } from './timezone';

export type OverdueEntityType = 'commitment' | 'commitment_proposal';

export function isCommitmentOverdue(
    dueAt: string | null,
    status: string,
    nowIso: string,
    timezone: string,
    entityType: OverdueEntityType = 'commitment',
): boolean {
    if (entityType === 'commitment_proposal') return false; // regla principal: nunca vencida, sea cual sea su status/fecha
    if (!dueAt) return false;
    if (!isOpenCommitmentStatus(status)) return false;
    const due = new Date(dueAt);
    const now = new Date(nowIso);
    if (due.getTime() >= now.getTime()) return false;
    return !isSameCalendarDay(due, now, timezone);
}

// M-1H v5 — señal separada y honesta para una proposal cuya fecha propuesta
// ya pasó, SIN llamarla "vencida". Se usa para frasear "la fecha propuesta
// ya pasó, pero sigues esperando la aceptación de X" en vez de "vencido".
// Deliberadamente NO depende de status (una proposal pendiente, en
// contrapropuesta, etc. todas pueden tener fecha pasada) ni de timezone/
// mismo-día (aquí "pasó" es simplemente instante < now -- no hay urgencia
// operativa de commitment que justifique el carve-out de mismo día).
export function isProposalDatePassed(dueAt: string | null, nowIso: string): boolean {
    if (!dueAt) return false;
    return new Date(dueAt).getTime() < new Date(nowIso).getTime();
}
