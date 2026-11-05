import React, { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import {
    View, Text, StyleSheet, TouchableOpacity, StatusBar, TextInput,
    ScrollView, SectionList, Modal, RefreshControl, Alert, Share,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import Reanimated, { FadeInDown } from 'react-native-reanimated';
import { useFocusEffect, useIsFocused, useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';
import * as Haptics from 'expo-haptics';
import { format, startOfDay, isSameDay, subDays } from 'date-fns';
import { es } from 'date-fns/locale';
import { apiClient } from '../api/client';
import { publicPingSurface } from '../api/agentSurfaceAdapter';
import { useAuth } from '../context/AuthContext';
import { normalizeCommitmentStatus } from '../utils/commitmentStatus';
import {
    useAcceptCommitment, useReopenCommitment,
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
import { CloseCommitmentSheet, type CloseOutcome } from '../components/compromisos/CloseCommitmentSheet';
import { useCloseCommitment, type ClosedNotice } from '../hooks/useCloseCommitment';
import { WeekStrip } from '../components/hoy/WeekStrip';
import { buildDayMarks } from '../utils/calendarDays';
import { colors, gradients, radius, space } from '../design/tokens';
import { fonts, type } from '../design/typography';
import { Glass } from '../design/Glass';
import { TAB_BAR_CLEARANCE } from '../design/FloatingTabBar';

import { SheetFill, sheetSurface } from '../design/Sheet';
import { PingOrb } from '../design/PingOrb';

// One tab for the day and every commitment: a single list ordered by when
// things are due, split between what I owe and what others owe me. Finished,
// cancelled and archived items live one tap away, in "Terminados y cancelados".
type HoyView = 'mine' | 'theirs' | 'historial';
type HistoryFilter = 'all' | 'resolved' | 'cancelled' | 'archived';
type TypeFilter = 'all' | 'tasks' | 'meetings';

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
        return `Tienes ${n} atrasado${n > 1 ? 's' : ''}. ¿Ya hiciste ${n > 1 ? 'alguno' : 'eso'}?`;
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
    const { user } = useAuth();
    const navigation = useNavigation<ChatsTabNavigationProp>();
    const isFocused = useIsFocused();

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
    const [undoToast, setUndoToast] = useState<ClosedNotice | null>(null);
    const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
    useEffect(() => () => { if (toastTimer.current) clearTimeout(toastTimer.current); }, []);

    const openHistory = useCallback((filter: HistoryFilter = 'all') => {
        setHistoryFilter(filter);
        setView('historial');
    }, []);

    const [searchVisible, setSearchVisible] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');
    const [typeFilter, setTypeFilter] = useState<TypeFilter>('all');
    const [selectedPersonId, setSelectedPersonId] = useState<string | null>(null);
    // Filters apply the moment they are tapped; the person list opens on its own.
    const [personPickerVisible, setPersonPickerVisible] = useState(false);


    const clearFilters = useCallback(() => {
        setSearchQuery('');
        setTypeFilter('all');
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
    const { mutate: reopenCommitment } = useReopenCommitment();
    const { mutateAsync: cancelCommitment } = useCancelCommitment();
    const { mutateAsync: archiveCommitment } = useArchiveCommitment();
    const { mutateAsync: restoreCommitment } = useRestoreCommitment();
    const { mutateAsync: updateCommitment } = useUpdateCommitment();
    const { mutateAsync: respondToProposal } = useRespondToCommitmentProposal();
    const { mutateAsync: confirmProposal } = useConfirmCommitmentProposal();
    const { mutateAsync: withdrawProposal } = useWithdrawCommitmentProposal();

    // Closing asks how it went. While reviewing the overdue items the sheet
    // walks through them one by one.
    const [closeItem, setCloseItem] = useState<any | null>(null);
    const { close: closeCommitment, isSaving: isClosing } = useCloseCommitment();
    const [review, setReview] = useState<{ ids: string[]; index: number } | null>(null);

    // The sheet covers the bottom of the screen, so the tab bar steps aside.
    useEffect(() => {
        navigation.setOptions({ tabBarStyle: closeItem ? { display: 'none' } : undefined } as any);
    }, [navigation, closeItem]);

    const showUndo = useCallback((notice: ClosedNotice) => {
        if (toastTimer.current) clearTimeout(toastTimer.current);
        setUndoToast(notice);
        toastTimer.current = setTimeout(() => setUndoToast(null), UNDO_TOAST_MS);
    }, []);

    const handleMarkDone = useCallback((id: string) => {
        setReview(null);
        setCloseItem(commitments.find((c: any) => c.id === id) ?? null);
    }, [commitments]);

    const startReview = useCallback((items: any[]) => {
        const ids = items.filter((c) => getCommitmentPrimaryAction(c, user?.id) === 'complete').map((c) => c.id);
        if (ids.length === 0) return false;
        setReview({ ids, index: 0 });
        setCloseItem(commitments.find((c: any) => c.id === ids[0]) ?? null);
        return true;
    }, [commitments, user?.id]);

    const nextInReview = useCallback(() => {
        if (!review || review.index + 1 >= review.ids.length) {
            setReview(null);
            setCloseItem(null);
            return;
        }
        const index = review.index + 1;
        setReview({ ...review, index });
        setCloseItem(commitments.find((c: any) => c.id === review.ids[index]) ?? null);
    }, [review, commitments]);

    const handleCloseSubmit = useCallback(async (outcome: CloseOutcome, note: string, dueAt: Date | null) => {
        const item = closeItem;
        if (!item) return;
        let notice: ClosedNotice;
        try {
            notice = await closeCommitment(item, outcome, note, dueAt);
        } catch {
            Alert.alert('No se pudo guardar', 'Intenta nuevamente.');
            return;
        }
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        showUndo(notice);
        if (review) {
            nextInReview();
            return;
        }
        setCloseItem(null);
    }, [closeItem, review, nextInReview, closeCommitment, showUndo]);

    const handleCloseReschedule = useCallback((item: any) => {
        setCloseItem(null);
        setRescheduleItem(item);
    }, []);

    const handleRescheduleClose = useCallback(() => {
        setRescheduleItem(null);
        if (review) nextInReview();
    }, [review, nextInReview]);

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
        showUndo({ text: 'Cancelado. Lo verás en Terminados y cancelados.', undo: () => reopenCommitment(id) });
    }, [cancelCommitment, reopenCommitment, showUndo]);

    const handleUndo = useCallback(() => {
        if (!undoToast) return;
        if (toastTimer.current) clearTimeout(toastTimer.current);
        undoToast.undo();
        setUndoToast(null);
    }, [undoToast]);

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

    const openPing = useCallback((startWith?: 'voice') => {
        navigation.navigate('Chats', {
            screen: 'PingAI',
            params: { surface: publicPingSurface(), ...(startWith ? { startWith } : {}) },
        });
    }, [navigation]);

    // Only what really shows in Yo debo or Me deben counts for a person, so
    // the number next to a name always matches the list it opens.
    const isListed = useCallback((c: any) => {
        if (isFinishedStatus(normalizeCommitmentStatus(c.status))) return false;
        if (c.owner_user_id === user?.id && c.assigned_to_user_id && c.assigned_to_user_id !== user?.id) return true;
        if (!isActorRelevantCommitmentItem(c, user?.id)) return false;
        if (c._isAgreementProposal !== true && c.due_at && classifyMeeting(c) && new Date(c.due_at) < startOfDay(new Date())) return false;
        return true;
    }, [user?.id]);

    const people = useMemo(() => {
        const map = new Map<string, { id: string; name: string; count: number }>();
        const add = (id: string | null | undefined, name: string | null | undefined) => {
            if (!id || id === user?.id || !name) return;
            const entry = map.get(id) ?? { id, name, count: 0 };
            entry.count += 1;
            map.set(id, entry);
        };
        commitments.filter(isListed).forEach((c: any) => {
            add(c.assigned_to_user_id, c.assignee?.full_name || c.assignee?.email?.split('@')[0]);
            if (c.owner_user_id !== c.assigned_to_user_id) add(c.owner_user_id, c.owner?.full_name || c.owner?.email?.split('@')[0]);
            add(c.counterparty_contact_id, contactNameMap[c.counterparty_contact_id]);
        });
        return Array.from(map.values()).sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
    }, [commitments, contactNameMap, isListed, user?.id]);
    const selectedPerson = people.find((p) => p.id === selectedPersonId) ?? null;

    const hasFiltersActive = typeFilter !== 'all' || !!selectedPersonId;
    const query = searchQuery.trim().toLowerCase();

    const matchesFilters = useCallback((c: any) => {
        if (query) {
            const haystack = [c.title, c.owner?.full_name, c.assignee?.full_name, contactNameMap[c.counterparty_contact_id]]
                .map((v) => (v || '').toLowerCase());
            if (!haystack.some((v) => v.includes(query))) return false;
        }
        if (typeFilter === 'tasks' && classifyMeeting(c)) return false;
        if (typeFilter === 'meetings' && !classifyMeeting(c)) return false;
        if (selectedPersonId) {
            const matchesPerson = c.assigned_to_user_id === selectedPersonId || c.owner_user_id === selectedPersonId || c.counterparty_contact_id === selectedPersonId;
            if (!matchesPerson) return false;
        }
        return true;
    }, [query, typeFilter, selectedPersonId, contactNameMap]);

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

    // Picking a person never lands on an empty side when the other one has them.
    useEffect(() => {
        if (!selectedPersonId) return;
        if (view === 'mine' && mineData.pendingCount === 0 && theirsData.pendingCount > 0) setView('theirs');
        else if (view === 'theirs' && theirsData.pendingCount === 0 && mineData.pendingCount > 0) setView('mine');
    }, [selectedPersonId]); // eslint-disable-line react-hooks/exhaustive-deps

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

    const toneColor = (tone: SectionTone) => tone === 'danger' ? colors.danger
        : tone === 'accent' ? colors.accentBright
            : colors.textSoft;

    const suggestion = view === 'mine' && !query && !hasFiltersActive ? pingSuggestion(mineData.overdue, mineData.hoy) : null;
    // Short enough to stay on one line next to the buttons: "MIÉRCOLES 4 NOV".
    const todayLabel = capitalize(format(new Date(), 'EEEE d MMM', { locale: es }).replace('.', ''));

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
                <Ionicons name="sunny-outline" size={28} color={colors.accent} />
                <Text style={[styles.freeDayTitle, { color: colors.text }]}>Hoy estás libre</Text>
                <Text style={[styles.freeDayText, { color: colors.textSoft }]}>
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
                <Ionicons name="folder-open-outline" size={40} color={colors.textFaint} />
                <Text style={[styles.emptyText, { color: colors.textSoft }]}>{copy}</Text>
                {(hasFiltersActive || !!query) && (
                    <TouchableOpacity style={[styles.clearFiltersBtn, { borderColor: colors.glassBorder }]} onPress={clearFilters}>
                        <Text style={[styles.clearFiltersText, { color: colors.accent }]}>Limpiar búsqueda y filtros</Text>
                    </TouchableOpacity>
                )}
            </View>
        );
    };

    const FilterChip = ({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) => (
        <TouchableOpacity style={[styles.filterChip, active && styles.filterChipActive]} onPress={onPress}>
            <Text style={[styles.filterChipText, { color: active ? colors.onAccent : colors.textSoft }]}>{label}</Text>
        </TouchableOpacity>
    );

    const isSideView = view === 'historial';

    const renderListFooter = () => {
        if (isSideView) return null;
        return (
            <TouchableOpacity onPress={() => openHistory('all')} accessibilityRole="button">
                <Glass style={styles.historyLink} intensity={22} tint={colors.glassTintLight}>
                <Ionicons name="time-outline" size={18} color={colors.textSoft} />
                <Text style={[styles.historyLinkText, { color: colors.text }]}>Terminados y cancelados</Text>
                <Ionicons name="chevron-forward" size={16} color={colors.textFaint} />
                </Glass>
            </TouchableOpacity>
        );
    };

    return (
        <SafeAreaView edges={['top']} style={styles.container}>
            <StatusBar barStyle={'light-content'} />

            <Modal visible={personPickerVisible} transparent animationType="slide" onRequestClose={() => setPersonPickerVisible(false)}>
                <TouchableOpacity style={styles.modalOverlay} activeOpacity={1} onPress={() => setPersonPickerVisible(false)}>
                    <TouchableOpacity activeOpacity={1} style={styles.filterSheet}>
                        <SheetFill />
                        <View style={styles.filterSheetHandle} />
                        <Text style={[styles.filterSheetTitle, { color: colors.text }]}>Ver compromisos con…</Text>
                        <ScrollView style={{ maxHeight: 420 }}>
                            {[{ id: null as string | null, name: 'Todas las personas', count: 0 }, ...people].map((p) => {
                                const active = selectedPersonId === p.id;
                                return (
                                    <TouchableOpacity
                                        key={p.id ?? 'all'}
                                        style={styles.personRow}
                                        onPress={() => { setSelectedPersonId(p.id); setPersonPickerVisible(false); }}
                                        accessibilityRole="button"
                                        accessibilityState={{ selected: active }}
                                    >
                                        <LinearGradient colors={gradients.avatar[0]} style={styles.personAvatar}>
                                            {p.id ? <Text style={styles.personInitial}>{p.name.charAt(0).toUpperCase()}</Text> : <Ionicons name="people" size={16} color={colors.silver} />}
                                        </LinearGradient>
                                        <Text style={[styles.personName, active && { color: colors.accentBright }]} numberOfLines={1}>{p.name}</Text>
                                        {p.id && <Text style={styles.personCount}>{p.count}</Text>}
                                        {active && <Ionicons name="checkmark" size={18} color={colors.accentBright} />}
                                    </TouchableOpacity>
                                );
                            })}
                        </ScrollView>
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
            <RescheduleModal item={rescheduleItem} onClose={handleRescheduleClose} onSaveDate={handleSaveDate} />
            <CloseCommitmentSheet
                item={closeItem}
                canCancel={!!closeItem && closeItem.owner_user_id === user?.id}
                isSaving={isClosing}
                progress={review ? { index: review.index, total: review.ids.length } : null}
                onClose={() => { setCloseItem(null); setReview(null); }}
                onSubmit={handleCloseSubmit}
                onReschedule={handleCloseReschedule}
                onSkip={nextInReview}
            />
            <ConfirmCommitmentModal
                commitment={confirmItem}
                isPending={isConfirming}
                onCancel={handleCancelConfirm}
                onConfirm={handleConfirmSubmit}
            />

            <View style={styles.header}>
                {isSideView && (
                    <TouchableOpacity onPress={() => setView('mine')} style={styles.backRow} accessibilityRole="button">
                        <Ionicons name="chevron-back" size={16} color={colors.accent} />
                        <Text style={[styles.backText, { color: colors.accent }]}>Volver a Hoy</Text>
                    </TouchableOpacity>
                )}
                <View style={styles.headerTop}>
                    <View style={{ flex: 1 }}>
                        {!isSideView && <Text style={type.overline} numberOfLines={1}>{todayLabel.toUpperCase()}</Text>}
                        <Text style={isSideView ? styles.sideTitle : styles.headerTitle}>
                            {isSideView ? 'Terminados y cancelados' : 'Hoy'}
                        </Text>
                    </View>
                    {!isSideView && (
                        <TouchableOpacity
                            onPress={toggleCalendar}
                            style={[styles.iconBtn, calendarVisible && styles.iconBtnActive]}
                            accessibilityLabel={calendarVisible ? 'Ocultar calendario' : 'Ver calendario'}
                            accessibilityState={{ expanded: calendarVisible }}
                            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                        >
                            <Ionicons name="calendar-outline" size={21} color={calendarVisible ? colors.accentBright : colors.text} />
                        </TouchableOpacity>
                    )}
                    <TouchableOpacity onPress={toggleSearch} style={styles.iconBtn} accessibilityLabel="Buscar" hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                        <Ionicons name={searchVisible ? 'close' : 'search'} size={21} color={colors.text} />
                    </TouchableOpacity>
                    {/* Same place and look as in Chats: Ping is always top right. */}
                    {!isSideView && (
                        <TouchableOpacity
                            style={styles.orbBtn}
                            onPress={() => openPing('voice')}
                            accessibilityRole="button"
                            accessibilityLabel="Abrir Ping"
                        >
                            <PingOrb size={44} paused={!isFocused} />
                        </TouchableOpacity>
                    )}
                </View>

                {searchVisible && (
                    <Glass style={styles.searchBar} intensity={40}>
                        <Ionicons name="search" size={16} color={colors.textFaint} />
                        <TextInput
                            style={[styles.searchInput, { color: colors.text }]}
                            placeholder="Buscar compromiso o persona"
                            placeholderTextColor={colors.textFaint}
                            value={searchQuery}
                            onChangeText={setSearchQuery}
                            autoFocus
                        />
                    </Glass>
                )}

                {!!suggestion && (
                    <TouchableOpacity onPress={() => { if (!startReview(mineData.overdue)) openPing(); }} accessibilityRole="button">
                        <Glass style={styles.suggestion} intensity={40} tint={colors.glassDim}>
                            <View style={styles.suggestionIcon}>
                                <Ionicons name="sparkles" size={14} color={colors.accentBright} />
                            </View>
                            <Text style={styles.suggestionText} numberOfLines={2}>{suggestion}</Text>
                            <Ionicons name="chevron-forward" size={16} color={colors.textFaint} />
                        </Glass>
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
                    <Glass style={styles.segmentContainer} intensity={40} tint={colors.glassDim}>
                        {([['mine', 'Yo debo', mineData.pendingCount], ['theirs', 'Me deben', theirsData.pendingCount]] as const).map(([v, label, count]) => (
                            <TouchableOpacity key={v} style={styles.segmentBtn} onPress={() => setView(v)}>
                                {view === v && (
                                    <LinearGradient colors={gradients.accent} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={[StyleSheet.absoluteFill, styles.segmentPill]} />
                                )}
                                <Text style={[styles.segmentText, view === v && styles.segmentTextActive]}>{label} · {count}</Text>
                            </TouchableOpacity>
                        ))}
                    </Glass>
                )}

                {!isSideView && (
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.quickFilters}>
                        {selectedPerson ? (
                            <TouchableOpacity style={[styles.filterChip, styles.filterChipActive, styles.personChip]} onPress={() => setSelectedPersonId(null)} accessibilityLabel={`Quitar filtro ${selectedPerson.name}`}>
                                <Text style={[styles.filterChipText, { color: colors.onAccent }]} numberOfLines={1}>{selectedPerson.name}</Text>
                                <Ionicons name="close" size={14} color={colors.onAccent} />
                            </TouchableOpacity>
                        ) : people.length > 0 && (
                            <TouchableOpacity style={[styles.filterChip, styles.personChip]} onPress={() => setPersonPickerVisible(true)}>
                                <Ionicons name="person-outline" size={13} color={colors.textSoft} />
                                <Text style={[styles.filterChipText, { color: colors.textSoft }]}>Persona</Text>
                                <Ionicons name="chevron-down" size={13} color={colors.textSoft} />
                            </TouchableOpacity>
                        )}
                        {([['all', 'Todo'], ['tasks', 'Tareas'], ['meetings', 'Reuniones']] as const).map(([v, l]) => (
                            <FilterChip key={v} label={l} active={typeFilter === v} onPress={() => setTypeFilter(v)} />
                        ))}
                    </ScrollView>
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
                        <Reanimated.View
                            entering={index < 8 ? FadeInDown.delay(index * 40).duration(380) : undefined}
                            style={[isFirst && styles.bandFirst, isLast && styles.bandLast]}
                        >
                            <Glass style={[StyleSheet.absoluteFill, styles.bandGlass]} intensity={22} tint={colors.glassTintLight} />
                            {!isFirst && <View pointerEvents="none" style={styles.bandSeparator} />}
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
                        onReceived={view === 'theirs' ? handleMarkDone : undefined}
                        onReopen={view === 'historial' ? handleReopen : undefined}
                    />
                        </Reanimated.View>
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
                            <View style={[styles.countPill, { backgroundColor: s.tone === 'danger' ? colors.dangerTint : s.tone === 'accent' ? colors.accentTint : colors.glassRaised }]}>
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
                            <Ionicons name={s.isOpen ? 'chevron-up' : 'chevron-down'} size={18} color={colors.textFaint} />
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
                        tintColor={colors.accent}
                    />
                }
                showsVerticalScrollIndicator={false}
            />

            {!!undoToast && (
                <View style={styles.toast}>
                    <SheetFill />
                    <Text style={[styles.toastText, { color: colors.text }]} numberOfLines={2}>
                        {undoToast.text}
                    </Text>
                    <TouchableOpacity onPress={handleUndo} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }} accessibilityRole="button">
                        <Text style={[styles.toastAction, { color: colors.accent }]}>Deshacer</Text>
                    </TouchableOpacity>
                </View>
            )}

        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1 },
    header: { paddingHorizontal: space.xl, paddingTop: space.sm, paddingBottom: space.md, gap: space.md },
    headerTop: { flexDirection: 'row', alignItems: 'flex-end', gap: space.sm },
    headerTitle: { ...type.display, marginTop: 2 },
    orbBtn: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
    iconBtn: {
        width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center',
        backgroundColor: colors.glassDim, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.glassBorder,
    },
    iconBtnActive: { backgroundColor: colors.accentTint, borderColor: colors.accent },
    searchBar: {
        flexDirection: 'row', alignItems: 'center', paddingHorizontal: space.md + 2, height: 42,
        borderRadius: radius.full, gap: space.sm,
    },
    searchInput: { fontFamily: fonts.regular, flex: 1, fontSize: 15, color: colors.text, paddingVertical: 0 },
    // Ping's hint: a glass pill with plain light text, readable over any wave.
    suggestion: {
        flexDirection: 'row', alignItems: 'center', gap: space.sm + 2,
        paddingVertical: space.sm + 2, paddingLeft: space.sm + 2, paddingRight: space.md, borderRadius: radius.lg,
    },
    suggestionIcon: {
        width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center',
        backgroundColor: colors.accentTint,
    },
    suggestionText: { flex: 1, fontSize: 14, fontFamily: fonts.medium, lineHeight: 19, color: colors.text },
    segmentContainer: { flexDirection: 'row', borderRadius: radius.full, padding: 4 },
    segmentBtn: { flex: 1, paddingVertical: 9, alignItems: 'center', borderRadius: radius.full, overflow: 'hidden' },
    segmentPill: { borderRadius: radius.full },
    segmentText: { fontSize: 14, fontFamily: fonts.semibold, color: colors.textSoft },
    segmentTextActive: { color: colors.onAccent },
    backRow: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingVertical: 4 },
    backText: { fontSize: 14, fontFamily: fonts.semibold },
    weekStrip: { paddingHorizontal: 12, paddingTop: 4 },
    sideTitle: { ...type.title, fontSize: 22 },
    // Bottom room so the + button and the tab bar never cover the last row.
    listContent: { paddingBottom: TAB_BAR_CLEARANCE + 24 },
    sectionHeader: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: space.xl, paddingTop: space.xl, paddingBottom: space.sm },
    sectionLabel: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 6 },
    sectionTitle: { fontSize: 12, fontFamily: fonts.semibold, letterSpacing: 1, textTransform: 'uppercase' },
    countPill: { minWidth: 22, paddingHorizontal: 7, paddingVertical: 1, borderRadius: 10, alignItems: 'center' },
    countPillText: { fontSize: 12, fontFamily: fonts.bold },
    bandGlass: { borderWidth: 0 },
    bandFirst: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.glassBorder },
    bandLast: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.glassBorder },
    bandSeparator: { position: 'absolute', top: 0, left: space.xl, right: 0, height: StyleSheet.hairlineWidth, backgroundColor: colors.separator },
    historyChips: { flexDirection: 'row', gap: 8 },
    historyLink: {
        flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: space.xxl, paddingHorizontal: space.xl, paddingVertical: space.lg,
        borderWidth: 0, borderTopWidth: StyleSheet.hairlineWidth, borderBottomWidth: StyleSheet.hairlineWidth,
    },
    historyLinkText: { flex: 1, fontSize: 15, fontFamily: fonts.medium },
    toast: {
        position: 'absolute', left: 16, right: 16, bottom: TAB_BAR_CLEARANCE + 72, flexDirection: 'row', alignItems: 'center', gap: 12,
        paddingHorizontal: 14, paddingVertical: 12, borderRadius: 12,
        shadowColor: colors.ink, shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.2, shadowRadius: 6, elevation: 6,
        ...sheetSurface,
    },
    toastText: { fontFamily: fonts.regular, flex: 1, fontSize: 13, lineHeight: 18 },
    toastAction: { fontSize: 14, fontFamily: fonts.bold },
    freeDay: { alignItems: 'center', paddingVertical: 28, paddingHorizontal: 32, gap: 6 },
    freeDayTitle: { fontSize: 17, fontFamily: fonts.bold },
    freeDayText: { fontFamily: fonts.regular, fontSize: 14, textAlign: 'center', lineHeight: 20 },
    emptyContainer: { alignItems: 'center', justifyContent: 'center', paddingVertical: 60, paddingHorizontal: 32, gap: 10 },
    emptyText: { fontSize: 14, fontFamily: fonts.medium, textAlign: 'center', lineHeight: 20 },
    clearFiltersBtn: { marginTop: 8, paddingHorizontal: 16, paddingVertical: 8, borderRadius: 8, borderWidth: 1 },
    clearFiltersText: { fontSize: 13, fontFamily: fonts.semibold },
    modalOverlay: { flex: 1, backgroundColor: colors.scrim, justifyContent: 'flex-end' },
    filterSheet: { borderTopLeftRadius: 26, borderTopRightRadius: 26, paddingHorizontal: 20, paddingBottom: 36, paddingTop: 12, ...sheetSurface },
    filterSheetHandle: { alignSelf: 'center', width: 36, height: 4, borderRadius: 2, backgroundColor: colors.glassBorder, marginBottom: 16 },
    filterSheetTitle: { fontSize: 17, fontFamily: fonts.bold, marginBottom: 6 },
    filterChip: {
        paddingHorizontal: 14, paddingVertical: 7, borderRadius: radius.full,
        backgroundColor: colors.glassRaised, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.glassBorder,
    },
    filterChipActive: { backgroundColor: colors.accent, borderColor: colors.accent },
    filterChipText: { fontSize: 13, fontFamily: fonts.semibold },
    quickFilters: { flexDirection: 'row', gap: 8, paddingTop: space.md },
    personChip: { flexDirection: 'row', alignItems: 'center', gap: 5, maxWidth: 180 },
    personRow: { flexDirection: 'row', alignItems: 'center', gap: space.md, paddingVertical: 10 },
    personAvatar: { width: 36, height: 36, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
    personInitial: { fontFamily: fonts.bold, fontSize: 15, color: colors.silver },
    personName: { flex: 1, fontFamily: fonts.medium, fontSize: 15, color: colors.text },
    personCount: { fontFamily: fonts.semibold, fontSize: 13, color: colors.textFaint },
});
