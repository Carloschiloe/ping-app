import React, { useState, useMemo, useCallback } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, StatusBar, ScrollView, Modal, RefreshControl } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';
import { format, addDays, isSameDay, startOfDay } from 'date-fns';
import { es } from 'date-fns/locale';
import { apiClient } from '../api/client';
import GroupTaskCard from '../components/GroupTaskCard';
import { useAuth } from '../context/AuthContext';
import { isRedDay } from '../utils/holidays';
import { normalizeCommitmentStatus } from '../utils/commitmentStatus';
import { useAppTheme } from '../theme/ThemeContext';

type FilterType = 'todo' | 'delegated';
type StatusFilter = 'all' | 'proposed' | 'accepted' | 'rejected' | 'completed';

export default function TaskDashboardScreen() {
    const { theme } = useAppTheme();
    const styles = useMemo(() => createStyles(theme), [theme]);
    const { user } = useAuth();
    const [filterType, setFilterType] = useState<FilterType>('todo');
    const [selectedDate, setSelectedDate] = useState<Date>(startOfDay(new Date()));
    const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
    const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
    const [isCalendarVisible, setIsCalendarVisible] = useState(false);
    const [timelineFilter, setTimelineFilter] = useState<'all' | 'tasks' | 'meetings'>('all');
    const [assigneePickerVisible, setAssigneePickerVisible] = useState(false);

    const { data: commitments = [], isLoading, refetch } = useQuery({
        queryKey: ['all-commitments-dashboard'],
        queryFn: async () => {
            return apiClient.get('/commitments');
        }
    });

    useFocusEffect(
        useCallback(() => {
            refetch();
        }, [refetch])
    );

    // Generate 21 days for the scroller (2 days ago to 18 days ahead)
    const dates = useMemo(() => {
        return Array.from({ length: 21 }).map((_, i) => addDays(startOfDay(new Date()), i - 2));
    }, []);

    // Calculate which days have tasks for the indicators
    const daysWithTasks = useMemo(() => {
        const set = new Set();
        commitments.forEach((c: any) => {
            if (c.due_at) {
                set.add(format(new Date(c.due_at), 'yyyy-MM-dd'));
            }
        });
        return set;
    }, [commitments]);

    // Get unique team members from commitments
    const teamMembers = useMemo(() => {
        const membersMap = new Map();
        commitments.forEach((c: any) => {
            if (c.assignee && c.assignee.id !== user?.id) {
                membersMap.set(c.assignee.id, c.assignee);
            }
            if (c.owner && c.owner.id !== user?.id) {
                membersMap.set(c.owner.id, c.owner);
            }
        });
        return Array.from(membersMap.values());
    }, [commitments, user?.id]);

    const groupedData = useMemo(() => {
        const filtered = commitments.filter((c: any) => {
            const normalizedStatus = normalizeCommitmentStatus(c.status);
            const taskDate = c.due_at ? startOfDay(new Date(c.due_at)) : null;
            if (!taskDate || !isSameDay(taskDate, selectedDate)) return false;

            if (filterType === 'todo') {
                if (c.assigned_to_user_id !== user?.id) return false;
                if (selectedUserId && c.owner_user_id !== selectedUserId) return false;
            } else {
                const isDelegatedByMe = c.owner_user_id === user?.id && c.assigned_to_user_id !== user?.id;
                if (!isDelegatedByMe) return false;
                if (selectedUserId && c.assigned_to_user_id !== selectedUserId) return false;
            }

            if (statusFilter !== 'all') {
                if (statusFilter === 'proposed' && normalizedStatus !== 'proposed') return false;
                if (statusFilter === 'accepted' && normalizedStatus !== 'accepted') return false;
                if (statusFilter === 'rejected' && normalizedStatus !== 'rejected') return false;
                if (statusFilter === 'completed' && normalizedStatus !== 'completed') return false;
            }
            return true;
        });

        // Sort by time
        const sorted = filtered.sort((a: any, b: any) => {
            const dateA = a.due_at ? new Date(a.due_at).getTime() : 0;
            const dateB = b.due_at ? new Date(b.due_at).getTime() : 0;
            return dateA - dateB;
        });

        const meetings: any[] = [];
        const tasks: any[] = [];

        sorted.forEach((item: any) => {
            const isMeeting = item.type === 'meeting' || /reuni[oó]n|llamada|junta|meet|zoom|call|cita/i.test(item.title || '');
            if (isMeeting) {
                meetings.push(item);
            } else {
                tasks.push(item);
            }
        });

        return { meetings, tasks };
    }, [commitments, selectedDate, filterType, statusFilter, selectedUserId, user?.id]);

    const timelineItems = useMemo(() => {
        const items = [
            ...groupedData.meetings.map(item => ({ ...item, _kind: 'meeting' })),
            ...groupedData.tasks.map(item => ({ ...item, _kind: 'task' })),
        ];
        const filtered = items.filter(item => {
            if (timelineFilter === 'all') return true;
            if (timelineFilter === 'meetings') return item._kind === 'meeting';
            return item._kind === 'task';
        });
        return filtered.sort((a: any, b: any) => {
            const dateA = a.due_at ? new Date(a.due_at).getTime() : 0;
            const dateB = b.due_at ? new Date(b.due_at).getTime() : 0;
            return dateA - dateB;
        });
    }, [groupedData.meetings, groupedData.tasks, timelineFilter]);

    const kpiSummary = useMemo(() => {
        const now = new Date();
        let pending = 0;
        let inProgress = 0;
        let overdue = 0;

        groupedData.tasks.forEach((item: any) => {
            const normalizedStatus = normalizeCommitmentStatus(item.status);
            if (normalizedStatus === 'proposed') pending += 1;
            if (normalizedStatus === 'accepted') inProgress += 1;
            if (item.due_at && new Date(item.due_at) < now && !['completed', 'rejected'].includes(normalizedStatus)) {
                overdue += 1;
            }
        });

        let insight = 'Día despejado. Puedes planificar sin urgencias.';
        let cta = { label: 'Ver hoy', action: () => setSelectedDate(startOfDay(new Date())) };

        if (overdue > 0) {
            insight = `Tienes ${overdue} vencida${overdue > 1 ? 's' : ''}. Prioriza estas tareas.`;
            cta = { label: 'Ver en curso', action: () => { setStatusFilter('accepted'); setSelectedDate(startOfDay(new Date())); } };
        } else if (pending > 0) {
            insight = `Hay ${pending} propuesta${pending > 1 ? 's' : ''} pendiente${pending > 1 ? 's' : ''} de confirmar.`;
            cta = { label: 'Ir a pendientes', action: () => { setStatusFilter('proposed'); setSelectedDate(startOfDay(new Date())); } };
        }

        return { pending, inProgress, overdue, insight, cta };
    }, [groupedData.tasks]);

    const hasUrgency = kpiSummary.overdue > 0 || kpiSummary.pending > 0;
    const selectedAssigneeName = useMemo(() => {
        if (!selectedUserId) return 'Todos';
        const match = teamMembers.find((member: any) => member.id === selectedUserId);
        return match?.full_name?.split(' ')[0] || 'Usuario';
    }, [selectedUserId, teamMembers]);


    const renderDateItem = (date: Date) => {
        const isSelected = isSameDay(date, selectedDate);
        const dayName = format(date, 'EEE', { locale: es }).replace('.', '');
        const dayNum = format(date, 'dd');
        const hasTask = daysWithTasks.has(format(date, 'yyyy-MM-dd'));
        const redDay = isRedDay(date);

        return (
            <TouchableOpacity
                key={date.toISOString()}
                style={[styles.dateItem, isSelected && styles.dateItemActive]}
                onPress={() => setSelectedDate(date)}
            >
                <Text style={[
                    styles.dateDay,
                    isSelected && styles.dateTextActive,
                    redDay && !isSelected && { color: theme.colors.danger }
                ]}>{dayName}</Text>
                <Text style={[
                    styles.dateNum,
                    isSelected && styles.dateTextActive,
                    redDay && !isSelected && { color: theme.colors.danger }
                ]}>{dayNum}</Text>
                {hasTask && <View style={[styles.dateDot, isSelected ? styles.dateDotActive : styles.dateDotInactive]} />}
            </TouchableOpacity>
        );
    };

    const StatusChip = ({ label, value, icon }: { label: string, value: StatusFilter, icon: any }) => (
        <TouchableOpacity
            style={[styles.chip, statusFilter === value && styles.chipActive]}
            onPress={() => setStatusFilter(value)}
        >
            <Ionicons
                name={icon}
                size={14}
                color={statusFilter === value ? theme.colors.white : (theme.isDark ? theme.colors.text.secondary : theme.colors.text.muted)}
            />
            <Text style={[styles.chipText, statusFilter === value && styles.chipTextActive]}>{label}</Text>
        </TouchableOpacity>
    );

    const MonthPickerModal = () => {
        const [viewDate, setViewDate] = useState(new Date(selectedDate));
        const monthStart = startOfDay(new Date(viewDate.getFullYear(), viewDate.getMonth(), 1));
        const daysInMonth = Array.from({ length: 31 }).map((_, i) => addDays(monthStart, i))
            .filter(d => d.getMonth() === viewDate.getMonth());

        return (
            <Modal visible={isCalendarVisible} transparent animationType="fade">
                <View style={styles.modalOverlay}>
                    <View style={styles.calendarModal}>
                        <View style={styles.modalHeader}>
                            <TouchableOpacity onPress={() => setViewDate(addDays(monthStart, -1))}>
                                <Ionicons name="chevron-back" size={24} color={theme.colors.accent} />
                            </TouchableOpacity>
                            <Text style={styles.modalHeaderTitle}>
                                {format(viewDate, 'MMMM yyyy', { locale: es })}
                            </Text>
                            <TouchableOpacity onPress={() => setViewDate(addDays(monthStart, 32))}>
                                <Ionicons name="chevron-forward" size={24} color={theme.colors.accent} />
                            </TouchableOpacity>
                        </View>
                        <View style={styles.monthGrid}>
                            {['Lu', 'Ma', 'Mi', 'Ju', 'Vi', 'Sa', 'Do'].map(d => (
                                <View key={d} style={styles.gridDayHeader}>
                                    <Text style={styles.gridDayHeaderText}>{d}</Text>
                                </View>
                            ))}
                            {(() => {
                                // Pad beginning of month to start on Monday
                                // getDay(): 0 is Sunday, 1 is Monday...
                                const firstDay = monthStart.getDay();
                                const prefixCount = firstDay === 0 ? 6 : firstDay - 1;
                                return Array.from({ length: prefixCount }).map((_, i) => (
                                    <View key={`prefix-${i}`} style={styles.gridDayEmpty} />
                                ));
                            })()}
                            {daysInMonth.map((date) => {
                                const isSelected = isSameDay(date, selectedDate);
                                const hasTask = daysWithTasks.has(format(date, 'yyyy-MM-dd'));
                                const redDay = isRedDay(date);
                                return (
                                    <TouchableOpacity
                                        key={date.toISOString()}
                                        style={styles.gridDay}
                                        onPress={() => {
                                            setSelectedDate(date);
                                            setIsCalendarVisible(false);
                                        }}
                                    >
                                        <View style={[styles.gridDayInner, isSelected && styles.gridDayActive]}>
                                            <Text style={[
                                                styles.gridDayText,
                                                isSelected && styles.gridDayTextActive,
                                                redDay && !isSelected && { color: theme.colors.danger, fontWeight: 'bold' }
                                            ]}>
                                                {format(date, 'd')}
                                            </Text>
                                            {hasTask && <View style={[styles.gridDot, isSelected && { backgroundColor: 'white' }]} />}
                                        </View>
                                    </TouchableOpacity>
                                );
                            })}
                        </View>
                        <TouchableOpacity
                            style={styles.closeModalBtn}
                            onPress={() => setIsCalendarVisible(false)}
                        >
                            <Text style={styles.closeModalBtnText}>Cerrar</Text>
                        </TouchableOpacity>
                    </View>
                </View>
            </Modal>
        );
    };

    return (
        <SafeAreaView style={styles.container}>
            <StatusBar barStyle={theme.isDark ? 'light-content' : 'dark-content'} />
            <MonthPickerModal />

            <View style={styles.header}>
                <View style={styles.headerTop}>
                    <View style={styles.headerTitleRow}>
                        <Text style={styles.headerTitle}>Tablero</Text>
                        <View style={styles.headerDatePill}>
                            <Ionicons name="calendar" size={14} color={theme.colors.accent} />
                            <Text style={styles.headerDateText}>{format(selectedDate, 'EEE d MMM', { locale: es })}</Text>
                        </View>
                    </View>
                    <TouchableOpacity style={styles.calendarBtn} onPress={() => setIsCalendarVisible(true)}>
                        <Ionicons name="calendar-outline" size={24} color={theme.colors.accent} />
                    </TouchableOpacity>
                </View>

                {hasUrgency ? (
                    <View style={styles.kpiCard}>
                        <View style={styles.kpiRow}>
                            <View style={styles.kpiItem}>
                                <Text style={styles.kpiValue}>{kpiSummary.pending}</Text>
                                <Text style={styles.kpiLabel}>Pendientes</Text>
                            </View>
                            <View style={styles.kpiDivider} />
                            <View style={styles.kpiItem}>
                                <Text style={styles.kpiValue}>{kpiSummary.inProgress}</Text>
                                <Text style={styles.kpiLabel}>En curso</Text>
                            </View>
                            <View style={styles.kpiDivider} />
                            <View style={styles.kpiItem}>
                                <Text style={styles.kpiValue}>{kpiSummary.overdue}</Text>
                                <Text style={styles.kpiLabel}>Vencidas</Text>
                            </View>
                        </View>
                        <View style={styles.kpiInsightRow}>
                            <Text style={styles.kpiInsightText}>{kpiSummary.insight}</Text>
                            <TouchableOpacity style={styles.kpiCta} onPress={kpiSummary.cta.action}>
                                <Text style={styles.kpiCtaText}>{kpiSummary.cta.label}</Text>
                            </TouchableOpacity>
                        </View>
                    </View>
                ) : (
                    <View style={styles.kpiHintRow}>
                        <Text style={styles.kpiHintText}>{kpiSummary.insight}</Text>
                        <TouchableOpacity style={styles.kpiCta} onPress={kpiSummary.cta.action}>
                            <Text style={styles.kpiCtaText}>Ver hoy</Text>
                        </TouchableOpacity>
                    </View>
                )}

                <View style={styles.toggleContainer}>
                    <TouchableOpacity
                        style={[styles.toggleBtn, filterType === 'todo' && styles.toggleBtnActive]}
                        onPress={() => { setFilterType('todo'); setSelectedUserId(null); }}
                    >
                        <Text style={[styles.toggleText, filterType === 'todo' && styles.toggleTextActive]}>Por Hacer</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                        style={[styles.toggleBtn, filterType === 'delegated' && styles.toggleBtnActive]}
                        onPress={() => { setFilterType('delegated'); setSelectedUserId(null); }}
                    >
                        <Text style={[styles.toggleText, filterType === 'delegated' && styles.toggleTextActive]}>Encargadas</Text>
                    </TouchableOpacity>
                </View>
            </View>

            <View style={styles.scrollerContainer}>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.dateScroller}>
                    {dates.map(renderDateItem)}
                </ScrollView>
            </View>

            <View style={styles.sectionLabelRow}>
                <Text style={styles.sectionLabel}>Estado</Text>
            </View>
            <View style={styles.filtersContainer}>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipsRow}>
                    <StatusChip label="Todas" value="all" icon="layers-outline" />
                    <StatusChip label="Nuevas" value="proposed" icon="mail-unread-outline" />
                    <StatusChip label="Activas" value="accepted" icon="flash-outline" />
                    <StatusChip label="Completas" value="completed" icon="checkmark-circle-outline" />
                    <StatusChip label="Rechazadas" value="rejected" icon="close-circle-outline" />
                </ScrollView>
            </View>

            {teamMembers.length > 0 && (
                <View style={styles.assigneeRowCompact}>
                    <Text style={styles.sectionLabel}>{filterType === 'todo' ? 'Asignado por' : 'Responsable'}</Text>
                    <TouchableOpacity style={styles.assigneeSelector} onPress={() => setAssigneePickerVisible(true)}>
                        <Ionicons name="person" size={14} color={theme.colors.text.secondary} />
                        <Text style={styles.assigneeSelectorText}>{selectedAssigneeName}</Text>
                        <Ionicons name="chevron-down" size={14} color={theme.colors.text.muted} />
                    </TouchableOpacity>
                </View>
            )}

            <ScrollView 
                style={{ flex: 1 }}
                contentContainerStyle={styles.listContent}
                refreshControl={
                    <RefreshControl refreshing={isLoading} onRefresh={refetch} />
                }
            >
                <View style={styles.sectionContainer}>
                    <View style={styles.sectionHeader}>
                        <View style={styles.sectionTitleRow}>
                            <Ionicons name="time" size={18} color={theme.colors.accent} />
                            <Text style={styles.sectionTitleText}>Agenda del Día</Text>
                        </View>
                        <View style={styles.sectionHeaderRight}>
                            <View style={styles.sectionBadge}>
                                <Text style={styles.sectionBadgeText}>{timelineItems.length}</Text>
                            </View>
                        </View>
                    </View>
                    <View style={styles.timelineFilterRow}>
                        <TouchableOpacity
                            style={[styles.timelineChip, timelineFilter === 'all' && styles.timelineChipActive]}
                            onPress={() => setTimelineFilter('all')}
                        >
                            <Text style={[styles.timelineChipText, timelineFilter === 'all' && styles.timelineChipTextActive]}>Todo</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                            style={[styles.timelineChip, timelineFilter === 'tasks' && styles.timelineChipActive]}
                            onPress={() => setTimelineFilter('tasks')}
                        >
                            <Text style={[styles.timelineChipText, timelineFilter === 'tasks' && styles.timelineChipTextActive]}>Tareas</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                            style={[styles.timelineChip, timelineFilter === 'meetings' && styles.timelineChipActive]}
                            onPress={() => setTimelineFilter('meetings')}
                        >
                            <Text style={[styles.timelineChipText, timelineFilter === 'meetings' && styles.timelineChipTextActive]}>Reuniones</Text>
                        </TouchableOpacity>
                    </View>
                    {timelineItems.length === 0 ? (
                        <View style={styles.emptyContainer}>
                            <Ionicons name="calendar-clear-outline" size={56} color={theme.colors.separator} />
                            <Text style={styles.emptyText}>No hay items para este filtro</Text>
                            <Text style={styles.emptySubtext}>Prueba cambiando el filtro o el día</Text>
                        </View>
                    ) : (
                        timelineItems.map(item => (
                            <GroupTaskCard key={item.id} commitment={item} groupParticipants={teamMembers} />
                        ))
                    )}
                </View>

                {groupedData.meetings.length === 0 && groupedData.tasks.length === 0 && (
                    <View style={styles.emptyContainer}>
                        <Ionicons name="folder-open-outline" size={64} color={theme.colors.separator} />
                        <Text style={styles.emptyText}>No hay tareas para este filtro</Text>
                        <Text style={styles.emptySubtext}>Cambia de día o filtro para ver más</Text>
                        <View style={styles.emptyActions}>
                            <TouchableOpacity
                                style={styles.emptyPrimaryBtn}
                                onPress={() => {
                                    setSelectedDate(startOfDay(new Date()));
                                    setStatusFilter('all');
                                    setSelectedUserId(null);
                                }}
                            >
                                <Text style={styles.emptyPrimaryText}>Ver hoy</Text>
                            </TouchableOpacity>
                            <TouchableOpacity
                                style={styles.emptySecondaryBtn}
                                onPress={() => {
                                    setStatusFilter('all');
                                    setSelectedUserId(null);
                                }}
                            >
                                <Text style={styles.emptySecondaryText}>Limpiar filtros</Text>
                            </TouchableOpacity>
                        </View>
                    </View>
                )}
            </ScrollView>

            <Modal visible={assigneePickerVisible} transparent animationType="fade" onRequestClose={() => setAssigneePickerVisible(false)}>
                <TouchableOpacity style={styles.assigneeModalOverlay} activeOpacity={1} onPress={() => setAssigneePickerVisible(false)}>
                    <View style={styles.assigneeModalCard}>
                        <Text style={styles.assigneeModalTitle}>{filterType === 'todo' ? 'Asignado por' : 'Responsable'}</Text>
                        <ScrollView contentContainerStyle={styles.assigneeList}>
                            <TouchableOpacity
                                style={[styles.assigneeListItem, !selectedUserId && styles.assigneeListItemActive]}
                                onPress={() => {
                                    setSelectedUserId(null);
                                    setAssigneePickerVisible(false);
                                }}
                            >
                                <Text style={[styles.assigneeListText, !selectedUserId && styles.assigneeListTextActive]}>Todos</Text>
                            </TouchableOpacity>
                            {teamMembers.map((member: any) => (
                                <TouchableOpacity
                                    key={member.id}
                                    style={[styles.assigneeListItem, selectedUserId === member.id && styles.assigneeListItemActive]}
                                    onPress={() => {
                                        setSelectedUserId(member.id);
                                        setAssigneePickerVisible(false);
                                    }}
                                >
                                    <Text style={[styles.assigneeListText, selectedUserId === member.id && styles.assigneeListTextActive]}>
                                        {member.full_name || 'Usuario'}
                                    </Text>
                                </TouchableOpacity>
                            ))}
                        </ScrollView>
                    </View>
                </TouchableOpacity>
            </Modal>
        </SafeAreaView>
    );
}

const createStyles = (theme: any) => StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: theme.colors.background,
    },
    header: {
        paddingHorizontal: 20,
        paddingTop: 8,
        backgroundColor: theme.colors.surface,
    },
    headerTop: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 8,
    },
    headerTitleRow: {
        flexDirection: 'row',
        alignItems: 'center',
        flexWrap: 'wrap',
        gap: 10,
    },
    headerTitle: {
        fontSize: 24,
        fontWeight: '800',
        color: theme.colors.text.primary,
        letterSpacing: -0.3,
    },
    headerDatePill: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        paddingHorizontal: 10,
        paddingVertical: 6,
        borderRadius: 999,
        backgroundColor: theme.colors.surfaceMuted,
        borderWidth: 1,
        borderColor: theme.colors.separator,
    },
    headerDateText: {
        fontSize: 12,
        fontWeight: '700',
        color: theme.colors.text.secondary,
        textTransform: 'capitalize',
    },
    calendarBtn: {
        padding: 8,
        backgroundColor: theme.colors.surfaceMuted,
        borderRadius: 12,
    },
    kpiCard: {
        marginTop: 12,
        padding: 14,
        backgroundColor: theme.colors.surfaceMuted,
        borderRadius: 16,
        borderWidth: 1,
        borderColor: theme.colors.separator,
        gap: 10,
    },
    kpiHintRow: {
        marginTop: 12,
        paddingHorizontal: 12,
        paddingVertical: 10,
        backgroundColor: theme.colors.surfaceMuted,
        borderRadius: 14,
        borderWidth: 1,
        borderColor: theme.colors.separator,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 10,
    },
    kpiHintText: {
        flex: 1,
        fontSize: 12,
        color: theme.colors.text.secondary,
    },
    kpiRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
    },
    kpiItem: {
        flex: 1,
        alignItems: 'center',
        gap: 2,
    },
    kpiDivider: {
        width: 1,
        height: 26,
        backgroundColor: theme.colors.separator,
    },
    kpiValue: {
        fontSize: 18,
        fontWeight: '800',
        color: theme.colors.text.primary,
    },
    kpiLabel: {
        fontSize: 11,
        fontWeight: '700',
        color: theme.isDark ? theme.colors.text.secondary : theme.colors.text.muted,
        textTransform: 'uppercase',
        letterSpacing: 0.5,
    },
    kpiInsightRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 12,
    },
    kpiInsightText: {
        flex: 1,
        fontSize: 12,
        color: theme.colors.text.secondary,
        lineHeight: 16,
    },
    kpiCta: {
        paddingHorizontal: 10,
        paddingVertical: 6,
        borderRadius: 12,
        backgroundColor: theme.colors.surface,
        borderWidth: 1,
        borderColor: theme.colors.separator,
    },
    kpiCtaText: {
        fontSize: 11,
        fontWeight: '700',
        color: theme.colors.accent,
    },
    toggleContainer: {
        flexDirection: 'row',
        backgroundColor: theme.colors.surfaceMuted,
        borderRadius: 12,
        padding: 3,
        marginBottom: 12,
    },
    toggleBtn: {
        flex: 1,
        paddingVertical: 10,
        alignItems: 'center',
        borderRadius: 11,
    },
    toggleBtnActive: {
        backgroundColor: theme.isDark ? theme.colors.surfaceElevated : theme.colors.surface,
    },
    toggleText: {
        fontSize: 14,
        fontWeight: '600',
        color: theme.isDark ? theme.colors.text.secondary : theme.colors.text.muted,
    },
    toggleTextActive: {
        color: theme.colors.accent,
    },
    scrollerContainer: {
        backgroundColor: theme.colors.surface,
        paddingVertical: 6,
        borderBottomWidth: 1,
        borderBottomColor: theme.colors.separator,
    },
    dateScroller: {
        paddingHorizontal: 15,
        gap: 10,
    },
    dateItem: {
        width: 42,
        height: 56,
        alignItems: 'center',
        justifyContent: 'center',
        borderRadius: 16,
        backgroundColor: theme.colors.surfaceMuted,
        borderWidth: 1,
        borderColor: theme.colors.separator,
    },
    dateItemActive: {
        backgroundColor: theme.colors.accent,
        borderColor: theme.colors.accent,
    },
    dateDay: {
        fontSize: 10,
        fontWeight: '700',
        color: theme.isDark ? theme.colors.text.secondary : theme.colors.text.muted,
        textTransform: 'uppercase',
    },
    dateNum: {
        fontSize: 15,
        fontWeight: '800',
        color: theme.colors.text.primary,
        marginTop: 2,
    },
    dateTextActive: {
        color: theme.colors.white,
        fontWeight: '800',
    },
    dateDot: {
        width: 4,
        height: 4,
        borderRadius: 2,
        marginTop: 4,
    },
    dateDotActive: {
        backgroundColor: theme.colors.white,
    },
    dateDotInactive: {
        backgroundColor: theme.colors.accent,
    },
    filtersContainer: {
        paddingTop: 10,
        paddingBottom: 4,
    },
    sectionLabelRow: {
        paddingHorizontal: 20,
        marginTop: 8,
        marginBottom: 6,
    },
    sectionLabel: {
        fontSize: 11,
        fontWeight: '700',
        color: theme.isDark ? theme.colors.text.secondary : theme.colors.text.muted,
        textTransform: 'uppercase',
        letterSpacing: 0.6,
    },
    chipsRow: {
        paddingHorizontal: 20,
        gap: 6,
    },
    chip: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 10,
        paddingVertical: 6,
        backgroundColor: theme.isDark ? theme.colors.surfaceMuted : theme.colors.surface,
        borderRadius: 16,
        borderWidth: 1,
        borderColor: theme.colors.separator,
        gap: 6,
    },
    chipActive: {
        backgroundColor: theme.colors.accent,
        borderColor: theme.colors.accent,
    },
    chipText: {
        fontSize: 12,
        fontWeight: '600',
        color: theme.isDark ? theme.colors.text.secondary : theme.colors.text.muted,
    },
    chipTextActive: {
        color: theme.colors.white,
    },
    teamContainer: {
        paddingBottom: 12,
    },
    assigneeRowCompact: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 20,
        marginTop: 4,
        marginBottom: 6,
    },
    assigneeSelector: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        paddingHorizontal: 10,
        paddingVertical: 6,
        borderRadius: 12,
        backgroundColor: theme.colors.surfaceMuted,
        borderWidth: 1,
        borderColor: theme.colors.separator,
    },
    assigneeSelectorText: {
        fontSize: 12,
        fontWeight: '700',
        color: theme.colors.text.secondary,
    },
    assigneeModalOverlay: {
        flex: 1,
        backgroundColor: 'rgba(0,0,0,0.25)',
        justifyContent: 'center',
        padding: 24,
    },
    assigneeModalCard: {
        backgroundColor: theme.colors.surface,
        borderRadius: 16,
        borderWidth: 1,
        borderColor: theme.colors.separator,
        padding: 16,
        maxHeight: '70%'
    },
    assigneeModalTitle: {
        fontSize: 14,
        fontWeight: '800',
        color: theme.colors.text.primary,
        marginBottom: 10,
    },
    assigneeList: {
        gap: 8,
    },
    assigneeListItem: {
        paddingVertical: 10,
        paddingHorizontal: 12,
        borderRadius: 12,
        backgroundColor: theme.colors.surfaceMuted,
        borderWidth: 1,
        borderColor: theme.colors.separator,
    },
    assigneeListItemActive: {
        backgroundColor: theme.colors.accentSoft,
        borderColor: theme.colors.accent,
    },
    assigneeListText: {
        fontSize: 13,
        fontWeight: '700',
        color: theme.colors.text.secondary,
    },
    assigneeListTextActive: {
        color: theme.colors.accent,
    },
    teamRow: {
        paddingHorizontal: 20,
        gap: 15,
    },
    memberAvatar: {
        alignItems: 'center',
        gap: 6,
    },
    memberAvatarActive: {
        // ...
    },
    allMembersCircle: {
        width: 48,
        height: 48,
        borderRadius: 24,
        backgroundColor: theme.colors.surfaceMuted,
        borderWidth: 2,
        borderColor: theme.colors.accent,
        alignItems: 'center',
        justifyContent: 'center',
    },
    avatarImg: {
        width: 48,
        height: 48,
        borderRadius: 24,
        borderWidth: 2,
        borderColor: 'transparent',
    },
    avatarFallback: {
        width: 48,
        height: 48,
        borderRadius: 24,
        backgroundColor: theme.colors.separator,
        alignItems: 'center',
        justifyContent: 'center',
    },
    avatarLetter: {
        fontSize: 18,
        fontWeight: 'bold',
        color: theme.isDark ? theme.colors.text.secondary : theme.colors.text.muted,
    },
    memberName: {
        fontSize: 10,
        fontWeight: '600',
        color: theme.isDark ? theme.colors.text.secondary : theme.colors.text.muted,
    },
    sectionContainer: {
        marginBottom: 20,
    },
    sectionHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginHorizontal: 16,
        paddingHorizontal: 14,
        paddingVertical: 10,
        backgroundColor: theme.colors.surface,
        borderRadius: 16,
        borderWidth: 1,
        borderColor: theme.colors.separator,
    },
    sectionHeaderRight: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
    },
    timelineFilterRow: {
        flexDirection: 'row',
        gap: 8,
        paddingHorizontal: 16,
        marginTop: 8,
        marginBottom: 6,
    },
    timelineChip: {
        paddingHorizontal: 10,
        paddingVertical: 6,
        borderRadius: 12,
        backgroundColor: theme.isDark ? theme.colors.surfaceMuted : theme.colors.surface,
        borderWidth: 1,
        borderColor: theme.colors.separator,
    },
    timelineChipActive: {
        backgroundColor: theme.colors.accent,
        borderColor: theme.colors.accent,
    },
    timelineChipText: {
        fontSize: 11,
        fontWeight: '700',
        color: theme.isDark ? theme.colors.text.secondary : theme.colors.text.muted,
    },
    timelineChipTextActive: {
        color: theme.colors.white,
    },
    sectionTitleRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
    },
    sectionTitleText: {
        fontSize: 11,
        fontWeight: '700',
        color: theme.colors.text.muted,
        textTransform: 'uppercase',
        letterSpacing: 0.5,
    },
    sectionBadge: {
        backgroundColor: theme.colors.surfaceMuted,
        paddingHorizontal: 8,
        paddingVertical: 2,
        borderRadius: 10,
        borderWidth: 1,
        borderColor: theme.colors.separator,
    },
    sectionBadgeText: {
        fontSize: 10,
        fontWeight: '700',
        color: theme.colors.text.muted,
    },
    sectionHint: {
        fontSize: 12,
        fontWeight: '700',
        color: theme.colors.text.muted,
        textTransform: 'uppercase',
    },
    listContent: {
        paddingBottom: 40,
    },
    modalOverlay: {
        flex: 1,
        backgroundColor: theme.colors.overlay,
        justifyContent: 'center',
        alignItems: 'center',
        padding: 20,
    },
    calendarModal: {
        width: '100%',
        backgroundColor: theme.colors.surface,
        borderRadius: 20,
        padding: 18,
        borderWidth: 1,
        borderColor: theme.colors.separator,
    },
    modalHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 20,
    },
    modalHeaderTitle: {
        fontSize: 16,
        fontWeight: '800',
        color: theme.colors.text.primary,
        textTransform: 'capitalize',
    },
    monthGrid: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        justifyContent: 'flex-start',
    },
    gridDay: {
        width: '14.28%',
        height: 45,
        alignItems: 'center',
        justifyContent: 'center',
    },
    gridDayInner: {
        width: 36,
        height: 36,
        borderRadius: 18,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: theme.colors.surfaceMuted,
    },
    gridDayActive: {
        backgroundColor: theme.colors.accent,
    },
    gridDayText: {
        fontSize: 14,
        fontWeight: '600',
        color: theme.colors.text.secondary,
    },
    gridDayTextActive: {
        color: theme.colors.white,
    },
    gridDot: {
        width: 4,
        height: 4,
        borderRadius: 2,
        backgroundColor: theme.colors.accent,
        position: 'absolute',
        bottom: 5,
    },
    closeModalBtn: {
        marginTop: 20,
        backgroundColor: theme.colors.surfaceMuted,
        paddingVertical: 12,
        borderRadius: 12,
        alignItems: 'center',
    },
    closeModalBtnText: {
        fontSize: 16,
        fontWeight: '700',
        color: theme.colors.accent,
    },
    emptyContainer: {
        alignItems: 'center',
        justifyContent: 'center',
        marginTop: 60,
        paddingHorizontal: 40,
    },
    emptyText: {
        marginTop: 16,
        fontSize: 16,
        color: theme.colors.text.secondary,
        fontWeight: '700',
    },
    emptySubtext: {
        marginTop: 6,
        fontSize: 13,
        color: theme.colors.text.muted,
        textAlign: 'center',
    },
    emptyActions: {
        flexDirection: 'row',
        gap: 10,
        marginTop: 14,
    },
    emptyPrimaryBtn: {
        paddingHorizontal: 16,
        paddingVertical: 10,
        borderRadius: 12,
        backgroundColor: theme.colors.primary,
    },
    emptyPrimaryText: {
        color: theme.colors.white,
        fontWeight: '700',
        fontSize: 13,
    },
    emptySecondaryBtn: {
        paddingHorizontal: 16,
        paddingVertical: 10,
        borderRadius: 12,
        backgroundColor: theme.colors.surfaceMuted,
        borderWidth: 1,
        borderColor: theme.colors.separator,
    },
    emptySecondaryText: {
        color: theme.colors.text.secondary,
        fontWeight: '700',
        fontSize: 13,
    },
    gridDayHeader: {
        width: '14.28%',
        alignItems: 'center',
        paddingVertical: 10,
    },
    gridDayHeaderText: {
        fontSize: 12,
        fontWeight: '700',
        color: theme.colors.text.muted,
    },
    gridDayEmpty: {
        width: '14.28%',
        height: 45,
    },
});
