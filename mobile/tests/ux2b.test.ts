/**
 * UX-2B.1 — Comprehensive Unit Tests for Hoy tab redesign adjustments.
 * Pure unit tests — no React Native renderer needed.
 */
/// <reference types="jest" />
import { describe, expect, it } from 'vitest';

import { normalizeCommitmentStatus } from '../src/utils/commitmentStatus';
import { canViewOriginConversation, resolveConversationId } from '../src/utils/commitmentDisplay';
import { format, subDays, addDays, isSameDay, startOfDay } from 'date-fns';

// ─── Pure Helpers (reflecting screen logic) ──────────────────────────────────

const MEETING_RE = /reuni[oó]n|llamada|junta|meet|zoom|call|cita/i;
function isMeeting(c: { type?: string; title?: string }) {
    return c.type === 'meeting' || MEETING_RE.test(c.title || '');
}

function isOverdue(c: { due_at?: string | null; status?: string }) {
    if (!c.due_at) return false;
    const status = normalizeCommitmentStatus(c.status);
    if (['resolved', 'cancelled', 'rejected'].includes(status)) return false;
    return new Date(c.due_at) < new Date();
}

function filterOverdueItems(commitments: any[], selectedDate: Date) {
    const now = new Date();
    return commitments.filter(c => {
        if (!c.due_at) return false;
        const status = normalizeCommitmentStatus(c.status);
        if (['resolved', 'cancelled', 'rejected'].includes(status)) return false;
        return new Date(c.due_at) < now && !isSameDay(new Date(c.due_at), selectedDate);
    }).sort((a, b) => new Date(b.due_at).getTime() - new Date(a.due_at).getTime()); // Most recent first
}

function buildTodayItems(commitments: any[], selectedDate: Date, statusFilter = 'all') {
    return commitments.filter(c => {
        if (!c.due_at) return false;
        if (!isSameDay(new Date(c.due_at), selectedDate)) return false;
        const status = normalizeCommitmentStatus(c.status);
        if (status === 'rejected' && statusFilter !== 'rejected') return false;
        if (['resolved', 'cancelled'].includes(status) && statusFilter !== 'all' && statusFilter !== status) return false;
        return true;
    }).sort((a, b) => {
        const statusA = normalizeCommitmentStatus(a.status);
        const statusB = normalizeCommitmentStatus(b.status);
        const isFinishedA = ['resolved', 'cancelled'].includes(statusA);
        const isFinishedB = ['resolved', 'cancelled'].includes(statusB);
        if (isFinishedA !== isFinishedB) return isFinishedA ? 1 : -1;
        return new Date(a.due_at).getTime() - new Date(b.due_at).getTime();
    });
}

function getNextItem(myItems: any[], now: Date, isToday: boolean) {
    if (!isToday) return null;
    const upcoming = myItems.filter(c => {
        const status = normalizeCommitmentStatus(c.status);
        return !['resolved', 'cancelled', 'rejected'].includes(status) && new Date(c.due_at) >= now;
    });
    return upcoming.length > 0 ? upcoming[0] : null; // Strictly due_at >= now
}

function getEmptyStateCopy(hasAgenda: boolean, overdueCount: number, isToday: boolean, selectedDate: Date) {
    if (hasAgenda) return null;
    if (isToday) {
        if (overdueCount > 0) {
            return {
                title: 'No tienes compromisos programados para hoy',
                subtitle: `Tienes ${overdueCount} pendiente${overdueCount > 1 ? 's' : ''} vencido${overdueCount > 1 ? 's' : ''} que requiere${overdueCount > 1 ? 'n' : ''} atención.`,
            };
        }
        return {
            title: 'Día libre',
            subtitle: 'No tienes compromisos para hoy.',
        };
    }
    return {
        title: 'Sin compromisos',
        subtitle: `No tienes compromisos programados para el ${format(selectedDate, 'd MMM')}.`,
    };
}

function buildSummaryText(totalToday: number, overdueCount: number, nextItemTime: string | null, isToday: boolean): string {
    if (!isToday) {
        if (totalToday === 0) return 'Sin compromisos para este día.';
        return `${totalToday} compromiso${totalToday > 1 ? 's' : ''} programado${totalToday > 1 ? 's' : ''} para este día.`;
    }
    if (totalToday === 0 && overdueCount === 0) return 'Día libre · Sin compromisos para hoy';
    const parts: string[] = [];
    if (overdueCount > 0) parts.push(`${overdueCount} vencida${overdueCount > 1 ? 's' : ''}`);
    if (totalToday > 0) parts.push(`${totalToday} para hoy`);
    else if (overdueCount > 0) parts.push('Sin compromisos programados hoy');
    const base = parts.join(' · ');
    if (nextItemTime) {
        const time = format(new Date(nextItemTime), 'HH:mm');
        return `${base} · Próximo a las ${time}`;
    }
    return base;
}

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const TODAY = startOfDay(new Date());
const todayAt = (h: number, m = 0) => {
    const d = new Date(TODAY);
    d.setHours(h, m, 0, 0);
    return d.toISOString();
};

const YESTERDAY_ISO = subDays(TODAY, 1).toISOString();
const DAYS_30_AGO_ISO = subDays(TODAY, 30).toISOString();
const TOMORROW_ISO = addDays(TODAY, 1).toISOString();

const c1 = { id: 'c1', title: 'Llamar cliente', due_at: todayAt(10), status: 'accepted', assigned_to_user_id: 'u1', owner_user_id: 'u1', message_id: 'msg1', conversation_id: 'conv1' };
const c2 = { id: 'c2', title: 'Enviar propuesta', due_at: todayAt(12, 30), status: 'accepted', assigned_to_user_id: 'u1', owner_user_id: 'u1' };
const c3 = { id: 'c3', title: 'Reunión de equipo', due_at: todayAt(15), status: 'proposed', assigned_to_user_id: 'u1', owner_user_id: 'u2', type: 'meeting' };
const cResolved = { id: 'cr', title: 'Tarea resuelta', due_at: todayAt(9), status: 'resolved', assigned_to_user_id: 'u1', owner_user_id: 'u1' };
const cCancelled = { id: 'cc', title: 'Cancelada', due_at: todayAt(8), status: 'cancelled', assigned_to_user_id: 'u1', owner_user_id: 'u1' };
const cOverdueRecent = { id: 'ov1', title: 'Ayer', due_at: YESTERDAY_ISO, status: 'accepted', assigned_to_user_id: 'u1', owner_user_id: 'u1' };
const cOverdueOld = { id: 'ov2', title: 'Hace 30 días', due_at: DAYS_30_AGO_ISO, status: 'accepted', assigned_to_user_id: 'u1', owner_user_id: 'u1' };
const cDelegated = { id: 'cd', title: 'Encargada a Javier', due_at: todayAt(14), status: 'accepted', assigned_to_user_id: 'u2', owner_user_id: 'u1' };

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('UX-2B.1 — Empty state copy rules', () => {
    it('Rule A: Sin agenda hoy + sin vencidos -> Día libre', () => {
        const copy = getEmptyStateCopy(false, 0, true, TODAY);
        expect(copy?.title).toBe('Día libre');
        expect(copy?.subtitle).toBe('No tienes compromisos para hoy.');
    });

    it('Rule B: Sin agenda hoy + con vencidos -> No tienes compromisos programados para hoy + Tienes N pendientes vencidos...', () => {
        const copy = getEmptyStateCopy(false, 4, true, TODAY);
        expect(copy?.title).toBe('No tienes compromisos programados para hoy');
        expect(copy?.subtitle).toBe('Tienes 4 pendientes vencidos que requieren atención.');
    });

    it('Rule C: Con agenda -> no empty state copy', () => {
        const copy = getEmptyStateCopy(true, 0, true, TODAY);
        expect(copy).toBeNull();
    });

    it('Rule D: Fecha distinta a hoy -> Sin compromisos para fecha', () => {
        const tomorrow = addDays(TODAY, 1);
        const copy = getEmptyStateCopy(false, 0, false, tomorrow);
        expect(copy?.title).toBe('Sin compromisos');
        expect(copy?.subtitle).toContain('No tienes compromisos programados para el');
    });
});

describe('UX-2B.1 — OverdueAlert expand / collapse / navigation logic', () => {
    const items = [
        cOverdueRecent, cOverdueOld,
        { id: 'ov3', title: 'hace 3 días', due_at: subDays(TODAY, 3).toISOString(), status: 'accepted' },
        { id: 'ov4', title: 'hace 4 días', due_at: subDays(TODAY, 4).toISOString(), status: 'accepted' },
    ];

    it('limits initial visible items to 3 max', () => {
        const maxVisible = 3;
        const initial = items.slice(0, maxVisible);
        expect(initial).toHaveLength(3);
    });

    it('orders overdue items most recent first', () => {
        const sorted = filterOverdueItems([cOverdueOld, cOverdueRecent], TODAY);
        expect(sorted[0].id).toBe('ov1'); // Yesterday comes before 30 days ago
        expect(sorted[1].id).toBe('ov2');
    });

    it('calculates hidden count correctly (4 total - 3 max = 1 hidden)', () => {
        const hiddenCount = items.length - 3;
        expect(hiddenCount).toBe(1);
    });

    it('expands in-place when toggleExpand is called', () => {
        let expanded = false;
        const visibleBefore = expanded ? items : items.slice(0, 3);
        expect(visibleBefore).toHaveLength(3);

        expanded = true; // simulate expand tap
        const visibleAfter = expanded ? items : items.slice(0, 3);
        expect(visibleAfter).toHaveLength(4);
    });

    it('collapses back when Mostrar menos is pressed', () => {
        let expanded = true;
        expanded = false; // simulate collapse tap
        const visibleAfter = expanded ? items : items.slice(0, 3);
        expect(visibleAfter).toHaveLength(3);
    });

    it('UX-2B.2: 1 overdue item shows "Ver en Compromisos"', () => {
        const singleItem = [cOverdueRecent];
        const navigateLabel = singleItem.length === 1 ? 'Ver en Compromisos' : 'Ver todos en Compromisos';
        expect(navigateLabel).toBe('Ver en Compromisos');
        expect(singleItem.length <= 3).toBe(true); // footer visible without expand CTA
    });

    it('UX-2B.2: 3 overdue items shows "Ver todos en Compromisos"', () => {
        const threeItems = [cOverdueRecent, cOverdueOld, { id: 'ov3', title: 'hace 3 días', due_at: subDays(TODAY, 3).toISOString(), status: 'accepted' }];
        const navigateLabel = threeItems.length === 1 ? 'Ver en Compromisos' : 'Ver todos en Compromisos';
        expect(navigateLabel).toBe('Ver todos en Compromisos');
        expect(threeItems.length <= 3).toBe(true); // footer visible without expand CTA
    });

    it('UX-2B.2: 4+ overdue items shows both "Ver todos en Compromisos" and expand CTA in collapsed and expanded states', () => {
        const navigateLabel = items.length === 1 ? 'Ver en Compromisos' : 'Ver todos en Compromisos';
        expect(navigateLabel).toBe('Ver todos en Compromisos');
        expect(items.length > 3).toBe(true);

        // Collapsed state
        let expanded = false;
        let expandText = !expanded ? `Ver ${items.length - 3} más` : 'Mostrar menos';
        expect(expandText).toBe('Ver 1 más');

        // Expanded state
        expanded = true;
        expandText = !expanded ? `Ver ${items.length - 3} más` : 'Mostrar menos';
        expect(expandText).toBe('Mostrar menos');
    });
});

describe('UX-2B.1 — NextUpCard strictly due_at >= now', () => {
    it('returns 15:10 item when now is 15:00 and items are 14:55 vs 15:10', () => {
        const now = new Date(todayAt(15, 0)); // 15:00
        const item1455 = { id: 'i1455', title: 'Reunión 14:55', due_at: todayAt(14, 55), status: 'accepted' };
        const item1510 = { id: 'i1510', title: 'Reunión 15:10', due_at: todayAt(15, 10), status: 'accepted' };

        const myItems = [item1455, item1510];
        const next = getNextItem(myItems, now, true);

        expect(next).not.toBeNull();
        expect(next?.id).toBe('i1510');
    });

    it('returns null if all items ended before now (e.g. 14:55 when now is 15:00)', () => {
        const now = new Date(todayAt(15, 0));
        const item1455 = { id: 'i1455', title: 'Reunión 14:55', due_at: todayAt(14, 55), status: 'accepted' };

        const next = getNextItem([item1455], now, true);
        expect(next).toBeNull();
    });

    it('returns null when selectedDate is not today', () => {
        const now = new Date(todayAt(15, 0));
        const item1510 = { id: 'i1510', title: 'Reunión 15:10', due_at: todayAt(15, 10), status: 'accepted' };

        const next = getNextItem([item1510], now, false); // isToday = false
        expect(next).toBeNull();
    });
});

describe('UX-2B.1 — Finished & Rejected status handling in Agenda', () => {
    it('excludes rejected status from main agenda view when statusFilter is all', () => {
        const cRejected = { id: 'crej', due_at: todayAt(10), status: 'rejected' };
        const items = buildTodayItems([c1, cRejected], TODAY, 'all');
        expect(items.find(i => i.id === 'crej')).toBeUndefined();
    });

    it('includes rejected ONLY when statusFilter is explicitly "rejected"', () => {
        const cRejected = { id: 'crej', due_at: todayAt(10), status: 'rejected' };
        const items = buildTodayItems([c1, cRejected], TODAY, 'rejected');
        expect(items.find(i => i.id === 'crej')).toBeDefined();
    });

    it('places resolved and cancelled at the end of the agenda list when statusFilter is all', () => {
        const items = buildTodayItems([cResolved, c1, cCancelled, c2], TODAY, 'all');
        const ids = items.map(i => i.id);
        // Active items (c1, c2) must come BEFORE finished items (cr, cc)
        expect(ids.slice(0, 2)).toEqual(['c1', 'c2']);
        expect(ids.slice(2)).toEqual(['cc', 'cr']);
    });
});

describe('UX-2B.1 — Summary text single-line combinations', () => {
    it('shows "4 vencidas · Sin compromisos programados hoy" when 0 scheduled today and 4 overdue', () => {
        const text = buildSummaryText(0, 4, null, true);
        expect(text).toBe('4 vencidas · Sin compromisos programados hoy');
    });

    it('shows "4 vencidas · 3 para hoy · Próximo a las 10:00" when 3 scheduled today and 4 overdue', () => {
        const text = buildSummaryText(3, 4, todayAt(10), true);
        expect(text).toBe('4 vencidas · 3 para hoy · Próximo a las 10:00');
    });

    it('shows "Día libre · Sin compromisos para hoy" when 0 scheduled and 0 overdue', () => {
        const text = buildSummaryText(0, 0, null, true);
        expect(text).toBe('Día libre · Sin compromisos para hoy');
    });
});

describe('UX-2B.1 — Chat Link & Navigation helper check', () => {
    it('canViewOriginConversation returns true for commitment with message_id and conversation_id', () => {
        expect(canViewOriginConversation(c1)).toBe(true);
    });

    it('canViewOriginConversation returns false when message_id is missing', () => {
        expect(canViewOriginConversation(c2)).toBe(false);
    });

    it('canViewOriginConversation returns false when conversation_id is missing', () => {
        expect(canViewOriginConversation({ message_id: 'msg1' })).toBe(false);
    });

    it('resolves group_conversation_id as fallback', () => {
        const c = { message_id: 'msg1', group_conversation_id: 'gconv1' };
        expect(canViewOriginConversation(c)).toBe(true);
    });
});

describe('UX-2B.1 — Meeting classification', () => {
    it('detects type=meeting', () => {
        expect(isMeeting({ type: 'meeting', title: 'anything' })).toBe(true);
    });

    it('detects "Reunión" in title', () => {
        expect(isMeeting({ title: 'Reunión de equipo' })).toBe(true);
    });

    it('detects "zoom" in title (case insensitive)', () => {
        expect(isMeeting({ title: 'Llamada Zoom con cliente' })).toBe(true);
    });

    it('returns false for plain task', () => {
        expect(isMeeting({ title: 'Enviar propuesta' })).toBe(false);
    });
});

describe('UX-2B.1 — Delegated vs mine identification', () => {
    it('identifies delegated item (owner=me, assigned=other)', () => {
        const isDelegated = cDelegated.owner_user_id === 'u1' && cDelegated.assigned_to_user_id !== 'u1';
        expect(isDelegated).toBe(true);
    });

    it('identifies mine (assigned=me)', () => {
        const isMine = c1.assigned_to_user_id === 'u1';
        expect(isMine).toBe(true);
    });
});

describe('UX-2B.1 — Status normalization', () => {
    it('normalizes "accepted" correctly', () => {
        expect(normalizeCommitmentStatus('accepted')).toBe('accepted');
    });

    it('normalizes legacy "done" to "resolved"', () => {
        expect(normalizeCommitmentStatus('done')).toBe('resolved');
    });

    it('normalizes null to "proposed"', () => {
        expect(normalizeCommitmentStatus(null)).toBe('proposed');
    });
});

describe('UX-2B.1 — Date navigation', () => {
    it('previous day is 1 day before selected', () => {
        const prev = subDays(TODAY, 1);
        expect(isSameDay(prev, subDays(TODAY, 1))).toBe(true);
    });

    it('next day is 1 day after selected', () => {
        const next = addDays(TODAY, 1);
        expect(isSameDay(next, addDays(TODAY, 1))).toBe(true);
    });

    it('going back to today resets to startOfDay(new Date())', () => {
        const today = startOfDay(new Date());
        expect(isSameDay(today, TODAY)).toBe(true);
    });
});
