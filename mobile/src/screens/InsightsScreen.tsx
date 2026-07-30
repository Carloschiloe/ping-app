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
import { useInsights, useContacts, useGroupParticipants } from '../api/queries';
import type { ChatsTabNavigationProp } from '../navigation/types';
import { useAppTheme } from '../theme/ThemeContext';
import { useAuth } from '../context/AuthContext';
import type { Commitment, InsightsResponse } from '../types/shared';
import { getWaitingLabel } from '../utils/commitmentDisplay';
import { AgreementParticipantsList } from '../components/AgreementParticipantsList';

// V2: esta pantalla se organiza alrededor de los 7 bloques que devuelve
// GET /insights (backend/src/controllers/insights.controller.ts), NO de los
// conceptos de Operación (myFocuses/inProgress/teamStatusByGroup/mode), que
// quedan fuera de alcance de esta fase y el backend ya no calcula (siempre
// vienen vacios — por eso esas secciones NUNCA se renderizan aqui, ni
// siquiera como bloque vacio).

function formatWhen(iso?: string | null) {
    if (!iso) return 'Sin fecha';
    const date = new Date(iso);
    const time = format(date, 'HH:mm', { locale: es });

    if (isToday(date)) return `Hoy · ${time}`;
    if (isTomorrow(date)) return `Mañana · ${time}`;
    return `${format(date, 'dd/MM', { locale: es })} · ${time}`;
}

function formatDetailDate(iso?: string | null) {
    if (!iso) return 'Sin fecha';
    return format(new Date(iso), "dd MMM yyyy · HH:mm", { locale: es }).replace('.', '');
}

type InsightsStyles = ReturnType<typeof createStyles>;

const BLOCK_DEFS: { key: keyof InsightsResponse; title: string; emptyOk: boolean }[] = [
    { key: 'actionDonePendingResolution', title: '☑️ Acción realizada · pendiente de resolución', emptyOk: true },
    { key: 'needsAttention', title: '👉 Necesita tu atención', emptyOk: true },
    { key: 'overdue', title: '⏰ Vencidos', emptyOk: true },
    { key: 'awaitingResponse', title: '⏳ Esperando respuesta', emptyOk: true },
    { key: 'upcoming', title: '📅 Próximos', emptyOk: true },
    { key: 'noDate', title: '🗂️ Sin fecha', emptyOk: true },
];

function EmptyState({ text, styles }: { text: string; styles: InsightsStyles }) {
    return (
        <View style={styles.emptyCard}>
            <Text style={styles.emptyText}>{text}</Text>
        </View>
    );
}

export default function InsightsScreen() {
    const { theme } = useAppTheme();
    const styles = React.useMemo(() => createStyles(theme), [theme]);
    const navigation = useNavigation<ChatsTabNavigationProp>();
    const { user } = useAuth();
    const { data, isLoading, isError, refetch, isRefetching } = useInsights();
    const { data: myContacts } = useContacts();
    const [detailItem, setDetailItem] = React.useState<Commitment | null>(null);
    const [showRecentlyResolved, setShowRecentlyResolved] = React.useState(false);
    const { data: detailParticipants = [] } = useGroupParticipants(detailItem?.conversation_id || null);

    const insights: InsightsResponse | undefined = data;

    const contactName = (contactId?: string | null) => {
        if (!contactId) return null;
        return (myContacts || []).find((c: any) => c.id === contactId)?.display_name || 'Contacto externo';
    };

    const waitingLabel = (item: Commitment) => getWaitingLabel(item, user?.id, myContacts || []);

    const goToChat = (item: Commitment) => {
        if (!item.conversation_id) return;
        navigation.navigate('Chats', {
            screen: 'Chat',
            params: {
                conversationId: item.conversation_id,
                isGroup: true,
                otherUser: null,
                groupMetadata: { id: item.conversation_id, name: null, avatar_url: null },
                mode: 'chat',
                scrollToMessageId: item.message_id || undefined,
                commitmentId: item.id,
                commitmentTitle: item.title,
            },
        });
    };

    if (isLoading) {
        return (
            <View style={styles.center}>
                <ActivityIndicator size="large" color={theme.colors.accent} />
                <Text style={styles.loadingText}>Cargando insights...</Text>
            </View>
        );
    }

    if (isError || !insights) {
        return (
            <View style={styles.center}>
                <Ionicons name="alert-circle-outline" size={56} color={theme.colors.danger} />
                <Text style={styles.errorTitle}>No se pudieron cargar los insights</Text>
                <TouchableOpacity style={styles.retryButton} onPress={() => refetch()}>
                    <Text style={styles.retryButtonText}>Reintentar</Text>
                </TouchableOpacity>
            </View>
        );
    }

    const totalOpen = BLOCK_DEFS.reduce((sum, b) => sum + (insights[b.key] as Commitment[] | undefined || []).length, 0);
    const recentlyResolved = insights.recentlyResolved || [];

    const renderCard = (item: Commitment, blockKey: string) => {
        const label = waitingLabel(item);
        const isOverdueBlock = blockKey === 'overdue';
        const isActionDoneBlock = blockKey === 'actionDonePendingResolution';
        return (
            <TouchableOpacity
                key={item.id}
                style={styles.card}
                onPress={() => setDetailItem(item)}
                onLongPress={() => goToChat(item)}
                activeOpacity={0.85}
            >
                <View style={styles.cardTopRow}>
                    <Text style={styles.cardTitle} numberOfLines={2}>{item.title}</Text>
                    {(isOverdueBlock || isActionDoneBlock) && (
                        <View style={[styles.stateBadge, { backgroundColor: isOverdueBlock ? (theme.isDark ? '#3b1d1d' : '#fee2e2') : (theme.isDark ? '#233044' : '#e0e7ff') }]}>
                            <Text style={[styles.stateBadgeText, { color: isOverdueBlock ? theme.colors.danger : theme.colors.accent }]}>
                                {isOverdueBlock ? 'Vencida' : 'Pendiente'}
                            </Text>
                        </View>
                    )}
                </View>
                <View style={styles.cardMetaRow}>
                    <Text style={styles.cardMeta}>{formatWhen(item.due_at)}</Text>
                    <Text style={styles.cardMetaMuted} numberOfLines={1}>
                        {item.counterparty_contact_id ? (contactName(item.counterparty_contact_id) || 'Contacto') : (item.assignee?.full_name || 'Todos')}
                    </Text>
                </View>
                {!!label && <Text style={styles.cardWaiting}>{label}</Text>}
                {item.status === 'counter_proposal' && item.proposed_due_at && (
                    <Text style={styles.cardWaiting}>Propuesto: {formatWhen(item.proposed_due_at)}</Text>
                )}
            </TouchableOpacity>
        );
    };

    return (
        <>
            <ScrollView
                style={styles.container}
                contentContainerStyle={styles.content}
                refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={() => refetch()} tintColor={theme.colors.accent} />}
            >
                <View style={styles.header}>
                    <Text style={styles.title}>Compromisos</Text>
                    <TouchableOpacity onPress={() => refetch()} style={styles.refreshBtn}>
                        <Ionicons name="refresh" size={18} color={theme.colors.text.secondary} />
                    </TouchableOpacity>
                </View>

                {totalOpen === 0 ? (
                    <EmptyState styles={styles} text="No tienes compromisos abiertos por ahora." />
                ) : (
                    BLOCK_DEFS.map((block) => {
                        const items = (insights[block.key] as Commitment[] | undefined) || [];
                        if (items.length === 0) return null;
                        return (
                            <View key={block.key} style={styles.sectionBlock}>
                                <View style={styles.sectionHeader}>
                                    <Text style={styles.sectionTitle}>{block.title}</Text>
                                    <Text style={styles.sectionCount}>{items.length}</Text>
                                </View>
                                {items.map((item) => renderCard(item, block.key as string))}
                            </View>
                        );
                    })
                )}

                {recentlyResolved.length > 0 && (
                    <View style={styles.sectionBlock}>
                        <TouchableOpacity style={styles.sectionHeader} onPress={() => setShowRecentlyResolved((v) => !v)}>
                            <Text style={styles.sectionTitle}>✅ Resueltos recientemente</Text>
                            <Ionicons name={showRecentlyResolved ? 'chevron-up' : 'chevron-down'} size={18} color={theme.colors.text.muted} />
                        </TouchableOpacity>
                        {showRecentlyResolved && recentlyResolved.map((item) => renderCard(item, 'recentlyResolved'))}
                    </View>
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
                        <Text style={[styles.detailValue, theme.isDark && { color: theme.colors.text.primary }]}>{detailItem?.status}</Text>
                    </View>

                    <View style={styles.detailRow}>
                        <Text style={[styles.detailLabel, theme.isDark && { color: theme.colors.text.muted }]}>Fecha</Text>
                        <Text style={[styles.detailValue, theme.isDark && { color: theme.colors.text.primary }]}>
                            {detailItem ? formatDetailDate(detailItem.due_at) : ''}
                        </Text>
                    </View>

                    <AgreementParticipantsList
                        responses={detailItem?.agreement_responses}
                        fallbackParticipants={detailParticipants}
                        currentUserId={user?.id}
                    />

                    {!!detailItem && waitingLabel(detailItem) && (
                        <View style={styles.detailRow}>
                            <Text style={[styles.detailLabel, theme.isDark && { color: theme.colors.text.muted }]}>Seguimiento</Text>
                            <Text style={[styles.detailValue, theme.isDark && { color: theme.colors.text.primary }]}>{waitingLabel(detailItem)}</Text>
                        </View>
                    )}

                    {!!detailItem?.next_action && (
                        <View style={styles.detailRowBlock}>
                            <Text style={[styles.detailLabel, theme.isDark && { color: theme.colors.text.muted }]}>Próxima acción</Text>
                            <Text style={[styles.detailValue, theme.isDark && { color: theme.colors.text.primary }]}>{detailItem.next_action}</Text>
                        </View>
                    )}

                    {!!detailItem?.rejection_reason && (
                        <View style={styles.detailRowBlock}>
                            <Text style={[styles.detailLabel, theme.isDark && { color: theme.colors.text.muted }]}>Motivo de rechazo</Text>
                            <Text style={[styles.detailValue, theme.isDark && { color: theme.colors.text.primary }]}>{detailItem.rejection_reason}</Text>
                        </View>
                    )}

                    {detailItem?.conversation_id ? (
                        <TouchableOpacity style={styles.detailPrimaryBtn} onPress={() => { if (detailItem) goToChat(detailItem); }}>
                            <Text style={styles.detailPrimaryText}>Ver conversación</Text>
                        </TouchableOpacity>
                    ) : (
                        <Text style={[styles.emptyText, { textAlign: 'center', marginTop: 6 }]}>Este compromiso no tiene chat asociado.</Text>
                    )}
                </View>
            </Modal>
        </>
    );
}

const createStyles = (theme: any) => StyleSheet.create({
    container: { flex: 1, backgroundColor: theme.colors.background },
    content: { padding: 20, paddingTop: 28, paddingBottom: 28, gap: 14 },
    center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.colors.background, padding: 24 },
    loadingText: { marginTop: 12, color: theme.colors.text.muted, fontSize: 14 },
    errorTitle: { marginTop: 12, fontSize: 18, fontWeight: '700', color: theme.colors.text.primary },
    retryButton: { marginTop: 16, backgroundColor: theme.colors.primary, borderRadius: 12, paddingHorizontal: 16, paddingVertical: 12 },
    retryButtonText: { color: theme.colors.white, fontWeight: '700' },
    header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 },
    title: { fontSize: 24, fontWeight: '800', letterSpacing: -0.3, color: theme.colors.text.primary },
    refreshBtn: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 12, backgroundColor: theme.colors.surfaceMuted, borderWidth: 1, borderColor: theme.colors.separator },
    sectionBlock: { gap: 10 },
    sectionHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    sectionTitle: { fontSize: 16, fontWeight: '800', color: theme.colors.text.primary },
    sectionCount: { fontSize: 13, fontWeight: '700', color: theme.colors.text.muted },
    emptyCard: { backgroundColor: theme.colors.surface, borderRadius: 16, padding: 14, borderWidth: 1, borderColor: theme.colors.separator },
    emptyText: { color: theme.colors.text.muted, fontSize: 14 },
    card: { backgroundColor: theme.colors.surface, borderRadius: 16, padding: 14, borderWidth: 1, borderColor: theme.colors.separator, gap: 6 },
    cardTopRow: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10 },
    cardTitle: { flex: 1, fontSize: 15, fontWeight: '700', color: theme.colors.text.primary },
    cardMetaRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
    cardMeta: { fontSize: 12, fontWeight: '600', color: theme.colors.text.muted },
    cardMetaMuted: { fontSize: 12, color: theme.colors.text.secondary, fontWeight: '600', flexShrink: 1, textAlign: 'right' },
    cardWaiting: { fontSize: 12, color: theme.colors.accent, fontWeight: '600' },
    stateBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999 },
    stateBadgeText: { fontSize: 11, fontWeight: '800' },
    detailOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.3)' },
    detailSheet: { padding: 16, borderTopLeftRadius: 18, borderTopRightRadius: 18, backgroundColor: theme.colors.surface, borderTopWidth: 1, borderTopColor: theme.colors.separator },
    detailHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 12 },
    detailTitle: { flex: 1, fontSize: 16, fontWeight: '800', color: theme.colors.text.primary },
    detailRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginBottom: 10 },
    detailRowBlock: { marginBottom: 10 },
    detailLabel: { fontSize: 12, fontWeight: '700', color: theme.colors.text.muted, textTransform: 'uppercase', letterSpacing: 0.3 },
    detailValue: { fontSize: 13, fontWeight: '600', color: theme.colors.text.primary },
    detailPrimaryBtn: { marginTop: 6, paddingVertical: 12, borderRadius: 12, backgroundColor: theme.colors.primary, alignItems: 'center' },
    detailPrimaryText: { color: theme.colors.white, fontWeight: '700', fontSize: 14 },
});
