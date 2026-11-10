import React, { useMemo, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, SectionList, ActivityIndicator, Alert } from 'react-native';
import * as Haptics from 'expo-haptics';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation, useRoute } from '@react-navigation/native';
import { LinearGradient } from 'expo-linear-gradient';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import {
    useConversationGroupTasks, useSendConversationMessage, useUpdateCommitment, useCancelCommitment,
    useReopenCommitment, useRespondToCommitmentProposal,
} from '../api/queries';
import { useCloseCommitment } from '../hooks/useCloseCommitment';
import { chatReminderText, combinedReminderText, markNudged, nudgeTarget, type NudgeTarget } from '../utils/chatNudge';
import { confirmAction } from '../design/ConfirmDialog';
import { RescheduleModal } from '../components/compromisos/RescheduleModal';
import { CloseCommitmentSheet, type CloseOutcome } from '../components/compromisos/CloseCommitmentSheet';
import { useAuth } from '../context/AuthContext';
import { normalizeCommitmentStatus } from '../utils/commitmentStatus';
import { getStatusLabel } from '../utils/commitmentDisplay';
import { outcomeOf, summarize, type Outcome } from '../utils/commitmentOutcome';
import { colors, gradients, radius, space } from '../design/tokens';
import { fonts, type } from '../design/typography';
import { Glass } from '../design/Glass';
import { ScreenHeader } from '../design/ScreenHeader';
import { CommitmentDetailSheet } from '../components/compromisos/CommitmentDetailSheet';
import type { TaskHistoryScreenProps } from '../navigation/types';

// Everything agreed in one chat or group, old and new: what got done, what
// is still open, what is late and what was not accepted. Each one can be
// acted on from here, and the late or unanswered ones can be reminded at once.

type KindFilter = 'all' | 'tasks' | 'meetings';

const whenOf = (item: any) => item.due_at || item.created_at;

type Look = { label: string; icon: keyof typeof Ionicons.glyphMap; tone: string; tint: string };

const TILES: Array<Look & { key: Outcome }> = [
    { key: 'pending', label: 'Pendientes', icon: 'time-outline', tone: colors.accentBright, tint: colors.accentTint },
    { key: 'overdue', label: 'Atrasados', icon: 'alert-circle-outline', tone: colors.warning, tint: colors.warningTint },
    { key: 'done', label: 'Cumplidos', icon: 'checkmark-circle-outline', tone: colors.success, tint: colors.successTint },
    { key: 'declined', label: 'Anulados', icon: 'close-circle-outline', tone: colors.danger, tint: colors.dangerTint },
];

// Pendientes also holds the unanswered ones whose date went by.
const inTile = (tile: Outcome, result: Outcome) => tile === result || (tile === 'pending' && result === 'expired');

const PILLS: Record<Outcome, Look> = {
    pending: { label: 'Pendiente', icon: 'time-outline', tone: colors.accentBright, tint: colors.accentTint },
    expired: { label: 'Sin respuesta', icon: 'hourglass-outline', tone: colors.textSoft, tint: colors.glassRaised },
    overdue: { label: 'Atrasado', icon: 'alert-circle-outline', tone: colors.warning, tint: colors.warningTint },
    done: { label: 'Cumplido', icon: 'checkmark-circle-outline', tone: colors.success, tint: colors.successTint },
    declined: { label: 'Anulado', icon: 'close-circle-outline', tone: colors.danger, tint: colors.dangerTint },
};

export default function TaskHistoryScreen() {
    const route = useRoute<TaskHistoryScreenProps['route']>();
    const navigation = useNavigation();
    const { user } = useAuth();
    const { conversationId, isGroup, title } = route.params;

    const { data: items = [], isLoading } = useConversationGroupTasks(conversationId);

    const [outcome, setOutcome] = useState<Outcome | null>(null);
    const [kind, setKind] = useState<KindFilter>('all');
    const [personId, setPersonId] = useState<string | null>(null);
    const [detailItem, setDetailItem] = useState<any | null>(null);
    const [closeItem, setCloseItem] = useState<any | null>(null);
    const [dateItem, setDateItem] = useState<any | null>(null);

    const { mutateAsync: sendChatMessage } = useSendConversationMessage(conversationId);
    const { mutateAsync: updateCommitment } = useUpdateCommitment();
    const { mutateAsync: cancelCommitment } = useCancelCommitment();
    const { mutate: reopenCommitment } = useReopenCommitment();
    const { mutateAsync: respondToProposal } = useRespondToCommitmentProposal();
    const { close: closeCommitment, isSaving: isClosing } = useCloseCommitment();

    const sendReminder = async (text: string, ids: string[]) => {
        const ok = await confirmAction({ title: 'Enviar recordatorio', message: text, confirmLabel: 'Enviar', destructive: false });
        if (!ok) return;
        try {
            await sendChatMessage({ text, client_message_id: `nudge-${Date.now()}` });
            await markNudged(ids);
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        } catch {
            Alert.alert('No se pudo enviar el recordatorio', 'Intenta nuevamente.');
        }
    };

    const handleNudge = (item: any) => {
        const target = nudgeTarget(item, user?.id);
        if (target) sendReminder(chatReminderText(item, target), [item.id]);
    };

    const handleCancel = async (id: string) => {
        const ok = await confirmAction({ title: 'Cancelar compromiso', message: 'Quedará en Anulados. Puedes reabrirlo después.', confirmLabel: 'Cancelar compromiso' });
        if (!ok) return;
        try {
            await cancelCommitment({ id });
        } catch (error: any) {
            if (error?.status === 403) {
                Alert.alert('No puedes cancelarlo', 'Solo quien creó este compromiso puede cancelarlo.');
                return;
            }
            Alert.alert('No se pudo cancelar el compromiso', 'Intenta nuevamente.');
        }
    };

    const handleCloseSubmit = async (result: CloseOutcome, note: string, dueAt: Date | null) => {
        if (!closeItem) return;
        try {
            await closeCommitment(closeItem, result, note, dueAt);
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
            setCloseItem(null);
        } catch {
            Alert.alert('No se pudo guardar', 'Intenta nuevamente.');
        }
    };

    // A proposal gets a new date by proposing it; a commitment by changing it.
    const handleSaveDate = async (id: string, iso: string) => {
        try {
            if (dateItem?._isAgreementProposal) await respondToProposal({ id, decision: 'counter_propose', proposedDueAt: iso });
            else await updateCommitment({ id, data: { due_at: iso } });
        } catch {
            Alert.alert('No se pudo poner la fecha', 'Intenta nuevamente.');
        }
    };

    const people = useMemo(() => {
        const map = new Map<string, any>();
        items.forEach((t: any) => { if (t.assignee?.id) map.set(t.assignee.id, t.assignee); });
        return Array.from(map.values());
    }, [items]);

    // The summary follows the type and person filters, so it always describes
    // the list underneath it.
    const scoped = useMemo(() => items.filter((t: any) => {
        if (kind === 'meetings' && t.type !== 'meeting') return false;
        if (kind === 'tasks' && t.type === 'meeting') return false;
        if (personId && t.assigned_to_user_id !== personId) return false;
        return true;
    }), [items, kind, personId]);

    const { counts, keptPercent } = useMemo(() => summarize(scoped), [scoped]);
    const tileCount = (key: Outcome) => counts[key] + (key === 'pending' ? counts.expired : 0);

    // With Atrasados or Pendientes picked, everything there that waits on
    // someone else can be reminded in one friendly message.
    const remindable = useMemo(() => {
        if (outcome !== 'overdue' && outcome !== 'pending') return [];
        return scoped
            .filter((t: any) => inTile(outcome, outcomeOf(t)))
            .map((t: any) => ({ item: t, target: nudgeTarget(t, user?.id) }))
            .filter((x): x is { item: any; target: NudgeTarget } => !!x.target);
    }, [scoped, outcome, user?.id]);

    const sections = useMemo(() => {
        const shown = scoped
            .filter((t: any) => !outcome || inTile(outcome, outcomeOf(t)))
            .sort((a: any, b: any) => new Date(whenOf(b)).getTime() - new Date(whenOf(a)).getTime());
        const byMonth = new Map<string, any[]>();
        shown.forEach((t: any) => {
            const month = format(new Date(whenOf(t)), 'MMMM yyyy', { locale: es });
            byMonth.set(month, [...(byMonth.get(month) || []), t]);
        });
        return Array.from(byMonth, ([month, data]) => ({ title: month.charAt(0).toUpperCase() + month.slice(1), data }));
    }, [scoped, outcome]);

    const chip = (active: boolean, label: string, onPress: () => void, key: string) => (
        <TouchableOpacity key={key} style={[styles.chip, !active && styles.chipIdle]} onPress={onPress} accessibilityState={{ selected: active }}>
            {active && <LinearGradient colors={gradients.accent} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />}
            <Text style={[styles.chipText, active && styles.chipTextActive]} numberOfLines={1}>{label}</Text>
        </TouchableOpacity>
    );

    const header = (
        <View style={styles.controls}>
            <View style={styles.summaryCard}>
                <Glass style={[StyleSheet.absoluteFill, styles.cardGlass]} intensity={22} tint={colors.glassTintLight} />
                <View style={styles.summaryTop}>
                    <Text style={styles.summaryTitle}>{keptPercent === null ? 'Sin compromisos vencidos aún' : `${keptPercent}% cumplido`}</Text>
                    <Text style={styles.summaryHint}>{scoped.length} en total</Text>
                </View>
                {keptPercent !== null && (
                    <View style={styles.meter}>
                        <View style={[styles.meterFill, { width: `${keptPercent}%` }]} />
                    </View>
                )}
                <View style={styles.tiles}>
                    {TILES.map((tile) => {
                        const active = outcome === tile.key;
                        return (
                            <TouchableOpacity
                                key={tile.key}
                                style={[styles.tile, active && { backgroundColor: tile.tint, borderColor: tile.tone }]}
                                onPress={() => setOutcome(active ? null : tile.key)}
                                accessibilityRole="button"
                                accessibilityState={{ selected: active }}
                                accessibilityLabel={`${tile.label}: ${tileCount(tile.key)}`}
                            >
                                <Ionicons name={tile.icon} size={18} color={tile.tone} />
                                <Text style={styles.tileCount}>{tileCount(tile.key)}</Text>
                                <Text style={styles.tileLabel} numberOfLines={1}>{tile.label}</Text>
                            </TouchableOpacity>
                        );
                    })}
                </View>
                {remindable.length > 0 && (
                    <TouchableOpacity
                        style={styles.remindAll}
                        onPress={() => sendReminder(
                            remindable.length === 1
                                ? chatReminderText(remindable[0].item, remindable[0].target)
                                : combinedReminderText(remindable.map((x) => x.item), remindable.map((x) => x.target)),
                            remindable.map((x) => x.item.id),
                        )}
                        accessibilityRole="button"
                    >
                        <Ionicons name="notifications-outline" size={16} color={colors.accentBright} />
                        <Text style={styles.remindAllText}>{remindable.length === 1 ? 'Recordarle' : `Recordar a todos (${remindable.length})`}</Text>
                    </TouchableOpacity>
                )}
            </View>

            <View style={styles.filterRow}>
                {chip(kind === 'all', 'Todo', () => setKind('all'), 'all')}
                {chip(kind === 'tasks', 'Tareas', () => setKind('tasks'), 'tasks')}
                {chip(kind === 'meetings', 'Reuniones', () => setKind('meetings'), 'meetings')}
            </View>

            {isGroup && people.length > 1 && (
                <View style={styles.filterRow}>
                    {chip(!personId, 'Todos', () => setPersonId(null), 'everyone')}
                    {people.map((p: any) => chip(personId === p.id, p.id === user?.id ? 'Yo' : (p.full_name?.split(' ')[0] || 'Usuario'), () => setPersonId(p.id), p.id))}
                </View>
            )}
        </View>
    );

    const renderItem = ({ item, index, section }: { item: any; index: number; section: { data: any[] } }) => {
        const result = outcomeOf(item);
        const tile = PILLS[result];
        const when = whenOf(item) ? new Date(whenOf(item)) : null;
        const who = item.assignee?.id === user?.id ? 'Para ti' : item.assignee?.full_name ? `Para ${item.assignee.full_name.split(' ')[0]}` : null;
        const meta = [item.type === 'meeting' ? 'Reunión' : 'Tarea', who, item.due_at ? format(new Date(item.due_at), 'HH:mm') : 'Sin fecha'].filter(Boolean).join(' · ');
        const first = index === 0;
        const last = index === section.data.length - 1;
        return (
            <TouchableOpacity
                activeOpacity={0.75}
                onPress={() => setDetailItem(item)}
                style={[styles.row, first && styles.rowFirst, last && styles.rowLast]}
                accessibilityRole="button"
                accessibilityLabel={`${item.title}, ${tile.label}`}
            >
                <Glass style={[StyleSheet.absoluteFill, styles.rowGlass]} intensity={22} tint={colors.glassTintLight} />
                {!first && <View pointerEvents="none" style={styles.divider} />}
                <View style={styles.dateBadge}>
                    <Text style={styles.dateDay}>{when ? format(when, 'd') : '—'}</Text>
                    <Text style={styles.dateMonth}>{when ? format(when, 'MMM', { locale: es }).replace('.', '') : ''}</Text>
                </View>
                <View style={styles.rowBody}>
                    <Text style={styles.rowTitle} numberOfLines={1}>{item.title}</Text>
                    <Text style={styles.rowMeta} numberOfLines={1}>{meta}</Text>
                </View>
                <View style={[styles.pill, { backgroundColor: tile.tint }]}>
                    <Ionicons name={tile.icon} size={13} color={tile.tone} />
                    <Text style={[styles.pillText, { color: tile.tone }]}>{result === 'declined' ? getStatusLabel(normalizeCommitmentStatus(item.status)) : tile.label}</Text>
                </View>
            </TouchableOpacity>
        );
    };

    return (
        <View style={styles.container}>
            <ScreenHeader title={title ? `Compromisos · ${title}` : 'Compromisos'} onBack={() => navigation.goBack()} />
            {isLoading ? (
                <View style={styles.loadingWrap}>
                    <ActivityIndicator size="small" color={colors.accentBright} />
                </View>
            ) : (
                <SectionList
                    sections={sections}
                    keyExtractor={(item) => item.id}
                    renderItem={renderItem}
                    renderSectionHeader={({ section }) => <Text style={styles.monthTitle}>{section.title}</Text>}
                    ListHeaderComponent={header}
                    stickySectionHeadersEnabled={false}
                    contentContainerStyle={styles.listContent}
                    ListEmptyComponent={
                        <View style={styles.emptyWrap}>
                            <View style={styles.emptyIcon}>
                                <Ionicons name="checkmark-done-outline" size={30} color={colors.accentBright} />
                            </View>
                            <Text style={styles.emptyText}>{items.length ? 'Nada con este filtro' : 'Aún no hay compromisos'}</Text>
                            <Text style={styles.emptySubtext}>{items.length ? 'Toca otro filtro para ver más' : 'Lo que acuerden en este chat aparecerá aquí'}</Text>
                        </View>
                    }
                />
            )}
            <CommitmentDetailSheet
                item={detailItem}
                currentUserId={user?.id}
                onClose={() => setDetailItem(null)}
                onMarkDone={(id) => setCloseItem(items.find((t: any) => t.id === id) ?? null)}
                onReschedule={(item) => setDateItem(item)}
                onCancel={handleCancel}
                onReopen={(id) => reopenCommitment(id)}
                onNudge={detailItem && nudgeTarget(detailItem, user?.id) ? handleNudge : undefined}
            />
            <CloseCommitmentSheet
                item={closeItem}
                canCancel={!!closeItem && closeItem.owner_user_id === user?.id}
                isSaving={isClosing}
                onClose={() => setCloseItem(null)}
                onSubmit={handleCloseSubmit}
                onReschedule={(item) => { setCloseItem(null); setDateItem(item); }}
            />
            <RescheduleModal item={dateItem} onClose={() => setDateItem(null)} onSaveDate={handleSaveDate} />
        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: 'transparent' },
    controls: { paddingTop: space.lg, gap: space.md },
    summaryCard: { borderRadius: radius.lg, overflow: 'hidden', padding: space.lg, gap: space.md },
    cardGlass: { borderRadius: radius.lg, borderTopColor: colors.glassEdge },
    summaryTop: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between' },
    summaryTitle: { fontFamily: fonts.semibold, fontSize: 18, color: colors.text },
    summaryHint: { ...type.caption, color: colors.textFaint },
    meter: { height: 6, borderRadius: 3, backgroundColor: colors.glassRaised, overflow: 'hidden' },
    meterFill: { height: 6, borderRadius: 3, backgroundColor: colors.success },
    tiles: { flexDirection: 'row', gap: space.sm },
    tile: {
        flex: 1,
        alignItems: 'center',
        paddingVertical: space.sm,
        gap: 2,
        borderRadius: radius.md,
        backgroundColor: colors.glassDim,
        borderWidth: StyleSheet.hairlineWidth,
        borderColor: colors.glassBorder,
    },
    tileCount: { fontFamily: fonts.bold, fontSize: 18, color: colors.text },
    tileLabel: { fontFamily: fonts.medium, fontSize: 11, color: colors.textSoft },
    filterRow: { flexDirection: 'row', gap: space.sm, flexWrap: 'wrap' },
    chip: {
        paddingHorizontal: 13,
        height: 30,
        borderRadius: radius.full,
        alignItems: 'center',
        justifyContent: 'center',
        overflow: 'hidden',
        maxWidth: 140,
    },
    chipIdle: { backgroundColor: colors.glassDim, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.glassBorder },
    chipText: { fontFamily: fonts.semibold, fontSize: 13, color: colors.textSoft },
    chipTextActive: { color: colors.onAccent },
    listContent: { paddingHorizontal: space.lg, paddingBottom: space.xxl },
    monthTitle: { fontFamily: fonts.semibold, fontSize: 14, color: colors.textSoft, marginTop: space.xl, marginBottom: space.sm, marginLeft: space.xs },
    row: { flexDirection: 'row', alignItems: 'center', gap: space.md, paddingHorizontal: space.lg, paddingVertical: space.md, overflow: 'hidden' },
    rowFirst: { borderTopLeftRadius: radius.lg, borderTopRightRadius: radius.lg },
    rowLast: { borderBottomLeftRadius: radius.lg, borderBottomRightRadius: radius.lg },
    rowGlass: { borderWidth: 0 },
    divider: { position: 'absolute', top: 0, left: space.lg + 44 + space.md, right: 0, height: StyleSheet.hairlineWidth, backgroundColor: colors.separator },
    dateBadge: { width: 44, height: 44, borderRadius: radius.sm, backgroundColor: colors.glassRaised, alignItems: 'center', justifyContent: 'center' },
    dateDay: { fontFamily: fonts.bold, fontSize: 16, color: colors.text },
    dateMonth: { fontFamily: fonts.medium, fontSize: 11, color: colors.textSoft },
    rowBody: { flex: 1, gap: 2 },
    rowTitle: { fontFamily: fonts.semibold, fontSize: 15, color: colors.text },
    rowMeta: { ...type.caption, color: colors.textFaint },
    remindAll: {
        flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
        paddingVertical: 10, borderRadius: radius.md,
        backgroundColor: colors.accentTint, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.accent,
    },
    remindAllText: { fontFamily: fonts.semibold, fontSize: 14, color: colors.accentBright },
    pill: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 4, borderRadius: radius.full },
    pillText: { fontFamily: fonts.semibold, fontSize: 11 },
    loadingWrap: { paddingTop: space.xl, alignItems: 'center' },
    emptyWrap: { paddingTop: 48, alignItems: 'center' },
    emptyIcon: {
        width: 64,
        height: 64,
        borderRadius: radius.lg,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: colors.accentTint,
    },
    emptyText: { ...type.headline, marginTop: space.md },
    emptySubtext: { ...type.caption, color: colors.textFaint, marginTop: 4, textAlign: 'center' },
});
