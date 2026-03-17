import React from 'react';
import {
    ActivityIndicator,
    Alert,
    RefreshControl,
    ScrollView,
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { format, isToday, isTomorrow } from 'date-fns';
import { es } from 'date-fns/locale';
import { useNavigation } from '@react-navigation/native';
import * as Haptics from 'expo-haptics';
import { useAcceptCommitment, useInsights, useRejectCommitment } from '../api/queries';

function formatWhen(iso?: string | null) {
    if (!iso) return 'Sin hora';
    const date = new Date(iso);
    const time = format(date, 'HH:mm', { locale: es });

    if (isToday(date)) return `Hoy · ${time}`;
    if (isTomorrow(date)) return `Mañana · ${time}`;
    return `${format(date, 'dd/MM', { locale: es })} · ${time}`;
}

function getStateTone(state?: string) {
    switch (state) {
        case 'Terminado':
            return { bg: '#dcfce7', color: '#166534' };
        case 'En sitio':
            return { bg: '#dbeafe', color: '#1d4ed8' };
        case 'Iniciada':
            return { bg: '#ede9fe', color: '#7c3aed' };
        case 'Lista':
            return { bg: '#ccfbf1', color: '#0f766e' };
        case 'Entendido':
            return { bg: '#fef3c7', color: '#92400e' };
        case 'Aceptada':
            return { bg: '#e0e7ff', color: '#4338ca' };
        default:
            return { bg: '#e2e8f0', color: '#475569' };
    }
}

function EmptyState({ text }: { text: string }) {
    return (
        <View style={styles.emptyCard}>
            <Text style={styles.emptyText}>{text}</Text>
        </View>
    );
}

function SectionBlock({ title, subtitle, children }: { title: string; subtitle: string; children: React.ReactNode }) {
    return (
        <View style={styles.sectionBlock}>
            <View style={styles.sectionHeader}>
                <Text style={styles.sectionTitle}>{title}</Text>
                <Text style={styles.sectionCaption}>{subtitle}</Text>
            </View>
            {children}
        </View>
    );
}

export default function InsightsScreen() {
    const navigation = useNavigation<any>();
    const { data, isLoading, isError, refetch, isRefetching } = useInsights();
    const { mutate: acceptCommitment } = useAcceptCommitment();
    const { mutate: rejectCommitment } = useRejectCommitment();

    const goToChat = (item: any) => {
        navigation.navigate('Chats', {
            screen: 'Chat',
            params: {
                conversationId: item.conversation_id,
                isGroup: true,
                otherUser: null,
                groupMetadata: {
                    id: item.conversation_id,
                    name: item.conversation_name,
                    avatar_url: item.conversation_avatar_url,
                },
                mode: item.conversation_mode || item.mode || 'chat',
            },
        });
    };

    const confirmReject = (item: any) => {
        Alert.alert(
            'Rechazar tarea',
            'Se marcara como rechazada y lo veran en el chat del grupo.',
            [
                { text: 'Cancelar', style: 'cancel' },
                {
                    text: 'Rechazar',
                    style: 'destructive',
                    onPress: () => {
                        rejectCommitment({ id: item.id, reason: 'Rechazada desde Operación' });
                    },
                },
            ]
        );
    };

    const handleAccept = async (id: string) => {
        await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        acceptCommitment(id);
    };

    if (isLoading) {
        return (
            <View style={styles.center}>
                <ActivityIndicator size="large" color="#1d4ed8" />
                <Text style={styles.loadingText}>Cargando operación...</Text>
            </View>
        );
    }

    if (isError) {
        return (
            <View style={styles.center}>
                <Ionicons name="alert-circle-outline" size={56} color="#ef4444" />
                <Text style={styles.errorTitle}>No se pudo cargar Operación</Text>
                <TouchableOpacity style={styles.retryButton} onPress={() => refetch()}>
                    <Text style={styles.retryButtonText}>Reintentar</Text>
                </TouchableOpacity>
            </View>
        );
    }

    const inProgress = data?.inProgress || [];
    const pendingResponse = data?.pendingResponse || [];
    const upcoming = data?.upcoming || [];
    const groupsSummary = data?.groupsSummary || [];
    const counts = data?.counts || { inProgress: 0, pendingResponse: 0, upcoming: 0, groups: 0 };

    return (
        <ScrollView
            style={styles.container}
            contentContainerStyle={styles.content}
            refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={() => refetch()} tintColor="#1d4ed8" />}
        >
            <View style={styles.header}>
                <View>
                    <Text style={styles.title}>Operación</Text>
                    <Text style={styles.subtitle}>Visión global de tus grupos y tareas.</Text>
                </View>
                <TouchableOpacity onPress={() => refetch()}>
                    <Ionicons name="refresh-circle" size={34} color="#94a3b8" />
                </TouchableOpacity>
            </View>

            <View style={styles.topPillsRow}>
                <View style={styles.topPill}><Text style={styles.topPillText}>{counts.pendingResponse} por responder</Text></View>
                <View style={styles.topPill}><Text style={styles.topPillText}>{counts.inProgress} en curso</Text></View>
                <View style={styles.topPill}><Text style={styles.topPillText}>{counts.upcoming} próximas</Text></View>
            </View>

            <SectionBlock title="Pendiente tu respuesta" subtitle="Lo que espera tu confirmación">
                {pendingResponse.length === 0 ? (
                    <EmptyState text="No tienes tareas pendientes de aceptar o rechazar." />
                ) : (
                    pendingResponse.map((item: any) => (
                        <View key={item.id} style={styles.responseCard}>
                            <TouchableOpacity onPress={() => goToChat(item)} activeOpacity={0.85}>
                                <Text style={styles.workGroup}>{item.conversation_name}</Text>
                                <Text style={styles.workTitle}>{item.title}</Text>
                                <Text style={styles.workMeta}>{formatWhen(item.due_at)} · Solicita: {item.owner?.full_name || 'Alguien'}</Text>
                            </TouchableOpacity>

                            <View style={styles.responseActions}>
                                <TouchableOpacity style={styles.secondaryButton} onPress={() => confirmReject(item)}>
                                    <Text style={styles.secondaryButtonText}>Rechazar</Text>
                                </TouchableOpacity>
                                <TouchableOpacity style={styles.primaryButton} onPress={() => handleAccept(item.id)}>
                                    <Text style={styles.primaryButtonText}>Aceptar</Text>
                                </TouchableOpacity>
                            </View>
                        </View>
                    ))
                )}
            </SectionBlock>

            <SectionBlock title="En curso" subtitle="Lo que ya estas ejecutando">
                
                {inProgress.length === 0 ? (
                    <EmptyState text="No hay tareas en curso ahora." />
                ) : (
                    inProgress.map((item: any) => {
                        const tone = getStateTone(item.operational_state);
                        return (
                            <TouchableOpacity key={item.id} style={styles.workCard} onPress={() => goToChat(item)} activeOpacity={0.85}>
                                <View style={styles.workTopRow}>
                                    <Text style={styles.workGroup}>{item.conversation_name}</Text>
                                    <View style={[styles.stateBadge, { backgroundColor: tone.bg }]}>
                                        <Text style={[styles.stateBadgeText, { color: tone.color }]}>{item.operational_state}</Text>
                                    </View>
                                </View>
                                <Text style={styles.workTitle}>{item.title}</Text>
                                <Text style={styles.workMeta}>
                                    {formatWhen(item.due_at)} · Responsable: {item.assignee?.full_name || 'Todos'}
                                </Text>
                            </TouchableOpacity>
                        );
                    })
                )}
            </SectionBlock>

            <SectionBlock title="Próximas" subtitle="Aceptadas, pero todavía no en ejecución">

                {upcoming.length === 0 ? (
                    <EmptyState text="No hay tareas próximas por ahora." />
                ) : (
                    upcoming.slice(0, 8).map((item: any) => (
                        <TouchableOpacity key={item.id} style={styles.simpleRow} onPress={() => goToChat(item)} activeOpacity={0.85}>
                            <View style={styles.simpleRowText}>
                                <Text style={styles.simpleRowTitle}>{item.title}</Text>
                                <Text style={styles.simpleRowMeta}>{item.conversation_name} · {formatWhen(item.due_at)}</Text>
                            </View>
                            <Ionicons name="chevron-forward" size={18} color="#94a3b8" />
                        </TouchableOpacity>
                    ))
                )}
            </SectionBlock>

            <SectionBlock title="Grupos" subtitle="Dónde conviene entrar ahora">

                {groupsSummary.length === 0 ? (
                    <EmptyState text="Todavía no hay grupos con operación activa." />
                ) : (
                    groupsSummary.map((group: any) => (
                        <TouchableOpacity
                            key={group.conversation_id}
                            style={styles.groupCard}
                            activeOpacity={0.85}
                            onPress={() => goToChat(group)}
                        >
                            <View style={styles.groupTopRow}>
                                <Text style={styles.groupName}>{group.conversation_name}</Text>
                                <Ionicons name="chevron-forward" size={18} color="#94a3b8" />
                            </View>
                            <Text style={styles.groupMeta}>
                                {group.pending_for_me > 0
                                    ? `${group.pending_for_me} pendiente(s) tuyas`
                                    : `${group.active_count} en curso · ${group.open_count} abiertas`}
                            </Text>
                            {group.team_preview?.[0] ? <Text style={styles.groupSubmeta}>{group.team_preview[0].user_name} · {group.team_preview[0].state}</Text> : null}
                        </TouchableOpacity>
                    ))
                )}
            </SectionBlock>
        </ScrollView>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#f8fafc',
    },
    content: {
        padding: 16,
        paddingBottom: 28,
        gap: 16,
    },
    center: {
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: '#f8fafc',
        padding: 24,
    },
    loadingText: {
        marginTop: 12,
        color: '#64748b',
        fontSize: 14,
    },
    errorTitle: {
        marginTop: 12,
        fontSize: 18,
        fontWeight: '700',
        color: '#0f172a',
    },
    retryButton: {
        marginTop: 16,
        backgroundColor: '#2563eb',
        borderRadius: 12,
        paddingHorizontal: 16,
        paddingVertical: 12,
    },
    retryButtonText: {
        color: '#fff',
        fontWeight: '700',
    },
    header: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
    },
    title: {
        fontSize: 28,
        fontWeight: '800',
        color: '#0f172a',
    },
    subtitle: {
        marginTop: 4,
        fontSize: 14,
        color: '#64748b',
    },
    topPillsRow: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: 8,
    },
    topPill: {
        backgroundColor: '#e0e7ff',
        borderRadius: 999,
        paddingHorizontal: 12,
        paddingVertical: 8,
    },
    topPillText: {
        color: '#3730a3',
        fontSize: 12,
        fontWeight: '800',
    },
    sectionBlock: { gap: 10 },
    sectionHeader: {
        gap: 2,
    },
    sectionTitle: {
        fontSize: 18,
        fontWeight: '800',
        color: '#0f172a',
    },
    sectionCaption: {
        fontSize: 13,
        color: '#64748b',
    },
    emptyCard: {
        backgroundColor: '#fff',
        borderRadius: 16,
        padding: 16,
        borderWidth: 1,
        borderColor: '#e2e8f0',
    },
    emptyText: {
        color: '#64748b',
        fontSize: 14,
    },
    workCard: {
        backgroundColor: '#fff',
        borderRadius: 18,
        padding: 14,
        borderWidth: 1,
        borderColor: '#e2e8f0',
        gap: 6,
    },
    workTopRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        gap: 12,
    },
    workGroup: {
        fontSize: 12,
        fontWeight: '800',
        color: '#2563eb',
        textTransform: 'uppercase',
    },
    workTitle: {
        fontSize: 16,
        fontWeight: '700',
        color: '#0f172a',
    },
    workMeta: {
        fontSize: 13,
        color: '#64748b',
    },
    stateBadge: {
        paddingHorizontal: 10,
        paddingVertical: 4,
        borderRadius: 999,
    },
    stateBadgeText: {
        fontSize: 11,
        fontWeight: '800',
    },
    responseCard: {
        backgroundColor: '#fff',
        borderRadius: 18,
        padding: 14,
        borderWidth: 1,
        borderColor: '#e2e8f0',
        gap: 12,
    },
    responseActions: {
        flexDirection: 'row',
        gap: 8,
    },
    secondaryButton: {
        flex: 1,
        borderRadius: 12,
        borderWidth: 1,
        borderColor: '#cbd5e1',
        paddingVertical: 11,
        alignItems: 'center',
        backgroundColor: '#fff',
    },
    secondaryButtonText: {
        fontWeight: '700',
        color: '#475569',
    },
    primaryButton: {
        flex: 1,
        borderRadius: 12,
        paddingVertical: 11,
        alignItems: 'center',
        backgroundColor: '#2563eb',
    },
    primaryButtonText: {
        fontWeight: '700',
        color: '#fff',
    },
    simpleRow: {
        backgroundColor: '#fff',
        borderRadius: 16,
        padding: 14,
        borderWidth: 1,
        borderColor: '#e2e8f0',
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 10,
    },
    simpleRowText: {
        flex: 1,
    },
    simpleRowTitle: {
        fontSize: 15,
        fontWeight: '700',
        color: '#0f172a',
    },
    simpleRowMeta: {
        marginTop: 4,
        fontSize: 13,
        color: '#64748b',
    },
    groupCard: {
        backgroundColor: '#fff',
        borderRadius: 18,
        padding: 14,
        borderWidth: 1,
        borderColor: '#e2e8f0',
        gap: 6,
    },
    groupTopRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        gap: 10,
    },
    groupName: {
        flex: 1,
        fontSize: 15,
        fontWeight: '700',
        color: '#0f172a',
    },
    groupCounts: {
        fontSize: 12,
        color: '#2563eb',
        fontWeight: '700',
    },
    groupMeta: {
        fontSize: 13,
        color: '#64748b',
    },
    groupSubmeta: {
        marginTop: 4,
        fontSize: 11,
        color: '#94a3b8',
        fontWeight: '700',
    },
});
