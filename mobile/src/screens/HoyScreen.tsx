import React, { useEffect, useState, useMemo } from 'react';
import { View, Text, FlatList, TouchableOpacity, ActivityIndicator, StyleSheet, Modal, SafeAreaView, ScrollView, Platform, Alert, Linking, Dimensions } from 'react-native';
import { useCommitments, useMarkCommitmentDone, useDeleteCommitment } from '../api/queries';
import { useNavigation, useIsFocused } from '@react-navigation/native';
import { scheduleCommitmentReminder, cancelCommitmentReminder } from '../lib/notifications';
import * as Calendar from 'expo-calendar';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { apiClient } from '../api/client';
import { format, addDays, startOfWeek, isSameDay, getYear, getMonth, startOfMonth, endOfMonth, isToday } from 'date-fns';
import { es } from 'date-fns/locale/es';
import { useQueryClient } from '@tanstack/react-query';
import { normalizeCommitmentStatus } from '../utils/commitmentStatus';

const SCREEN_WIDTH = Dimensions.get('window').width;
type ViewMode = 'year' | 'month' | 'agenda';

export default function HoyScreen() {
    const { data: commitments, isLoading } = useCommitments('accepted');
    const { mutate: markDone } = useMarkCommitmentDone();
    const { mutate: deleteCommitment } = useDeleteCommitment();
    const navigation = useNavigation<any>();
    const queryClient = useQueryClient();

    const [calendars, setCalendars] = useState<Calendar.Calendar[]>([]);
    const [cloudAccounts, setCloudAccounts] = useState<any[]>([]);
    const [isCalendarModalVisible, setIsCalendarModalVisible] = useState(false);
    const [selectedCommitment, setSelectedCommitment] = useState<any>(null);
    const [isLoadingCalendars, setIsLoadingCalendars] = useState(false);

    // UI states
    const [viewMode, setViewMode] = useState<ViewMode>('agenda');
    const [selectedDate, setSelectedDate] = useState(new Date());
    const [displayYear, setDisplayYear] = useState(getYear(new Date()));
    const [displayMonth, setDisplayMonth] = useState(getMonth(new Date())); // 0-11

    const isFocused = useIsFocused();

    useEffect(() => {
        if (commitments && commitments.length > 0) {
            commitments.forEach((c: any) => {
                if (normalizeCommitmentStatus(c.status) === 'accepted' && c.due_at) {
                    scheduleCommitmentReminder(c);
                }
            });
        }
    }, [commitments]);

    useEffect(() => {
        fetchCloudAccounts();
    }, [isFocused]);

    const fetchCloudAccounts = async () => {
        try {
            const data = await apiClient.get('/calendar/accounts');
            setCloudAccounts(data);
        } catch (e) {
            console.error('[Hoy] Fetch Cloud Accounts Error:', e);
        }
    };

    const handleMarkDone = (id: string) => {
        markDone(id);
        cancelCommitmentReminder(id);
    };

    const handleDelete = (id: string, title: string) => {
        Alert.alert(
            'Eliminar Compromiso',
            `¿Seguro que quieres eliminar "${title}"?\nEsto también lo borrará de tu calendario en la nube si está habilitada la sincronización.`,
            [
                { text: 'Cancelar', style: 'cancel' },
                {
                    text: 'Eliminar',
                    style: 'destructive',
                    onPress: () => {
                        deleteCommitment(id);
                        cancelCommitmentReminder(id);
                    }
                }
            ]
        );
    };

    const handleCalendarPress = async (item: any) => {
        const { status } = await Calendar.requestCalendarPermissionsAsync();
        if (status !== 'granted') {
            Alert.alert('Ping', 'Necesitamos permisos para acceder a tu calendario.');
            return;
        }

        setIsLoadingCalendars(true);
        setSelectedCommitment(item);
        setIsCalendarModalVisible(true);
        fetchCloudAccounts();

        try {
            const allCalendars = await Calendar.getCalendarsAsync(Calendar.EntityTypes.EVENT);
            const writableCalendars = allCalendars.filter(cal => cal.allowsModifications);
            const stored = await AsyncStorage.getItem('ping_hidden_calendars');
            const hiddenIds: string[] = stored ? JSON.parse(stored) : [];
            const visibleCalendars = writableCalendars.filter(cal => !hiddenIds.includes(cal.id));

            setCalendars(visibleCalendars);
        } catch (e) {
            console.error(e);
            Alert.alert('Ping', 'No se pudieron cargar los calendarios.');
        } finally {
            setIsLoadingCalendars(false);
        }
    };

    const confirmAddToCalendar = async (calendarId: string, calendarTitle: string) => {
        if (!selectedCommitment) return;

        const startDate = new Date(selectedCommitment.due_at);
        const endDate = new Date(startDate.getTime() + 60 * 60 * 1000);

        try {
            await Calendar.createEventAsync(calendarId, {
                title: `Ping: ${selectedCommitment.title}`,
                startDate,
                endDate,
                notes: `Compromiso detectado por Ping.`,
                timeZone: 'GMT',
            });

            setIsCalendarModalVisible(false);
            Alert.alert('Ping', `✅ Agregado a tu calendario local: "${calendarTitle}"`);
        } catch (e) {
            console.error(e);
            Alert.alert('Ping', 'Hubo un error al agregar el evento local.');
        }
    };

    const handleCloudSync = async (provider: string, email: string) => {
        if (!selectedCommitment) return;
        setIsLoadingCalendars(true);
        try {
            await apiClient.post('/calendar/sync', {
                commitmentId: selectedCommitment.id,
                provider
            });
            setIsCalendarModalVisible(false);
            Alert.alert('Ping', `✅ Sincronizado directamente con tu ${provider === 'google' ? 'Google' : 'Outlook'} Calendar (${email})`);
            queryClient.invalidateQueries({ queryKey: ['commitments'] });
        } catch (e: any) {
            Alert.alert('Error Cloud Sync', e.message);
        } finally {
            setIsLoadingCalendars(false);
        }
    };

    const handleOpenExternalCalendar = async (url: string) => {
        if (!url) {
            Alert.alert('Ping', 'El enlace directo al evento no está disponible.\nIntenta sincronizar nuevamente.');
            return;
        }

        try {
            const supported = await Linking.canOpenURL(url);
            if (supported) {
                await Linking.openURL(url);
            } else {
                Alert.alert('Ping', `No sabemos cómo abrir este enlace en tu dispositivo.`);
            }
        } catch (err) {
            console.error('Failed to open URL:', err);
            Alert.alert('Ping', 'No se pudo abrir la aplicación de calendario externa.');
        }
    };

    const hasCommitmentsOnDate = (date: Date) => {
        if (!commitments) return false;
        return commitments.some((c: any) => c.due_at && isSameDay(new Date(c.due_at), date));
    };

    // --- Sub-components logic ---
    const MiniMonthGrid = ({ date }: { date: Date }) => {
        const start = startOfWeek(startOfMonth(date), { weekStartsOn: 1 });
        const end = endOfMonth(date);
        const days = [];
        let cur = start;
        while (cur <= end || days.length % 7 !== 0) {
            days.push(cur);
            cur = addDays(cur, 1);
        }

        return (
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', width: '100%', marginTop: 4 }}>
                {days.map((d, i) => {
                    const isCurrentMonth = getMonth(d) === getMonth(date);
                    return (
                        <View key={i} style={{ width: '14.28%', aspectRatio: 1, alignItems: 'center', justifyContent: 'center' }}>
                            <Text style={{ fontSize: 7, color: isCurrentMonth ? '#111827' : 'transparent', fontWeight: '500' }}>
                                {format(d, 'd')}
                            </Text>
                        </View>
                    );
                })}
            </View>
        );
    };

    const renderYearView = () => {
        const months = Array.from({ length: 12 }).map((_, i) => i);
        return (
            <ScrollView contentContainerStyle={{ padding: 20, paddingTop: 60, paddingBottom: 100 }} showsVerticalScrollIndicator={false}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20, paddingHorizontal: 10 }}>
                    <TouchableOpacity onPress={() => setDisplayYear(y => y - 1)}>
                        <Ionicons name="chevron-back" size={28} color="#0a84ff" />
                    </TouchableOpacity>
                    <Text style={[styles.largeRedTitle, { marginBottom: 0 }]}>{displayYear}</Text>
                    <TouchableOpacity onPress={() => setDisplayYear(y => y + 1)}>
                        <Ionicons name="chevron-forward" size={28} color="#0a84ff" />
                    </TouchableOpacity>
                </View>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', marginTop: 10 }}>
                    {months.map(m => {
                        const monthDate = new Date(displayYear, m, 1);
                        return (
                            <TouchableOpacity
                                key={m}
                                style={{ width: (SCREEN_WIDTH - 60) / 3, marginBottom: 24 }}
                                onPress={() => { setDisplayMonth(m); setViewMode('month'); }}
                            >
                                <Text style={styles.miniMonthTitle}>{format(monthDate, 'MMM.', { locale: es }).replace(/^\w/, c => c.toUpperCase())}</Text>
                                <MiniMonthGrid date={monthDate} />
                            </TouchableOpacity>
                        );
                    })}
                </View>
            </ScrollView>
        );
    };

    const renderMonthView = () => {
        const monthDate = new Date(displayYear, displayMonth, 1);
        const start = startOfWeek(startOfMonth(monthDate), { weekStartsOn: 1 });
        const end = endOfMonth(monthDate);
        const days = [];
        let cur = start;
        while (cur <= end || days.length % 7 !== 0) {
            days.push(cur);
            cur = addDays(cur, 1);
        }

        return (
            <ScrollView contentContainerStyle={{ paddingTop: 50, paddingBottom: 100 }} showsVerticalScrollIndicator={false}>
                <View style={styles.monthHeaderRow}>
                    <TouchableOpacity onPress={() => setViewMode('year')} style={styles.backBtn}>
                        <Ionicons name="chevron-back" size={26} color="#0a84ff" />
                        <Text style={styles.backBtnText}>{displayYear}</Text>
                    </TouchableOpacity>
                </View>
                <Text style={styles.hugeMonthTitle}>{format(monthDate, 'MMMM', { locale: es }).replace(/^\w/, c => c.toUpperCase())}</Text>

                <View style={styles.weekDaysHeader}>
                    {['L', 'M', 'M', 'J', 'V', 'S', 'D'].map((d, i) => (
                        <Text key={i} style={styles.weekDayText}>{d}</Text>
                    ))}
                </View>
                <View style={styles.gridDivider} />

                <View style={styles.daysGrid}>
                    {days.map((d, i) => {
                        const isCurrentMonth = getMonth(d) === displayMonth;
                        const hasEvent = hasCommitmentsOnDate(d);
                        const isSel = isSameDay(d, selectedDate);
                        const today = isToday(d);

                        return (
                            <TouchableOpacity
                                key={i}
                                style={styles.dayCell}
                                onPress={() => {
                                    setSelectedDate(d);
                                    if (!isCurrentMonth) {
                                        setDisplayMonth(getMonth(d));
                                        setDisplayYear(getYear(d));
                                    }
                                    setViewMode('agenda');
                                }}
                            >
                                <View style={[styles.dayCircle, isSel && styles.dayCircleSelected, today && !isSel && styles.dayCircleToday]}>
                                    <Text style={[styles.dayCellText, !isCurrentMonth && { opacity: 0.3 }, isSel && { color: 'white' }, today && !isSel && { color: '#0a84ff' }]}>
                                        {format(d, 'd')}
                                    </Text>
                                </View>
                                {hasEvent && <View style={[styles.eventDot, isSel && { backgroundColor: '#0a84ff' }]} />}
                            </TouchableOpacity>
                        );
                    })}
                </View>
            </ScrollView>
        );
    };

    const renderAgendaView = () => {
        const weekStart = startOfWeek(selectedDate, { weekStartsOn: 1 });
        const weekDays = Array.from({ length: 7 }).map((_, i) => addDays(weekStart, i));

        const filteredCommitments = commitments?.filter((c: any) => {
            if (!c.due_at) return false;
            return isSameDay(new Date(c.due_at), selectedDate);
        }).sort((a: any, b: any) => new Date(a.due_at).getTime() - new Date(b.due_at).getTime()) || [];

        return (
            <View style={{ flex: 1, backgroundColor: 'white' }}>
                <View style={styles.agendaHeader}>
                    <TouchableOpacity onPress={() => setViewMode('month')} style={styles.backBtn}>
                        <Ionicons name="chevron-back" size={26} color="#0a84ff" />
                        <Text style={styles.backBtnText}>{format(new Date(displayYear, displayMonth, 1), 'MMM', { locale: es }).replace(/^\w/, c => c.toUpperCase())}</Text>
                    </TouchableOpacity>
                    <View style={{ flexDirection: 'row', gap: 16 }}>
                        <TouchableOpacity onPress={() => { setViewMode('agenda'); setSelectedDate(new Date()); setDisplayMonth(getMonth(new Date())); setDisplayYear(getYear(new Date())); }}>
                            <Ionicons name="today-outline" size={24} color="#0a84ff" />
                        </TouchableOpacity>
                    </View>
                </View>
                <View style={styles.agendaTopSection}>
                    <Text style={styles.monthLabel}>
                        {format(selectedDate, 'MMMM yyyy', { locale: es }).replace(/^\w/, c => c.toUpperCase())}
                    </Text>

                    <View style={styles.weekContainer}>
                        {weekDays.map((day, idx) => {
                            const isSelected = isSameDay(day, selectedDate);
                            const isTodayDay = isSameDay(day, new Date());
                            return (
                                <TouchableOpacity
                                    key={idx}
                                    style={[styles.dayCard, isSelected && styles.dayCardSelected, isTodayDay && !isSelected && { backgroundColor: 'transparent' }]}
                                    onPress={() => setSelectedDate(day)}
                                >
                                    <View style={[styles.dayNameCircle, isSelected && styles.dayCardSelected]}>
                                        <Text style={[styles.dayName, isSelected && styles.dayNameSelected]}>
                                            {format(day, 'EEE', { locale: es }).substring(0, 1).toUpperCase()}
                                        </Text>
                                    </View>
                                    <Text style={[styles.dayNumber, isSelected && styles.dayNumberSelected, isTodayDay && !isSelected && styles.dayNumberToday]}>
                                        {format(day, 'd')}
                                    </Text>
                                    {hasCommitmentsOnDate(day) && !isSelected && <View style={[styles.eventDot, { marginTop: 4, width: 4, height: 4, opacity: 0.5 }]} />}
                                </TouchableOpacity>
                            );
                        })}
                    </View>
                </View>

                {isLoading ? (
                    <ActivityIndicator size="large" color="#0a84ff" style={{ marginTop: 40 }} />
                ) : filteredCommitments.length === 0 ? (
                    <View style={styles.emptyContainer}>
                        <Ionicons name="calendar-clear-outline" size={64} color="#f3f4f6" />
                        <Text style={styles.emptyText}>Día libre, no hay eventos.</Text>
                    </View>
                ) : (
                    <FlatList
                        data={filteredCommitments}
                        keyExtractor={c => c.id}
                        renderItem={renderEventCard}
                        showsVerticalScrollIndicator={false}
                        contentContainerStyle={styles.agendaList}
                    />
                )}
            </View>
        );
    };

    const renderEventCard = ({ item }: { item: any }) => {
        const timeString = item.due_at ? format(new Date(item.due_at), 'HH:mm') : '--:--';
        const isConflict = item.meta?.conflict_detected;
        const isSynced = !!item.meta?.synced_to;

        return (
            <View style={styles.agendaRow}>
                <View style={styles.timeColumn}>
                    <Text style={styles.timeText}>{timeString}</Text>
                    <View style={styles.timeLine} />
                </View>

                <View style={[styles.eventCard, isConflict && styles.eventCardConflict]}>
                    <View style={styles.eventHeader}>
                        <Text style={[styles.eventTitle, isConflict && { color: '#92400e' }]}>
                            {item.title}
                        </Text>
                        <View style={{ flexDirection: 'row', gap: 12, alignItems: 'center' }}>
                            <TouchableOpacity style={styles.actionBtn} onPress={() => handleDelete(item.id, item.title)}>
                                <Ionicons name="trash-outline" size={24} color="#ef4444" />
                            </TouchableOpacity>
                            <TouchableOpacity style={styles.actionBtn} onPress={() => handleMarkDone(item.id)}>
                                <Ionicons name="checkmark-circle-outline" size={26} color="#0a84ff" />
                            </TouchableOpacity>
                        </View>
                    </View>

                    {isSynced ? (
                        item.meta.external_event_url ? (
                            <TouchableOpacity
                                style={[styles.syncBtn, isConflict && styles.syncBtnConflict, { backgroundColor: '#0a84ff' }]}
                                onPress={() => handleOpenExternalCalendar(item.meta.external_event_url)}
                            >
                                <Ionicons
                                    name={item.meta.synced_to === 'google' ? "logo-google" : "logo-microsoft"}
                                    size={16}
                                    color="white"
                                />
                                <Text style={styles.syncBtnText}>
                                    {isConflict ? `Ver Conflicto en ${item.meta.synced_to === 'google' ? 'Google' : 'Outlook'}` : `Abrir en ${item.meta.synced_to === 'google' ? 'Google' : 'Outlook'}`}
                                </Text>
                            </TouchableOpacity>
                        ) : (
                            <TouchableOpacity
                                style={[styles.syncBtn, isConflict && styles.syncBtnConflict, { backgroundColor: '#0a84ff' }]}
                                onPress={() => { setSelectedCommitment(item); setIsCalendarModalVisible(true); fetchCloudAccounts(); }}
                            >
                                <Ionicons name="refresh" size={16} color="white" />
                                <Text style={styles.syncBtnText}>Volver a Sincronizar</Text>
                            </TouchableOpacity>
                        )
                    ) : (
                        <TouchableOpacity style={styles.localSyncBtn} onPress={() => handleCalendarPress(item)}>
                            <Ionicons name="calendar-outline" size={14} color="#6b7280" />
                            <Text style={styles.localSyncText}>Agendar en Calendario</Text>
                        </TouchableOpacity>
                    )}

                    {item.message_id && (
                        <TouchableOpacity
                            style={styles.chatLinkBtn}
                            onPress={() => {
                                const conversationId = item.message?.conversation_id || item.conversation_id;
                                navigation.navigate('Chats', {
                                    screen: 'Chat',
                                    params: {
                                        conversationId: conversationId,
                                        isSelf: !conversationId,
                                        scrollToMessageId: item.message_id
                                    }
                                });
                            }}
                        >
                            <Ionicons name="chatbubble-ellipses-outline" size={14} color="#3b82f6" />
                            <Text style={styles.chatLinkText}>Ver contexto de la conversación</Text>
                        </TouchableOpacity>
                    )}
                </View>
            </View>
        );
    };

    return (
        <View style={styles.container}>
            {viewMode === 'year' && renderYearView()}
            {viewMode === 'month' && renderMonthView()}
            {viewMode === 'agenda' && renderAgendaView()}

            <Modal visible={isCalendarModalVisible} transparent animationType="slide">
                <View style={styles.modalOverlay}>
                    <SafeAreaView style={styles.modalContent}>
                        <View style={styles.modalHeader}>
                            <Text style={styles.modalTitle}>Sincronizar Evento</Text>
                            <TouchableOpacity onPress={() => setIsCalendarModalVisible(false)}>
                                <Ionicons name="close" size={24} color="#6b7280" />
                            </TouchableOpacity>
                        </View>

                        {isLoadingCalendars ? (
                            <ActivityIndicator size="large" color="#0a84ff" style={{ margin: 40 }} />
                        ) : (
                            <ScrollView style={{ flex: 1 }} showsVerticalScrollIndicator={false}>
                                {cloudAccounts.length > 0 && (
                                    <View style={styles.cloudSection}>
                                        <Text style={styles.sectionLabel}>Cuentas en la Nube (Recomendado)</Text>
                                        {cloudAccounts.map((acc, index) => (
                                            <TouchableOpacity
                                                key={acc.id || index}
                                                style={styles.calendarItem}
                                                onPress={() => handleCloudSync(acc.provider, acc.email)}
                                            >
                                                <Ionicons
                                                    name={acc.provider === 'google' ? "logo-google" : "logo-microsoft"}
                                                    size={18}
                                                    color={acc.provider === 'google' ? "#ea4335" : "#00a4ef"}
                                                />
                                                <View style={styles.calendarInfo}>
                                                    <Text style={styles.calendarName}>{acc.email}</Text>
                                                    <Text style={styles.calendarSource}>Sincronización Directa API</Text>
                                                </View>
                                                <Ionicons name="cloud-upload-outline" size={20} color="#8b5cf6" />
                                            </TouchableOpacity>
                                        ))}
                                    </View>
                                )}

                                <View style={styles.localSection}>
                                    <Text style={[styles.sectionLabel, { marginTop: cloudAccounts.length > 0 ? 10 : 0 }]}>
                                        Calendarios del Dispositivo
                                    </Text>
                                    {calendars.length === 0 ? (
                                        <View style={{ padding: 20, alignItems: 'center' }}>
                                            <Text style={{ color: '#9ca3af' }}>No se encontraron calendarios locales con permisos de escritura.</Text>
                                        </View>
                                    ) : (
                                        calendars.map(item => (
                                            <TouchableOpacity
                                                key={item.id}
                                                style={styles.calendarItem}
                                                onPress={() => confirmAddToCalendar(item.id, item.title)}
                                            >
                                                <View style={[styles.calendarColor, { backgroundColor: item.color }]} />
                                                <View style={styles.calendarInfo}>
                                                    <Text style={styles.calendarName}>{item.title}</Text>
                                                    <Text style={styles.calendarSource}>{item.source?.name || 'Local'}</Text>
                                                </View>
                                                <Ionicons name="chevron-forward" size={20} color="#9ca3af" />
                                            </TouchableOpacity>
                                        ))
                                    )}
                                </View>
                            </ScrollView>
                        )}
                    </SafeAreaView>
                </View>
            </Modal>
        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: 'white' },

    // iOS Calendar Text & Headers
    largeRedTitle: { fontSize: 34, fontWeight: '800', color: '#0a84ff', marginBottom: 20 },
    hugeMonthTitle: { fontSize: 34, fontWeight: '800', color: '#111827', paddingHorizontal: 20, marginTop: 10, marginBottom: 16 },
    miniMonthTitle: { fontSize: 16, fontWeight: '600', color: '#0a84ff', marginBottom: 4 },
    backBtn: { flexDirection: 'row', alignItems: 'center' },
    backBtnText: { fontSize: 17, color: '#0a84ff', marginLeft: -4 },
    monthHeaderRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 10 },

    // Month Grid
    weekDaysHeader: { flexDirection: 'row', paddingHorizontal: 10, marginBottom: 8 },
    weekDayText: { flex: 1, textAlign: 'center', fontSize: 12, fontWeight: '600', color: '#9ca3af' },
    gridDivider: { height: StyleSheet.hairlineWidth, backgroundColor: '#e5e7eb', marginHorizontal: 10, marginBottom: 10 },
    daysGrid: { flexDirection: 'row', flexWrap: 'wrap', paddingHorizontal: 10 },
    dayCell: { width: '14.28%', aspectRatio: 1, alignItems: 'center', justifyContent: 'center', height: 50 },
    dayCircle: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', backgroundColor: 'transparent' },
    dayCircleSelected: { backgroundColor: '#0a84ff' },
    dayCircleToday: { backgroundColor: 'transparent' },
    dayCellText: { fontSize: 20, color: '#111827', fontWeight: '400' },
    eventDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: '#d1d5db', position: 'absolute', bottom: 2 },

    // Agenda Header
    agendaHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingTop: 50, paddingHorizontal: 10, paddingBottom: 10 },
    agendaTopSection: { backgroundColor: '#f9fafb', paddingBottom: 16, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#e5e7eb' },
    monthLabel: { fontSize: 20, fontWeight: '700', paddingHorizontal: 20, marginTop: 10, marginBottom: 14, color: '#111827' },
    weekContainer: { flexDirection: 'row', justifyContent: 'space-evenly', paddingHorizontal: 10 },
    dayCard: { alignItems: 'center', justifyContent: 'center', paddingVertical: 8, width: 44, borderRadius: 22 },
    dayCardSelected: { backgroundColor: 'transparent' },
    dayNameCircle: { marginBottom: 4, width: 24, height: 24, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
    dayName: { fontSize: 11, fontWeight: '600', color: '#6b7280' },
    dayNameSelected: { color: 'white' },
    dayNumber: { fontSize: 20, fontWeight: '400', color: '#111827' },
    dayNumberSelected: { color: '#0a84ff', fontWeight: '600' },
    dayNumberToday: { color: '#0a84ff' },

    // Agenda List
    agendaList: { padding: 20, paddingTop: 16, paddingBottom: 100 },
    emptyContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', marginTop: 80 },
    emptyText: { color: '#9ca3af', fontSize: 16, marginTop: 16, fontWeight: '500' },

    agendaRow: { flexDirection: 'row', marginBottom: 20 },
    timeColumn: { width: 50, alignItems: 'flex-end', marginRight: 15, paddingRight: 5 },
    timeText: { fontSize: 12, fontWeight: '600', color: '#6b7280', marginTop: 2 },
    timeLine: { width: 2, height: '100%', backgroundColor: '#e5e7eb', marginTop: 16, marginRight: 14 },

    eventCard: { flex: 1, backgroundColor: '#f3f4f6', borderRadius: 12, padding: 14 },
    eventCardConflict: { backgroundColor: '#fffbeb', borderColor: '#fef3c7', borderWidth: 1 },
    eventHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 },
    eventTitle: { fontSize: 15, fontWeight: '600', color: '#111827', flex: 1, marginRight: 12, lineHeight: 22 },
    actionBtn: { width: 28, height: 28, alignItems: 'center', justifyContent: 'center' },

    syncBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', backgroundColor: '#0a84ff', paddingVertical: 10, borderRadius: 8, gap: 8, marginBottom: 10 },
    syncBtnConflict: { backgroundColor: '#f59e0b' },
    syncBtnText: { color: 'white', fontSize: 13, fontWeight: '700' },

    localSyncBtn: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#e5e7eb', paddingVertical: 8, paddingHorizontal: 12, borderRadius: 6, alignSelf: 'flex-start', marginBottom: 10 },
    localSyncText: { fontSize: 12, fontWeight: '600', color: '#4b5563', marginLeft: 6 },

    chatLinkBtn: { flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-start' },
    chatLinkText: { color: '#0a84ff', fontSize: 12, fontWeight: '600', marginLeft: 4 },

    // Modal Styles
    modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
    modalContent: { backgroundColor: 'white', borderTopLeftRadius: 24, borderTopRightRadius: 24, height: '70%', width: '100%' },
    modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 20, borderBottomWidth: 1, borderBottomColor: '#f3f4f6' },
    modalTitle: { fontSize: 18, fontWeight: 'bold', color: '#111827' },
    calendarItem: { flexDirection: 'row', alignItems: 'center', padding: 16, borderBottomWidth: 1, borderBottomColor: '#f3f4f6' },
    calendarColor: { width: 12, height: 12, borderRadius: 6, marginRight: 12 },
    calendarInfo: { flex: 1 },
    calendarName: { fontSize: 16, fontWeight: '600', color: '#111827' },
    calendarSource: { fontSize: 12, color: '#6b7280', marginTop: 2 },
    sectionLabel: { fontSize: 13, fontWeight: '700', color: '#0a84ff', paddingHorizontal: 20, paddingVertical: 10, backgroundColor: '#e0f2fe', textTransform: 'uppercase', letterSpacing: 0.5 },
    cloudSection: { borderBottomWidth: 1, borderBottomColor: '#f3f4f6' },
    localSection: { paddingBottom: 40 },
});
