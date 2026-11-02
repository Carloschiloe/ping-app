import React, { useState, useMemo, useCallback } from 'react';
import {
    View, Text, StyleSheet, TouchableOpacity, StatusBar, TextInput,
    ScrollView, SectionList, Modal, RefreshControl, Alert, Share,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';
import { format, isTomorrow, isSameWeek, startOfDay, isSameDay, subDays } from 'date-fns';
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

// One tab for the day and every commitment: a single list ordered by when
// things are due, split between what I owe and what others owe me. History
// and archived items stay one step away, behind the filter sheet.
type HoyView = 'mine' | 'theirs' | 'historial' | 'archivados';
type TypeFilter = 'all' | 'tasks' | 'meetings';
type OriginFilter = 'all' | 'chat' | 'direct';

type HoySection = { key: string; title: string; data: any[]; collapsible?: boolean; danger?: boolean };

const RECENT_DONE_DAYS = 7;
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
    const [expanded, setExpanded] = useState<Record<string, boolean>>({});

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

    useFocusEffect(useCallback(() => {
        refetch();
        if (view === 'archivados') refetchArchived();
    }, [refetch, refetchArchived, view]));

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

    const handleCancel = useCallback(async (id: string) => {
        try {
            await cancelCommitment({ id });
        } catch {
            Alert.alert('No se pudo cancelar el compromiso', 'Intenta nuevamente.');
        }
    }, [cancelCommitment]);

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
        const doneSince = subDays(today, RECENT_DONE_DAYS);

        const porConfirmar: any[] = [];
        const overdue: any[] = [];
        const hoy: any[] = [];
        const manana: any[] = [];
        const semana: any[] = [];
        const adelante: any[] = [];
        const sinFecha: any[] = [];
        const hechos: any[] = [];

        filteredCommitments.forEach((c: any) => {
            if (!isActorRelevantCommitmentItem(c, user?.id)) return;
            const status = normalizeCommitmentStatus(c.status);
            if (status === 'resolved') {
                const doneAt = new Date(c.resolved_at || c.updated_at || c.due_at || 0);
                if (doneAt >= doneSince) hechos.push(c);
                return;
            }
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
            else if (isTomorrow(date)) manana.push(c);
            else if (isSameWeek(date, now, { weekStartsOn: 1 })) semana.push(c);
            else adelante.push(c);
        });

        overdue.sort((a, b) => new Date(b.due_at).getTime() - new Date(a.due_at).getTime());
        [hoy, manana, semana, adelante].forEach((arr) => arr.sort(byDueAsc));
        hechos.sort((a, b) => new Date(b.resolved_at || b.updated_at || 0).getTime() - new Date(a.resolved_at || a.updated_at || 0).getTime());
        // What the user can answer comes before what waits on someone else.
        porConfirmar.sort((a, b) => (getCommitmentPrimaryAction(a, user?.id) === 'accept' ? 0 : 1) - (getCommitmentPrimaryAction(b, user?.id) === 'accept' ? 0 : 1));

        const sections: HoySection[] = [
            { key: 'confirmar', title: 'Por confirmar', data: porConfirmar },
            { key: 'atrasado', title: 'Atrasado', data: overdue, danger: true },
            { key: 'hoy', title: 'Hoy', data: hoy },
            { key: 'manana', title: 'Mañana', data: manana, collapsible: true },
            { key: 'semana', title: 'Esta semana', data: semana, collapsible: true },
            { key: 'adelante', title: 'Más adelante', data: adelante, collapsible: true },
            { key: 'sinfecha', title: 'Sin fecha', data: sinFecha, collapsible: true },
            { key: 'hechos', title: 'Hechos recientes', data: hechos, collapsible: true },
        ].filter((s) => s.data.length > 0);

        const next = manana[0] ?? semana[0] ?? adelante[0] ?? null;
        const pendingCount = porConfirmar.length + overdue.length + hoy.length + manana.length + semana.length + adelante.length + sinFecha.length;
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

        const sections: HoySection[] = [
            { key: 'revisar', title: 'Dicen que ya está', data: revisar },
            { key: 'atrasado', title: 'Atrasado', data: overdue, danger: true },
            { key: 'curso', title: 'En curso', data: enCurso },
            { key: 'aceptar', title: 'Aún no lo aceptan', data: porAceptar },
        ].filter((s) => s.data.length > 0);

        return { sections, pendingCount: porAceptar.length + revisar.length + overdue.length + enCurso.length };
    }, [filteredCommitments, user?.id]);

    // ─── Historial y archivados ──────────────────────────────────────────────
    const historialData = useMemo(() => {
        const finished = filteredCommitments.filter((c: any) => isFinishedStatus(normalizeCommitmentStatus(c.status)));
        const sortDesc = (arr: any[]) => arr.sort((a, b) =>
            new Date(b.resolved_at || b.due_at || b.created_at).getTime() - new Date(a.resolved_at || a.due_at || a.created_at).getTime());
        const pick = (status: string) => sortDesc(finished.filter((c: any) => normalizeCommitmentStatus(c.status) === status));
        const sections: HoySection[] = [
            { key: 'resueltos', title: 'Hechos', data: pick('resolved') },
            { key: 'cancelados', title: 'Cancelados', data: pick('cancelled') },
            { key: 'rechazados', title: 'Rechazados', data: pick('rejected') },
        ].filter((s) => s.data.length > 0);
        return { sections };
    }, [filteredCommitments]);

    const archivadosData = useMemo(() => {
        const list = archivedCommitments.filter(matchesFilters);
        const sortDesc = (arr: any[]) => arr.sort((a, b) =>
            new Date(b.archived_at || b.created_at).getTime() - new Date(a.archived_at || a.created_at).getTime());
        const byStatus = (pred: (s: string) => boolean) => sortDesc(list.filter((c: any) => pred(normalizeCommitmentStatus(c.status))));
        const sections: HoySection[] = [
            { key: 'activos', title: 'Activos', data: byStatus((s) => !isFinishedStatus(s)) },
            { key: 'resueltos', title: 'Hechos', data: byStatus((s) => s === 'resolved') },
            { key: 'cancelados', title: 'Cancelados', data: byStatus((s) => s === 'cancelled') },
            { key: 'rechazados', title: 'Rechazados', data: byStatus((s) => s === 'rejected') },
        ].filter((s) => s.data.length > 0);
        return { sections, count: list.length };
    }, [archivedCommitments, matchesFilters]);

    const currentSections = useMemo(() => {
        const sections = view === 'mine' ? mineData.sections
            : view === 'theirs' ? theirsData.sections
                : view === 'historial' ? historialData.sections
                    : archivadosData.sections;
        // While searching every section is open, so nothing found is hidden.
        return sections.map((s) => ({
            ...s,
            isOpen: !s.collapsible || !!query || !!expanded[`${view}:${s.key}`],
            count: s.data.length,
            data: !s.collapsible || query || expanded[`${view}:${s.key}`] ? s.data : [],
        }));
    }, [view, mineData, theirsData, historialData, archivadosData, expanded, query]);

    const suggestion = view === 'mine' && !query && !hasFiltersActive ? pingSuggestion(mineData.overdue, mineData.hoy) : null;
    const todayLabel = capitalize(format(new Date(), "EEEE d 'de' MMMM", { locale: es }));

    const renderListHeader = () => {
        if (view !== 'mine' || query || hasFiltersActive || !mineData.dayIsFree) return null;
        return (
            <View style={styles.freeDay}>
                <Ionicons name="sunny-outline" size={28} color={theme.colors.accent} />
                <Text style={[styles.freeDayTitle, { color: theme.colors.text.primary }]}>Hoy estás libre</Text>
                <Text style={[styles.freeDayText, { color: theme.colors.text.secondary }]}>
                    {mineData.next ? `Lo próximo: «${mineData.next.title}» · ${formatWhen(mineData.next.due_at)}` : 'No tienes nada pendiente.'}
                </Text>
            </View>
        );
    };

    const renderEmpty = () => {
        if (view === 'mine' && !query && !hasFiltersActive) return null;
        let copy = 'Nadie te debe nada por ahora.';
        if (view === 'mine') copy = 'No tienes compromisos pendientes.';
        if (view === 'historial') copy = 'Aún no tienes compromisos cerrados.';
        if (view === 'archivados') copy = 'No tienes compromisos archivados.';
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

    const isSideView = view === 'historial' || view === 'archivados';

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
                            <TouchableOpacity style={styles.sheetLink} onPress={() => { setView('historial'); setFilterDrawerVisible(false); }}>
                                <Ionicons name="time-outline" size={18} color={theme.colors.text.secondary} />
                                <Text style={[styles.sheetLinkText, { color: theme.colors.text.primary }]}>Historial</Text>
                                <Ionicons name="chevron-forward" size={16} color={theme.colors.text.muted} />
                            </TouchableOpacity>
                            <TouchableOpacity style={styles.sheetLink} onPress={() => { setView('archivados'); setFilterDrawerVisible(false); refetchArchived(); }}>
                                <Ionicons name="archive-outline" size={18} color={theme.colors.text.secondary} />
                                <Text style={[styles.sheetLinkText, { color: theme.colors.text.primary }]}>Archivados ({archivadosData.count})</Text>
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
                <View style={styles.headerTop}>
                    <View style={{ flex: 1 }}>
                        <Text style={[styles.headerTitle, { color: theme.colors.text.primary }]}>Hoy</Text>
                        <Text style={[styles.headerDate, { color: theme.colors.text.secondary }]}>{todayLabel}</Text>
                    </View>
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
                    <TouchableOpacity onPress={() => setView('mine')} style={styles.backRow}>
                        <Ionicons name="chevron-back" size={16} color={theme.colors.accent} />
                        <Text style={[styles.backText, { color: theme.colors.accent }]}>
                            {view === 'historial' ? 'Historial' : 'Archivados'} · volver
                        </Text>
                    </TouchableOpacity>
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
                renderItem={({ item }) => (
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
                    />
                )}
                renderSectionHeader={({ section }) => {
                    const s = section as HoySection & { isOpen: boolean; count: number };
                    const color = s.danger ? theme.colors.danger : theme.colors.text.secondary;
                    if (!s.collapsible) {
                        return (
                            <View style={[styles.sectionHeader, { backgroundColor: theme.colors.background }]}>
                                <Text style={[styles.sectionTitle, { color }]}>{s.title}</Text>
                            </View>
                        );
                    }
                    return (
                        <TouchableOpacity
                            style={[styles.foldHeader, { backgroundColor: theme.colors.background, borderBottomColor: theme.colors.border }]}
                            onPress={() => setExpanded((e) => ({ ...e, [`${view}:${s.key}`]: !e[`${view}:${s.key}`] }))}
                        >
                            <Text style={[styles.foldTitle, { color: theme.colors.text.primary }]}>{s.title}</Text>
                            <Text style={[styles.foldCount, { color: theme.colors.text.secondary }]}>{s.count}</Text>
                            <Ionicons name={s.isOpen ? 'chevron-up' : 'chevron-down'} size={16} color={theme.colors.text.muted} />
                        </TouchableOpacity>
                    );
                }}
                ListHeaderComponent={renderListHeader}
                ListEmptyComponent={renderEmpty}
                contentContainerStyle={styles.listContent}
                stickySectionHeadersEnabled={false}
                refreshControl={
                    <RefreshControl
                        refreshing={view === 'archivados' ? isRefetchingArchived : isRefetching}
                        onRefresh={view === 'archivados' ? refetchArchived : refetch}
                        tintColor={theme.colors.accent}
                    />
                }
                showsVerticalScrollIndicator={false}
            />

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
    listContent: { paddingBottom: 110 },
    sectionHeader: { paddingHorizontal: 16, paddingTop: 16, paddingBottom: 4 },
    sectionTitle: { fontSize: 13, fontWeight: '700' },
    foldHeader: {
        flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 16, paddingVertical: 13,
        borderBottomWidth: StyleSheet.hairlineWidth,
    },
    foldTitle: { flex: 1, fontSize: 15, fontWeight: '500' },
    foldCount: { fontSize: 14 },
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
