import React from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, Platform, Image } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useInsights } from '../api/queries';
import { LinearGradient } from 'expo-linear-gradient';
import { useNavigation } from '@react-navigation/native';

export default function InsightsScreen() {
    const { data, isLoading, refetch } = useInsights();
    const navigation = useNavigation<any>();

    if (isLoading) {
        return (
            <View style={styles.center}>
                <ActivityIndicator size="large" color="#0f172a" />
            </View>
        );
    }

    const briefing = data?.briefing || { title: 'Tu Resumen', summary: 'Cargando inteligencia...' };
    const commitments = data?.commitments || [];
    const ghostedChats = data?.ghostedChats || [];

    return (
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

                {briefing.priority && (
                    <TouchableOpacity
                        style={styles.priorityCard}
                        onPress={() => navigation.navigate('Tablero')}
                    >
                        <Text style={styles.priorityLabel}>PRIORIDAD HOY</Text>
                        <Text style={styles.priorityText} numberOfLines={1}>{briefing.priority.title}</Text>
                    </TouchableOpacity>
                )}
            </LinearGradient>

            {/* Pending Pings (Ghosted) */}
            {ghostedChats.length > 0 && (
                <View style={styles.section}>
                    <Text style={styles.sectionTitle}>Esperando Respuesta (Ghosts)</Text>
                    {ghostedChats.map((chat: any) => (
                        <TouchableOpacity
                            key={chat.id}
                            style={styles.ghostCard}
                            onPress={() => navigation.navigate('Chats', { screen: 'Chat', params: { conversationId: chat.id } })}
                        >
                            <View style={styles.ghostInfo}>
                                <Text style={styles.ghostName}>{chat.name}</Text>
                                <Text style={styles.ghostMeta}>Hace {chat.hours} horas</Text>
                            </View>
                            <TouchableOpacity style={styles.pingBtn}>
                                <Text style={styles.pingBtnText}>Enviar Ping ⚡</Text>
                            </TouchableOpacity>
                        </TouchableOpacity>
                    ))}
                </View>
            )}

            {/* Quick Commitments */}
            <View style={styles.section}>
                <View style={styles.sectionHeader}>
                    <Text style={styles.sectionTitle}>Tareas Críticas</Text>
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

            {/* Voice Capture (Future Placeholder) */}
            <TouchableOpacity style={styles.captureBtn}>
                <LinearGradient colors={['#3b82f6', '#2563eb']} style={styles.captureBtnGradient}>
                    <Ionicons name="mic" size={28} color="white" />
                    <Text style={styles.captureBtnText}>Pensamiento Rápido</Text>
                </LinearGradient>
            </TouchableOpacity>
        </ScrollView>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#fcfdfe' },
    content: { padding: 20, paddingBottom: 100 },
    header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: Platform.OS === 'ios' ? 40 : 20, marginBottom: 24 },
    title: { fontSize: 34, fontWeight: '900', color: '#0f172a', letterSpacing: -1 },
    center: { flex: 1, justifyContent: 'center', alignItems: 'center' },

    briefingCard: { borderRadius: 24, padding: 24, marginBottom: 30, shadowColor: '#000', shadowOffset: { width: 0, height: 10 }, shadowOpacity: 0.2, shadowRadius: 20, elevation: 10 },
    briefingHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 12 },
    briefingTitle: { color: '#60a5fa', fontWeight: '800', fontSize: 13, textTransform: 'uppercase', letterSpacing: 1, marginLeft: 8 },
    briefingText: { color: 'white', fontSize: 18, fontWeight: '600', lineHeight: 26 },
    priorityCard: { backgroundColor: 'rgba(255,255,255,0.1)', borderRadius: 12, padding: 12, marginTop: 20 },
    priorityLabel: { color: '#94a3b8', fontSize: 10, fontWeight: '800', marginBottom: 4 },
    priorityText: { color: 'white', fontSize: 14, fontWeight: '700' },

    section: { marginBottom: 32 },
    sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
    sectionTitle: { fontSize: 18, fontWeight: '800', color: '#1e293b', marginBottom: 16 },
    viewAll: { color: '#3b82f6', fontWeight: '700', fontSize: 14 },

    ghostCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: 'white', padding: 16, borderRadius: 16, marginBottom: 12, borderWidth: 1, borderColor: '#f1f5f9' },
    ghostInfo: { flex: 1 },
    ghostName: { fontSize: 16, fontWeight: '700', color: '#1e293b' },
    ghostMeta: { fontSize: 13, color: '#94a3b8', marginTop: 2 },
    pingBtn: { backgroundColor: '#f0fdf4', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10 },
    pingBtnText: { color: '#16a34a', fontWeight: '700', fontSize: 12 },

    commCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#f8fafc', padding: 16, borderRadius: 16, marginBottom: 8 },
    commDot: { width: 8, height: 8, borderRadius: 4, marginRight: 12 },
    commText: { flex: 1, fontSize: 15, fontWeight: '600', color: '#334155' },
    emptyCard: { padding: 30, alignItems: 'center', backgroundColor: '#f8fafc', borderRadius: 20, borderStyle: 'dashed', borderWidth: 1, borderColor: '#cbd5e1' },
    emptyText: { color: '#94a3b8', fontSize: 14, fontWeight: '500' },

    captureBtn: { marginTop: 10 },
    captureBtnGradient: { height: 64, borderRadius: 32, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 12 },
    captureBtnText: { color: 'white', fontSize: 18, fontWeight: '800' },
});
