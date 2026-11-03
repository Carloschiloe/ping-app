import React, { useMemo, useState } from 'react';
import { View, Text, StyleSheet, TextInput, TouchableOpacity, FlatList, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation, useRoute } from '@react-navigation/native';
import { LinearGradient } from 'expo-linear-gradient';
import { useConversationGroupTasks } from '../api/queries';
import { normalizeCommitmentStatus } from '../utils/commitmentStatus';
import { getStatusLabel } from '../utils/commitmentDisplay';
import { colors, gradients, radius, space } from '../design/tokens';
import { fonts, type } from '../design/typography';
import { Glass } from '../design/Glass';
import { ScreenHeader } from '../design/ScreenHeader';
import type { TaskHistoryScreenProps } from '../navigation/types';

type StatusFilter = 'all' | 'resolved' | 'pending' | 'rejected';

function formatShortDate(iso?: string | null) {
    if (!iso) return '';
    return new Date(iso).toLocaleString('es-CL', {
        day: '2-digit',
        month: 'short',
        hour: '2-digit',
        minute: '2-digit',
    });
}

export default function TaskHistoryScreen() {
    const route = useRoute<TaskHistoryScreenProps['route']>();
    const navigation = useNavigation();
    const conversationId = route.params?.conversationId as string;

    const { data: tasks = [], isLoading } = useConversationGroupTasks(conversationId);

    const [query, setQuery] = useState('');
    const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
    const [assigneeId, setAssigneeId] = useState<string | null>(null);

    const assignees = useMemo(() => {
        const map = new Map<string, any>();
        tasks.forEach((t: any) => {
            if (t.assignee?.id) {
                map.set(t.assignee.id, t.assignee);
            }
        });
        return Array.from(map.values());
    }, [tasks]);

    const filteredTasks = useMemo(() => {
        const q = query.trim().toLowerCase();
        return tasks.filter((t: any) => {
            const normalized = normalizeCommitmentStatus(t.status);
            const isCompleted = normalized === 'resolved';
            const isRejected = normalized === 'rejected';
            const isPending = normalized === 'proposed' || normalized === 'accepted' || normalized === 'counter_proposal';

            if (statusFilter === 'resolved' && !isCompleted) return false;
            if (statusFilter === 'rejected' && !isRejected) return false;
            if (statusFilter === 'pending' && !isPending) return false;

            if (assigneeId && t.assigned_to_user_id !== assigneeId) return false;

            if (q) {
                const hay = `${t.title || ''} ${t.assignee?.full_name || ''} ${t.owner?.full_name || ''}`.toLowerCase();
                if (!hay.includes(q)) return false;
            }

            return true;
        });
    }, [tasks, query, statusFilter, assigneeId]);

    const renderItem = ({ item, index }: { item: any; index: number }) => {
        const normalized = normalizeCommitmentStatus(item.status);
        const isCompleted = normalized === 'resolved';
        const isRejected = normalized === 'rejected';
        const assigneeName = item.assignee?.full_name || 'Sin responsable';
        const completedAt = item.meta?.operational?.completed_at || item.updated_at || item.created_at;
        const completedBy = item.meta?.operational?.completed_by_name || assigneeName;
        const timeLabel = isCompleted ? `Completado: ${formatShortDate(completedAt)}` : `Fecha: ${formatShortDate(item.due_at)}`;

        const first = index === 0;
        const last = index === filteredTasks.length - 1;
        return (
            <View style={[styles.rowCard, first && styles.bandFirst, last && styles.bandLast]}>
                <Glass style={[StyleSheet.absoluteFill, styles.bandGlass]} intensity={22} tint={colors.glassTintLight} />
                {!last && <View pointerEvents="none" style={styles.bandSeparator} />}
                <View style={styles.rowHeader}>
                    <Text style={styles.rowTitle} numberOfLines={2}>{item.title}</Text>
                    <View style={[styles.statusPill, isCompleted && styles.statusPillDone, isRejected && styles.statusPillRejected]}>
                        <Text style={[styles.statusPillText, isCompleted && styles.statusPillTextDone, isRejected && styles.statusPillTextRejected]}>
                            {getStatusLabel(normalized)}
                        </Text>
                    </View>
                </View>
                <Text style={styles.rowMeta}>{timeLabel}</Text>
                <Text style={styles.rowMeta}>Responsable: {assigneeName}</Text>
                {isCompleted && <Text style={styles.rowMeta}>Completado por: {completedBy}</Text>}
            </View>
        );
    };

    const chip = (active: boolean, label: string, onPress: () => void, key: string) => (
        <TouchableOpacity key={key} style={[styles.chip, !active && styles.chipIdle]} onPress={onPress} accessibilityState={{ selected: active }}>
            {active && <LinearGradient colors={gradients.accent} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />}
            <Text style={[styles.chipText, active && styles.chipTextActive]} numberOfLines={1}>{label}</Text>
        </TouchableOpacity>
    );

    return (
        <View style={styles.container}>
            <ScreenHeader title="Historial de tareas" onBack={() => navigation.goBack()} />
            <View style={styles.controls}>
                <Glass style={styles.searchRow}>
                    <Ionicons name="search" size={17} color={colors.textFaint} />
                    <TextInput
                        placeholder="Buscar tareas"
                        placeholderTextColor={colors.textFaint}
                        selectionColor={colors.accent}
                        style={styles.searchInput}
                        value={query}
                        onChangeText={setQuery}
                    />
                </Glass>

                <View style={styles.filterRow}>
                    {([
                        { key: 'all', label: 'Todas' },
                        { key: 'pending', label: 'Pendientes' },
                        { key: 'resolved', label: 'Resueltas' },
                        { key: 'rejected', label: 'Rechazadas' },
                    ] as const).map((f) => chip(statusFilter === f.key, f.label, () => setStatusFilter(f.key), f.key))}
                </View>

                {assignees.length > 0 && (
                    <View style={styles.filterRow}>
                        {chip(!assigneeId, 'Todos', () => setAssigneeId(null), 'everyone')}
                        {assignees.map((a: any) => chip(assigneeId === a.id, a.full_name?.split(' ')[0] || 'Usuario', () => setAssigneeId(a.id), a.id))}
                    </View>
                )}
            </View>

            {isLoading ? (
                <View style={styles.loadingWrap}>
                    <ActivityIndicator size="small" color={colors.accentBright} />
                </View>
            ) : (
                <FlatList
                    data={filteredTasks}
                    keyExtractor={(item) => item.id}
                    renderItem={renderItem}
                    contentContainerStyle={styles.listContent}
                    ListEmptyComponent={
                        <View style={styles.emptyWrap}>
                            <View style={styles.emptyIcon}>
                                <Ionicons name="clipboard-outline" size={30} color={colors.accentBright} />
                            </View>
                            <Text style={styles.emptyText}>Sin resultados</Text>
                            <Text style={styles.emptySubtext}>Prueba cambiando el filtro o la búsqueda</Text>
                        </View>
                    }
                />
            )}
        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: 'transparent' },
    controls: { paddingHorizontal: space.lg, paddingTop: space.lg, gap: space.md },
    searchRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
        borderRadius: radius.md,
        paddingHorizontal: 14,
        height: 46,
    },
    searchInput: { flex: 1, fontFamily: fonts.medium, fontSize: 15, color: colors.text },
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
    listContent: { paddingTop: space.lg, paddingBottom: space.xxl },
    bandGlass: { borderWidth: 0 },
    bandFirst: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.glassBorder },
    bandLast: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.glassBorder },
    bandSeparator: { position: 'absolute', left: space.xl, right: 0, bottom: 0, height: StyleSheet.hairlineWidth, backgroundColor: colors.separator },
    rowCard: { paddingHorizontal: space.xl, paddingVertical: 14, gap: 5 },
    rowHeader: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10 },
    rowTitle: { flex: 1, fontFamily: fonts.semibold, fontSize: 15, color: colors.text },
    statusPill: { paddingHorizontal: 9, paddingVertical: 4, borderRadius: radius.full, backgroundColor: colors.accentTint },
    statusPillText: { fontFamily: fonts.bold, fontSize: 10, letterSpacing: 0.5, color: colors.accentBright, textTransform: 'uppercase' },
    statusPillDone: { backgroundColor: colors.successTint },
    statusPillTextDone: { color: colors.success },
    statusPillRejected: { backgroundColor: colors.dangerTint },
    statusPillTextRejected: { color: colors.danger },
    rowMeta: { ...type.caption, color: colors.textFaint },
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
    emptySubtext: { ...type.caption, color: colors.textFaint, marginTop: 4 },
});
