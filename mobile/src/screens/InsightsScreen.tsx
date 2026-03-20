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
import type { ChatsTabNavigationProp } from '../navigation/types';
import { useAppTheme } from '../theme/ThemeContext';

function formatWhen(iso?: string | null) {
    if (!iso) return 'Sin hora';
    const date = new Date(iso);
    const time = format(date, 'HH:mm', { locale: es });

    if (isToday(date)) return `Hoy · ${time}`;
    if (isTomorrow(date)) return `Mañana · ${time}`;
    return `${format(date, 'dd/MM', { locale: es })} · ${time}`;
}

type InsightsStyles = ReturnType<typeof createStyles>;

function EmptyState({
    text,
    styles,
    primaryLabel,
    onPrimary,
    secondaryLabel,
    onSecondary,
}: {
    text: string;
    styles: InsightsStyles;
    primaryLabel?: string;
    onPrimary?: () => void;
    secondaryLabel?: string;
    onSecondary?: () => void;
}) {
    return (
        <View style={styles.emptyCard}>
            <Text style={styles.emptyText}>{text}</Text>
            {(primaryLabel || secondaryLabel) && (
                <View style={styles.emptyActions}>
                    {primaryLabel && onPrimary && (
                        <TouchableOpacity style={styles.emptyPrimaryBtn} onPress={onPrimary}>
                            <Text style={styles.emptyPrimaryText}>{primaryLabel}</Text>
                        </TouchableOpacity>
                    )}
                    {secondaryLabel && onSecondary && (
                        <TouchableOpacity style={styles.emptySecondaryBtn} onPress={onSecondary}>
                            <Text style={styles.emptySecondaryText}>{secondaryLabel}</Text>
                        </TouchableOpacity>
                    )}
                </View>
            )}
        </View>
    );
}

function SectionBlock({ title, subtitle, children, styles }: { title: string; subtitle: string; children: React.ReactNode; styles: InsightsStyles }) {
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
    const { theme } = useAppTheme();
    const styles = React.useMemo(() => createStyles(theme), [theme]);
    const navigation = useNavigation<ChatsTabNavigationProp>();
    const { data, isLoading, isError, refetch, isRefetching } = useInsights();
    const { mutate: acceptCommitment } = useAcceptCommitment();
    const { mutate: rejectCommitment } = useRejectCommitment();

    const getStateTone = (state?: string) => {
        const isDark = theme.isDark;
        switch (state) {
            case 'Terminado':
                return { bg: isDark ? '#1f3a2b' : '#dcfce7', color: isDark ? '#86efac' : '#166534' };
            case 'En sitio':
                return { bg: isDark ? '#1f2c45' : '#dbeafe', color: isDark ? '#93c5fd' : '#1d4ed8' };
            case 'Iniciada':
                return { bg: isDark ? '#2b2141' : '#ede9fe', color: isDark ? '#c4b5fd' : '#7c3aed' };
            case 'Lista':
                return { bg: isDark ? '#1b3a36' : '#ccfbf1', color: isDark ? '#5eead4' : '#0f766e' };
            case 'Entendido':
                return { bg: isDark ? '#3b2a15' : '#fef3c7', color: isDark ? '#fcd34d' : '#92400e' };
            case 'Aceptada':
                return { bg: isDark ? '#2a2b49' : '#e0e7ff', color: isDark ? '#a5b4fc' : '#4338ca' };
            default:
                return { bg: isDark ? '#233044' : '#e2e8f0', color: isDark ? '#94a3b8' : '#475569' };
        }
    };

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
                <ActivityIndicator size="large" color={theme.colors.accent} />
                <Text style={styles.loadingText}>Cargando operación...</Text>
            </View>
        );
    }

    if (isError) {
        return (
            <View style={styles.center}>
                <Ionicons name="alert-circle-outline" size={56} color={theme.colors.danger} />
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
            refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={() => refetch()} tintColor={theme.colors.accent} />}
        >
            <View style={styles.header}>
                <View>
                    <Text style={styles.title}>Operación</Text>
                    <Text style={styles.subtitle}>Visión global de tus grupos y tareas.</Text>
                </View>
                <TouchableOpacity onPress={() => refetch()}>
                    <Ionicons name="refresh-circle" size={34} color={theme.colors.text.muted} />
                </TouchableOpacity>
            </View>

            <View style={styles.metricsRow}>
                {[
                    { label: 'Pendientes', value: counts.pendingResponse, icon: 'mail-unread-outline' },
                    { label: 'En curso', value: counts.inProgress, icon: 'flash-outline' },
                    { label: 'Próximas', value: counts.upcoming, icon: 'calendar-outline' },
                ].map((metric) => (
                    <View key={metric.label} style={styles.metricCard}>
                        <View style={styles.metricIcon}>
                            <Ionicons name={metric.icon as any} size={14} color={theme.colors.accent} />
                        </View>
                        <Text style={styles.metricValue}>{metric.value}</Text>
                        <Text style={styles.metricLabel}>{metric.label}</Text>
                    </View>
                ))}
            </View>

            <SectionBlock styles={styles} title="Pendiente tu respuesta" subtitle="Lo que espera tu confirmación">
                {pendingResponse.length === 0 ? (
                    <EmptyState
                        styles={styles}
                        text="No tienes tareas pendientes de aceptar o rechazar."
                        primaryLabel="Ir a chats"
                        onPrimary={() => navigation.navigate('Chats')}
                        secondaryLabel="Refrescar"
                        onSecondary={() => refetch()}
                    />
                ) : (
                    pendingResponse.map((item: any) => (
                        <View key={item.id} style={styles.responseCard}>
                            <TouchableOpacity onPress={() => goToChat(item)} activeOpacity={0.85}>
                                <Text style={styles.workGroup}>{item.conversation_name}</Text>
                                <Text style={styles.workTitle}>{item.title}</Text>
                                <View style={styles.workMetaRow}>
                                    <Text style={styles.workTime}>{formatWhen(item.due_at)}</Text>
                                    <Text style={styles.workMetaTag}>Solicita: {item.owner?.full_name || 'Alguien'}</Text>
                                </View>
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

            <SectionBlock styles={styles} title="En curso" subtitle="Lo que ya estas ejecutando">
                
                {inProgress.length === 0 ? (
                    <EmptyState
                        styles={styles}
                        text="No hay tareas en curso ahora."
                        primaryLabel="Ir a chats"
                        onPrimary={() => navigation.navigate('Chats')}
                        secondaryLabel="Refrescar"
                        onSecondary={() => refetch()}
                    />
                ) : (
                    inProgress.map((item: any) => {
                        const tone = getStateTone(item.operational_state);
                        return (
                            <TouchableOpacity key={item.id} style={styles.workCard} onPress={() => goToChat(item)} activeOpacity={0.85}>
                                <Text style={styles.workGroup}>{item.conversation_name}</Text>
                                <Text style={styles.workTitle}>{item.title}</Text>
                                <View style={styles.workMetaRow}>
                                    <View style={[styles.stateBadge, { backgroundColor: tone.bg }]}>
                                        <Text style={[styles.stateBadgeText, { color: tone.color }]}>{item.operational_state}</Text>
                                    </View>
                                    <Text style={styles.workTime}>{formatWhen(item.due_at)}</Text>
                                </View>
                                <Text style={styles.workMeta}>Responsable: {item.assignee?.full_name || 'Todos'}</Text>
                            </TouchableOpacity>
                        );
                    })
                )}
            </SectionBlock>

            <SectionBlock styles={styles} title="Próximas" subtitle="Aceptadas, pero todavía no en ejecución">

                {upcoming.length === 0 ? (
                    <EmptyState
                        styles={styles}
                        text="No hay tareas próximas por ahora."
                        primaryLabel="Ir a chats"
                        onPrimary={() => navigation.navigate('Chats')}
                        secondaryLabel="Refrescar"
                        onSecondary={() => refetch()}
                    />
                ) : (
                    upcoming.slice(0, 8).map((item: any) => (
                        <TouchableOpacity key={item.id} style={styles.simpleRow} onPress={() => goToChat(item)} activeOpacity={0.85}>
                            <View style={styles.simpleRowText}>
                                <Text style={styles.simpleRowTitle}>{item.title}</Text>
                                <View style={styles.simpleRowMetaRow}>
                                    <Text style={styles.simpleRowMeta}>{formatWhen(item.due_at)}</Text>
                                    <Text style={styles.simpleRowMetaMuted}>{item.conversation_name}</Text>
                                </View>
                            </View>
                            <Ionicons name="chevron-forward" size={18} color={theme.colors.text.muted} />
                        </TouchableOpacity>
                    ))
                )}
            </SectionBlock>

            <SectionBlock styles={styles} title="Grupos" subtitle="Dónde conviene entrar ahora">

                {groupsSummary.length === 0 ? (
                    <EmptyState
                        styles={styles}
                        text="Todavía no hay grupos con operación activa."
                        primaryLabel="Ir a chats"
                        onPrimary={() => navigation.navigate('Chats')}
                        secondaryLabel="Refrescar"
                        onSecondary={() => refetch()}
                    />
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
                                <Ionicons name="chevron-forward" size={18} color={theme.colors.text.muted} />
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

const createStyles = (theme: any) => StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: theme.colors.background,
    },
    content: {
        padding: 20,
        paddingBottom: 28,
        gap: 14,
    },
    center: {
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: theme.colors.background,
        padding: 24,
    },
    loadingText: {
        marginTop: 12,
        color: theme.colors.text.muted,
        fontSize: 14,
    },
    errorTitle: {
        marginTop: 12,
        fontSize: 18,
        fontWeight: '700',
        color: theme.colors.text.primary,
    },
    retryButton: {
        marginTop: 16,
        backgroundColor: theme.colors.primary,
        borderRadius: 12,
        paddingHorizontal: 16,
        paddingVertical: 12,
    },
    retryButtonText: {
        color: theme.colors.white,
        fontWeight: '700',
    },
    header: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
    },
    title: {
        fontSize: 24,
        fontWeight: '800',
        letterSpacing: -0.3,
        color: theme.colors.text.primary,
    },
    subtitle: {
        marginTop: 2,
        fontSize: 13,
        fontWeight: '600',
        color: theme.colors.text.secondary,
    },
    metricsRow: {
        flexDirection: 'row',
        gap: 10,
    },
    metricCard: {
        flex: 1,
        backgroundColor: theme.colors.surface,
        borderRadius: 16,
        paddingVertical: 12,
        paddingHorizontal: 12,
        borderWidth: 1,
        borderColor: theme.colors.separator,
        alignItems: 'flex-start',
        gap: 6,
    },
    metricIcon: {
        width: 24,
        height: 24,
        borderRadius: 8,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: theme.colors.accentSoft,
    },
    metricValue: {
        fontSize: 20,
        fontWeight: '800',
        color: theme.colors.text.primary,
    },
    metricLabel: {
        fontSize: 12,
        fontWeight: '600',
        color: theme.colors.text.muted,
    },
    sectionBlock: { gap: 10 },
    sectionHeader: {
        gap: 2,
    },
    sectionTitle: {
        fontSize: 18,
        fontWeight: '800',
        color: theme.colors.text.primary,
    },
    sectionCaption: {
        fontSize: 13,
        fontWeight: '600',
        color: theme.colors.text.secondary,
    },
    emptyCard: {
        backgroundColor: theme.colors.surface,
        borderRadius: 16,
        padding: 14,
        borderWidth: 1,
        borderColor: theme.colors.separator,
    },
    emptyText: {
        color: theme.colors.text.muted,
        fontSize: 14,
    },
    emptyActions: {
        flexDirection: 'row',
        gap: 10,
        marginTop: 12,
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
    workCard: {
        backgroundColor: theme.colors.surface,
        borderRadius: 16,
        padding: 14,
        borderWidth: 1,
        borderColor: theme.colors.separator,
        gap: 6,
    },
    workGroup: {
        fontSize: 12,
        fontWeight: '700',
        color: theme.colors.text.muted,
        textTransform: 'uppercase',
    },
    workTitle: {
        fontSize: 16,
        fontWeight: '700',
        color: theme.colors.text.primary,
    },
    workMetaRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 10,
    },
    workMeta: {
        fontSize: 13,
        color: theme.colors.text.secondary,
    },
    workTime: {
        fontSize: 12,
        fontWeight: '600',
        color: theme.colors.text.muted,
    },
    workMetaTag: {
        fontSize: 12,
        fontWeight: '600',
        color: theme.colors.text.muted,
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
        backgroundColor: theme.colors.surface,
        borderRadius: 16,
        padding: 14,
        borderWidth: 1,
        borderColor: theme.colors.separator,
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
        borderColor: theme.colors.border,
        paddingVertical: 11,
        alignItems: 'center',
        backgroundColor: theme.colors.surface,
    },
    secondaryButtonText: {
        fontWeight: '700',
        color: theme.colors.text.secondary,
    },
    primaryButton: {
        flex: 1,
        borderRadius: 12,
        paddingVertical: 11,
        alignItems: 'center',
        backgroundColor: theme.colors.primary,
    },
    primaryButtonText: {
        fontWeight: '700',
        color: theme.colors.white,
    },
    simpleRow: {
        backgroundColor: theme.colors.surface,
        borderRadius: 16,
        padding: 14,
        borderWidth: 1,
        borderColor: theme.colors.separator,
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
        color: theme.colors.text.primary,
    },
    simpleRowMetaRow: {
        marginTop: 6,
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        gap: 10,
    },
    simpleRowMeta: {
        fontSize: 12,
        fontWeight: '600',
        color: theme.colors.text.muted,
    },
    simpleRowMetaMuted: {
        fontSize: 12,
        color: theme.colors.text.secondary,
        fontWeight: '600',
    },
    groupCard: {
        backgroundColor: theme.colors.surface,
        borderRadius: 16,
        padding: 14,
        borderWidth: 1,
        borderColor: theme.colors.separator,
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
        color: theme.colors.text.primary,
    },
    groupCounts: {
        fontSize: 12,
        color: theme.colors.accent,
        fontWeight: '700',
    },
    groupMeta: {
        fontSize: 12,
        color: theme.colors.text.muted,
    },
    groupSubmeta: {
        marginTop: 4,
        fontSize: 11,
        color: theme.colors.text.muted,
        fontWeight: '600',
    },
});
