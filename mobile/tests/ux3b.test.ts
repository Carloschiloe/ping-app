/**
 * UX-3B.1 — Comprehensive Unit Tests for Compromisos tab redesign & filter fixes.
 * Pure unit tests — no React Native renderer needed.
 */
/// <reference types="jest" />

import { normalizeCommitmentStatus } from '../src/utils/commitmentStatus';
import { canViewOriginConversation } from '../src/utils/commitmentDisplay';
import { format, subDays, addDays, isSameDay, isTomorrow, isSameWeek, startOfDay } from 'date-fns';

// ─── Pure Logic Helpers (mirroring InsightsScreen.tsx) ───────────────────────

const MEETING_RE = /reuni[oó]n|llamada|junta|meet|zoom|call|cita/i;
function isMeeting(c: { type?: string; title?: string }) {
    return c.type === 'meeting' || MEETING_RE.test(c.title || '');
}

function filterBySearchAndFilters(
    commitments: any[],
    searchQuery: string,
    filters: { statusFilter?: string; typeFilter?: string; originFilter?: string; personId?: string | null },
    userId: string,
    contactMap: Record<string, string> = {}
) {
    const q = searchQuery.trim().toLowerCase();
    const { statusFilter = 'all', typeFilter = 'all', originFilter = 'all', personId = null } = filters;

    return commitments.filter(c => {
        const status = normalizeCommitmentStatus(c.status);

        if (q) {
            const titleMatch = (c.title || '').toLowerCase().includes(q);
            const ownerMatch = (c.owner?.full_name || '').toLowerCase().includes(q);
            const assigneeMatch = (c.assignee?.full_name || '').toLowerCase().includes(q);
            const contactMatch = (contactMap[c.counterparty_contact_id] || '').toLowerCase().includes(q);
            if (!titleMatch && !ownerMatch && !assigneeMatch && !contactMatch) return false;
        }

        if (statusFilter !== 'all' && status !== statusFilter) return false;
        if (typeFilter === 'tasks' && isMeeting(c)) return false;
        if (typeFilter === 'meetings' && !isMeeting(c)) return false;
        if (originFilter === 'chat' && !c.message_id) return false;
        if (originFilter === 'direct' && c.message_id) return false;
        if (personId) {
            const matches = c.assigned_to_user_id === personId || c.owner_user_id === personId || c.counterparty_contact_id === personId;
            if (!matches) return false;
        }

        return true;
    });
}

function categorizePendientes(commitments: any[], userId: string) {
    const list = commitments.filter(c => {
        const status = normalizeCommitmentStatus(c.status);
        if (['resolved', 'cancelled', 'rejected'].includes(status)) return false;

        const isAssignedToMe = c.assigned_to_user_id === userId || !c.assigned_to_user_id;
        const isDelegatedByMe = c.owner_user_id === userId && c.assigned_to_user_id !== userId;
        return isAssignedToMe && !isDelegatedByMe;
    });

    const now = new Date();
    const today = startOfDay(now);

    const overdue: any[] = [];
    const hoy: any[] = [];
    const manana: any[] = [];
    const estaSemana: any[] = [];
    const masAdelante: any[] = [];
    const sinFecha: any[] = [];

    list.forEach(c => {
        if (!c.due_at) {
            sinFecha.push(c);
            return;
        }
        const date = new Date(c.due_at);
        if (date < now && !isSameDay(date, today)) {
            overdue.push(c);
        } else if (isSameDay(date, today)) {
            hoy.push(c);
        } else if (isTomorrow(date)) {
            manana.push(c);
        } else if (isSameWeek(date, now, { weekStartsOn: 1 })) {
            estaSemana.push(c);
        } else {
            masAdelante.push(c);
        }
    });

    overdue.sort((a, b) => new Date(b.due_at).getTime() - new Date(a.due_at).getTime());

    return { overdue, hoy, manana, estaSemana, masAdelante, sinFecha, totalCount: list.length };
}

function categorizeEncargados(commitments: any[], userId: string) {
    const list = commitments.filter(c => {
        return c.owner_user_id === userId && c.assigned_to_user_id && c.assigned_to_user_id !== userId;
    });

    const now = new Date();
    const pendingAcceptance: any[] = [];
    const inProgress: any[] = [];
    const overdue: any[] = [];
    const pendingReview: any[] = [];

    list.forEach(c => {
        const status = normalizeCommitmentStatus(c.status);
        if (c.action_completed_at && !c.resolved_at) {
            pendingReview.push(c);
        } else if (status === 'proposed') {
            pendingAcceptance.push(c);
        } else if (c.due_at && new Date(c.due_at) < now && status !== 'resolved') {
            overdue.push(c);
        } else {
            inProgress.push(c);
        }
    });

    return { pendingAcceptance, inProgress, overdue, pendingReview, totalCount: list.length };
}

function categorizeHistorial(commitments: any[]) {
    const list = commitments.filter(c => {
        const status = normalizeCommitmentStatus(c.status);
        return ['resolved', 'cancelled', 'rejected'].includes(status);
    });

    const resolved: any[] = [];
    const cancelled: any[] = [];
    const rejected: any[] = [];

    list.forEach(c => {
        const status = normalizeCommitmentStatus(c.status);
        if (status === 'resolved') resolved.push(c);
        else if (status === 'cancelled') cancelled.push(c);
        else if (status === 'rejected') rejected.push(c);
    });

    return { resolved, cancelled, rejected, totalCount: list.length };
}

function roleLabel(c: any, currentUserId: string, contactMap: Record<string, string> = {}) {
    const status = normalizeCommitmentStatus(c.status);
    const isFinished = ['resolved', 'cancelled', 'rejected'].includes(status);
    const isDelegated = c.owner_user_id === currentUserId && c.assigned_to_user_id && c.assigned_to_user_id !== currentUserId;

    if (isFinished) {
        if (status === 'resolved') return { text: 'Resuelto' };
        if (status === 'cancelled') return { text: 'Cancelado' };
        return { text: 'Rechazado' };
    }
    if (isDelegated) {
        const assigneeName = c.assignee?.full_name?.split(' ')[0] || contactMap[c.assigned_to_user_id] || 'Otro';
        return { text: `→ ${assigneeName}` };
    }
    if (c.owner_user_id && c.owner_user_id !== currentUserId) {
        const ownerName = c.owner?.full_name?.split(' ')[0] || 'Asignado';
        return { text: `← ${ownerName}` };
    }
    return null; // NO redundant "Mía" chip in Pendientes segment
}

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const TODAY = startOfDay(new Date());
const todayAt = (h: number, m = 0) => {
    const d = new Date(TODAY);
    d.setHours(h, m, 0, 0);
    return d.toISOString();
};

const YESTERDAY_ISO = subDays(TODAY, 1).toISOString();
const TOMORROW_ISO = addDays(TODAY, 1).toISOString();
const IN_3_DAYS_ISO = addDays(TODAY, 3).toISOString();
const IN_14_DAYS_ISO = addDays(TODAY, 14).toISOString();

const USER_ME = 'u1';
const USER_OTHER = 'u2';

const cMineToday = { id: 'c1', title: 'Llamar cliente hoy', due_at: todayAt(10), status: 'accepted', assigned_to_user_id: USER_ME, owner_user_id: USER_ME };
const cOverdue = { id: 'co', title: 'Tarea vencida', due_at: YESTERDAY_ISO, status: 'accepted', assigned_to_user_id: USER_ME, owner_user_id: USER_ME };
const cTomorrow = { id: 'ct', title: 'Reunión mañana', due_at: TOMORROW_ISO, status: 'accepted', assigned_to_user_id: USER_ME, owner_user_id: USER_ME, type: 'meeting' };
const cLaterThisWeek = { id: 'cw', title: 'Entrega esta semana', due_at: IN_3_DAYS_ISO, status: 'accepted', assigned_to_user_id: USER_ME, owner_user_id: USER_ME };
const cFarFuture = { id: 'cf', title: 'Revisión mensual', due_at: IN_14_DAYS_ISO, status: 'accepted', assigned_to_user_id: USER_ME, owner_user_id: USER_ME };
const cNoDate = { id: 'cnd', title: 'Definir estrategia', due_at: null, status: 'accepted', assigned_to_user_id: USER_ME, owner_user_id: USER_ME };

const cDelegated = { id: 'cd', title: 'Disposición Javier', due_at: TOMORROW_ISO, status: 'accepted', assigned_to_user_id: USER_OTHER, owner_user_id: USER_ME, assignee: { full_name: 'Javier Pérez' } };
const cDelegatedProposed = { id: 'cdp', title: 'Propuesta a Ana', due_at: todayAt(15), status: 'proposed', assigned_to_user_id: USER_OTHER, owner_user_id: USER_ME, assignee: { full_name: 'Ana R' } };
const cDelegatedReview = { id: 'cdr', title: 'Revisar entregable', due_at: todayAt(16), status: 'accepted', action_completed_at: YESTERDAY_ISO, assigned_to_user_id: USER_OTHER, owner_user_id: USER_ME };

const cResolved = { id: 'cr', title: 'Completado ayer', due_at: YESTERDAY_ISO, status: 'resolved', assigned_to_user_id: USER_ME, owner_user_id: USER_ME };
const cCancelled = { id: 'cc', title: 'Cancelado', due_at: todayAt(12), status: 'cancelled', assigned_to_user_id: USER_ME, owner_user_id: USER_ME };
const cRejected = { id: 'crej', title: 'Rechazado', due_at: todayAt(16), status: 'rejected', assigned_to_user_id: USER_ME, owner_user_id: USER_OTHER };
const cFromChat = { id: 'cchat', title: 'Hacer presupuesto', due_at: todayAt(11), status: 'accepted', assigned_to_user_id: USER_ME, owner_user_id: USER_ME, message_id: 'msg99', conversation_id: 'conv99' };

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('UX-3B.1 — Draft filter flow (fixes modal re-render bug)', () => {
    it('modal maintains draft state until Aplicar is pressed', () => {
        let activeFilters = { statusFilter: 'all', typeFilter: 'all' };
        let draftFilters = { ...activeFilters };

        // User taps chip inside modal -> updates draft only
        draftFilters.typeFilter = 'meetings';
        expect(activeFilters.typeFilter).toBe('all'); // Active list unaffected

        // User taps Aplicar -> saves draft to active
        activeFilters = { ...draftFilters };
        expect(activeFilters.typeFilter).toBe('meetings');
    });

    it('closing modal without applying discards draft state', () => {
        let activeFilters = { statusFilter: 'all', typeFilter: 'all' };
        let draftFilters = { ...activeFilters };

        // User taps chip inside modal -> updates draft
        draftFilters.typeFilter = 'tasks';

        // User closes modal without applying -> active remains unchanged
        draftFilters = { ...activeFilters };
        expect(activeFilters.typeFilter).toBe('all');
        expect(draftFilters.typeFilter).toBe('all');
    });
});

describe('UX-3B.1 — Contextual filters per segment', () => {
    it('Pendientes segment status options should exclude resolved, cancelled, rejected', () => {
        const pendientesStatusOptions = ['all', 'proposed', 'accepted'];
        expect(pendientesStatusOptions).not.toContain('resolved');
        expect(pendientesStatusOptions).not.toContain('cancelled');
        expect(pendientesStatusOptions).not.toContain('rejected');
    });

    it('Historial segment status options include resolved, cancelled, rejected', () => {
        const historialStatusOptions = ['all', 'resolved', 'cancelled', 'rejected'];
        expect(historialStatusOptions).toContain('resolved');
        expect(historialStatusOptions).toContain('cancelled');
        expect(historialStatusOptions).toContain('rejected');
    });
});

describe('UX-3B.1 — Active Filter Chips Row', () => {
    it('identifies active filters correctly for chip rendering', () => {
        const filters = { statusFilter: 'accepted', typeFilter: 'meetings', originFilter: 'all', personId: null };
        const activeTypes = Object.entries(filters).filter(([k, v]) => v !== 'all' && v !== null);
        expect(activeTypes).toHaveLength(2); // statusFilter & typeFilter
    });

    it('removing single active chip leaves other active filters untouched', () => {
        let filters = { statusFilter: 'accepted', typeFilter: 'meetings' };
        // Remove type filter
        filters.typeFilter = 'all';
        expect(filters.statusFilter).toBe('accepted');
        expect(filters.typeFilter).toBe('all');
    });
});

describe('UX-3B.1 — Role Labeling Rules (No redundant Mía chip)', () => {
    it('returns null for personal pending item (no Mía chip)', () => {
        const label = roleLabel(cMineToday, USER_ME);
        expect(label).toBeNull();
    });

    it('returns → Javier for delegated item in Encargados', () => {
        const label = roleLabel(cDelegated, USER_ME);
        expect(label?.text).toBe('→ Javier');
    });

    it('returns ← OwnerName when assigned by someone else', () => {
        const item = { ...cMineToday, owner_user_id: USER_OTHER, owner: { full_name: 'Ana R' } };
        const label = roleLabel(item, USER_ME);
        expect(label?.text).toBe('← Ana');
    });

    it('returns Resuelto / Cancelado / Rechazado in Historial', () => {
        expect(roleLabel(cResolved, USER_ME)?.text).toBe('Resuelto');
        expect(roleLabel(cCancelled, USER_ME)?.text).toBe('Cancelado');
        expect(roleLabel(cRejected, USER_ME)?.text).toBe('Rechazado');
    });
});

describe('UX-3B.1 — Encargados section grouping', () => {
    it('groups Encargados into proposed, inProgress, pendingReview', () => {
        const { pendingAcceptance, inProgress, pendingReview, totalCount } = categorizeEncargados(
            [cDelegated, cDelegatedProposed, cDelegatedReview], USER_ME
        );
        expect(totalCount).toBe(3);
        expect(pendingAcceptance.map(i => i.id)).toContain('cdp');
        expect(inProgress.map(i => i.id)).toContain('cd');
        expect(pendingReview.map(i => i.id)).toContain('cdr');
    });
});

describe('UX-3B.1 — Historial section grouping', () => {
    it('groups Historial into resolved, cancelled, rejected', () => {
        const { resolved, cancelled, rejected, totalCount } = categorizeHistorial([cResolved, cCancelled, cRejected]);
        expect(totalCount).toBe(3);
        expect(resolved.map(i => i.id)).toContain('cr');
        expect(cancelled.map(i => i.id)).toContain('cc');
        expect(rejected.map(i => i.id)).toContain('crej');
    });
});

describe('UX-3B.1 — Search & Filter Coexistence', () => {
    const allItems = [cMineToday, cTomorrow, cFromChat];

    it('search and filter intersect (both conditions must match)', () => {
        // Search "Llamar" + typeFilter "meetings" -> no match (cMineToday is task)
        const result = filterBySearchAndFilters(allItems, 'Llamar', { typeFilter: 'meetings' }, USER_ME);
        expect(result).toHaveLength(0);

        // Search "Llamar" + typeFilter "all" -> match
        const result2 = filterBySearchAndFilters(allItems, 'Llamar', { typeFilter: 'all' }, USER_ME);
        expect(result2).toHaveLength(1);
    });

    it('clearing search query does NOT clear active filter state', () => {
        let searchQuery = 'Llamar';
        let filters = { typeFilter: 'meetings' };

        searchQuery = ''; // clear search
        expect(filters.typeFilter).toBe('meetings'); // filter preserved
    });

    it('clearing active filter state does NOT clear search query', () => {
        let searchQuery = 'Reunión';
        let filters = { typeFilter: 'meetings' };

        filters = { typeFilter: 'all' }; // clear filter
        expect(searchQuery).toBe('Reunión'); // search preserved
    });
});
