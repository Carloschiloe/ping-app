import React, { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import {
    View, Text, StyleSheet, TouchableOpacity, StatusBar, TextInput,
    ScrollView, SectionList, Modal, RefreshControl, Alert, Share,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';
import { format, startOfDay, isSameDay, subDays } from 'date-fns';
import { es } from 'date-fns/locale';
import { apiClient } from '../api/client';
import { publicPingSurface } from '../api/agentSurfaceAdapter';
import { useAuth } from '../context/AuthContext';
import { useAppTheme } from '../theme/ThemeContext';
import { normalizeCommitmentStatus } from '../utils/commitmentStatus';
import {
    useAcceptCommitment, useResolveCommitment, useReopenCommitment,
    useCancelCommitment, useUpdateCommitment, useContacts, useGroupParticipants,
    useRespondToCommitmentProposal, useConfirmCommitmentProposal,
    useWithdrawCommitmentProposal, useArchiveCommitment,
    useArchivedCommitments, useRestoreCommitment,
} from '../api/queries';
import { performCommitmentConfirm } from '../utils/commitmentConfirmDispatch';
import { isCommitmentOverdue } from '../utils/commitmentDisplay';
import { getCommitmentPrimaryAction, isActorRelevantCommitmentItem } from '../utils/commitmentPrimaryAction';
import type { ChatsTabNavigationProp } from '../navigation/types';

import { CommitmentRow, formatWhen } from '../components/compromisos/CommitmentRow';
import { CommitmentDetailSheet } from '../components/compromisos/CommitmentDetailSheet';
import { RescheduleModal } from '../components/compromisos/RescheduleModal';
import { ConfirmCommitmentModal } from '../components/compromisos/ConfirmCommitmentModal';
import { WeekStrip } from '../components/hoy/WeekStrip';
import { buildDayMarks } from '../utils/calendarDays';

// One tab for the day and every commitment: a single list ordered by when
// things are due, split between what I owe and what others owe me. Finished,
// cancelled and archived items live one tap away, in "Terminados y cancelados".
type HoyView = 'mine' | 'theirs' | 'historial';
type HistoryFilter = 'all' | 'resolved' | 'cancelled' | 'archived';
type TypeFilter = 'all' | 'tasks' | 'meetings';
type OriginFilter = 'all' | 'chat' | 'direct';

type SectionTone = 'danger' | 'accent' | 'muted';
// Every section starts closed and opens from its title, so the screen first
// shows only how many things are in each group. startsOpen is for the one
// section that answers a question the user just asked (a picked day).
type HoySection = {
    key: string; title: string; data: any[]; tone: SectionTone;
    icon: keyof typeof Ionicons.glyphMap; startsOpen?: boolean;
};

const UNDO_TOAST_MS = 6000;
export function classifyMeeting(c: any) {
    return c.type === 'meeting';
}

const isFinishedStatus = (status: string) => ['resolved', 'cancelled', 'rejected'].includes(status);
const byDueAsc = (a: any, b: any) => new Date(a.due_at).getTime() - new Date(b.due_at).getTime();
const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

export function pingSuggestion(overdue: any[], today: any[]): string | null {
    if (overdue.length > 0) {
        const n = overdue.length;
        return `Tienes ${n} atrasado${n > 1 ? 's' : ''}. Parte por «${overdue[0].title}».`;
    }
    const first = today.find((c) => !classifyMeeting(c)) ?? today[0];
    if (!first) return null;
    const n = today.length;
    return `Hoy tienes ${n} ${n > 1 ? 'cosas' : 'cosa'}. Lo primero: «${first.title}».`;
}

export function reminderMessage(c: any, personName: string | null): string {
    const greeting = personName ? `Hola ${personName.split(' ')[0]}` : 'Hola';
    const when = c.due_at ? ` Quedamos para el ${format(new Date(c.due_at), "EEEE d 'de' MMMM", { locale: es })}.` : '';
    return `${greeting}, ¿cómo vas con «${c.title}»?${when} ¡Gracias!`;
}

export default function HoyScreen() {
    const { theme } = useAppTheme();
    const styles = useMemo(() => createStyles(theme), [theme]);
    const { user } = useAuth();
    const navigation = useNavigation<ChatsTabNavigationProp>();

    const [view, setView] = useState<HoyView>('mine');
    const [historyFilter, setHistoryFilter] = useState<HistoryFilter>('all');
    const [expanded, setExpanded] = useState<Record<string, boolean>>({});
    const [selectedDay, setSelectedDay] = useState<Date | null>(null);
    // The calendar is there when asked for, not always in the way. Closing it
    // also drops the picked day, so the full list comes back.
    const [calendarVisible, setCalendarVisible] = useState(false);
    const toggleCalendar = useCallback(() => {
        setCalendarVisible((visible) => {
            if (visible) setSelectedDay(null);
            return !visible;
        });
    }, []);
    const [undoToast, setUndoToast] = useState<{ id: string } | null>(null);
    const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
    useEffect(() => () => { if (toastTimer.current) clearTimeout(toastTimer.current); }, []);

    const openHistory = useCallback((filter: HistoryFilter = 'all') => {
        setHistoryFilter(filter);
        setView('historial');
    }, []);

    const [searchVisible, setSearchVisible] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');
    const [typeFilter, setTypeFilter] = useState<TypeFilter>('all');
    const [originFilter, setOriginFilter] = useState<OriginFilter>('all');
    const [selectedPersonId, setSelectedPersonId] = useState<string | null>(null);

    const [filterDrawerVisible, setFilterDrawerVisible] = useState(false);
    const [draftType, setDraftType] = useState<TypeFilter>('all');
    const [draftOrigin, setDraftOrigin] = useState<OriginFilter>('all');
    const [draftPersonId, setDraftPersonId] = useState<string | null>(null);

    const openFilterDrawer = useCallback(() => {
        setDraftType(typeFilter);
        setDraftOrigin(originFilter);
        setDraftPersonId(selectedPersonId);
        setFilterDrawerVisible(true);
    }, [typeFilter, originFilter, selectedPersonId]);

    const applyFilters = useCallback(() => {
        setTypeFilter(draftType);
        setOriginFilter(draftOrigin);
        setSelectedPersonId(draftPersonId);
        setFilterDrawerVisible(false);
    }, [draftType, draftOrigin, draftPersonId]);

    const clearFilters = useCallback(() => {
        setSearchQuery('');
        setTypeFilter('all');
        setOriginFilter('all');
        setSelectedPersonId(null);
    }, []);

    const toggleSearch = useCallback(() => {
        setSearchVisible((visible) => {
            if (visible) setSearchQuery('');
            return !visible;
        });
    }, []);

    // ─── Sheets ──────────────────────────────────────────────────────────────
    const [detailItem, setDetailItem] = useState<any | null>(null);
    const [rescheduleItem, setRescheduleItem] = useState<any | null>(null);
    // Confirming never writes from the row tap: the row opens the modal and
    // the write runs only from its "Confirmar" button.
    const [confirmItem, setConfirmItem] = useState<any | null>(null);
    const [isConfirming, setIsConfirming] = useState(false);

    // ─── Queries & Mutations ─────────────────────────────────────────────────
    const { data: commitments = [], refetch, isRefetching } = useQuery({
        queryKey: ['all-commitments-dashboard'],
        queryFn: async () => {
            const [confirmed, proposals] = await Promise.all([
                apiClient.get('/commitments'),
                apiClient.get('/commitment-proposals'),
            ]);
            return [...(confirmed || []), ...(proposals || [])];
        },
    });

    const { data: contacts = [] } = useContacts();
    const { data: participants = [] } = useGroupParticipants(detailItem?.conversation_id || null);
    // Archived items come from their own endpoint; GET /commitments never
    // includes them.
    const {
        data: archivedCommitments = [],
        refetch: refetchArchived,
        isRefetching: isRefetchingArchived,
    } = useArchivedCommitments();

    const showingArchived = view === 'historial' && historyFilter === 'archived';
    useFocusEffect(useCallback(() => {
        refetch();
        if (showingArchived) refetchArchived();
    }, [refetch, refetchArchived, showingArchived]));

    const { mutateAsync: acceptCommitment } = useAcceptCommitment();
    const { mutate: resolveCommitment } = useResolveCommitment();
    const { mutate: reopenCommitment } = useReopenCommitment();
    const { mutateAsync: cancelCommitment } = useCancelCommitment();
    const { mutateAsync: archiveCommitment } = useArchiveCommitment();
    const { mutateAsync: restoreCommitment } = useRestoreCommitment();
    const { mutateAsync: updateCommitment } = useUpdateCommitment();
    const { mutateAsync: respondToProposal } = useRespondToCommitmentProposal();
    const { mutateAsync: confirmProposal } = useConfirmCommitmentProposal();
    const { mutateAsync: withdrawProposal } = useWithdrawCommitmentProposal();

    const handleMarkDone = useCallback((id: string) => {
        resolveCommitment({ id, result: 'Resuelto desde Hoy.' });
    }, [resolveCommitment]);

    const handleReceived = useCallback((id: string) => {
        resolveCommitment({ id, result: 'Recibido.' });
    }, [resolveCommitment]);

    const handleRequestConfirm = useCallback((commitment: any) => {
        setConfirmItem(commitment);
    }, []);

    const handleCancelConfirm = useCallback(() => {
        if (isConfirming) return;
        setConfirmItem(null);
    }, [isConfirming]);

    const handleConfirmSubmit = useCallback(async () => {
        if (!confirmItem) return;
        setIsConfirming(true);
        try {
            await performCommitmentConfirm(confirmItem, { acceptCommitment, respondToProposal, confirmProposal });
            setConfirmItem(null);
            // Accepting a shared proposal may still wait on someone else, so
            // the message never claims it is already active.
            if (confirmItem._isAgreementProposal) {
                Alert.alert('Respuesta registrada', `Tu respuesta a "${confirmItem.title}" fue registrada.`);
            } else {
                Alert.alert('Compromiso confirmado', `"${confirmItem.title}" quedó confirmado y activo.`);
            }
        } catch (error: any) {
            console.warn('[Confirmar compromiso] falló', { status: error?.status, message: error instanceof Error ? error.message : 'unknown' });
            Alert.alert('No se pudo confirmar el compromiso', 'Intenta nuevamente.');
        } finally {
            setIsConfirming(false);
        }
    }, [confirmItem, acceptCommitment, respondToProposal, confirmProposal]);

    // After cancelling, a short notice says where it went and offers to undo.
    const handleCancel = useCallback(async (id: string) => {
        try {
            await cancelCommitment({ id });
        } catch {
            Alert.alert('No se pudo cancelar el compromiso', 'Intenta nuevamente.');
            return;
        }
        if (toastTimer.current) clearTimeout(toastTimer.current);
        setUndoToast({ id });
        toastTimer.current = setTimeout(() => setUndoToast(null), UNDO_TOAST_MS);
    }, [cancelCommitment]);

    const handleUndoCancel = useCallback(() => {
        if (!undoToast) return;
        if (toastTimer.current) clearTimeout(toastTimer.current);
        reopenCommitment(undoToast.id);
        setUndoToast(null);
    }, [undoToast, reopenCommitment]);

    const handleArchive = useCallback(async (id: string) => {
        try {
            await archiveCommitment(id);
        } catch {
            Alert.alert('No se pudo archivar el compromiso', 'Intenta nuevamente.');
        }
    }, [archiveCommitment]);

    const handleRestore = useCallback(async (id: string) => {
        try {
            await restoreCommitment(id);
        } catch {
            Alert.alert('No se pudo restaurar el compromiso', 'Intenta nuevamente.');
        }
    }, [restoreCommitment]);

    const handleReopen = useCallback((id: string) => {
        reopenCommitment(id);
    }, [reopenCommitment]);

    // A proposal is rescheduled through counter_propose; a materialized
    // commitment through PATCH /commitments/:id.
    const handleSaveDate = useCallback(async (id: string, newDateIso: string) => {
        if (rescheduleItem?._isAgreementProposal) {
            try {
                await respondToProposal({ id, decision: 'counter_propose', proposedDueAt: newDateIso });
            } catch {
                Alert.alert('No se pudo proponer la fecha', 'Intenta nuevamente.');
            }
            return;
        }
        await updateCommitment({ id, data: { due_at: newDateIso } });
    }, [rescheduleItem, respondToProposal, updateCommitment]);

    const handleRejectProposal = useCallback((commitment: any) => {
        Alert.alert(
            '¿Rechazar propuesta?',
            `"${commitment.title}" no se convertirá en un compromiso.`,
            [
                { text: 'Cancelar', style: 'cancel' },
                {
                    text: 'Rechazar',
                    style: 'destructive',
                    onPress: async () => {
                        try {
                            await respondToProposal({ id: commitment.id, decision: 'reject' });
                        } catch {
                            Alert.alert('No se pudo rechazar la propuesta', 'Intenta nuevamente.');
                        }
                    },
                },
            ]
        );
    }, [respondToProposal]);

    const handleWithdrawProposal = useCallback((commitment: any) => {
        Alert.alert(
            '¿Retirar propuesta?',
            `"${commitment.title}" dejará de estar pendiente y no se convertirá en un compromiso.`,
            [
                { text: 'Volver', style: 'cancel' },
                {
                    text: 'Retirar',
                    style: 'destructive',
                    onPress: async () => {
                        try {
                            await withdrawProposal(commitment.id);
                        } catch {
                            Alert.alert('No se pudo retirar la propuesta', 'Intenta nuevamente.');
                        }
                    },
                },
            ]
        );
    }, [withdrawProposal]);

    const contactNameMap = useMemo(() => {
        const map: Record<string, string> = {};
        (contacts || []).forEach((c: any) => { if (c.id) map[c.id] = c.display_name; });
        return map;
    }, [contacts]);

    // "Recordarle": Ping drafts a friendly note and the share sheet lets the
    // user decide whether, and where, to send it.
    const handleNudge = useCallback(async (c: any) => {
        const name = c.assignee?.full_name || contactNameMap[c.counterparty_contact_id] || null;
        try {
            await Share.share({ message: reminderMessage(c, name) });
        } catch {
            Alert.alert('No se pudo preparar el recordatorio', 'Intenta nuevamente.');
        }
    }, [contactNameMap]);

    const openPing = useCallback((draft?: string) => {
        navigation.navigate('Chats', {
            screen: 'PingAI',
            params: { surface: publicPingSurface(), ...(draft ? { draft, draftAt: Date.now() } : {}) },
        });
    }, [navigation]);

    const teamMembers = useMemo(() => {
        const map = new Map<string, any>();
        commitments.forEach((c: any) => {
            if (c.assignee && c.assignee.id !== user?.id) map.set(c.assignee.id, c.assignee);
            if (c.owner && c.owner.id !== user?.id) map.set(c.owner.id, c.owner);
        });
        return Array.from(map.values());
    }, [commitments, user?.id]);

    const hasFiltersActive = typeFilter !== 'all' || originFilter !== 'all' || !!selectedPersonId;
    const query = searchQuery.trim().toLowerCase();

    const matchesFilters = useCallback((c: any) => {
        if (query) {
            const haystack = [c.title, c.owner?.full_name, c.assignee?.full_name, contactNameMap[c.counterparty_contact_id]]
                .map((v) => (v || '').toLowerCase());
            if (!haystack.some((v) => v.includes(query))) return false;
        }
        if (typeFilter === 'tasks' && classifyMeeting(c)) return false;
        if (typeFilter === 'meetings' && !classifyMeeting(c)) return false;
        if (originFilter === 'chat' && !c.message_id) return false;
        if (originFilter === 'direct' && c.message_id) return false;
        if (selectedPersonId) {
            const matchesPerson = c.assigned_to_user_id === selectedPersonId || c.owner_user_id === selectedPersonId || c.counterparty_contact_id === selectedPersonId;
            if (!matchesPerson) return false;
        }
        return true;
    }, [query, typeFilter, originFilter, selectedPersonId, contactNameMap]);

    const filteredCommitments = useMemo(() => commitments.filter(matchesFilters), [commitments, matchesFilters]);

    // ─── Yo debo ─────────────────────────────────────────────────────────────
    const mineData = useMemo(() => {
        const now = new Date();
        const today = startOfDay(now);

        const porConfirmar: any[] = [];
        const overdue: any[] = [];
        const hoy: any[] = [];
        const proximos: any[] = [];
        const sinFecha: any[] = [];

        filteredCommitments.forEach((c: any) => {
            if (!isActorRelevantCommitmentItem(c, user?.id)) return;
            const status = normalizeCommitmentStatus(c.status);
            if (isFinishedStatus(status)) return;
            // A pending proposal is never mixed with active commitments,
            // whatever its date.
            if (c._isAgreementProposal === true) {
                porConfirmar.push(c);
                return;
            }
            if (!c.due_at) {
                sinFecha.push(c);
                return;
            }
            const date = new Date(c.due_at);
            // A meeting from a past day is simply over; it is not a debt.
            if (classifyMeeting(c) && date < today) return;
            if (isCommitmentOverdue(c, now)) overdue.push(c);
            else if (isSameDay(date, today)) hoy.push(c);
            else proximos.push(c);
        });

        overdue.sort((a, b) => new Date(b.due_at).getTime() - new Date(a.due_at).getTime());
        [hoy, proximos].forEach((arr) => arr.sort(byDueAsc));
        // What the user can answer comes before what waits on someone else.
        porConfirmar.sort((a, b) => (getCommitmentPrimaryAction(a, user?.id) === 'accept' ? 0 : 1) - (getCommitmentPrimaryAction(b, user?.id) === 'accept' ? 0 : 1));

        const sections: HoySection[] = ([
            { key: 'confirmar', title: 'Por confirmar', data: porConfirmar, tone: 'accent', icon: 'help-circle-outline' },
            { key: 'atrasado', title: 'Atrasado', data: overdue, tone: 'danger', icon: 'alert-circle-outline' },
            { key: 'hoy', title: 'Hoy', data: hoy, tone: 'accent', icon: 'sunny-outline' },
            { key: 'proximos', title: 'Próximos', data: proximos, tone: 'muted', icon: 'calendar-outline' },
            { key: 'sinfecha', title: 'Sin fecha', data: sinFecha, tone: 'muted', icon: 'calendar-clear-outline' },
        ] as HoySection[]).filter((s) => s.data.length > 0);

        const next = proximos[0] ?? null;
        const pendingCount = porConfirmar.length + overdue.length + hoy.length + proximos.length + sinFecha.length;
        return { sections, overdue, hoy, next, pendingCount, dayIsFree: porConfirmar.length + overdue.length + hoy.length === 0 };
    }, [filteredCommitments, user?.id]);

    // ─── Me deben ────────────────────────────────────────────────────────────
    const theirsData = useMemo(() => {
        const now = new Date();
        const porAceptar: any[] = [];
        const revisar: any[] = [];
        const overdue: any[] = [];
        const enCurso: any[] = [];

        filteredCommitments.forEach((c: any) => {
            const delegatedByMe = c.owner_user_id === user?.id && c.assigned_to_user_id && c.assigned_to_user_id !== user?.id;
            if (!delegatedByMe) return;
            const status = normalizeCommitmentStatus(c.status);
            if (isFinishedStatus(status)) return;
            if (c.action_completed_at && !c.resolved_at) revisar.push(c);
            else if (status === 'proposed') porAceptar.push(c);
            else if (isCommitmentOverdue(c, now)) overdue.push(c);
            else enCurso.push(c);
        });
        enCurso.sort((a, b) => (a.due_at ? new Date(a.due_at).getTime() : Infinity) - (b.due_at ? new Date(b.due_at).getTime() : Infinity));

        const sections: HoySection[] = ([
            { key: 'revisar', title: 'Dicen que ya está', data: revisar, tone: 'accent', icon: 'checkmark-circle-outline' },
            { key: 'atrasado', title: 'Atrasado', data: overdue, tone: 'danger', icon: 'alert-circle-outline' },
            { key: 'curso', title: 'En curso', data: enCurso, tone: 'muted', icon: 'calendar-outline' },
            { key: 'aceptar', title: 'Aún no lo aceptan', data: porAceptar, tone: 'muted', icon: 'hourglass-outline' },
        ] as HoySection[]).filter((s) => s.data.length > 0);

        return { sections, pendingCount: porAceptar.length + revisar.length + overdue.length + enCurso.length };
    }, [filteredCommitments, user?.id]);

    // ─── Terminados y cancelados ─────────────────────────────────────────────
    // One place for everything closed: done, cancelled, rejected and
    // archived, grouped by when it closed. The chips narrow it to one kind.
    const historialData = useMemo(() => {
        const list = historyFilter === 'archived'
            ? archivedCommitments.filter(matchesFilters)
            : filteredCommitments.filter((c: any) => {
                const status = normalizeCommitmentStatus(c.status);
                if (historyFilter === 'resolved') return status === 'resolved';
                if (historyFilter === 'cancelled') return status === 'cancelled' || status === 'rejected';
                return isFinishedStatus(status);
            });
        const closedAt = (c: any) => new Date(c.archived_at && historyFilter === 'archived'
            ? c.archived_at
            : c.resolved_at || c.updated_at || c.due_at || c.created_at);
        const sorted = [...list].sort((a, b) => closedAt(b).getTime() - closedAt(a).getTime());

        const now = new Date();
        const weekAgo = subDays(startOfDay(now), 7);
        const monthAgo = subDays(startOfDay(now), 30);
        const sections: HoySection[] = ([
            { key: 'semana', title: 'Esta semana', data: sorted.filter((c) => closedAt(c) >= weekAgo), tone: 'muted', icon: 'time-outline' },
            { key: 'mes', title: 'Este mes', data: sorted.filter((c) => closedAt(c) < weekAgo && closedAt(c) >= monthAgo), tone: 'muted', icon: 'time-outline' },
            { key: 'antes', title: 'Antes', data: sorted.filter((c) => closedAt(c) < monthAgo), tone: 'muted', icon: 'time-outline' },
        ] as HoySection[]).filter((s) => s.data.length > 0);
        return { sections };
    }, [filteredCommitments, archivedCommitments, matchesFilters, historyFilter]);

    // Everything pending in "Yo debo" or "Me deben": what the calendar marks
    // and what a picked day is drawn from.
    const pendingItems = useMemo(() => {
        if (view === 'historial') return [];
        return (view === 'mine' ? mineData.sections : theirsData.sections).flatMap((s) => s.data);
    }, [view, mineData, theirsData]);
    const dayMarks = useMemo(() => buildDayMarks(pendingItems, (c) => isCommitmentOverdue(c)), [pendingItems]);

    const currentSections = useMemo(() => {
        const daySection: HoySection | null = selectedDay && view !== 'historial' ? {
            key: 'dia',
            title: capitalize(format(selectedDay, "EEEE d 'de' MMMM", { locale: es })),
            data: pendingItems.filter((c: any) => c.due_at && isSameDay(new Date(c.due_at), selectedDay)).sort(byDueAsc),
            tone: 'accent',
            icon: 'calendar-outline',
            startsOpen: true,
        } : null;
        const sections = daySection ? (daySection.data.length > 0 ? [daySection] : [])
            : view === 'mine' ? mineData.sections
                : view === 'theirs' ? theirsData.sections
                    : historialData.sections;
        // While searching every section is open, so nothing found is hidden.
        return sections.map((s) => {
            const choice = expanded[`${view}:${s.key}`];
            const isOpen = !!query || (choice ?? !!s.startsOpen);
            return { ...s, isOpen, count: s.data.length, data: isOpen ? s.data : [] };
        });
    }, [view, mineData, theirsData, historialData, expanded, query, selectedDay, pendingItems]);

    const toggleSection = useCallback((key: string, isOpen: boolean) => {
        setExpanded((e) => ({ ...e, [`${view}:${key}`]: !isOpen }));
    }, [view]);

    const toneColor = (tone: SectionTone) => tone === 'danger' ? theme.colors.danger
        : tone === 'accent' ? theme.colors.accent
            : theme.colors.text.secondary;

    const suggestion = view === 'mine' && !query && !hasFiltersActive ? pingSuggestion(mineData.overdue, mineData.hoy) : null;
    const todayLabel = capitalize(format(new Date(), "EEEE d 'de' MMMM", { locale: es }));

    const renderListHeader = () => {
        if (view === 'historial') return null;
        const strip = calendarVisible && (
            <View style={styles.weekStrip}>
                <WeekStrip marks={dayMarks} selectedDay={selectedDay} onSelectDay={setSelectedDay} />
            </View>
        );
        if (view !== 'mine' || query || hasFiltersActive || selectedDay || !mineData.dayIsFree) return strip || null;
        return (
            <>
            {strip}
            <View style={styles.freeDay}>
                <Ionicons name="sunny-outline" size={28} color={theme.colors.accent} />
                <Text style={[styles.freeDayTitle, { color: theme.colors.text.primary }]}>Hoy estás libre</Text>
                <Text style={[styles.freeDayText, { color: theme.colors.text.secondary }]}>
                    {mineData.next ? `Lo próximo: «${mineData.next.title}» · ${formatWhen(mineData.next.due_at)}` : 'No tienes nada pendiente.'}
                </Text>
            </View>
            </>
        );
    };

    const renderEmpty = () => {
        if (view === 'mine' && !query && !hasFiltersActive && !selectedDay) return null;
        let copy = 'Nadie te debe nada por ahora.';
        if (view === 'mine') copy = 'No tienes compromisos pendientes.';
        if (view === 'historial') {
            copy = historyFilter === 'archived' ? 'No tienes compromisos archivados.'
                : historyFilter === 'cancelled' ? 'No tienes compromisos cancelados.'
                    : historyFilter === 'resolved' ? 'Aún no terminas ningún compromiso.'
                        : 'Aún no tienes compromisos terminados ni cancelados.';
        }
        if (selectedDay) copy = 'No tienes nada para ese día.';
        if (hasFiltersActive || query) copy = 'No encontré compromisos con esa búsqueda.';
        return (
            <View style={styles.emptyContainer}>
                <Ionicons name="folder-open-outline" size={40} color={theme.colors.text.muted} />
                <Text style={[styles.emptyText, { color: theme.colors.text.secondary }]}>{copy}</Text>
                {(hasFiltersActive || !!query) && (
                    <TouchableOpacity style={[styles.clearFiltersBtn, { borderColor: theme.colors.border }]} onPress={clearFilters}>
                        <Text style={[styles.clearFiltersText, { color: theme.colors.accent }]}>Limpiar búsqueda y filtros</Text>
                    </TouchableOpacity>
                )}
            </View>
        );
    };

    const FilterChip = ({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) => (
        <TouchableOpacity style={[styles.filterChip, active && { backgroundColor: theme.colors.accent }]} onPress={onPress}>
            <Text style={[styles.filterChipText, { color: active ? theme.colors.white : theme.colors.text.secondary }]}>{label}</Text>
        </TouchableOpacity>
    );

    const isSideView = view === 'historial';

    const renderListFooter = () => {
        if (isSideView) return null;
        return (
            <TouchableOpacity
                style={[styles.card, styles.historyLink, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border }]}
                onPress={() => openHistory('all')}
                accessibilityRole="button"
            >
                <Ionicons name="time-outline" size={18} color={theme.colors.text.secondary} />
                <Text style={[styles.historyLinkText, { color: theme.colors.text.primary }]}>Terminados y cancelados</Text>
                <Ionicons name="chevron-forward" size={16} color={theme.colors.text.muted} />
            </TouchableOpacity>
        );
    };

    return (
        <SafeAreaView edges={['top']} style={[styles.container, { backgroundColor: theme.colors.background }]}>
            <StatusBar barStyle={theme.isDark ? 'light-content' : 'dark-content'} />

            <Modal visible={filterDrawerVisible} transparent animationType="slide" onRequestClose={() => setFilterDrawerVisible(false)}>
                <TouchableOpacity style={styles.modalOverlay} activeOpacity={1} onPress={() => setFilterDrawerVisible(false)}>
                    <TouchableOpacity activeOpacity={1} style={[styles.filterSheet, { backgroundColor: theme.colors.surface }]}>
                        <View style={styles.filterSheetHandle} />
                        <Text style={[styles.filterSheetTitle, { color: theme.colors.text.primary }]}>Filtrar</Text>

                        <Text style={[styles.filterGroupLabel, { color: theme.colors.text.muted }]}>Tipo</Text>
                        <View style={styles.filterChipsRow}>
                            {([['all', 'Todo'], ['tasks', 'Tareas'], ['meetings', 'Reuniones']] as const).map(([v, l]) => (
                                <FilterChip key={v} label={l} active={draftType === v} onPress={() => setDraftType(v)} />
                            ))}
                        </View>

                        <Text style={[styles.filterGroupLabel, { color: theme.colors.text.muted }]}>Origen</Text>
                        <View style={styles.filterChipsRow}>
                            {([['all', 'Todo'], ['chat', 'De un chat'], ['direct', 'Creado directo']] as const).map(([v, l]) => (
                                <FilterChip key={v} label={l} active={draftOrigin === v} onPress={() => setDraftOrigin(v)} />
                            ))}
                        </View>

                        {teamMembers.length > 0 && (
                            <>
                                <Text style={[styles.filterGroupLabel, { color: theme.colors.text.muted }]}>Persona</Text>
                                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterChipsRow}>
                                    <FilterChip label="Todos" active={!draftPersonId} onPress={() => setDraftPersonId(null)} />
                                    {teamMembers.map((m: any) => (
                                        <FilterChip key={m.id} label={m.full_name?.split(' ')[0] || 'Usuario'} active={draftPersonId === m.id} onPress={() => setDraftPersonId(m.id)} />
                                    ))}
                                </ScrollView>
                            </>
                        )}

                        <View style={[styles.sheetLinks, { borderTopColor: theme.colors.border }]}>
                            <TouchableOpacity style={styles.sheetLink} onPress={() => { openHistory('all'); setFilterDrawerVisible(false); }}>
                                <Ionicons name="time-outline" size={18} color={theme.colors.text.secondary} />
                                <Text style={[styles.sheetLinkText, { color: theme.colors.text.primary }]}>Terminados y cancelados</Text>
                                <Ionicons name="chevron-forward" size={16} color={theme.colors.text.muted} />
                            </TouchableOpacity>
                        </View>

                        <View style={styles.filterSheetFooter}>
                            <TouchableOpacity
                                style={[styles.filterSecondaryBtn, { borderColor: theme.colors.border }]}
                                onPress={() => { setDraftType('all'); setDraftOrigin('all'); setDraftPersonId(null); }}
                            >
                                <Text style={{ color: theme.colors.text.secondary, fontWeight: '600', fontSize: 13 }}>Limpiar</Text>
                            </TouchableOpacity>
                            <TouchableOpacity style={[styles.filterPrimaryBtn, { backgroundColor: theme.colors.accent }]} onPress={applyFilters}>
                                <Text style={{ color: theme.colors.white, fontWeight: '700', fontSize: 13 }}>Aplicar</Text>
                            </TouchableOpacity>
                        </View>
                    </TouchableOpacity>
                </TouchableOpacity>
            </Modal>

            <CommitmentDetailSheet
                item={detailItem}
                currentUserId={user?.id}
                contacts={contacts}
                participants={participants}
                onClose={() => setDetailItem(null)}
                onMarkDone={handleMarkDone}
                onReschedule={(c) => setRescheduleItem(c)}
                onReopen={handleReopen}
                onCancel={handleCancel}
                onConfirmRequest={handleRequestConfirm}
                onArchive={handleArchive}
                onRestore={handleRestore}
            />
            <RescheduleModal item={rescheduleItem} onClose={() => setRescheduleItem(null)} onSaveDate={handleSaveDate} />
            <ConfirmCommitmentModal
                commitment={confirmItem}
                isPending={isConfirming}
                onCancel={handleCancelConfirm}
                onConfirm={handleConfirmSubmit}
            />

            <View style={styles.header}>
                {isSideView && (
                    <TouchableOpacity onPress={() => setView('mine')} style={styles.backRow} accessibilityRole="button">
                        <Ionicons name="chevron-back" size={16} color={theme.colors.accent} />
                        <Text style={[styles.backText, { color: theme.colors.accent }]}>Volver a Hoy</Text>
                    </TouchableOpacity>
                )}
                <View style={styles.headerTop}>
                    <View style={{ flex: 1 }}>
                        <Text style={[isSideView ? styles.sideTitle : styles.headerTitle, { color: theme.colors.text.primary }]}>
                            {isSideView ? 'Terminados y cancelados' : 'Hoy'}
                        </Text>
                        {!isSideView && <Text style={[styles.headerDate, { color: theme.colors.text.secondary }]}>{todayLabel}</Text>}
                    </View>
                    {!isSideView && (
                        <TouchableOpacity
                            onPress={toggleCalendar}
                            style={[styles.iconBtn, calendarVisible && { backgroundColor: theme.colors.accentSoft }]}
                            accessibilityLabel={calendarVisible ? 'Ocultar calendario' : 'Ver calendario'}
                            accessibilityState={{ expanded: calendarVisible }}
                            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                        >
                            <Ionicons name="calendar-outline" size={21} color={calendarVisible ? theme.colors.accent : theme.colors.text.secondary} />
                        </TouchableOpacity>
                    )}
                    <TouchableOpacity onPress={toggleSearch} style={styles.iconBtn} accessibilityLabel="Buscar" hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                        <Ionicons name={searchVisible ? 'close' : 'search'} size={21} color={theme.colors.text.secondary} />
                    </TouchableOpacity>
                    <TouchableOpacity
                        onPress={openFilterDrawer}
                        style={[styles.iconBtn, hasFiltersActive && { backgroundColor: theme.colors.accentSoft }]}
                        accessibilityLabel="Filtros"
                        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                    >
                        <Ionicons name="options-outline" size={21} color={hasFiltersActive ? theme.colors.accent : theme.colors.text.secondary} />
                    </TouchableOpacity>
                </View>

                {searchVisible && (
                    <View style={[styles.searchBar, { backgroundColor: theme.colors.surfaceMuted, borderColor: theme.colors.border }]}>
                        <Ionicons name="search" size={16} color={theme.colors.text.muted} />
                        <TextInput
                            style={[styles.searchInput, { color: theme.colors.text.primary }]}
                            placeholder="Buscar compromiso o persona"
                            placeholderTextColor={theme.colors.text.muted}
                            value={searchQuery}
                            onChangeText={setSearchQuery}
                            autoFocus
                        />
                    </View>
                )}

                {!!suggestion && (
                    <TouchableOpacity onPress={() => openPing()} style={styles.suggestion} accessibilityRole="button">
                        <Ionicons name="sparkles-outline" size={14} color={theme.colors.accent} />
                        <Text style={[styles.suggestionText, { color: theme.colors.accent }]} numberOfLines={2}>{suggestion}</Text>
                    </TouchableOpacity>
                )}

                {isSideView ? (
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.historyChips}>
                        {([['all', 'Todos'], ['resolved', 'Hechos'], ['cancelled', 'Cancelados'], ['archived', 'Archivados']] as const).map(([v, l]) => (
                            <FilterChip
                                key={v}
                                label={l}
                                active={historyFilter === v}
                                onPress={() => { setHistoryFilter(v); if (v === 'archived') refetchArchived(); }}
                            />
                        ))}
                    </ScrollView>
                ) : (
                    <View style={[styles.segmentContainer, { backgroundColor: theme.colors.surfaceMuted }]}>
                        {([['mine', 'Yo debo', mineData.pendingCount], ['theirs', 'Me deben', theirsData.pendingCount]] as const).map(([v, label, count]) => (
                            <TouchableOpacity key={v} style={[styles.segmentBtn, view === v && styles.segmentBtnActive]} onPress={() => setView(v)}>
                                <Text style={[styles.segmentText, view === v && styles.segmentTextActive]}>{label} · {count}</Text>
                            </TouchableOpacity>
                        ))}
                    </View>
                )}
            </View>

            <SectionList
                sections={currentSections}
                keyExtractor={(item) => item.id}
                renderItem={({ item, index, section }) => {
                    const s = section as typeof currentSections[number];
                    // Each section's rows sit together on one card, so where a
                    // group starts and ends is never in doubt.
                    const isFirst = index === 0;
                    const isLast = index === s.data.length - 1;
                    return (
                        <View
                            style={[
                                styles.cardRow,
                                { backgroundColor: theme.colors.surface, borderColor: theme.colors.border },
                                isFirst && styles.cardRowFirst,
                                !isFirst && { borderTopColor: theme.colors.border, borderTopWidth: StyleSheet.hairlineWidth },
                                isLast && styles.cardRowLast,
                            ]}
                        >
                    <CommitmentRow
                        commitment={item}
                        currentUserId={user?.id}
                        contactNameMap={contactNameMap}
                        onMarkDone={handleMarkDone}
                        onConfirm={handleRequestConfirm}
                        onOpenReschedule={(c) => setRescheduleItem(c)}
                        onOpenDetail={(c) => setDetailItem(c)}
                        onCancel={handleCancel}
                        onReject={handleRejectProposal}
                        onWithdraw={handleWithdrawProposal}
                        onArchive={handleArchive}
                        onRestore={handleRestore}
                        onNudge={view === 'theirs' ? handleNudge : undefined}
                        onReceived={view === 'theirs' ? handleReceived : undefined}
                        onReopen={view === 'historial' ? handleReopen : undefined}
                    />
                        </View>
                    );
                }}
                renderSectionHeader={({ section }) => {
                    const s = section as typeof currentSections[number];
                    const color = toneColor(s.tone);
                    // A section title is a small colored label, never the
                    // same size and weight as the commitments below it.
                    const label = (
                        <View style={styles.sectionLabel}>
                            <Ionicons name={s.icon} size={15} color={color} />
                            <Text style={[styles.sectionTitle, { color }]}>{s.title}</Text>
                            <View style={[styles.countPill, { backgroundColor: s.tone === 'muted' ? theme.colors.surfaceMuted : `${color}26` }]}>
                                <Text style={[styles.countPillText, { color }]}>{s.count}</Text>
                            </View>
                        </View>
                    );
                    return (
                        <TouchableOpacity
                            style={styles.sectionHeader}
                            onPress={() => toggleSection(s.key, s.isOpen)}
                            accessibilityRole="button"
                            accessibilityState={{ expanded: s.isOpen }}
                        >
                            {label}
                            <Ionicons name={s.isOpen ? 'chevron-up' : 'chevron-down'} size={18} color={theme.colors.text.muted} />
                        </TouchableOpacity>
                    );
                }}
                // Passed as an element, not a component: a component made
                // anew on every render would remount the calendar and send
                // the month view back to the week each time a day is picked.
                ListHeaderComponent={renderListHeader()}
                ListEmptyComponent={renderEmpty}
                ListFooterComponent={renderListFooter}
                contentContainerStyle={styles.listContent}
                stickySectionHeadersEnabled={false}
                refreshControl={
                    <RefreshControl
                        refreshing={showingArchived ? isRefetchingArchived : isRefetching}
                        onRefresh={showingArchived ? refetchArchived : refetch}
                        tintColor={theme.colors.accent}
                    />
                }
                showsVerticalScrollIndicator={false}
            />

            {!!undoToast && (
                <View style={[styles.toast, { backgroundColor: theme.colors.surfaceElevated, borderColor: theme.colors.border }]}>
                    <Text style={[styles.toastText, { color: theme.colors.text.primary }]} numberOfLines={2}>
                        Cancelado. Lo verás en Terminados y cancelados.
                    </Text>
                    <TouchableOpacity onPress={handleUndoCancel} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }} accessibilityRole="button">
                        <Text style={[styles.toastAction, { color: theme.colors.accent }]}>Deshacer</Text>
                    </TouchableOpacity>
                </View>
            )}

            {!isSideView && (
                <TouchableOpacity
                    style={[styles.fab, { backgroundColor: theme.colors.accent }]}
                    onPress={() => openPing('Recuérdame ')}
                    accessibilityRole="button"
                    accessibilityLabel="Agregar compromiso"
                >
                    <Ionicons name="add" size={28} color={theme.colors.white} />
                </TouchableOpacity>
            )}
        </SafeAreaView>
    );
}

const createStyles = (theme: any) => StyleSheet.create({
    container: { flex: 1 },
    header: { paddingHorizontal: 16, paddingTop: 8, paddingBottom: 10, gap: 10 },
    headerTop: { flexDirection: 'row', alignItems: 'flex-start', gap: 6 },
    headerTitle: { fontSize: 26, fontWeight: '800', letterSpacing: -0.4 },
    headerDate: { fontSize: 13, marginTop: 1 },
    iconBtn: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
    searchBar: {
        flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, height: 38,
        borderRadius: 19, borderWidth: StyleSheet.hairlineWidth, gap: 6,
    },
    searchInput: { flex: 1, fontSize: 14, paddingVertical: 0 },
    suggestion: { flexDirection: 'row', alignItems: 'flex-start', gap: 6 },
    suggestionText: { flex: 1, fontSize: 13, fontWeight: '600', lineHeight: 18 },
    segmentContainer: { flexDirection: 'row', borderRadius: 20, padding: 3 },
    segmentBtn: { flex: 1, paddingVertical: 7, alignItems: 'center', borderRadius: 17 },
    segmentBtnActive: {
        backgroundColor: theme.colors.surface,
        shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.1, shadowRadius: 2, elevation: 2,
    },
    segmentText: { fontSize: 13, fontWeight: '600', color: theme.colors.text.muted },
    segmentTextActive: { color: theme.colors.text.primary, fontWeight: '700' },
    backRow: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingVertical: 4 },
    backText: { fontSize: 14, fontWeight: '600' },
    weekStrip: { paddingHorizontal: 12, paddingTop: 4 },
    sideTitle: { fontSize: 22, fontWeight: '800', letterSpacing: -0.3 },
    // Bottom room so the + button never covers the last row.
    listContent: { paddingBottom: 120 },
    sectionHeader: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingTop: 18, paddingBottom: 8 },
    sectionLabel: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 6 },
    sectionTitle: { fontSize: 13, fontWeight: '700', letterSpacing: 0.2 },
    countPill: { minWidth: 22, paddingHorizontal: 7, paddingVertical: 1, borderRadius: 10, alignItems: 'center' },
    countPillText: { fontSize: 12, fontWeight: '700' },
    card: { marginHorizontal: 12, borderRadius: 14, borderWidth: StyleSheet.hairlineWidth },
    cardRow: { marginHorizontal: 12, borderLeftWidth: StyleSheet.hairlineWidth, borderRightWidth: StyleSheet.hairlineWidth },
    cardRowFirst: { borderTopWidth: StyleSheet.hairlineWidth, borderTopLeftRadius: 14, borderTopRightRadius: 14 },
    cardRowLast: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomLeftRadius: 14, borderBottomRightRadius: 14 },
    historyChips: { flexDirection: 'row', gap: 8 },
    historyLink: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 24, paddingHorizontal: 14, paddingVertical: 14 },
    historyLinkText: { flex: 1, fontSize: 15, fontWeight: '500' },
    toast: {
        position: 'absolute', left: 16, right: 16, bottom: 90, flexDirection: 'row', alignItems: 'center', gap: 12,
        paddingHorizontal: 14, paddingVertical: 12, borderRadius: 12, borderWidth: StyleSheet.hairlineWidth,
        shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.2, shadowRadius: 6, elevation: 6,
    },
    toastText: { flex: 1, fontSize: 13, lineHeight: 18 },
    toastAction: { fontSize: 14, fontWeight: '700' },
    freeDay: { alignItems: 'center', paddingVertical: 28, paddingHorizontal: 32, gap: 6 },
    freeDayTitle: { fontSize: 17, fontWeight: '700' },
    freeDayText: { fontSize: 14, textAlign: 'center', lineHeight: 20 },
    emptyContainer: { alignItems: 'center', justifyContent: 'center', paddingVertical: 60, paddingHorizontal: 32, gap: 10 },
    emptyText: { fontSize: 14, fontWeight: '500', textAlign: 'center', lineHeight: 20 },
    clearFiltersBtn: { marginTop: 8, paddingHorizontal: 16, paddingVertical: 8, borderRadius: 8, borderWidth: 1 },
    clearFiltersText: { fontSize: 13, fontWeight: '600' },
    fab: {
        position: 'absolute', right: 20, bottom: 20, width: 56, height: 56, borderRadius: 28,
        alignItems: 'center', justifyContent: 'center',
        shadowColor: '#000', shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.2, shadowRadius: 6, elevation: 6,
    },
    modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end' },
    filterSheet: { borderTopLeftRadius: 20, borderTopRightRadius: 20, paddingHorizontal: 20, paddingBottom: 36, paddingTop: 12 },
    filterSheetHandle: { alignSelf: 'center', width: 36, height: 4, borderRadius: 2, backgroundColor: '#d1d5db', marginBottom: 16 },
    filterSheetTitle: { fontSize: 17, fontWeight: '700', marginBottom: 6 },
    filterGroupLabel: { fontSize: 12, fontWeight: '700', marginBottom: 8, marginTop: 12 },
    filterChipsRow: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
    filterChip: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8, backgroundColor: theme.colors.surfaceMuted },
    filterChipText: { fontSize: 13, fontWeight: '600' },
    sheetLinks: { marginTop: 18, borderTopWidth: StyleSheet.hairlineWidth, paddingTop: 6 },
    sheetLink: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 11 },
    sheetLinkText: { flex: 1, fontSize: 15, fontWeight: '500' },
    filterSheetFooter: { flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: 10, marginTop: 18 },
    filterSecondaryBtn: { paddingHorizontal: 14, paddingVertical: 9, borderRadius: 8, borderWidth: 1 },
    filterPrimaryBtn: { paddingHorizontal: 18, paddingVertical: 9, borderRadius: 8 },
});
