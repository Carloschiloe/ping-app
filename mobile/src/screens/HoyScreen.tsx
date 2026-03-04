import React, { useEffect, useState, useMemo } from 'react';
import { View, Text, FlatList, TouchableOpacity, ActivityIndicator, StyleSheet, Modal, SafeAreaView, ScrollView, Platform, Alert, Linking } from 'react-native';
import { useCommitments, useMarkCommitmentDone } from '../api/queries';
import { useNavigation, useIsFocused } from '@react-navigation/native';
import { scheduleCommitmentReminder, cancelCommitmentReminder } from '../lib/notifications';
import * as Calendar from 'expo-calendar';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { apiClient } from '../api/client';
import { format, addDays, startOfWeek, isSameDay } from 'date-fns';
import { es } from 'date-fns/locale';

export default function HoyScreen() {
    const { data: commitments, isLoading } = useCommitments('pending');
    const { mutate: markDone } = useMarkCommitmentDone();
    const navigation = useNavigation<any>();

    const [calendars, setCalendars] = useState<Calendar.Calendar[]>([]);
    const [cloudAccounts, setCloudAccounts] = useState<any[]>([]);
    const [isCalendarModalVisible, setIsCalendarModalVisible] = useState(false);
    const [selectedCommitment, setSelectedCommitment] = useState<any>(null);
    const [isLoadingCalendars, setIsLoadingCalendars] = useState(false);
    const [selectedDate, setSelectedDate] = useState(new Date());
    const isFocused = useIsFocused();

    useEffect(() => {
        if (commitments && commitments.length > 0) {
            commitments.forEach((c: any) => {
                if (c.status === 'pending' && c.due_at) {
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
        } catch (e: any) {
            Alert.alert('Error Cloud Sync', e.message);
        } finally {
            setIsLoadingCalendars(false);
        }
    };

    const handleOpenExternalCalendar = (url: string) => {
        if (!url) return;
        Linking.openURL(url).catch(err => {
            console.error('Failed to open URL:', err);
            Alert.alert('Ping', 'No se pudo abrir la aplicación de calendario.');
        });
    };

    // --- Dynamic Calendar UI Logic ---
    const weekStart = startOfWeek(selectedDate, { weekStartsOn: 1 }); // Starts Monday
    const weekDays = Array.from({ length: 7 }).map((_, i) => addDays(weekStart, i));

    const filteredCommitments = useMemo(() => {
        if (!commitments) return [];
        return commitments.filter((c: any) => {
            if (!c.due_at) return false;
            return isSameDay(new Date(c.due_at), selectedDate);
        }).sort((a: any, b: any) => new Date(a.due_at).getTime() - new Date(b.due_at).getTime());
    }, [commitments, selectedDate]);

    const renderItem = ({ item }: { item: any }) => {
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
                        <TouchableOpacity style={styles.completeBtn} onPress={() => handleMarkDone(item.id)}>
                            <Ionicons name="checkmark-circle" size={24} color="#d1d5db" />
                        </TouchableOpacity>
                    </View>

                    {isSynced ? (
                        <TouchableOpacity
                            style={[styles.syncBtn, isConflict && styles.syncBtnConflict]}
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
                        <TouchableOpacity style={styles.localSyncBtn} onPress={() => handleCalendarPress(item)}>
                            <Ionicons name="calendar-outline" size={14} color="#6b7280" />
                            <Text style={styles.localSyncText}>Agendar en Calendario</Text>
                        </TouchableOpacity>
                    )}

                    {item.message_id && (
                        <TouchableOpacity
                            style={styles.chatLinkBtn}
                            onPress={() => navigation.navigate('Chats', {
                                screen: 'Chat',
                                params: { scrollToMessageId: item.message_id }
                            })}
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
            <View style={styles.header}>
                <Text style={styles.monthLabel}>
                    {format(selectedDate, 'MMMM yyyy', { locale: es }).replace(/^\w/, c => c.toUpperCase())}
                </Text>

                <View style={styles.weekContainer}>
                    {weekDays.map((day, idx) => {
                        const isSelected = isSameDay(day, selectedDate);
                        const isToday = isSameDay(day, new Date());
                        return (
                            <TouchableOpacity
                                key={idx}
                                style={[styles.dayCard, isSelected && styles.dayCardSelected]}
                                onPress={() => setSelectedDate(day)}
                            >
                                <Text style={[styles.dayName, isSelected && styles.dayNameSelected]}>
                                    {format(day, 'EEE', { locale: es }).toUpperCase()}
                                </Text>
                                <Text style={[styles.dayNumber, isSelected && styles.dayNumberSelected]}>
                                    {format(day, 'd')}
                                </Text>
                                {isToday && !isSelected && <View style={styles.todayDot} />}
                            </TouchableOpacity>
                        );
                    })}
                </View>
            </View>

            {isLoading ? (
                <ActivityIndicator size="large" color="#3b82f6" style={{ marginTop: 40 }} />
            ) : filteredCommitments.length === 0 ? (
                <View style={styles.emptyContainer}>
                    <Ionicons name="calendar-clear-outline" size={64} color="#e5e7eb" />
                    <Text style={styles.emptyText}>Día libre, no hay compromisos.</Text>
                </View>
            ) : (
                <FlatList
                    data={filteredCommitments}
                    keyExtractor={c => c.id}
                    renderItem={renderItem}
                    showsVerticalScrollIndicator={false}
                    contentContainerStyle={styles.agendaList}
                />
            )}

            {/* Calendar Selection Modal */}
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
                            <ActivityIndicator size="large" color="#3b82f6" style={{ margin: 40 }} />
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
    container: { flex: 1, backgroundColor: '#f9fafb' },

    // Header & Week Slider
    header: { backgroundColor: 'white', paddingTop: 60, paddingBottom: 16, borderBottomWidth: 1, borderBottomColor: '#f3f4f6' },
    monthLabel: { fontSize: 22, fontWeight: 'bold', paddingHorizontal: 20, marginBottom: 16, color: '#111827', marginLeft: 20 },
    weekContainer: { flexDirection: 'row', justifyContent: 'space-evenly', paddingHorizontal: 10 },
    dayCard: { alignItems: 'center', justifyContent: 'center', paddingVertical: 10, width: 44, borderRadius: 22 },
    dayCardSelected: { backgroundColor: '#3b82f6' },
    dayName: { fontSize: 11, fontWeight: '600', color: '#6b7280', marginBottom: 4 },
    dayNameSelected: { color: '#bfdbfe' },
    dayNumber: { fontSize: 18, fontWeight: '600', color: '#111827' },
    dayNumberSelected: { color: 'white' },
    todayDot: { width: 4, height: 4, borderRadius: 2, backgroundColor: '#3b82f6', marginTop: 4 },

    // Agenda List
    agendaList: { padding: 20, paddingBottom: 100 },
    emptyContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', marginTop: 80 },
    emptyText: { color: '#9ca3af', fontSize: 16, marginTop: 16, fontWeight: '500' },

    agendaRow: { flexDirection: 'row', marginBottom: 20 },
    timeColumn: { width: 60, alignItems: 'center', marginRight: 10 },
    timeText: { fontSize: 13, fontWeight: '700', color: '#6b7280' },
    timeLine: { width: 2, flex: 1, backgroundColor: '#e5e7eb', marginTop: 8, borderRadius: 1 },

    eventCard: { flex: 1, backgroundColor: 'white', borderRadius: 16, padding: 16, shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 8, elevation: 2, borderWidth: 1, borderColor: '#f3f4f6' },
    eventCardConflict: { backgroundColor: '#fffbeb', borderColor: '#fef3c7' },
    eventHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 },
    eventTitle: { fontSize: 16, fontWeight: '700', color: '#111827', flex: 1, marginRight: 12, lineHeight: 22 },
    completeBtn: { width: 28, height: 28, alignItems: 'center', justifyContent: 'center' },

    syncBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', backgroundColor: '#10b981', paddingVertical: 10, borderRadius: 10, gap: 8, marginBottom: 10 },
    syncBtnConflict: { backgroundColor: '#f59e0b' },
    syncBtnText: { color: 'white', fontSize: 14, fontWeight: '700' },

    localSyncBtn: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#f3f4f6', paddingVertical: 8, paddingHorizontal: 12, borderRadius: 8, alignSelf: 'flex-start', marginBottom: 10 },
    localSyncText: { fontSize: 12, fontWeight: '600', color: '#4b5563', marginLeft: 6 },

    chatLinkBtn: { flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-start' },
    chatLinkText: { color: '#3b82f6', fontSize: 13, fontWeight: '600', marginLeft: 4 },

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
    sectionLabel: { fontSize: 13, fontWeight: '700', color: '#8b5cf6', paddingHorizontal: 20, paddingVertical: 10, backgroundColor: '#f5f3ff', textTransform: 'uppercase', letterSpacing: 0.5 },
    cloudSection: { borderBottomWidth: 1, borderBottomColor: '#f3f4f6' },
    localSection: { paddingBottom: 40 },
});
