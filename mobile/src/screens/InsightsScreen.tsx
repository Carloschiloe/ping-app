import React, { useState } from 'react';
import {
    View, Text, StyleSheet, ScrollView, TouchableOpacity,
    ActivityIndicator, Platform, Image, Modal, TextInput,
    KeyboardAvoidingView, Alert
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useInsights, useCreateCommitment, usePingConversation } from '../api/queries';
import { useAuth } from '../context/AuthContext';
import { LinearGradient } from 'expo-linear-gradient';
import { useNavigation } from '@react-navigation/native';
import * as Haptics from 'expo-haptics';

export default function InsightsScreen() {
    const { user } = useAuth();
    const { data, isLoading, isError, refetch } = useInsights();
    const navigation = useNavigation<any>();
    const [isCaptureModalVisible, setIsCaptureModalVisible] = useState(false);
    const [quickNote, setQuickNote] = useState('');
    const { mutate: createCommitment, isPending: isCreating } = useCreateCommitment();
    const { mutate: pingConv } = usePingConversation();

    const handleSaveNote = async () => {
        if (!quickNote.trim()) return;

        // Haptic feedback for starting save
        await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

        createCommitment({
            title: quickNote,
            priority: 'medium',
            due_at: new Date(Date.now() + 86400000).toISOString(), // Tomorrow
            assigned_to_user_id: user?.id, // Self-assigned for quick thoughts
            status: 'accepted', // Automatically accepted for me
        }, {
            onSuccess: async () => {
                await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                setIsCaptureModalVisible(false);
                setQuickNote('');
                refetch();
            },
            onError: () => {
                Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
                Alert.alert('Error', 'No se pudo guardar el pensamiento. Inténtalo de nuevo.');
            }
        });
    };

    const handleProactiveAction = async (sug: any) => {
        await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
        switch (sug.type) {
            case 'OPEN_CHAT':
                navigation.navigate('Chats', { screen: 'Chat', params: { conversationId: sug.payload.id } });
                break;
            case 'COMPLETE_TASK':
                // Using existing navigate to board for now, or we could call the mutation directly
                navigation.navigate('Tablero');
                break;
            case 'CREATE_NOTE':
                setIsCaptureModalVisible(true);
                break;
            default:
                Alert.alert('Acción', `Próximamente: ${sug.label}`);
        }
    };

    const handlePing = async (convId: string) => {
        await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        pingConv(convId, {
            onSuccess: () => {
                Alert.alert('Recordatorio enviado', 'Hemos avisado a la persona que estás esperando respuesta.');
            },
            onError: () => {
                Alert.alert('Error', 'No se pudo enviar el recordatorio.');
            }
        });
    };

    if (isLoading) {
        return (
            <View style={styles.center}>
                <ActivityIndicator size="large" color="#3b82f6" />
                <Text style={styles.loadingText}>Analizando tus hilos...</Text>
            </View>
        );
    }

    if (isError) {
        return (
            <View style={styles.center}>
                <Ionicons name="alert-circle-outline" size={60} color="#ef4444" />
                <Text style={styles.errorTitle}>Error al cargar</Text>
                <Text style={styles.errorText}>Asegúrate de ejecutar las migraciones SQL.</Text>
                <TouchableOpacity style={styles.retryBtn} onPress={() => refetch()}>
                    <Text style={styles.retryBtnText}>Reintentar</Text>
                </TouchableOpacity>
            </View>
        );
    }

    const briefing = data?.briefing || { title: 'Tu Resumen', summary: 'Inteligencia no disponible. Prueba refrescar.' };
    const commitments = data?.commitments || [];
    const ghostedChats = data?.ghostedChats || [];

    return (
        <View style={{ flex: 1 }}>
            <ScrollView style={styles.container} contentContainerStyle={styles.content}>
                <View style={styles.header}>
                    <Text style={styles.title}>Insights</Text>
                    <TouchableOpacity onPress={() => refetch()}>
                        <Ionicons name="refresh-circle" size={32} color="#94a3b8" />
                    </TouchableOpacity>
                </View>

                {/* IA Briefing Card */}
                <LinearGradient
                    colors={['#1e293b', '#0f172a']}
                    style={styles.briefingCard}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 1 }}
                >
                    <View style={styles.briefingHeader}>
                        <Ionicons name="sparkles" size={20} color="#60a5fa" />
                        <Text style={styles.briefingTitle}>{briefing.title}</Text>
                    </View>
                    <Text style={styles.briefingText}>{briefing.summary}</Text>

                    {/* Proactive Suggestions */}
                    {briefing.suggestions && briefing.suggestions.length > 0 && (
                        <View style={styles.suggestionRow}>
                            {briefing.suggestions.map((sug: any) => (
                                <TouchableOpacity
                                    key={sug.id}
                                    style={styles.suggestionChip}
                                    onPress={() => handleProactiveAction(sug)}
                                >
                                    <Ionicons
                                        name={sug.type === 'OPEN_CHAT' ? 'chatbubble' : sug.type === 'COMPLETE_TASK' ? 'checkmark-circle' : 'flash'}
                                        size={14}
                                        color="#60a5fa"
                                    />
                                    <Text style={styles.suggestionChipText}>{sug.label}</Text>
                                </TouchableOpacity>
                            ))}
                        </View>
                    )}

                    {briefing.priority_commitment && (
                        <TouchableOpacity
                            style={styles.priorityCard}
                            onPress={() => navigation.navigate('Tablero')}
                        >
                            <Text style={styles.priorityLabel}>PRIORIDAD HOY</Text>
                            <Text style={styles.priorityText} numberOfLines={1}>{briefing.priority_commitment.title}</Text>
                        </TouchableOpacity>
                    )}
                </LinearGradient>

                {/* Ghosted Chats Section */}
                {ghostedChats.length > 0 && (
                    <View style={styles.section}>
                        <Text style={styles.sectionTitle}>Conversaciones en Espera</Text>
                        <Text style={styles.sectionSub}>Gente que no te ha respondido en más de 24h</Text>
                        {ghostedChats.map((chat: any) => (
                            <View key={chat.id} style={styles.ghostCardWrapper}>
                                <TouchableOpacity
                                    style={styles.ghostCard}
                                    onPress={() => navigation.navigate('Chats', { screen: 'Chat', params: { conversationId: chat.id } })}
                                >
                                    <View style={styles.ghostHeader}>
                                        <Text style={styles.ghostName}>{chat.name}</Text>
                                        <Text style={styles.ghostMeta}>{chat.hours}h fuera</Text>
                                    </View>

                                    <View style={styles.lastMsgPreview}>
                                        <Text style={styles.lastMsgLabel}>TU ÚLTIMO MENSAJE:</Text>
                                        <Text style={styles.ghostLastMsg} numberOfLines={2}>
                                            "{chat.last_msg_text}"
                                        </Text>
                                    </View>
                                </TouchableOpacity>

                                <View style={styles.ghostActions}>
                                    <TouchableOpacity style={styles.actionBtnOutline} onPress={() => navigation.navigate('Chats', { screen: 'Chat', params: { conversationId: chat.id } })}>
                                        <Ionicons name="chatbubble-outline" size={16} color="#475569" />
                                        <Text style={styles.actionBtnText}>Ver Chat</Text>
                                    </TouchableOpacity>
                                    <TouchableOpacity style={styles.actionBtnSolid} onPress={() => handlePing(chat.id)}>
                                        <Ionicons name="flash" size={16} color="white" />
                                        <Text style={styles.actionBtnTextSolid}>Recordar</Text>
                                    </TouchableOpacity>
                                </View>
                            </View>
                        ))}
                    </View>
                )}

                {/* Critical Tasks Section */}
                <View style={styles.section}>
                    <View style={styles.sectionHeader}>
                        <View>
                            <Text style={styles.sectionTitle}>Tareas Críticas</Text>
                            <Text style={styles.sectionSub}>Pendientes por hacer</Text>
                        </View>
                        <TouchableOpacity onPress={() => navigation.navigate('Tablero')}>
                            <Text style={styles.viewAll}>Ver todo</Text>
                        </TouchableOpacity>
                    </View>
                    {commitments.length === 0 ? (
                        <View style={styles.emptyCard}>
                            <Text style={styles.emptyText}>¡Todo al día! No hay tareas pendientes.</Text>
                        </View>
                    ) : (
                        commitments.slice(0, 3).map((comm: any) => (
                            <View key={comm.id} style={styles.commCard}>
                                <View style={[styles.commDot, { backgroundColor: comm.priority === 'high' ? '#ef4444' : '#f59e0b' }]} />
                                <Text style={styles.commText} numberOfLines={1}>{comm.title}</Text>
                                <Ionicons name="chevron-forward" size={16} color="#cbd5e1" />
                            </View>
                        ))
                    )}
                </View>

                {/* Voice Capture Placeholder */}
                <TouchableOpacity style={styles.captureBtn} onPress={() => setIsCaptureModalVisible(true)}>
                    <LinearGradient colors={['#3b82f6', '#2563eb']} style={styles.captureBtnGradient}>
                        <Ionicons name="mic" size={28} color="white" />
                        <Text style={styles.captureBtnText}>Pensamiento Rápido</Text>
                    </LinearGradient>
                </TouchableOpacity>
            </ScrollView>

            {/* Modal: Quick Capture */}
            <Modal
                visible={isCaptureModalVisible}
                animationType="slide"
                transparent={true}
                onRequestClose={() => setIsCaptureModalVisible(false)}
            >
                <KeyboardAvoidingView
                    behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
                    style={styles.modalOverlay}
                >
                    <View style={styles.modalContent}>
                        <View style={styles.modalHeader}>
                            <Text style={styles.modalTitle}>Pensamiento Rápido</Text>
                            <TouchableOpacity onPress={() => setIsCaptureModalVisible(false)}>
                                <Ionicons name="close" size={24} color="#94a3b8" />
                            </TouchableOpacity>
                        </View>

                        <View style={styles.micPreview}>
                            <LinearGradient colors={['#eff6ff', '#dbeafe']} style={styles.micCircle}>
                                <Ionicons name="mic" size={40} color="#3b82f6" />
                            </LinearGradient>
                            <Text style={styles.micSubtext}>Ping capturará tu pensamiento y lo convertirá en tarea.</Text>
                        </View>

                        <TextInput
                            style={styles.modalInput}
                            placeholder="Escribe algo o usa el dictado..."
                            placeholderTextColor="#94a3b8"
                            multiline
                            autoFocus
                            value={quickNote}
                            onChangeText={setQuickNote}
                        />

                        <TouchableOpacity
                            style={[styles.saveBtn, !quickNote.trim() && { opacity: 0.5 }]}
                            onPress={handleSaveNote}
                            disabled={!quickNote.trim() || isCreating}
                        >
                            {isCreating ? (
                                <ActivityIndicator color="white" />
                            ) : (
                                <Text style={styles.saveBtnText}>Guardar en Tablero</Text>
                            )}
                        </TouchableOpacity>
                    </View>
                </KeyboardAvoidingView>
            </Modal>
        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#fcfdfe' },
    content: { padding: 20, paddingBottom: 100 },
    header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: Platform.OS === 'ios' ? 40 : 20, marginBottom: 24 },
    title: { fontSize: 34, fontWeight: '900', color: '#0f172a', letterSpacing: -1 },
    center: { flex: 1, justifyContent: 'center', alignItems: 'center' },

    briefingCard: { borderRadius: 24, padding: 24, marginBottom: 32, shadowColor: '#3b82f6', shadowOffset: { width: 0, height: 12 }, shadowOpacity: 0.3, shadowRadius: 20, elevation: 12 },
    briefingHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 16 },
    briefingTitle: { color: 'white', fontWeight: '800', fontSize: 13, textTransform: 'uppercase', letterSpacing: 1.5, marginLeft: 8 },
    briefingText: { color: 'rgba(255,255,255,0.95)', fontSize: 18, fontWeight: '700', lineHeight: 26 },
    priorityCard: { backgroundColor: 'rgba(255,255,255,0.15)', borderRadius: 16, padding: 16, marginTop: 20, borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)' },
    priorityLabel: { color: '#93c5fd', fontSize: 10, fontWeight: '900', marginBottom: 4, letterSpacing: 1 },
    priorityText: { color: 'white', fontSize: 15, fontWeight: '700' },

    section: { marginBottom: 32 },
    sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
    sectionTitle: { fontSize: 18, fontWeight: '800', color: '#1e293b' },
    sectionSub: { fontSize: 13, color: '#64748b', marginBottom: 16, marginTop: -4 },
    viewAll: { color: '#3b82f6', fontWeight: '700', fontSize: 14 },

    ghostCardWrapper: { backgroundColor: 'white', borderRadius: 20, marginBottom: 16, borderWidth: 1, borderColor: '#f1f5f9', overflow: 'hidden' },
    ghostCard: { padding: 16 },
    ghostHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
    ghostName: { fontSize: 16, fontWeight: '700', color: '#1e293b' },
    ghostMeta: { fontSize: 12, color: '#94a3b8', fontWeight: '600' },

    lastMsgPreview: { backgroundColor: '#f8fafc', padding: 12, borderRadius: 12 },
    lastMsgLabel: { fontSize: 9, fontWeight: '800', color: '#94a3b8', marginBottom: 4, letterSpacing: 0.5 },
    ghostLastMsg: { fontSize: 14, color: '#475569', fontStyle: 'italic', lineHeight: 20 },

    ghostActions: { flexDirection: 'row', borderTopWidth: 1, borderTopColor: '#f1f5f9' },
    actionBtnOutline: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 12, gap: 6, borderRightWidth: 1, borderRightColor: '#f1f5f9' },
    actionBtnSolid: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 12, gap: 6, backgroundColor: '#f0f9ff' },
    actionBtnText: { fontSize: 13, fontWeight: '600', color: '#475569' },
    actionBtnTextSolid: { fontSize: 13, fontWeight: '700', color: '#0369a1' },

    commCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#f8fafc', padding: 16, borderRadius: 16, marginBottom: 8 },
    commDot: { width: 8, height: 8, borderRadius: 4, marginRight: 12 },
    commText: { flex: 1, fontSize: 15, fontWeight: '600', color: '#334155' },
    emptyCard: { padding: 30, alignItems: 'center', backgroundColor: '#f8fafc', borderRadius: 20, borderStyle: 'dashed', borderWidth: 1, borderColor: '#cbd5e1' },
    emptyText: { color: '#94a3b8', fontSize: 14, fontWeight: '500' },

    captureBtn: { marginTop: 10 },
    captureBtnGradient: { height: 64, borderRadius: 32, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 12 },
    captureBtnText: { color: 'white', fontSize: 18, fontWeight: '800' },
    // Modal Styles
    modalOverlay: { flex: 1, backgroundColor: 'rgba(15, 23, 42, 0.5)', justifyContent: 'flex-end' },
    modalContent: { backgroundColor: 'white', borderTopLeftRadius: 32, borderTopRightRadius: 32, padding: 24, paddingBottom: Platform.OS === 'ios' ? 40 : 24, minHeight: '50%' },
    modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 },
    modalTitle: { fontSize: 20, fontWeight: '900', color: '#0f172a' },
    micPreview: { alignItems: 'center', marginBottom: 24 },
    micCircle: { width: 80, height: 80, borderRadius: 40, alignItems: 'center', justifyContent: 'center', marginBottom: 12 },
    micSubtext: { fontSize: 13, color: '#64748b', textAlign: 'center', paddingHorizontal: 20 },
    modalInput: { backgroundColor: '#f8fafc', borderRadius: 20, padding: 20, fontSize: 16, color: '#1e293b', minHeight: 120, textAlignVertical: 'top', borderWidth: 1, borderColor: '#f1f5f9', marginBottom: 24 },
    saveBtn: { backgroundColor: '#3b82f6', height: 60, borderRadius: 30, alignItems: 'center', justifyContent: 'center', shadowColor: '#3b82f6', shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.2, shadowRadius: 15, elevation: 8 },
    saveBtnText: { color: 'white', fontSize: 16, fontWeight: '800' },
    // Proactive Suggestions
    suggestionRow: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: 8,
        marginTop: 16,
        marginBottom: 8,
    },
    suggestionChip: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: 'rgba(255,255,255,0.15)',
        paddingVertical: 6,
        paddingHorizontal: 12,
        borderRadius: 20,
        gap: 6,
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.1)',
    },
    suggestionChipText: {
        color: 'white',
        fontSize: 12,
        fontWeight: '700',
    },
    // Error & Loading States
    loadingText: { marginTop: 16, fontSize: 14, color: '#64748b', fontWeight: '600' },
    errorTitle: { fontSize: 20, fontWeight: '800', color: '#1e293b', marginTop: 16 },
    errorText: { fontSize: 14, color: '#64748b', marginTop: 8, textAlign: 'center', paddingHorizontal: 40 },
    retryBtn: { marginTop: 20, backgroundColor: '#f1f5f9', paddingHorizontal: 24, paddingVertical: 12, borderRadius: 12 },
    retryBtnText: { color: '#3b82f6', fontWeight: '700' },
});
