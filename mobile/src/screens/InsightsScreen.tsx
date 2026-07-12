import React from 'react';
import {
    ActivityIndicator,
    RefreshControl,
    ScrollView,
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
    Modal,
    Pressable,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { format, isToday, isTomorrow } from 'date-fns';
import { es } from 'date-fns/locale';
import { useNavigation } from '@react-navigation/native';
import { useInsights } from '../api/queries';
import type { ChatsTabNavigationProp } from '../navigation/types';
import { useAppTheme } from '../theme/ThemeContext';
import { normalizeCommitmentStatus } from '../utils/commitmentStatus';
import { useAuth } from '../context/AuthContext';

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

function SectionBlock({ title, subtitle, children, styles }: { title: string; subtitle?: string; children: React.ReactNode; styles: InsightsStyles }) {
    return (
        <View style={styles.sectionBlock}>
            <View style={styles.sectionHeader}>
                <Text style={styles.sectionTitle}>{title}</Text>
                {!!subtitle && <Text style={styles.sectionCaption}>{subtitle}</Text>}
            </View>
            {children}
        </View>
    );
}

export default function InsightsScreen() {
    const { theme } = useAppTheme();
    const styles = React.useMemo(() => createStyles(theme), [theme]);
    const navigation = useNavigation<ChatsTabNavigationProp>();
    const { user } = useAuth();
    const { data, isLoading, isError, refetch, isRefetching } = useInsights();
    const [typeFilter, setTypeFilter] = React.useState<'all' | 'tasks' | 'meetings'>('all');
    const [detailItem, setDetailItem] = React.useState<any | null>(null);

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
        const scrollToMessageId = item.message_id || item?.meta?.source_message_id || item?.meta?.origin_message_id;
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
                scrollToMessageId,
                commitmentId: item.id,
                commitmentTitle: item.title,
            },
        });
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

    const inProgressRaw = data?.inProgress || [];
    const pendingResponse = data?.pendingResponse || [];
    const upcomingRaw = data?.upcoming || [];
    const now = new Date();

    const isOverdue = (item: any) => {
        if (!item?.due_at) return false;
        const normalized = normalizeCommitmentStatus(item.status);
        if (normalized === 'completed' || normalized === 'rejected') return false;
        return new Date(item.due_at) < now;
    };

    const isMeeting = (item: any) => {
        if (item?.type === 'meeting') return true;
        return /reuni[oó]n|llamada|junta|meet|zoom|call|cita/i.test(item?.title || '');
    };

    const overdueFromFlow = [...inProgressRaw, ...upcomingRaw].filter((item: any) => isOverdue(item));
    const upcoming = upcomingRaw.filter((item: any) => !isOverdue(item));
    const inProgress = inProgressRaw.filter((item: any) => !isOverdue(item));
    const pending = pendingResponse.filter((item: any) => !isOverdue(item));
    const overdueFromPending = pendingResponse.filter((item: any) => isOverdue(item));

    const overdueMap = new Map<string, any>();
    [...overdueFromFlow, ...overdueFromPending].forEach((item: any) => overdueMap.set(item.id, item));
    const overdue = Array.from(overdueMap.values());

    const metricCounts = {
        pending: pending.length,
        inProgress: inProgress.length,
        upcoming: upcoming.length,
        overdue: overdue.length,
    };

    const priorityItems = [
        ...pending.map((item: any) => ({ ...item, _priorityType: 'pending' })),
        ...overdue.map((item: any) => ({ ...item, _priorityType: 'overdue' })),
    ].sort((a: any, b: any) => {
        const dateA = a.due_at ? new Date(a.due_at).getTime() : 0;
        const dateB = b.due_at ? new Date(b.due_at).getTime() : 0;
        return dateA - dateB;
    });

    const filterByType = (items: any[]) => items.filter((item: any) => {
        if (typeFilter === 'all') return true;
        return typeFilter === 'meetings' ? isMeeting(item) : !isMeeting(item);
    });

    const filteredPriority = filterByType(priorityItems);
    const filteredInProgress = filterByType(inProgress);
    const filteredUpcoming = filterByType(upcoming);

    const formatDetailDate = (iso?: string | null) => {
        if (!iso) return 'Sin fecha';
        return format(new Date(iso), "dd MMM yyyy · HH:mm", { locale: es }).replace('.', '');
    };

    const getStatusLabel = (item: any) => {
        if (isOverdue(item)) return 'Vencida';
        const normalized = normalizeCommitmentStatus(item.status);
        if (normalized === 'completed') return 'Completada';
        if (normalized === 'rejected') return 'Rechazada';
        if (normalized === 'accepted') return 'En curso';
        return 'Pendiente';
    };

    const getOperationLabel = (item: any) => {
        const operational = item?.meta?.operational || {};
        const normalized = normalizeCommitmentStatus(item.status);
        if (operational.completed_at || normalized === 'completed') return 'Terminado';
        if (operational.arrived_at) return 'En sitio';
        if (operational.acknowledged_at) return 'Iniciada';
        if (normalized === 'accepted') return 'Lista';
        return 'Pendiente';
    };

    return (
        <>
            <ScrollView
                style={styles.container}
                contentContainerStyle={styles.content}
                refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={() => refetch()} tintColor={theme.colors.accent} />}
            >
            <View style={styles.header}>
                <Text style={styles.title}>Operación</Text>
                <TouchableOpacity onPress={() => refetch()} style={styles.refreshBtn}>
                    <Ionicons name="refresh" size={18} color={theme.colors.text.secondary} />
                </TouchableOpacity>
            </View>

            <View style={styles.summaryRow}>
                <Text style={styles.summaryLabel}>Hoy</Text>
                <Text style={styles.summaryValue}>{metricCounts.pending} pendientes · {metricCounts.overdue} vencidas · {metricCounts.inProgress} en curso</Text>
            </View>

            <View style={styles.typeFilterRow}>
                <TouchableOpacity
                    style={[styles.typeChip, typeFilter === 'all' && styles.typeChipActive]}
                    onPress={() => setTypeFilter('all')}
                >
                    <Text style={[styles.typeChipText, typeFilter === 'all' && styles.typeChipTextActive]}>Todo</Text>
                </TouchableOpacity>
                <TouchableOpacity
                    style={[styles.typeChip, typeFilter === 'tasks' && styles.typeChipActive]}
                    onPress={() => setTypeFilter('tasks')}
                >
                    <Text style={[styles.typeChipText, typeFilter === 'tasks' && styles.typeChipTextActive]}>Tareas</Text>
                </TouchableOpacity>
                <TouchableOpacity
                    style={[styles.typeChip, typeFilter === 'meetings' && styles.typeChipActive]}
                    onPress={() => setTypeFilter('meetings')}
                >
                    <Text style={[styles.typeChipText, typeFilter === 'meetings' && styles.typeChipTextActive]}>Reuniones</Text>
                </TouchableOpacity>
            </View>

            <SectionBlock styles={styles} title="Prioridad">
                {filteredPriority.length === 0 ? (
                    <EmptyState
                        styles={styles}
                        text="Nada urgente por ahora."
                        primaryLabel="Ir a chats"
                        onPrimary={() => navigation.navigate('Chats')}
                        secondaryLabel="Refrescar"
                        onSecondary={() => refetch()}
                    />
                ) : (
                    filteredPriority.map((item: any) => (
                        <View key={item.id} style={styles.responseCard}>
                            <TouchableOpacity
                                onPress={() => setDetailItem(item)}
                                onLongPress={() => goToChat(item)}
                                activeOpacity={0.85}
                            >
                                <View style={styles.priorityHeaderRow}>
                                    <Text style={styles.workGroup}>{item.conversation_name}</Text>
                                    <View style={[styles.stateBadge, { backgroundColor: item._priorityType === 'overdue' ? (theme.isDark ? '#3b1d1d' : '#fee2e2') : (theme.isDark ? '#3b2a15' : '#fef3c7') }]}>
                                        <Text style={[styles.stateBadgeText, { color: item._priorityType === 'overdue' ? theme.colors.danger : '#92400e' }]}>
                                            {item._priorityType === 'overdue' ? 'Vencida' : 'Pendiente'}
                                        </Text>
                                    </View>
                                </View>
                                <Text style={styles.workTitle}>{item.title}</Text>
                                <View style={styles.workMetaRow}>
                                    <Text style={styles.workTime}>{formatWhen(item.due_at)}</Text>
                                    <Text style={styles.workMetaTag}>Solicita: {item.owner?.full_name || 'Alguien'}</Text>
                                </View>
                            </TouchableOpacity>

                        </View>
                    ))
                )}
            </SectionBlock>

            {filteredInProgress.length > 0 && (
                <SectionBlock styles={styles} title="En curso">
                    {filteredInProgress.map((item: any) => {
                        const tone = getStateTone(item.operational_state);
                        return (
                            <TouchableOpacity
                                key={item.id}
                                style={styles.workCard}
                                onPress={() => setDetailItem(item)}
                                onLongPress={() => goToChat(item)}
                                activeOpacity={0.85}
                            >
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
                    })}
                </SectionBlock>
            )}

            {filteredUpcoming.length > 0 && (
                <SectionBlock styles={styles} title="Próximas">
                    {filteredUpcoming.slice(0, 8).map((item: any) => (
                        <TouchableOpacity
                            key={item.id}
                            style={styles.simpleRow}
                            onPress={() => setDetailItem(item)}
                            onLongPress={() => goToChat(item)}
                            activeOpacity={0.85}
                        >
                            <View style={styles.simpleRowText}>
                                <Text style={styles.simpleRowTitle}>{item.title}</Text>
                                <View style={styles.simpleRowMetaRow}>
                                    <Text style={styles.simpleRowMeta}>{formatWhen(item.due_at)}</Text>
                                    <Text style={styles.simpleRowMetaMuted}>{item.conversation_name}</Text>
                                </View>
                            </View>
                            <Ionicons name="chevron-forward" size={18} color={theme.colors.text.muted} />
                        </TouchableOpacity>
                    ))}
                </SectionBlock>
            )}

            </ScrollView>

            <Modal
                visible={!!detailItem}
                transparent
                animationType="slide"
                onRequestClose={() => setDetailItem(null)}
            >
                <Pressable style={styles.detailOverlay} onPress={() => setDetailItem(null)} />
                <View style={[styles.detailSheet, theme.isDark && { backgroundColor: theme.colors.surfaceElevated }]}>
                <View style={styles.detailHeader}>
                    <Text style={[styles.detailTitle, theme.isDark && { color: theme.colors.text.primary }]} numberOfLines={2}>
                        {detailItem?.title || 'Detalle'}
                    </Text>
                    <TouchableOpacity onPress={() => setDetailItem(null)}>
                        <Ionicons name="close" size={22} color={theme.colors.text.muted} />
                    </TouchableOpacity>
                </View>

                <View style={styles.detailRow}>
                    <Text style={[styles.detailLabel, theme.isDark && { color: theme.colors.text.muted }]}>Estado</Text>
                    <Text style={[styles.detailValue, theme.isDark && { color: theme.colors.text.primary }]}>
                        {detailItem ? getStatusLabel(detailItem) : ''}
                    </Text>
                </View>

                <View style={styles.detailRow}>
                    <Text style={[styles.detailLabel, theme.isDark && { color: theme.colors.text.muted }]}>Operación</Text>
                    <Text style={[styles.detailValue, theme.isDark && { color: theme.colors.text.primary }]}>
                        {detailItem ? getOperationLabel(detailItem) : ''}
                    </Text>
                </View>

                <View style={styles.detailRow}>
                    <Text style={[styles.detailLabel, theme.isDark && { color: theme.colors.text.muted }]}>Responsable</Text>
                    <Text style={[styles.detailValue, theme.isDark && { color: theme.colors.text.primary }]}>
                        {detailItem?.assignee?.full_name || 'Todos'}
                    </Text>
                </View>

                <View style={styles.detailRow}>
                    <Text style={[styles.detailLabel, theme.isDark && { color: theme.colors.text.muted }]}>Fecha</Text>
                    <Text style={[styles.detailValue, theme.isDark && { color: theme.colors.text.primary }]}>
                        {detailItem ? formatDetailDate(detailItem.due_at) : ''}
                    </Text>
                </View>

                <View style={styles.detailRow}>
                    <Text style={[styles.detailLabel, theme.isDark && { color: theme.colors.text.muted }]}>Solicita</Text>
                    <Text style={[styles.detailValue, theme.isDark && { color: theme.colors.text.primary }]}>
                        {detailItem?.owner_user_id && user?.id && detailItem.owner_user_id.toLowerCase() === user.id.toLowerCase()
                            ? 'Tú'
                            : (detailItem?.owner?.full_name || 'Alguien')}
                    </Text>
                </View>

                {detailItem?.meta?.operational?.completed_at && (
                    <>
                        <View style={styles.detailRow}>
                            <Text style={[styles.detailLabel, theme.isDark && { color: theme.colors.text.muted }]}>Completado por</Text>
                            <Text style={[styles.detailValue, theme.isDark && { color: theme.colors.text.primary }]}>
                                {detailItem?.meta?.operational?.completed_by_name || detailItem?.assignee?.full_name || 'Alguien'}
                            </Text>
                        </View>
                        <View style={styles.detailRow}>
                            <Text style={[styles.detailLabel, theme.isDark && { color: theme.colors.text.muted }]}>Completado</Text>
                            <Text style={[styles.detailValue, theme.isDark && { color: theme.colors.text.primary }]}>
                                {formatDetailDate(detailItem?.meta?.operational?.completed_at)}
                            </Text>
                        </View>
                    </>
                )}

                {detailItem?.meta?.operational?.completion_note && (
                    <View style={styles.detailRowBlock}>
                        <Text style={[styles.detailLabel, theme.isDark && { color: theme.colors.text.muted }]}>Observación</Text>
                        <Text style={[styles.detailValue, theme.isDark && { color: theme.colors.text.primary }]}>
                            {detailItem.meta.operational.completion_note}
                        </Text>
                    </View>
                )}

                <TouchableOpacity style={styles.detailPrimaryBtn} onPress={() => { if (detailItem) goToChat(detailItem); }}>
                    <Text style={styles.detailPrimaryText}>Ir al chat</Text>
                </TouchableOpacity>
            </View>
            </Modal>
        </>
    );
}

const createStyles = (theme: any) => StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: theme.colors.background,
    },
    content: {
        padding: 20,
        paddingTop: 28,
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
        marginBottom: 4,
    },
    title: {
        fontSize: 24,
        fontWeight: '800',
        letterSpacing: -0.3,
        color: theme.colors.text.primary,
    },
    refreshBtn: {
        paddingHorizontal: 10,
        paddingVertical: 6,
        borderRadius: 12,
        backgroundColor: theme.colors.surfaceMuted,
        borderWidth: 1,
        borderColor: theme.colors.separator,
    },
    summaryRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
        backgroundColor: theme.colors.surface,
        borderRadius: 16,
        paddingVertical: 10,
        paddingHorizontal: 14,
        borderWidth: 1,
        borderColor: theme.colors.separator,
    },
    summaryLabel: {
        fontSize: 11,
        fontWeight: '800',
        color: theme.colors.text.muted,
        textTransform: 'uppercase',
    },
    summaryValue: {
        fontSize: 13,
        fontWeight: '700',
        color: theme.colors.text.secondary,
    },
    typeFilterRow: {
        flexDirection: 'row',
        gap: 8,
        marginTop: 6,
    },
    typeChip: {
        paddingHorizontal: 10,
        paddingVertical: 6,
        borderRadius: 12,
        backgroundColor: theme.colors.surfaceMuted,
        borderWidth: 1,
        borderColor: theme.colors.separator,
    },
    typeChipActive: {
        backgroundColor: theme.colors.accent,
        borderColor: theme.colors.accent,
    },
    typeChipText: {
        fontSize: 11,
        fontWeight: '700',
        color: theme.colors.text.secondary,
    },
    typeChipTextActive: {
        color: theme.colors.white,
    },
    sectionBlock: { gap: 10 },
    sectionHeader: {
        gap: 2,
    },
    sectionTitle: {
        fontSize: 16,
        fontWeight: '800',
        color: theme.colors.text.primary,
    },
    sectionCaption: {
        fontSize: 12,
        fontWeight: '600',
        color: theme.colors.text.muted,
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
    priorityHeaderRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 10,
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
    detailOverlay: {
        flex: 1,
        backgroundColor: 'rgba(0,0,0,0.3)',
    },
    detailSheet: {
        padding: 16,
        borderTopLeftRadius: 18,
        borderTopRightRadius: 18,
        backgroundColor: theme.colors.surface,
        borderTopWidth: 1,
        borderTopColor: theme.colors.separator,
    },
    detailHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 12,
        marginBottom: 12,
    },
    detailTitle: {
        flex: 1,
        fontSize: 16,
        fontWeight: '800',
        color: theme.colors.text.primary,
    },
    detailRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 10,
        marginBottom: 10,
    },
    detailRowBlock: {
        marginBottom: 10,
    },
    detailLabel: {
        fontSize: 12,
        fontWeight: '700',
        color: theme.colors.text.muted,
        textTransform: 'uppercase',
        letterSpacing: 0.3,
    },
    detailValue: {
        fontSize: 13,
        fontWeight: '600',
        color: theme.colors.text.primary,
    },
    detailPrimaryBtn: {
        marginTop: 6,
        paddingVertical: 12,
        borderRadius: 12,
        backgroundColor: theme.colors.primary,
        alignItems: 'center',
    },
    detailPrimaryText: {
        color: theme.colors.white,
        fontWeight: '700',
        fontSize: 14,
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
