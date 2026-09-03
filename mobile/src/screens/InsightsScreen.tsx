import React, { useState, useMemo, useCallback, useEffect } from 'react';
import {
    View, Text, StyleSheet, TouchableOpacity, StatusBar, TextInput,
    ScrollView, SectionList, Modal, RefreshControl, Platform, UIManager,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useRoute, useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';
import {
    format, isToday, isTomorrow, isSameWeek, isPast as dateFnsIsPast, startOfDay, addDays, isSameDay,
} from 'date-fns';
import { es } from 'date-fns/locale';
import { apiClient } from '../api/client';
import { useAuth } from '../context/AuthContext';
import { useAppTheme } from '../theme/ThemeContext';
import { normalizeCommitmentStatus } from '../utils/commitmentStatus';
import {
    useAcceptCommitment, useResolveCommitment, useReopenCommitment,
    useCancelCommitment, useUpdateCommitment, useContacts, useGroupParticipants,
} from '../api/queries';

import { CommitmentRow } from '../components/compromisos/CommitmentRow';
import { CommitmentDetailSheet } from '../components/compromisos/CommitmentDetailSheet';
import { RescheduleModal } from '../components/compromisos/RescheduleModal';

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
    UIManager.setLayoutAnimationEnabledExperimental(true);
}

type MainSegment = 'pendientes' | 'encargados' | 'historial';
type StatusFilter = 'all' | 'proposed' | 'accepted' | 'resolved' | 'cancelled' | 'rejected';
type TypeFilter = 'all' | 'tasks' | 'meetings';
type OriginFilter = 'all' | 'chat' | 'direct';

const MEETING_RE = /reuni[oó]n|llamada|junta|meet|zoom|call|cita/i;
function classifyMeeting(c: any) {
    return c.type === 'meeting' || MEETING_RE.test(c.title || '');
}

export default function InsightsScreen() {
    const { theme } = useAppTheme();
    const styles = useMemo(() => createStyles(theme), [theme]);
    const { user } = useAuth();
    const route = useRoute<any>();

    // ─── Segment State ───────────────────────────────────────────────────────
    const [segment, setSegment] = useState<MainSegment>('pendientes');

    // Handle incoming navigation params from Hoy (e.g. "Ver todos en Compromisos")
    useEffect(() => {
        if (route.params?.initialSegment) {
            setSegment(route.params.initialSegment as MainSegment);
        }
    }, [route.params?.initialSegment]);

    // ─── Search & Active Filter State ─────────────────────────────────────────
    const [searchQuery, setSearchQuery] = useState('');
    const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
    const [typeFilter, setTypeFilter] = useState<TypeFilter>('all');
    const [originFilter, setOriginFilter] = useState<OriginFilter>('all');
    const [selectedPersonId, setSelectedPersonId] = useState<string | null>(null);

    // ─── Filter Drawer Modal Draft State (Fixes Re-render / Discard Bug) ────
    const [filterDrawerVisible, setFilterDrawerVisible] = useState(false);
    const [draftStatus, setDraftStatus] = useState<StatusFilter>('all');
    const [draftType, setDraftType] = useState<TypeFilter>('all');
    const [draftOrigin, setDraftOrigin] = useState<OriginFilter>('all');
    const [draftPersonId, setDraftPersonId] = useState<string | null>(null);

    const openFilterDrawer = useCallback(() => {
        setDraftStatus(statusFilter);
        setDraftType(typeFilter);
        setDraftOrigin(originFilter);
        setDraftPersonId(selectedPersonId);
        setFilterDrawerVisible(true);
    }, [statusFilter, typeFilter, originFilter, selectedPersonId]);

    const applyFilters = useCallback(() => {
        setStatusFilter(draftStatus);
        setTypeFilter(draftType);
        setOriginFilter(draftOrigin);
        setSelectedPersonId(draftPersonId);
        setFilterDrawerVisible(false);
    }, [draftStatus, draftType, draftOrigin, draftPersonId]);

    const resetDraftFilters = useCallback(() => {
        setDraftStatus('all');
        setDraftType('all');
        setDraftOrigin('all');
        setDraftPersonId(null);
    }, []);

    // ─── Active Items for Sheets ──────────────────────────────────────────────
    const [detailItem, setDetailItem] = useState<any | null>(null);
    const [rescheduleItem, setRescheduleItem] = useState<any | null>(null);

    // ─── Queries & Mutations ─────────────────────────────────────────────────
    const { data: commitments = [], refetch, isRefetching } = useQuery({
        queryKey: ['all-commitments-dashboard'],
        queryFn: async () => {
            const [confirmed, proposals] = await Promise.all([
                apiClient.get('/commitments'),
                apiClient.get('/commitment-proposals'),
            ]);
            return [...(confirmed || []), ...(proposals || [])];
        }
    });

    const { data: contacts = [] } = useContacts();
    const { data: participants = [] } = useGroupParticipants(detailItem?.conversation_id || null);

    useFocusEffect(useCallback(() => { refetch(); }, [refetch]));

    const { mutate: acceptCommitment } = useAcceptCommitment();
    const { mutate: resolveCommitment } = useResolveCommitment();
    const { mutate: reopenCommitment } = useReopenCommitment();
    const { mutateAsync: cancelCommitment } = useCancelCommitment();
    const { mutateAsync: updateCommitment } = useUpdateCommitment();

    const handleMarkDone = useCallback((id: string) => {
        resolveCommitment({ id, result: 'Resuelto desde Compromisos.' });
    }, [resolveCommitment]);

    const handleConfirm = useCallback((id: string) => {
        acceptCommitment(id);
    }, [acceptCommitment]);

    const handleCancel = useCallback((id: string) => {
        cancelCommitment({ id });
    }, [cancelCommitment]);

    const handleReopen = useCallback((id: string) => {
        reopenCommitment(id);
    }, [reopenCommitment]);

    const handleSaveDate = useCallback(async (id: string, newDateIso: string) => {
        await updateCommitment({ id, data: { due_at: newDateIso } });
    }, [updateCommitment]);

    // Contact map helper
    const contactNameMap = useMemo(() => {
        const map: Record<string, string> = {};
        (contacts || []).forEach((c: any) => { if (c.id) map[c.id] = c.display_name; });
        return map;
    }, [contacts]);

    // Unique team members for filter picker
    const teamMembers = useMemo(() => {
        const map = new Map<string, any>();
        commitments.forEach((c: any) => {
            if (c.assignee && c.assignee.id !== user?.id) map.set(c.assignee.id, c.assignee);
            if (c.owner && c.owner.id !== user?.id) map.set(c.owner.id, c.owner);
        });
        return Array.from(map.values());
    }, [commitments, user?.id]);

    const hasFiltersActive = statusFilter !== 'all' || typeFilter !== 'all' || originFilter !== 'all' || !!selectedPersonId;

    // ─── Filtered Data Base ───────────────────────────────────────────────────
    const filteredCommitments = useMemo(() => {
        const query = searchQuery.trim().toLowerCase();
        return commitments.filter((c: any) => {
            const status = normalizeCommitmentStatus(c.status);

            // Text search
            if (query) {
                const titleMatch = (c.title || '').toLowerCase().includes(query);
                const ownerMatch = (c.owner?.full_name || '').toLowerCase().includes(query);
                const assigneeMatch = (c.assignee?.full_name || '').toLowerCase().includes(query);
                const contactMatch = (contactNameMap[c.counterparty_contact_id] || '').toLowerCase().includes(query);
                if (!titleMatch && !ownerMatch && !assigneeMatch && !contactMatch) return false;
            }

            // Secondary active filters
            if (statusFilter !== 'all' && status !== statusFilter) return false;
            if (typeFilter === 'tasks' && classifyMeeting(c)) return false;
            if (typeFilter === 'meetings' && !classifyMeeting(c)) return false;
            if (originFilter === 'chat' && !c.message_id) return false;
            if (originFilter === 'direct' && c.message_id) return false;
            if (selectedPersonId) {
                const matchesPerson = c.assigned_to_user_id === selectedPersonId || c.owner_user_id === selectedPersonId || c.counterparty_contact_id === selectedPersonId;
                if (!matchesPerson) return false;
            }

            return true;
        });
    }, [commitments, searchQuery, statusFilter, typeFilter, originFilter, selectedPersonId, contactNameMap]);

    // ─── Segment 1: PENDIENTES ───────────────────────────────────────────────
    const pendientesData = useMemo(() => {
        const list = filteredCommitments.filter((c: any) => {
            const status = normalizeCommitmentStatus(c.status);
            if (['resolved', 'cancelled', 'rejected'].includes(status)) return false;

            const isAssignedToMe = c.assigned_to_user_id === user?.id || !c.assigned_to_user_id;
            const isDelegatedByMe = c.owner_user_id === user?.id && c.assigned_to_user_id !== user?.id;
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

        list.forEach((c: any) => {
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
        const sortByTime = (arr: any[]) => arr.sort((a, b) => new Date(a.due_at).getTime() - new Date(b.due_at).getTime());

        const sections = [
            { title: '⏰ Vencidos', data: overdue },
            { title: '📅 Hoy', data: sortByTime(hoy) },
            { title: '🌅 Mañana', data: sortByTime(manana) },
            { title: '📆 Esta semana', data: sortByTime(estaSemana) },
            { title: '🔮 Más adelante', data: sortByTime(masAdelante) },
            { title: '🗂️ Sin fecha', data: sinFecha },
        ].filter(s => s.data.length > 0);

        return { sections, totalCount: list.length };
    }, [filteredCommitments, user?.id]);

    // ─── Segment 2: ENCARGADOS ───────────────────────────────────────────────
    const encargadosData = useMemo(() => {
        const list = filteredCommitments.filter((c: any) => {
            return c.owner_user_id === user?.id && c.assigned_to_user_id && c.assigned_to_user_id !== user?.id;
        });

        const now = new Date();
        const pendingAcceptance: any[] = [];
        const inProgress: any[] = [];
        const overdue: any[] = [];
        const pendingReview: any[] = [];

        list.forEach((c: any) => {
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

        const sections = [
            { title: '⏳ Pendientes de aceptación', data: pendingAcceptance },
            { title: '☑️ Pendientes de tu revisión', data: pendingReview },
            { title: '⏰ Vencidos', data: overdue },
            { title: '⚡ En curso', data: inProgress },
        ].filter(s => s.data.length > 0);

        return { sections, totalCount: list.length };
    }, [filteredCommitments, user?.id]);

    // ─── Segment 3: HISTORIAL ─────────────────────────────────────────────────
    const historialData = useMemo(() => {
        const list = filteredCommitments.filter((c: any) => {
            const status = normalizeCommitmentStatus(c.status);
            return ['resolved', 'cancelled', 'rejected'].includes(status);
        });

        const resolved: any[] = [];
        const cancelled: any[] = [];
        const rejected: any[] = [];

        list.forEach((c: any) => {
            const status = normalizeCommitmentStatus(c.status);
            if (status === 'resolved') resolved.push(c);
            else if (status === 'cancelled') cancelled.push(c);
            else if (status === 'rejected') rejected.push(c);
        });

        const sortByDateDesc = (arr: any[]) => arr.sort((a, b) => {
            const dateA = a.resolved_at || a.due_at || a.created_at;
            const dateB = b.resolved_at || b.due_at || b.created_at;
            return new Date(dateB).getTime() - new Date(dateA).getTime();
        });

        const sections = [
            { title: '✅ Resueltos', data: sortByDateDesc(resolved) },
            { title: '🚫 Cancelados', data: sortByDateDesc(cancelled) },
            { title: '❌ Rechazados', data: sortByDateDesc(rejected) },
        ].filter(s => s.data.length > 0);

        return { sections, totalCount: list.length };
    }, [filteredCommitments]);

    const currentSegmentData = useMemo(() => {
        if (segment === 'pendientes') return pendientesData;
        if (segment === 'encargados') return encargadosData;
        return historialData;
    }, [segment, pendientesData, encargadosData, historialData]);

    // ─── Active Filter Chips Helper ───────────────────────────────────────────
    const activePersonName = useMemo(() => {
        if (!selectedPersonId) return null;
        const match = teamMembers.find((m: any) => m.id === selectedPersonId);
        return match?.full_name?.split(' ')[0] || contactNameMap[selectedPersonId] || 'Persona';
    }, [selectedPersonId, teamMembers, contactNameMap]);

    // ─── Render Empty State ──────────────────────────────────────────────────
    const renderEmpty = () => {
        let copy = 'No tienes compromisos pendientes.';
        if (segment === 'encargados') copy = 'No estás esperando compromisos de otras personas.';
        if (segment === 'historial') copy = 'Aún no tienes compromisos cerrados.';

        if (hasFiltersActive || searchQuery) {
            copy = 'No se encontraron compromisos con los filtros aplicados.';
        }

        return (
            <View style={styles.emptyContainer}>
                <Ionicons name="folder-open-outline" size={48} color={theme.colors.text.muted} />
                <Text style={[styles.emptyText, { color: theme.colors.text.secondary }]}>{copy}</Text>
                {(hasFiltersActive || searchQuery) && (
                    <TouchableOpacity
                        style={[styles.clearFiltersBtn, { borderColor: theme.colors.border }]}
                        onPress={() => {
                            setSearchQuery('');
                            setStatusFilter('all');
                            setTypeFilter('all');
                            setOriginFilter('all');
                            setSelectedPersonId(null);
                        }}
                    >
                        <Text style={[styles.clearFiltersText, { color: theme.colors.accent }]}>Limpiar búsqueda y filtros</Text>
                    </TouchableOpacity>
                )}
            </View>
        );
    };

    return (
        <SafeAreaView style={[styles.container, { backgroundColor: theme.colors.background }]}>
            <StatusBar barStyle={theme.isDark ? 'light-content' : 'dark-content'} />

            {/* ── FILTER DRAWER MODAL ── */}
            <Modal visible={filterDrawerVisible} transparent animationType="slide" onRequestClose={() => setFilterDrawerVisible(false)}>
                <TouchableOpacity style={styles.modalOverlay} activeOpacity={1} onPress={() => setFilterDrawerVisible(false)}>
                    <TouchableOpacity activeOpacity={1} style={[styles.filterSheet, { backgroundColor: theme.colors.surface }]}>
                        <View style={styles.filterSheetHandle} />
                        <Text style={[styles.filterSheetTitle, { color: theme.colors.text.primary }]}>Filtrar Compromisos</Text>

                        {/* Contextual Status Options per Segment */}
                        <Text style={[styles.filterGroupLabel, { color: theme.colors.text.muted }]}>ESTADO</Text>
                        <View style={styles.filterChipsRow}>
                            {segment === 'pendientes' && (
                                ([['all','Todos'],['proposed','Propuesto'],['accepted','Aceptado']] as const).map(([v, l]) => (
                                    <TouchableOpacity
                                        key={v}
                                        style={[styles.filterChip, draftStatus === v && { backgroundColor: theme.colors.accent }]}
                                        onPress={() => setDraftStatus(v)}
                                    >
                                        <Text style={[styles.filterChipText, { color: draftStatus === v ? theme.colors.white : theme.colors.text.secondary }]}>{l}</Text>
                                    </TouchableOpacity>
                                ))
                            )}
                            {segment === 'encargados' && (
                                ([['all','Todos'],['proposed','Pendiente aceptación'],['accepted','En curso']] as const).map(([v, l]) => (
                                    <TouchableOpacity
                                        key={v}
                                        style={[styles.filterChip, draftStatus === v && { backgroundColor: theme.colors.accent }]}
                                        onPress={() => setDraftStatus(v)}
                                    >
                                        <Text style={[styles.filterChipText, { color: draftStatus === v ? theme.colors.white : theme.colors.text.secondary }]}>{l}</Text>
                                    </TouchableOpacity>
                                ))
                            )}
                            {segment === 'historial' && (
                                ([['all','Todos'],['resolved','Resuelto'],['cancelled','Cancelado'],['rejected','Rechazado']] as const).map(([v, l]) => (
                                    <TouchableOpacity
                                        key={v}
                                        style={[styles.filterChip, draftStatus === v && { backgroundColor: theme.colors.accent }]}
                                        onPress={() => setDraftStatus(v)}
                                    >
                                        <Text style={[styles.filterChipText, { color: draftStatus === v ? theme.colors.white : theme.colors.text.secondary }]}>{l}</Text>
                                    </TouchableOpacity>
                                ))
                            )}
                        </View>

                        <Text style={[styles.filterGroupLabel, { color: theme.colors.text.muted }]}>TIPO</Text>
                        <View style={styles.filterChipsRow}>
                            {([['all','Todo'],['tasks','Tareas'],['meetings','Reuniones']] as const).map(([v, l]) => (
                                <TouchableOpacity
                                    key={v}
                                    style={[styles.filterChip, draftType === v && { backgroundColor: theme.colors.accent }]}
                                    onPress={() => setDraftType(v as TypeFilter)}
                                >
                                    <Text style={[styles.filterChipText, { color: draftType === v ? theme.colors.white : theme.colors.text.secondary }]}>{l}</Text>
                                </TouchableOpacity>
                            ))}
                        </View>

                        <Text style={[styles.filterGroupLabel, { color: theme.colors.text.muted }]}>ORIGEN</Text>
                        <View style={styles.filterChipsRow}>
                            {([['all','Todo'],['chat','Derivado de Chat'],['direct','Creado directo']] as const).map(([v, l]) => (
                                <TouchableOpacity
                                    key={v}
                                    style={[styles.filterChip, draftOrigin === v && { backgroundColor: theme.colors.accent }]}
                                    onPress={() => setDraftOrigin(v as OriginFilter)}
                                >
                                    <Text style={[styles.filterChipText, { color: draftOrigin === v ? theme.colors.white : theme.colors.text.secondary }]}>{l}</Text>
                                </TouchableOpacity>
                            ))}
                        </View>

                        {teamMembers.length > 0 && (
                            <>
                                <Text style={[styles.filterGroupLabel, { color: theme.colors.text.muted }]}>PERSONA</Text>
                                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterChipsRow}>
                                    <TouchableOpacity
                                        style={[styles.filterChip, !draftPersonId && { backgroundColor: theme.colors.accent }]}
                                        onPress={() => setDraftPersonId(null)}
                                    >
                                        <Text style={[styles.filterChipText, { color: !draftPersonId ? theme.colors.white : theme.colors.text.secondary }]}>Todos</Text>
                                    </TouchableOpacity>
                                    {teamMembers.map((m: any) => (
                                        <TouchableOpacity
                                            key={m.id}
                                            style={[styles.filterChip, draftPersonId === m.id && { backgroundColor: theme.colors.accent }]}
                                            onPress={() => setDraftPersonId(m.id)}
                                        >
                                            <Text style={[styles.filterChipText, { color: draftPersonId === m.id ? theme.colors.white : theme.colors.text.secondary }]}>
                                                {m.full_name?.split(' ')[0] || 'Usuario'}
                                            </Text>
                                        </TouchableOpacity>
                                    ))}
                                </ScrollView>
                            </>
                        )}

                        {/* Explicit Application Footer Buttons */}
                        <View style={styles.filterSheetFooter}>
                            <TouchableOpacity style={[styles.filterSecondaryBtn, { borderColor: theme.colors.border }]} onPress={resetDraftFilters}>
                                <Text style={{ color: theme.colors.text.secondary, fontWeight: '600', fontSize: 13 }}>Limpiar</Text>
                            </TouchableOpacity>
                            <TouchableOpacity style={[styles.filterPrimaryBtn, { backgroundColor: theme.colors.accent }]} onPress={applyFilters}>
                                <Text style={{ color: theme.colors.white, fontWeight: '700', fontSize: 13 }}>Aplicar filtros</Text>
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
            />

            <RescheduleModal
                item={rescheduleItem}
                onClose={() => setRescheduleItem(null)}
                onSaveDate={handleSaveDate}
            />

            {/* ── HEADER & SEARCH ── */}
            <View style={[styles.header, { backgroundColor: theme.colors.surface, borderBottomColor: theme.colors.border }]}>
                <View style={styles.headerTop}>
                    <Text style={[styles.headerTitle, { color: theme.colors.text.primary }]}>Compromisos</Text>
                    <TouchableOpacity
                        style={[styles.filterBtn, hasFiltersActive && { backgroundColor: theme.colors.accentSoft }]}
                        onPress={openFilterDrawer}
                        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                    >
                        <Ionicons name="options-outline" size={18} color={hasFiltersActive ? theme.colors.accent : theme.colors.text.secondary} />
                        {hasFiltersActive && <View style={[styles.filterDot, { backgroundColor: theme.colors.accent }]} />}
                    </TouchableOpacity>
                </View>

                {/* Search Input */}
                <View style={[styles.searchBar, { backgroundColor: theme.colors.surfaceMuted, borderColor: theme.colors.border }]}>
                    <Ionicons name="search" size={16} color={theme.colors.text.muted} />
                    <TextInput
                        style={[styles.searchInput, { color: theme.colors.text.primary }]}
                        placeholder="Buscar compromisos o personas..."
                        placeholderTextColor={theme.colors.text.muted}
                        value={searchQuery}
                        onChangeText={setSearchQuery}
                        clearButtonMode="while-editing"
                    />
                    {!!searchQuery && (
                        <TouchableOpacity onPress={() => setSearchQuery('')}>
                            <Ionicons name="close-circle" size={16} color={theme.colors.text.muted} />
                        </TouchableOpacity>
                    )}
                </View>

                {/* Active Filter Chips Row (Rendered ONLY when filters are active) */}
                {hasFiltersActive && (
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.activeChipsRow}>
                        {activePersonName && (
                            <TouchableOpacity style={[styles.activeChip, { backgroundColor: theme.colors.surfaceMuted }]} onPress={() => setSelectedPersonId(null)}>
                                <Text style={[styles.activeChipText, { color: theme.colors.text.primary }]}>{activePersonName}</Text>
                                <Ionicons name="close" size={12} color={theme.colors.text.muted} />
                            </TouchableOpacity>
                        )}
                        {typeFilter !== 'all' && (
                            <TouchableOpacity style={[styles.activeChip, { backgroundColor: theme.colors.surfaceMuted }]} onPress={() => setTypeFilter('all')}>
                                <Text style={[styles.activeChipText, { color: theme.colors.text.primary }]}>
                                    {typeFilter === 'tasks' ? 'Tareas' : 'Reuniones'}
                                </Text>
                                <Ionicons name="close" size={12} color={theme.colors.text.muted} />
                            </TouchableOpacity>
                        )}
                        {originFilter !== 'all' && (
                            <TouchableOpacity style={[styles.activeChip, { backgroundColor: theme.colors.surfaceMuted }]} onPress={() => setOriginFilter('all')}>
                                <Text style={[styles.activeChipText, { color: theme.colors.text.primary }]}>
                                    {originFilter === 'chat' ? 'Chat' : 'Directo'}
                                </Text>
                                <Ionicons name="close" size={12} color={theme.colors.text.muted} />
                            </TouchableOpacity>
                        )}
                        {statusFilter !== 'all' && (
                            <TouchableOpacity style={[styles.activeChip, { backgroundColor: theme.colors.surfaceMuted }]} onPress={() => setStatusFilter('all')}>
                                <Text style={[styles.activeChipText, { color: theme.colors.text.primary }]}>{statusFilter}</Text>
                                <Ionicons name="close" size={12} color={theme.colors.text.muted} />
                            </TouchableOpacity>
                        )}

                        <TouchableOpacity
                            onPress={() => {
                                setStatusFilter('all');
                                setTypeFilter('all');
                                setOriginFilter('all');
                                setSelectedPersonId(null);
                            }}
                            style={styles.clearLink}
                        >
                            <Text style={[styles.clearLinkText, { color: theme.colors.accent }]}>Limpiar</Text>
                        </TouchableOpacity>
                    </ScrollView>
                )}

                {/* Segmented Control */}
                <View style={[styles.segmentContainer, { backgroundColor: theme.colors.surfaceMuted }]}>
                    <TouchableOpacity
                        style={[styles.segmentBtn, segment === 'pendientes' && styles.segmentBtnActive]}
                        onPress={() => setSegment('pendientes')}
                    >
                        <Text style={[styles.segmentText, segment === 'pendientes' && styles.segmentTextActive]}>
                            Pendientes ({pendientesData.totalCount})
                        </Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                        style={[styles.segmentBtn, segment === 'encargados' && styles.segmentBtnActive]}
                        onPress={() => setSegment('encargados')}
                    >
                        <Text style={[styles.segmentText, segment === 'encargados' && styles.segmentTextActive]}>
                            Encargados ({encargadosData.totalCount})
                        </Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                        style={[styles.segmentBtn, segment === 'historial' && styles.segmentBtnActive]}
                        onPress={() => setSegment('historial')}
                    >
                        <Text style={[styles.segmentText, segment === 'historial' && styles.segmentTextActive]}>
                            Historial ({historialData.totalCount})
                        </Text>
                    </TouchableOpacity>
                </View>
            </View>

            {/* ── SECTION LIST DATA ── */}
            <SectionList
                sections={currentSegmentData.sections}
                keyExtractor={(item) => item.id}
                renderItem={({ item }) => (
                    <CommitmentRow
                        commitment={item}
                        currentUserId={user?.id}
                        contactNameMap={contactNameMap}
                        onMarkDone={handleMarkDone}
                        onConfirm={handleConfirm}
                        onOpenReschedule={(c) => setRescheduleItem(c)}
                        onOpenDetail={(c) => setDetailItem(c)}
                        onCancel={handleCancel}
                    />
                )}
                renderSectionHeader={({ section: { title } }) => (
                    <View style={[styles.sectionHeaderBg, { backgroundColor: theme.colors.background }]}>
                        <Text style={[styles.sectionTitle, { color: theme.colors.text.secondary }]}>{title}</Text>
                    </View>
                )}
                ListEmptyComponent={renderEmpty}
                contentContainerStyle={styles.listContent}
                refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor={theme.colors.accent} />}
                showsVerticalScrollIndicator={false}
            />
        </SafeAreaView>
    );
}

// ─── STYLES ──────────────────────────────────────────────────────────────────

const createStyles = (theme: any) => StyleSheet.create({
    container: { flex: 1 },

    header: {
        paddingHorizontal: 16,
        paddingTop: 8,
        paddingBottom: 10,
        borderBottomWidth: StyleSheet.hairlineWidth,
        gap: 8,
    },
    headerTop: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
    },
    headerTitle: {
        fontSize: 22,
        fontWeight: '800',
        letterSpacing: -0.3,
    },
    filterBtn: {
        width: 32,
        height: 32,
        borderRadius: 8,
        alignItems: 'center',
        justifyContent: 'center',
    },
    filterDot: {
        position: 'absolute',
        top: 4,
        right: 4,
        width: 6,
        height: 6,
        borderRadius: 3,
    },

    searchBar: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 10,
        height: 36,
        borderRadius: 8,
        borderWidth: 1,
        gap: 6,
    },
    searchInput: {
        flex: 1,
        fontSize: 13,
        paddingVertical: 0,
    },

    activeChipsRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        paddingVertical: 2,
    },
    activeChip: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 8,
        paddingVertical: 4,
        borderRadius: 6,
        gap: 4,
    },
    activeChipText: {
        fontSize: 11,
        fontWeight: '600',
    },
    clearLink: {
        paddingHorizontal: 6,
        paddingVertical: 4,
    },
    clearLinkText: {
        fontSize: 12,
        fontWeight: '600',
    },

    segmentContainer: {
        flexDirection: 'row',
        borderRadius: 8,
        padding: 3,
    },
    segmentBtn: {
        flex: 1,
        paddingVertical: 6,
        alignItems: 'center',
        borderRadius: 6,
    },
    segmentBtnActive: {
        backgroundColor: theme.colors.surface,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.1,
        shadowRadius: 2,
        elevation: 2,
    },
    segmentText: {
        fontSize: 12,
        fontWeight: '600',
        color: theme.colors.text.muted,
    },
    segmentTextActive: {
        color: theme.colors.text.primary,
        fontWeight: '700',
    },

    listContent: {
        paddingBottom: 80,
    },
    sectionHeaderBg: {
        paddingHorizontal: 16,
        paddingTop: 12,
        paddingBottom: 4,
    },
    sectionTitle: {
        fontSize: 11,
        fontWeight: '700',
        textTransform: 'uppercase',
        letterSpacing: 0.6,
    },

    emptyContainer: {
        alignItems: 'center',
        justifyContent: 'center',
        paddingVertical: 60,
        paddingHorizontal: 32,
        gap: 10,
    },
    emptyText: {
        fontSize: 14,
        fontWeight: '500',
        textAlign: 'center',
        lineHeight: 20,
    },
    clearFiltersBtn: {
        marginTop: 8,
        paddingHorizontal: 16,
        paddingVertical: 8,
        borderRadius: 8,
        borderWidth: 1,
    },
    clearFiltersText: {
        fontSize: 13,
        fontWeight: '600',
    },

    // Modal Filter Sheet
    modalOverlay: {
        flex: 1,
        backgroundColor: 'rgba(0,0,0,0.45)',
        justifyContent: 'flex-end',
    },
    filterSheet: {
        borderTopLeftRadius: 20,
        borderTopRightRadius: 20,
        paddingHorizontal: 20,
        paddingBottom: 36,
        paddingTop: 12,
    },
    filterSheetHandle: {
        alignSelf: 'center',
        width: 36,
        height: 4,
        borderRadius: 2,
        backgroundColor: '#d1d5db',
        marginBottom: 16,
    },
    filterSheetTitle: {
        fontSize: 17,
        fontWeight: '700',
        marginBottom: 14,
    },
    filterGroupLabel: {
        fontSize: 11,
        fontWeight: '700',
        letterSpacing: 0.6,
        marginBottom: 8,
        marginTop: 10,
    },
    filterChipsRow: {
        flexDirection: 'row',
        gap: 8,
        flexWrap: 'wrap',
    },
    filterChip: {
        paddingHorizontal: 12,
        paddingVertical: 6,
        borderRadius: 8,
        backgroundColor: theme.colors.surfaceMuted,
    },
    filterChipText: {
        fontSize: 13,
        fontWeight: '600',
    },
    filterSheetFooter: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'flex-end',
        gap: 10,
        marginTop: 24,
    },
    filterSecondaryBtn: {
        paddingHorizontal: 14,
        paddingVertical: 9,
        borderRadius: 8,
        borderWidth: 1,
    },
    filterPrimaryBtn: {
        paddingHorizontal: 18,
        paddingVertical: 9,
        borderRadius: 8,
    },
});
