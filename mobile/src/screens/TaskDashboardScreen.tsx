import React, { useState, useMemo, useCallback } from 'react';
import {
    View, Text, StyleSheet, TouchableOpacity, StatusBar, ScrollView,
    Modal, RefreshControl, LayoutAnimation, Platform, UIManager,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { format, addDays, isSameDay, startOfDay, isPast, isToday as dateFnsIsToday, subDays } from 'date-fns';
import { es } from 'date-fns/locale';
import { apiClient } from '../api/client';
import { useAuth } from '../context/AuthContext';
import { isRedDay } from '../utils/holidays';
import { normalizeCommitmentStatus } from '../utils/commitmentStatus';
import { useAppTheme } from '../theme/ThemeContext';
import {
    useAcceptCommitment, useResolveCommitment, useRespondToCommitmentProposal,
} from '../api/queries';

import { TodaySummaryBar } from '../components/hoy/TodaySummaryBar';
import { OverdueAlert } from '../components/hoy/OverdueAlert';
import { TodayItemRow } from '../components/hoy/TodayItemRow';

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
    UIManager.setLayoutAnimationEnabledExperimental(true);
}

type StatusFilter = 'all' | 'proposed' | 'accepted' | 'rejected' | 'resolved';
type TypeFilter = 'all' | 'tasks' | 'meetings';
type OwnerFilter = 'mine' | 'delegated' | 'all';

const MEETING_RE = /reuni[oó]n|llamada|junta|meet|zoom|call|cita/i;
function classifyMeeting(c: any) {
    return c.type === 'meeting' || MEETING_RE.test(c.title || '');
}

export default function TaskDashboardScreen() {
    const { theme } = useAppTheme();
    const styles = useMemo(() => createStyles(theme), [theme]);
    const { user } = useAuth();
    const queryClient = useQueryClient();
    const navigation = useNavigation<any>();

    // ─── Date state ──────────────────────────────────────────────────────────
    const [selectedDate, setSelectedDate] = useState<Date>(startOfDay(new Date()));
    const [isCalendarVisible, setIsCalendarVisible] = useState(false);

    // ─── Filter state (secondary, hidden behind Filtrar) ────────────────────
    const [filterDrawerVisible, setFilterDrawerVisible] = useState(false);
    const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
    const [typeFilter, setTypeFilter] = useState<TypeFilter>('all');
    const [ownerFilter, setOwnerFilter] = useState<OwnerFilter>('all');
    const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
    const [assigneePickerVisible, setAssigneePickerVisible] = useState(false);

    // ─── Encargadas section collapse ─────────────────────────────────────────
    const [delegatedExpanded, setDelegatedExpanded] = useState(false);

    // ─── Data ─────────────────────────────────────────────────────────────────
    const { data: commitments = [], isLoading, refetch } = useQuery({
        queryKey: ['all-commitments-dashboard'],
        queryFn: async () => {
            const [confirmed, proposals] = await Promise.all([
                apiClient.get('/commitments'),
                apiClient.get('/commitment-proposals'),
            ]);
            return [...(confirmed || []), ...(proposals || [])];
        }
    });

    useFocusEffect(useCallback(() => { refetch(); }, [refetch]));

    // ─── Mutations ────────────────────────────────────────────────────────────
    const { mutate: acceptCommitment } = useAcceptCommitment();
    const { mutate: resolveCommitment } = useResolveCommitment();
    const { mutateAsync: respondToProposal } = useRespondToCommitmentProposal();

    const handleMarkDone = useCallback((id: string) => {
        resolveCommitment({ id, result: 'Resuelto desde Hoy.' });
    }, [resolveCommitment]);

    const handleConfirm = useCallback((id: string) => {
        acceptCommitment(id);
    }, [acceptCommitment]);

    // ─── Team members for assignee picker ────────────────────────────────────
    const teamMembers = useMemo(() => {
        const map = new Map<string, any>();
        commitments.forEach((c: any) => {
            if (c.assignee && c.assignee.id !== user?.id) map.set(c.assignee.id, c.assignee);
            if (c.owner && c.owner.id !== user?.id) map.set(c.owner.id, c.owner);
        });
        return Array.from(map.values());
    }, [commitments, user?.id]);

    // ─── Calendar dates for dot indicators ───────────────────────────────────
    const daysWithTasks = useMemo(() => {
        const s = new Set<string>();
        commitments.forEach((c: any) => { if (c.due_at) s.add(format(new Date(c.due_at), 'yyyy-MM-dd')); });
        return s;
    }, [commitments]);

    const isSelectedToday = useMemo(() => dateFnsIsToday(selectedDate), [selectedDate]);

    // ─── Overdue (relative to now, not selectedDate) ─────────────────────────
    const overdueItems = useMemo(() => {
        const now = new Date();
        return commitments.filter((c: any) => {
            if (!c.due_at) return false;
            const status = normalizeCommitmentStatus(c.status);
            if (['resolved', 'cancelled', 'rejected'].includes(status)) return false;
            return new Date(c.due_at) < now && !isSameDay(new Date(c.due_at), selectedDate);
        }).sort((a: any, b: any) => new Date(b.due_at).getTime() - new Date(a.due_at).getTime());
    }, [commitments, selectedDate]);

    // ─── Today items (matching selectedDate) ─────────────────────────────────
    const todayItems = useMemo(() => {
        return commitments.filter((c: any) => {
            if (!c.due_at) return false;
            if (!isSameDay(new Date(c.due_at), selectedDate)) return false;
            const status = normalizeCommitmentStatus(c.status);

            // Rejected: excluded unless statusFilter is explicitly 'rejected'
            if (status === 'rejected' && statusFilter !== 'rejected') return false;

            // Resolved / cancelled: excluded unless statusFilter is 'all' or matches
            if (['resolved', 'cancelled'].includes(status) && statusFilter !== 'all' && statusFilter !== status) return false;

            // Secondary filters
            if (statusFilter !== 'all' && status !== statusFilter) return false;
            if (typeFilter === 'tasks' && classifyMeeting(c)) return false;
            if (typeFilter === 'meetings' && !classifyMeeting(c)) return false;
            if (ownerFilter === 'mine' && c.assigned_to_user_id !== user?.id) return false;
            if (ownerFilter === 'delegated') {
                const isDelegated = c.owner_user_id === user?.id && c.assigned_to_user_id !== user?.id;
                if (!isDelegated) return false;
            }
            if (selectedUserId) {
                if (ownerFilter === 'delegated' && c.assigned_to_user_id !== selectedUserId) return false;
                if (ownerFilter !== 'delegated' && c.owner_user_id !== selectedUserId) return false;
            }
            return true;
        }).sort((a: any, b: any) => {
            const statusA = normalizeCommitmentStatus(a.status);
            const statusB = normalizeCommitmentStatus(b.status);
            const isFinishedA = ['resolved', 'cancelled'].includes(statusA);
            const isFinishedB = ['resolved', 'cancelled'].includes(statusB);

            if (isFinishedA !== isFinishedB) return isFinishedA ? 1 : -1;
            return new Date(a.due_at).getTime() - new Date(b.due_at).getTime();
        });
    }, [commitments, selectedDate, statusFilter, typeFilter, ownerFilter, selectedUserId, user?.id]);

    // My tasks (mine) vs delegated by me
    const myItems = useMemo(() =>
        todayItems.filter((c: any) => {
            const isAssigned = c.assigned_to_user_id === user?.id || !c.assigned_to_user_id;
            const isDelegatedByMe = c.owner_user_id === user?.id && c.assigned_to_user_id !== user?.id;
            return isAssigned && !isDelegatedByMe;
        }), [todayItems, user?.id]);

    const delegatedItems = useMemo(() =>
        todayItems.filter((c: any) => {
            return c.owner_user_id === user?.id && c.assigned_to_user_id && c.assigned_to_user_id !== user?.id;
        }), [todayItems, user?.id]);

    // Próximo item (closest future due_at >= now strictly)
    const nextItem = useMemo(() => {
        if (!isSelectedToday) return null;
        const now = new Date();
        const upcoming = myItems.filter((c: any) => {
            const status = normalizeCommitmentStatus(c.status);
            return !['resolved', 'cancelled', 'rejected'].includes(status) && new Date(c.due_at) >= now;
        });
        return upcoming.length > 0 ? upcoming[0] : null;
    }, [myItems, isSelectedToday]);

    const hasFiltersActive = statusFilter !== 'all' || typeFilter !== 'all' || ownerFilter !== 'all' || !!selectedUserId;

    // ─── Computed for summary bar ─────────────────────────────────────────────
    const nextItemTime = nextItem?.due_at ?? null;

    // ─── Calendar modal dates ─────────────────────────────────────────────────
    const [calendarViewDate, setCalendarViewDate] = useState(new Date(selectedDate));

    const calendarDays = useMemo(() => {
        const monthStart = startOfDay(new Date(calendarViewDate.getFullYear(), calendarViewDate.getMonth(), 1));
        return Array.from({ length: 31 }).map((_, i) => addDays(monthStart, i))
            .filter(d => d.getMonth() === calendarViewDate.getMonth());
    }, [calendarViewDate]);

    // ─── Renderers ─────────────────────────────────────────────────────────────

    const renderNextUpCard = () => {
        if (!nextItem) return null;
        const timeStr = format(new Date(nextItem.due_at), 'HH:mm');
        const isMeeting = classifyMeeting(nextItem);

        return (
            <View style={[styles.nextUpCard, { backgroundColor: theme.colors.surface, borderColor: `${theme.colors.accent}40` }]}>
                <View style={styles.nextUpHeader}>
                    <View style={[styles.nextUpBadge, { backgroundColor: theme.colors.accentSoft }]}>
                        <Ionicons name={isMeeting ? 'people-outline' : 'flash-outline'} size={11} color={theme.colors.accent} />
                        <Text style={[styles.nextUpBadgeText, { color: theme.colors.accent }]}>
                            Próximo
                        </Text>
                    </View>
                    <Text style={[styles.nextUpTime, { color: theme.colors.text.secondary }]}>{timeStr}</Text>
                </View>
                <Text style={[styles.nextUpTitle, { color: theme.colors.text.primary }]} numberOfLines={2}>
                    {nextItem.title}
                </Text>
            </View>
        );
    };

    const renderSection = (items: any[], title?: string, isCollapsible = false) => {
        if (items.length === 0) return null;

        if (isCollapsible) {
            return (
                <View style={[styles.section, { backgroundColor: theme.colors.surface }]}>
                    <TouchableOpacity
                        style={styles.collapsibleHeader}
                        onPress={() => {
                            LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
                            setDelegatedExpanded(e => !e);
                        }}
                    >
                        <Text style={[styles.sectionTitle, { color: theme.colors.text.secondary }]}>
                            {title} ({items.length})
                        </Text>
                        <Ionicons
                            name={delegatedExpanded ? 'chevron-up' : 'chevron-down'}
                            size={14}
                            color={theme.colors.text.muted}
                        />
                    </TouchableOpacity>
                    {delegatedExpanded && items.map(c => (
                        <TodayItemRow
                            key={c.id}
                            commitment={c}
                            currentUserId={user?.id}
                            onMarkDone={handleMarkDone}
                            onConfirm={handleConfirm}
                        />
                    ))}
                </View>
            );
        }

        return (
            <View style={[styles.section, { backgroundColor: theme.colors.surface }]}>
                {title && <Text style={[styles.sectionTitle, { color: theme.colors.text.secondary }]}>{title}</Text>}
                {items.map(c => (
                    <TodayItemRow
                        key={c.id}
                        commitment={c}
                        currentUserId={user?.id}
                        onMarkDone={handleMarkDone}
                        onConfirm={handleConfirm}
                    />
                ))}
            </View>
        );
    };

    const renderEmpty = () => {
        let title = 'Día libre';
        let subtitle = 'No tienes compromisos para hoy.';

        if (isSelectedToday) {
            if (overdueItems.length > 0) {
                title = 'No tienes compromisos programados para hoy';
                subtitle = `Tienes ${overdueItems.length} pendiente${overdueItems.length > 1 ? 's' : ''} vencido${overdueItems.length > 1 ? 's' : ''} que requiere${overdueItems.length > 1 ? 'n' : ''} atención.`;
            } else {
                title = 'Día libre';
                subtitle = 'No tienes compromisos para hoy.';
            }
        } else {
            title = 'Sin compromisos';
            subtitle = `No tienes compromisos programados para el ${format(selectedDate, 'd MMM', { locale: es })}.`;
        }

        return (
            <View style={styles.emptyContainer}>
                <Ionicons name="calendar-clear-outline" size={48} color={theme.colors.text.muted} />
                <Text style={[styles.emptyTitle, { color: theme.colors.text.primary }]}>{title}</Text>
                <Text style={[styles.emptySubtext, { color: theme.colors.text.secondary }]}>{subtitle}</Text>
                {hasFiltersActive && (
                    <TouchableOpacity
                        style={[styles.clearFiltersBtn, { borderColor: theme.colors.border }]}
                        onPress={() => { setStatusFilter('all'); setTypeFilter('all'); setOwnerFilter('all'); setSelectedUserId(null); }}
                    >
                        <Text style={[styles.clearFiltersText, { color: theme.colors.accent }]}>Limpiar filtros</Text>
                    </TouchableOpacity>
                )}
            </View>
        );
    };

    // ─── Calendar Modal ────────────────────────────────────────────────────────
    const CalendarModal = () => {
        const monthStart = startOfDay(new Date(calendarViewDate.getFullYear(), calendarViewDate.getMonth(), 1));
        const firstDayOfWeek = monthStart.getDay();
        const prefixCount = firstDayOfWeek === 0 ? 6 : firstDayOfWeek - 1;

        return (
            <Modal visible={isCalendarVisible} transparent animationType="fade" onRequestClose={() => setIsCalendarVisible(false)}>
                <TouchableOpacity style={styles.modalOverlay} activeOpacity={1} onPress={() => setIsCalendarVisible(false)}>
                    <TouchableOpacity activeOpacity={1} style={[styles.calendarCard, { backgroundColor: theme.colors.surface }]}>
                        <View style={styles.calendarHeader}>
                            <TouchableOpacity onPress={() => setCalendarViewDate(d => subDays(startOfDay(new Date(d.getFullYear(), d.getMonth(), 1)), 1))}>
                                <Ionicons name="chevron-back" size={22} color={theme.colors.accent} />
                            </TouchableOpacity>
                            <Text style={[styles.calendarHeaderTitle, { color: theme.colors.text.primary }]}>
                                {format(calendarViewDate, 'MMMM yyyy', { locale: es }).replace(/^\w/, c => c.toUpperCase())}
                            </Text>
                            <TouchableOpacity onPress={() => setCalendarViewDate(d => addDays(startOfDay(new Date(d.getFullYear(), d.getMonth() + 1, 1)), 0))}>
                                <Ionicons name="chevron-forward" size={22} color={theme.colors.accent} />
                            </TouchableOpacity>
                        </View>

                        <View style={styles.weekdayRow}>
                            {['Lu', 'Ma', 'Mi', 'Ju', 'Vi', 'Sa', 'Do'].map(d => (
                                <Text key={d} style={[styles.weekdayText, { color: theme.colors.text.muted }]}>{d}</Text>
                            ))}
                        </View>

                        <View style={styles.calendarGrid}>
                            {Array.from({ length: prefixCount }).map((_, i) => <View key={`px-${i}`} style={styles.calendarDayEmpty} />)}
                            {calendarDays.map(date => {
                                const isSel = isSameDay(date, selectedDate);
                                const isT = dateFnsIsToday(date);
                                const hasTasks = daysWithTasks.has(format(date, 'yyyy-MM-dd'));
                                const isRed = isRedDay(date);
                                return (
                                    <TouchableOpacity
                                        key={date.toISOString()}
                                        style={styles.calendarDay}
                                        onPress={() => {
                                            setSelectedDate(startOfDay(date));
                                            setCalendarViewDate(date);
                                            setIsCalendarVisible(false);
                                        }}
                                    >
                                        <View style={[
                                            styles.calendarDayInner,
                                            isSel && { backgroundColor: theme.colors.accent },
                                            isT && !isSel && { borderWidth: 1.5, borderColor: theme.colors.accent },
                                        ]}>
                                            <Text style={[
                                                styles.calendarDayText,
                                                { color: theme.colors.text.primary },
                                                isSel && { color: theme.colors.white },
                                                isRed && !isSel && { color: theme.colors.danger },
                                            ]}>
                                                {format(date, 'd')}
                                            </Text>
                                        </View>
                                        {hasTasks && <View style={[styles.calendarDot, isSel && { backgroundColor: theme.colors.white }]} />}
                                    </TouchableOpacity>
                                );
                            })}
                        </View>

                        <TouchableOpacity
                            style={[styles.todayBtn, { borderColor: theme.colors.border }]}
                            onPress={() => {
                                const today = startOfDay(new Date());
                                setSelectedDate(today);
                                setCalendarViewDate(today);
                                setIsCalendarVisible(false);
                            }}
                        >
                            <Text style={[styles.todayBtnText, { color: theme.colors.accent }]}>Ir a hoy</Text>
                        </TouchableOpacity>
                    </TouchableOpacity>
                </TouchableOpacity>
            </Modal>
        );
    };

    // ─── Filter Drawer ─────────────────────────────────────────────────────────
    const FilterDrawer = () => {
        const FilterChip = ({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) => (
            <TouchableOpacity
                style={[styles.filterChip, active && { backgroundColor: theme.colors.accent }]}
                onPress={onPress}
            >
                <Text style={[styles.filterChipText, { color: active ? theme.colors.white : theme.colors.text.secondary }]}>
                    {label}
                </Text>
            </TouchableOpacity>
        );

        return (
            <Modal visible={filterDrawerVisible} transparent animationType="slide" onRequestClose={() => setFilterDrawerVisible(false)}>
                <TouchableOpacity style={styles.modalOverlay} activeOpacity={1} onPress={() => setFilterDrawerVisible(false)}>
                    <TouchableOpacity activeOpacity={1} style={[styles.filterSheet, { backgroundColor: theme.colors.surface }]}>
                        <View style={styles.filterSheetHandle} />
                        <Text style={[styles.filterSheetTitle, { color: theme.colors.text.primary }]}>Filtrar</Text>

                        <Text style={[styles.filterGroupLabel, { color: theme.colors.text.muted }]}>ESTADO</Text>
                        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterChipsRow}>
                            {([['all','Todos'],['proposed','Nuevos'],['accepted','Activos'],['resolved','Resueltos'],['rejected','Rechazados']] as const).map(([v, l]) => (
                                <FilterChip key={v} label={l} active={statusFilter === v} onPress={() => setStatusFilter(v)} />
                            ))}
                        </ScrollView>

                        <Text style={[styles.filterGroupLabel, { color: theme.colors.text.muted }]}>TIPO</Text>
                        <View style={styles.filterChipsRow}>
                            {([['all','Todo'],['tasks','Tareas'],['meetings','Reuniones']] as const).map(([v, l]) => (
                                <FilterChip key={v} label={l} active={typeFilter === v} onPress={() => setTypeFilter(v as TypeFilter)} />
                            ))}
                        </View>

                        <Text style={[styles.filterGroupLabel, { color: theme.colors.text.muted }]}>ASIGNACIÓN</Text>
                        <View style={styles.filterChipsRow}>
                            {([['all','Todos'],['mine','Míos'],['delegated','Encargados']] as const).map(([v, l]) => (
                                <FilterChip key={v} label={l} active={ownerFilter === v} onPress={() => setOwnerFilter(v as OwnerFilter)} />
                            ))}
                        </View>

                        {teamMembers.length > 0 && (
                            <>
                                <Text style={[styles.filterGroupLabel, { color: theme.colors.text.muted }]}>PERSONA</Text>
                                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterChipsRow}>
                                    <FilterChip label="Todos" active={!selectedUserId} onPress={() => setSelectedUserId(null)} />
                                    {teamMembers.map((m: any) => (
                                        <FilterChip
                                            key={m.id}
                                            label={m.full_name?.split(' ')[0] || 'Usuario'}
                                            active={selectedUserId === m.id}
                                            onPress={() => setSelectedUserId(m.id)}
                                        />
                                    ))}
                                </ScrollView>
                            </>
                        )}

                        {hasFiltersActive && (
                            <TouchableOpacity
                                style={[styles.clearAllBtn, { borderColor: theme.colors.border }]}
                                onPress={() => { setStatusFilter('all'); setTypeFilter('all'); setOwnerFilter('all'); setSelectedUserId(null); setFilterDrawerVisible(false); }}
                            >
                                <Text style={[styles.clearAllText, { color: theme.colors.danger }]}>Limpiar todos los filtros</Text>
                            </TouchableOpacity>
                        )}
                    </TouchableOpacity>
                </TouchableOpacity>
            </Modal>
        );
    };

    const dateTitle = isSelectedToday
        ? 'Hoy'
        : format(selectedDate, "EEE d MMM", { locale: es }).replace(/^\w/, c => c.toUpperCase());

    return (
        <SafeAreaView style={[styles.container, { backgroundColor: theme.colors.background }]}>
            <StatusBar barStyle={theme.isDark ? 'light-content' : 'dark-content'} />
            <CalendarModal />
            <FilterDrawer />

            {/* ── HEADER ── */}
            <View style={[styles.header, { backgroundColor: theme.colors.surface, borderBottomColor: theme.colors.border }]}>
                <TouchableOpacity
                    onPress={() => { setSelectedDate(d => subDays(d, 1)); }}
                    hitSlop={{ top: 8, bottom: 8, left: 12, right: 12 }}
                >
                    <Ionicons name="chevron-back" size={22} color={theme.colors.accent} />
                </TouchableOpacity>

                <TouchableOpacity onPress={() => setIsCalendarVisible(true)} style={styles.headerDatePill}>
                    <Text style={[styles.headerDateText, { color: theme.colors.text.primary }]}>{dateTitle}</Text>
                    <Ionicons name="chevron-down" size={14} color={theme.colors.text.muted} />
                </TouchableOpacity>

                <TouchableOpacity
                    onPress={() => { setSelectedDate(d => addDays(d, 1)); }}
                    hitSlop={{ top: 8, bottom: 8, left: 12, right: 12 }}
                >
                    <Ionicons name="chevron-forward" size={22} color={theme.colors.accent} />
                </TouchableOpacity>

                <TouchableOpacity
                    onPress={() => setFilterDrawerVisible(true)}
                    style={[styles.filterBtn, hasFiltersActive && { backgroundColor: theme.colors.accentSoft }]}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                >
                    <Ionicons name="options-outline" size={18} color={hasFiltersActive ? theme.colors.accent : theme.colors.text.secondary} />
                    {hasFiltersActive && <View style={[styles.filterActiveDot, { backgroundColor: theme.colors.accent }]} />}
                </TouchableOpacity>
            </View>

            <ScrollView
                style={{ flex: 1 }}
                contentContainerStyle={styles.scrollContent}
                refreshControl={<RefreshControl refreshing={isLoading} onRefresh={refetch} />}
                showsVerticalScrollIndicator={false}
            >
                {/* ── RESUMEN ── */}
                <TodaySummaryBar
                    totalToday={todayItems.length}
                    overdueCount={overdueItems.length}
                    nextItemTime={nextItemTime}
                    selectedDate={selectedDate}
                    isToday={isSelectedToday}
                />

                {/* ── NECESITA ATENCIÓN ── */}
                {isSelectedToday && overdueItems.length > 0 && (
                    <View style={styles.blockPad}>
                        <OverdueAlert
                            items={overdueItems}
                            maxVisible={3}
                            onViewAll={() => navigation.navigate('Insights', { initialSegment: 'pendientes' })}
                        />
                    </View>
                )}

                {/* ── AHORA / PRÓXIMO ── */}
                {isSelectedToday && nextItem && (
                    <View style={styles.blockPad}>
                        {renderNextUpCard()}
                    </View>
                )}

                {/* ── AGENDA ── */}
                {todayItems.length === 0 ? (
                    renderEmpty()
                ) : (
                    <View style={[styles.agendaBlock, { backgroundColor: theme.colors.surface }]}>
                        <Text style={[styles.agendaBlockTitle, { color: theme.colors.text.secondary }]}>
                            {isSelectedToday ? 'Agenda de hoy' : `Agenda · ${format(selectedDate, 'd MMM', { locale: es })}`}
                        </Text>
                        {myItems.map(c => (
                            <TodayItemRow
                                key={c.id}
                                commitment={c}
                                currentUserId={user?.id}
                                onMarkDone={handleMarkDone}
                                onConfirm={handleConfirm}
                            />
                        ))}
                    </View>
                )}

                {/* ── ENCARGADAS ── */}
                {delegatedItems.length > 0 && (
                    <View style={styles.blockPad}>
                        {renderSection(delegatedItems, 'Esperando de otros', true)}
                    </View>
                )}

                <View style={{ height: 80 }} />
            </ScrollView>
        </SafeAreaView>
    );
}

// ─── Styles ──────────────────────────────────────────────────────────────────

const createStyles = (theme: any) => StyleSheet.create({
    container: { flex: 1 },

    // Header
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 16,
        paddingVertical: 12,
        borderBottomWidth: StyleSheet.hairlineWidth,
    },
    headerDatePill: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
        flex: 1,
        justifyContent: 'center',
    },
    headerDateText: {
        fontSize: 17,
        fontWeight: '700',
    },
    filterBtn: {
        width: 32,
        height: 32,
        borderRadius: 8,
        alignItems: 'center',
        justifyContent: 'center',
    },
    filterActiveDot: {
        position: 'absolute',
        top: 4,
        right: 4,
        width: 6,
        height: 6,
        borderRadius: 3,
    },

    // Scroll
    scrollContent: {
        paddingTop: 12,
        gap: 8,
    },
    blockPad: {
        paddingHorizontal: 16,
    },

    // Next-up card
    nextUpCard: {
        borderRadius: 12,
        borderWidth: 1,
        padding: 14,
        gap: 6,
    },
    nextUpHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
    },
    nextUpBadge: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
        paddingHorizontal: 8,
        paddingVertical: 3,
        borderRadius: 6,
    },
    nextUpBadgeText: {
        fontSize: 11,
        fontWeight: '700',
        textTransform: 'uppercase',
        letterSpacing: 0.4,
    },
    nextUpTime: {
        fontSize: 13,
        fontWeight: '600',
        fontVariant: ['tabular-nums'],
    },
    nextUpTitle: {
        fontSize: 16,
        fontWeight: '700',
        lineHeight: 22,
    },

    // Agenda block
    agendaBlock: {
        marginHorizontal: 16,
        borderRadius: 12,
        paddingHorizontal: 14,
        paddingBottom: 6,
        overflow: 'hidden',
    },
    agendaBlockTitle: {
        fontSize: 11,
        fontWeight: '700',
        textTransform: 'uppercase',
        letterSpacing: 0.6,
        paddingTop: 14,
        paddingBottom: 6,
    },

    // Section (collapsible, e.g. Encargadas)
    section: {
        borderRadius: 12,
        paddingHorizontal: 14,
        paddingBottom: 6,
        overflow: 'hidden',
    },
    sectionTitle: {
        fontSize: 11,
        fontWeight: '700',
        textTransform: 'uppercase',
        letterSpacing: 0.6,
        paddingTop: 14,
        paddingBottom: 6,
    },
    collapsibleHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingVertical: 12,
    },

    // Empty state
    emptyContainer: {
        alignItems: 'center',
        justifyContent: 'center',
        paddingVertical: 60,
        paddingHorizontal: 32,
        gap: 8,
    },
    emptyTitle: {
        fontSize: 18,
        fontWeight: '700',
        marginTop: 8,
    },
    emptySubtext: {
        fontSize: 14,
        textAlign: 'center',
        lineHeight: 20,
    },
    clearFiltersBtn: {
        marginTop: 12,
        paddingHorizontal: 20,
        paddingVertical: 9,
        borderRadius: 8,
        borderWidth: 1,
    },
    clearFiltersText: {
        fontSize: 14,
        fontWeight: '600',
    },

    // Calendar Modal
    modalOverlay: {
        flex: 1,
        backgroundColor: 'rgba(0,0,0,0.45)',
        justifyContent: 'center',
        alignItems: 'center',
    },
    calendarCard: {
        width: '88%',
        borderRadius: 18,
        padding: 20,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.2,
        shadowRadius: 12,
        elevation: 8,
    },
    calendarHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: 14,
    },
    calendarHeaderTitle: {
        fontSize: 16,
        fontWeight: '700',
    },
    weekdayRow: {
        flexDirection: 'row',
        marginBottom: 8,
    },
    weekdayText: {
        flex: 1,
        textAlign: 'center',
        fontSize: 11,
        fontWeight: '600',
    },
    calendarGrid: {
        flexDirection: 'row',
        flexWrap: 'wrap',
    },
    calendarDay: {
        width: '14.28%',
        alignItems: 'center',
        paddingVertical: 2,
    },
    calendarDayInner: {
        width: 34,
        height: 34,
        borderRadius: 17,
        alignItems: 'center',
        justifyContent: 'center',
    },
    calendarDayText: {
        fontSize: 14,
        fontWeight: '500',
    },
    calendarDayEmpty: {
        width: '14.28%',
    },
    calendarDot: {
        width: 4,
        height: 4,
        borderRadius: 2,
        backgroundColor: '#6366f1',
        marginTop: 2,
    },
    todayBtn: {
        marginTop: 14,
        paddingVertical: 10,
        borderRadius: 8,
        borderWidth: 1,
        alignItems: 'center',
    },
    todayBtnText: {
        fontSize: 14,
        fontWeight: '600',
    },

    // Filter Drawer
    filterSheet: {
        position: 'absolute',
        bottom: 0,
        left: 0,
        right: 0,
        borderTopLeftRadius: 20,
        borderTopRightRadius: 20,
        paddingHorizontal: 20,
        paddingBottom: 40,
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
        marginBottom: 20,
    },
    filterGroupLabel: {
        fontSize: 11,
        fontWeight: '700',
        letterSpacing: 0.6,
        marginBottom: 8,
        marginTop: 14,
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
    clearAllBtn: {
        marginTop: 20,
        paddingVertical: 12,
        borderRadius: 10,
        borderWidth: 1,
        alignItems: 'center',
    },
    clearAllText: {
        fontSize: 14,
        fontWeight: '600',
    },
});
