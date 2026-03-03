import React, { useEffect } from 'react';
import { View, Text, FlatList, TouchableOpacity, ActivityIndicator, StyleSheet, Modal, SafeAreaView, ScrollView, Platform, Alert } from 'react-native';
import { useCommitments, useMarkCommitmentDone } from '../api/queries';
import { useNavigation, useIsFocused } from '@react-navigation/native';
import { scheduleCommitmentReminder, cancelCommitmentReminder } from '../lib/notifications';
import * as Calendar from 'expo-calendar';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { apiClient } from '../api/client';

export default function HoyScreen() {
    const { data: commitments, isLoading } = useCommitments('pending');
    const { mutate: markDone } = useMarkCommitmentDone();
    const navigation = useNavigation<any>();

    const [calendars, setCalendars] = React.useState<Calendar.Calendar[]>([]);
    const [cloudAccounts, setCloudAccounts] = React.useState<any[]>([]);
    const [isCalendarModalVisible, setIsCalendarModalVisible] = React.useState(false);
    const [selectedCommitment, setSelectedCommitment] = React.useState<any>(null);
    const [isLoadingCalendars, setIsLoadingCalendars] = React.useState(false);
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

        // Refresh cloud accounts every time we open the modal
        fetchCloudAccounts();

        try {
            const allCalendars = await Calendar.getCalendarsAsync(Calendar.EntityTypes.EVENT);
            const writableCalendars = allCalendars.filter(cal => cal.allowsModifications);

            // Apply filtering from Profile preferences
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
        const endDate = new Date(startDate.getTime() + 60 * 60 * 1000); // 1 hour duration

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

    const renderItem = ({ item }: { item: any }) => (
        <View style={styles.card}>
            <View style={styles.cardContent}>
                <Text style={styles.cardTitle}>{item.title}</Text>
                <Text style={styles.cardDate}>
                    {item.due_at ? new Date(item.due_at).toLocaleString('es-ES', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : 'Sin fecha'}
                </Text>

                {item.message_id && (
                    <TouchableOpacity
                        style={styles.linkBtn}
                        onPress={() => navigation.navigate('Chats', {
                            screen: 'Chat',
                            params: {
                                conversationId: item.message?.conversation_id, // We'll need to join this in backend or handle it
                                scrollToMessageId: item.message_id
                            }
                        })}
                    >
                        <Text style={styles.linkBtnText}>Ir al mensaje →</Text>
                    </TouchableOpacity>
                )}
            </View>
            <View style={styles.actionColumn}>
                <TouchableOpacity style={styles.calendarBtn} onPress={() => handleCalendarPress(item)}>
                    <Ionicons name="calendar-outline" size={20} color="#8b5cf6" />
                </TouchableOpacity>
                <TouchableOpacity style={styles.doneBtn} onPress={() => handleMarkDone(item.id)}>
                    <Text style={styles.doneBtnText}>✓</Text>
                </TouchableOpacity>
            </View>
        </View>
    );

    return (
        <View style={styles.container}>
            <Text style={styles.heading}>Compromisos</Text>
            {isLoading ? (
                <ActivityIndicator size="large" color="#3b82f6" />
            ) : commitments?.length === 0 ? (
                <View style={styles.emptyContainer}>
                    <Text style={styles.emptyText}>No tienes compromisos pendientes.</Text>
                </View>
            ) : (
                <FlatList
                    data={commitments}
                    keyExtractor={c => c.id}
                    renderItem={renderItem}
                    showsVerticalScrollIndicator={false}
                />
            )}

            {/* Calendar Selection Modal */}
            <Modal visible={isCalendarModalVisible} transparent animationType="slide">
                <View style={styles.modalOverlay}>
                    <SafeAreaView style={styles.modalContent}>
                        <View style={styles.modalHeader}>
                            <Text style={styles.modalTitle}>Selecciona un Calendario</Text>
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
                                        <Text style={styles.sectionLabel}>Cuentas en la Nube (Directo)</Text>
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
                                                    <Text style={styles.calendarSource}>Sincronización Directa</Text>
                                                </View>
                                                <Ionicons name="cloud-upload-outline" size={20} color="#8b5cf6" />
                                            </TouchableOpacity>
                                        ))}
                                    </View>
                                )}

                                <View style={styles.localSection}>
                                    <Text style={[styles.sectionLabel, { marginTop: cloudAccounts.length > 0 ? 10 : 0 }]}>
                                        Calendarios del Teléfono (Local)
                                    </Text>
                                    {calendars.length === 0 ? (
                                        <View style={{ padding: 20, alignItems: 'center' }}>
                                            <Text style={{ color: '#9ca3af' }}>No se encontraron calendarios locales.</Text>
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
    container: { flex: 1, backgroundColor: '#f9fafb', paddingTop: 64 },
    heading: { fontSize: 28, fontWeight: 'bold', paddingHorizontal: 16, marginBottom: 16 },
    card: { backgroundColor: 'white', padding: 16, marginHorizontal: 16, marginVertical: 8, borderRadius: 12, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 4, elevation: 2 },
    cardContent: { flex: 1, paddingRight: 16 },
    cardTitle: { fontWeight: '600', fontSize: 16 },
    cardDate: { color: '#6b7280', marginTop: 4, fontSize: 13 },
    linkBtn: { marginTop: 8 },
    linkBtnText: { color: '#3b82f6', fontSize: 13, fontWeight: '600' },
    doneBtn: { width: 36, height: 36, borderRadius: 18, borderWidth: 2, borderColor: '#22c55e', alignItems: 'center', justifyContent: 'center' },
    doneBtnText: { color: '#22c55e', fontSize: 18, fontWeight: 'bold' },
    actionColumn: { alignItems: 'center', gap: 12 },
    calendarBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: '#f5f3ff', alignItems: 'center', justifyContent: 'center' },
    emptyContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
    emptyText: { color: '#9ca3af', fontSize: 16 },

    // Modal Styles
    modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
    modalContent: { backgroundColor: 'white', borderTopLeftRadius: 24, borderTopRightRadius: 24, maxHeight: '80%' },
    modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 20, borderBottomWidth: 1, borderBottomColor: '#f3f4f6' },
    modalTitle: { fontSize: 18, fontWeight: 'bold', color: '#111827' },
    calendarItem: { flexDirection: 'row', alignItems: 'center', padding: 16, borderBottomWidth: 1, borderBottomColor: '#f3f4f6' },
    calendarColor: { width: 12, height: 12, borderRadius: 6, marginRight: 12 },
    calendarInfo: { flex: 1 },
    calendarName: { fontSize: 16, fontWeight: '600', color: '#111827' },
    calendarSource: { fontSize: 12, color: '#6b7280', marginTop: 2 },
    sectionLabel: { fontSize: 13, fontWeight: '700', color: '#8b5cf6', paddingHorizontal: 20, paddingVertical: 10, backgroundColor: '#f5f3ff', textTransform: 'uppercase', letterSpacing: 0.5 },
    cloudSection: { borderBottomWidth: 1, borderBottomColor: '#f3f4f6' },
    localSection: { paddingBottom: 20 },
});
