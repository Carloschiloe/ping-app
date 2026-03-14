import React, { useState, useMemo, useCallback } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, SafeAreaView, StatusBar, ScrollView, Image, Alert, Modal, RefreshControl } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';
import { format, addDays, isSameDay, startOfDay } from 'date-fns';
import { es } from 'date-fns/locale';
import { apiClient } from '../api/client';
import GroupTaskCard from '../components/GroupTaskCard';
import { useAuth } from '../context/AuthContext';
import { isRedDay } from '../utils/holidays';

type FilterType = 'todo' | 'delegated';
type StatusFilter = 'all' | 'proposed' | 'accepted' | 'rejected' | 'done';

export default function TaskDashboardScreen() {
    const { user } = useAuth();
    const [filterType, setFilterType] = useState<FilterType>('todo');
    const [selectedDate, setSelectedDate] = useState<Date>(startOfDay(new Date()));
    const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
    const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
    const [isCalendarVisible, setIsCalendarVisible] = useState(false);

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
                if (statusFilter === 'proposed' && c.status !== 'proposed') return false;
                if (statusFilter === 'accepted' && (c.status !== 'accepted' && c.status !== 'pending' && c.status !== 'in_progress')) return false;
                if (statusFilter === 'rejected' && c.status !== 'rejected') return false;
                if (statusFilter === 'done' && c.status !== 'completed') return false;
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
                    redDay && !isSelected && { color: '#ef4444' }
                ]}>{dayName}</Text>
                <Text style={[
                    styles.dateNum,
                    isSelected && styles.dateTextActive,
                    redDay && !isSelected && { color: '#ef4444' }
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
            <Ionicons name={icon} size={14} color={statusFilter === value ? 'white' : '#6b7280'} />
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
                                <Ionicons name="chevron-back" size={24} color="#6366f1" />
                            </TouchableOpacity>
                            <Text style={styles.modalHeaderTitle}>
                                {format(viewDate, 'MMMM yyyy', { locale: es })}
                            </Text>
                            <TouchableOpacity onPress={() => setViewDate(addDays(monthStart, 32))}>
                                <Ionicons name="chevron-forward" size={24} color="#6366f1" />
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
                                                redDay && !isSelected && { color: '#ef4444', fontWeight: 'bold' }
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
            <StatusBar barStyle="dark-content" />
            <MonthPickerModal />

            <View style={styles.header}>
                <View style={styles.headerTop}>
                    <Text style={styles.headerTitle}>Tareas</Text>
                    <TouchableOpacity style={styles.calendarBtn} onPress={() => setIsCalendarVisible(true)}>
                        <Ionicons name="calendar-outline" size={24} color="#6366f1" />
                    </TouchableOpacity>
                </View>

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

            <View style={styles.filtersContainer}>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipsRow}>
                    <StatusChip label="Todas" value="all" icon="layers-outline" />
                    <StatusChip label="Nuevas" value="proposed" icon="mail-unread-outline" />
                    <StatusChip label="Activas" value="accepted" icon="flash-outline" />
                    <StatusChip label="Completas" value="done" icon="checkmark-circle-outline" />
                    <StatusChip label="Rechazadas" value="rejected" icon="close-circle-outline" />
                </ScrollView>
            </View>

            {teamMembers.length > 0 && (
                <View style={styles.teamContainer}>
                    <View style={{ paddingHorizontal: 20, marginBottom: 8 }}>
                        <Text style={{ fontSize: 12, fontWeight: '700', color: '#94a3b8', textTransform: 'uppercase' }}>
                            {filterType === 'todo' ? 'Filtrar por quien asignó:' : 'Filtrar por responsable:'}
                        </Text>
                    </View>
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.teamRow}>
                        <TouchableOpacity
                            style={[styles.memberAvatar, !selectedUserId && styles.memberAvatarActive]}
                            onPress={() => setSelectedUserId(null)}
                        >
                            <View style={styles.allMembersCircle}>
                                <Ionicons name="people" size={20} color={!selectedUserId ? 'white' : '#6366f1'} />
                            </View>
                            <Text style={styles.memberName}>Todos</Text>
                        </TouchableOpacity>
                        {teamMembers.map((member: any) => (
                            <TouchableOpacity
                                key={member.id}
                                style={[styles.memberAvatar, selectedUserId === member.id && styles.memberAvatarActive]}
                                onPress={() => setSelectedUserId(member.id)}
                            >
                                {member.avatar_url ? (
                                    <Image source={{ uri: member.avatar_url }} style={styles.avatarImg} />
                                ) : (
                                    <View style={styles.avatarFallback}>
                                        <Text style={styles.avatarLetter}>{member.full_name?.[0] || '?'}</Text>
                                    </View>
                                )}
                                <Text style={styles.memberName} numberOfLines={1}>{member.full_name?.split(' ')[0]}</Text>
                            </TouchableOpacity>
                        ))}
                    </ScrollView>
                </View>
            )}

            <ScrollView 
                style={{ flex: 1 }}
                contentContainerStyle={styles.listContent}
                refreshControl={
                    <RefreshControl refreshing={isLoading} onRefresh={refetch} />
                }
            >
                {groupedData.meetings.length > 0 && (
                    <View style={styles.sectionContainer}>
                        <View style={styles.sectionHeader}>
                            <View style={styles.sectionTitleRow}>
                                <Ionicons name="calendar" size={18} color="#6366f1" />
                                <Text style={styles.sectionTitleText}>Próximas Reuniones</Text>
                            </View>
                            <View style={styles.sectionBadge}>
                                <Text style={styles.sectionBadgeText}>{groupedData.meetings.length}</Text>
                            </View>
                        </View>
                        {groupedData.meetings.map(item => (
                            <GroupTaskCard key={item.id} commitment={item} groupParticipants={teamMembers} />
                        ))}
                    </View>
                )}

                {groupedData.tasks.length > 0 && (
                    <View style={styles.sectionContainer}>
                        <View style={styles.sectionHeader}>
                            <View style={styles.sectionTitleRow}>
                                <Ionicons name="list" size={18} color="#10b981" />
                                <Text style={styles.sectionTitleText}>Tareas del Día</Text>
                            </View>
                            <View style={styles.sectionBadge}>
                                <Text style={styles.sectionBadgeText}>{groupedData.tasks.length}</Text>
                            </View>
                        </View>
                        {groupedData.tasks.map(item => (
                            <GroupTaskCard key={item.id} commitment={item} groupParticipants={teamMembers} />
                        ))}
                    </View>
                )}

                {groupedData.meetings.length === 0 && groupedData.tasks.length === 0 && (
                    <View style={styles.emptyContainer}>
                        <Ionicons name="folder-open-outline" size={64} color="#d1d5db" />
                        <Text style={styles.emptyText}>No hay tareas para este filtro</Text>
                        <Text style={styles.emptySubtext}>Cambia de día o filtro para ver más</Text>
                    </View>
                )}
            </ScrollView>
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#f8fafc',
    },
    header: {
        paddingHorizontal: 20,
        paddingTop: 10,
        backgroundColor: 'white',
    },
    headerTop: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 15,
    },
    headerTitle: {
        fontSize: 28,
        fontWeight: '900',
        color: '#0f172a',
        letterSpacing: -0.5,
    },
    calendarBtn: {
        padding: 8,
        backgroundColor: '#f1f5f9',
        borderRadius: 12,
    },
    toggleContainer: {
        flexDirection: 'row',
        backgroundColor: '#f1f5f9',
        borderRadius: 14,
        padding: 4,
        marginBottom: 15,
    },
    toggleBtn: {
        flex: 1,
        paddingVertical: 10,
        alignItems: 'center',
        borderRadius: 11,
    },
    toggleBtnActive: {
        backgroundColor: 'white',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.1,
        shadowRadius: 4,
        elevation: 2,
    },
    toggleText: {
        fontSize: 14,
        fontWeight: '600',
        color: '#64748b',
    },
    toggleTextActive: {
        color: '#6366f1',
    },
    scrollerContainer: {
        backgroundColor: 'white',
        paddingVertical: 10,
        borderBottomWidth: 1,
        borderBottomColor: '#f1f5f9',
    },
    dateScroller: {
        paddingHorizontal: 15,
        gap: 12,
    },
    dateItem: {
        width: 50,
        height: 70,
        alignItems: 'center',
        justifyContent: 'center',
        borderRadius: 15,
        backgroundColor: '#f8fafc',
    },
    dateItemActive: {
        backgroundColor: '#6366f1',
    },
    dateDay: {
        fontSize: 11,
        fontWeight: '600',
        color: '#94a3b8',
        textTransform: 'uppercase',
    },
    dateNum: {
        fontSize: 18,
        fontWeight: '800',
        color: '#1e293b',
        marginTop: 2,
    },
    dateTextActive: {
        color: 'white',
    },
    dateDot: {
        width: 4,
        height: 4,
        borderRadius: 2,
        marginTop: 4,
    },
    dateDotActive: {
        backgroundColor: 'white',
    },
    dateDotInactive: {
        backgroundColor: '#6366f1',
    },
    filtersContainer: {
        paddingVertical: 12,
    },
    chipsRow: {
        paddingHorizontal: 20,
        gap: 8,
    },
    chip: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 12,
        paddingVertical: 8,
        backgroundColor: 'white',
        borderRadius: 20,
        borderWidth: 1,
        borderColor: '#e2e8f0',
        gap: 6,
    },
    chipActive: {
        backgroundColor: '#6366f1',
        borderColor: '#6366f1',
    },
    chipText: {
        fontSize: 13,
        fontWeight: '600',
        color: '#64748b',
    },
    chipTextActive: {
        color: 'white',
    },
    teamContainer: {
        paddingBottom: 12,
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
        backgroundColor: '#f1f5f9',
        borderWidth: 2,
        borderColor: '#6366f1',
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
        backgroundColor: '#e2e8f0',
        alignItems: 'center',
        justifyContent: 'center',
    },
    avatarLetter: {
        fontSize: 18,
        fontWeight: 'bold',
        color: '#64748b',
    },
    memberName: {
        fontSize: 10,
        fontWeight: '600',
        color: '#64748b',
    },
    sectionContainer: {
        marginBottom: 20,
    },
    sectionHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingHorizontal: 20,
        paddingVertical: 12,
        backgroundColor: '#f8fafc',
    },
    sectionTitleRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
    },
    sectionTitleText: {
        fontSize: 14,
        fontWeight: '700',
        color: '#475569',
        textTransform: 'uppercase',
        letterSpacing: 0.5,
    },
    sectionBadge: {
        backgroundColor: '#e2e8f0',
        paddingHorizontal: 8,
        paddingVertical: 2,
        borderRadius: 10,
    },
    sectionBadgeText: {
        fontSize: 12,
        fontWeight: '700',
        color: '#64748b',
    },
    listContent: {
        paddingBottom: 40,
    },
    modalOverlay: {
        flex: 1,
        backgroundColor: 'rgba(0,0,0,0.5)',
        justifyContent: 'center',
        alignItems: 'center',
        padding: 20,
    },
    calendarModal: {
        width: '100%',
        backgroundColor: 'white',
        borderRadius: 24,
        padding: 20,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 10 },
        shadowOpacity: 0.2,
        shadowRadius: 20,
        elevation: 10,
    },
    modalHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 20,
    },
    modalHeaderTitle: {
        fontSize: 18,
        fontWeight: '800',
        color: '#1e293b',
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
        backgroundColor: '#f1f5f9',
    },
    gridDayActive: {
        backgroundColor: '#6366f1',
    },
    gridDayText: {
        fontSize: 14,
        fontWeight: '600',
        color: '#475569',
    },
    gridDayTextActive: {
        color: 'white',
    },
    gridDot: {
        width: 4,
        height: 4,
        borderRadius: 2,
        backgroundColor: '#6366f1',
        position: 'absolute',
        bottom: 5,
    },
    closeModalBtn: {
        marginTop: 20,
        backgroundColor: '#f1f5f9',
        paddingVertical: 12,
        borderRadius: 12,
        alignItems: 'center',
    },
    closeModalBtnText: {
        fontSize: 16,
        fontWeight: '700',
        color: '#6366f1',
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
        color: '#475569',
        fontWeight: '700',
    },
    emptySubtext: {
        marginTop: 6,
        fontSize: 13,
        color: '#94a3b8',
        textAlign: 'center',
    },
    gridDayHeader: {
        width: '14.28%',
        alignItems: 'center',
        paddingVertical: 10,
    },
    gridDayHeaderText: {
        fontSize: 12,
        fontWeight: '700',
        color: '#64748b',
    },
    gridDayEmpty: {
        width: '14.28%',
        height: 45,
    },
});
