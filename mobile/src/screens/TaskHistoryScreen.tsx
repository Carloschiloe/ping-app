import React, { useMemo, useState } from 'react';
import { View, Text, StyleSheet, TextInput, TouchableOpacity, FlatList, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRoute } from '@react-navigation/native';
import { useConversationGroupTasks } from '../api/queries';
import { normalizeCommitmentStatus } from '../utils/commitmentStatus';
import { useAppTheme } from '../theme/ThemeContext';
import type { TaskHistoryScreenProps } from '../navigation/types';

type StatusFilter = 'all' | 'completed' | 'pending' | 'rejected';

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
    const { theme } = useAppTheme();
    const styles = useMemo(() => createStyles(theme), [theme]);
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
            const isCompleted = normalized === 'completed';
            const isRejected = normalized === 'rejected';
            const isPending = normalized === 'proposed' || normalized === 'accepted';

            if (statusFilter === 'completed' && !isCompleted) return false;
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

    const renderItem = ({ item }: { item: any }) => {
        const normalized = normalizeCommitmentStatus(item.status);
        const isCompleted = normalized === 'completed';
        const isRejected = normalized === 'rejected';
        const assigneeName = item.assignee?.full_name || 'Sin responsable';
        const completedAt = item.meta?.operational?.completed_at || item.updated_at || item.created_at;
        const completedBy = item.meta?.operational?.completed_by_name || assigneeName;
        const timeLabel = isCompleted ? `Completado: ${formatShortDate(completedAt)}` : `Fecha: ${formatShortDate(item.due_at)}`;

        return (
            <View style={styles.rowCard}>
                <View style={styles.rowHeader}>
                    <Text style={styles.rowTitle} numberOfLines={2}>{item.title}</Text>
                    <View style={[styles.statusPill, isCompleted && styles.statusPillDone, isRejected && styles.statusPillRejected]}>
                        <Text style={[styles.statusPillText, isCompleted && styles.statusPillTextDone, isRejected && styles.statusPillTextRejected]}>
                            {normalized === 'accepted' ? 'En curso' : normalized === 'proposed' ? 'Pendiente' : normalized === 'completed' ? 'Completada' : 'Rechazada'}
                        </Text>
                    </View>
                </View>
                <Text style={styles.rowMeta}>{timeLabel}</Text>
                <Text style={styles.rowMeta}>Responsable: {assigneeName}</Text>
                {isCompleted && <Text style={styles.rowMeta}>Completado por: {completedBy}</Text>}
            </View>
        );
    };

    return (
        <View style={styles.container}>
            <View style={styles.searchRow}>
                <Ionicons name="search" size={16} color={theme.colors.text.muted} />
                <TextInput
                    placeholder="Buscar tareas"
                    placeholderTextColor={theme.colors.text.muted}
                    style={styles.searchInput}
                    value={query}
                    onChangeText={setQuery}
                />
            </View>

            <View style={styles.filterRow}>
                {([
                    { key: 'all', label: 'Todas' },
                    { key: 'pending', label: 'Pendientes' },
                    { key: 'completed', label: 'Completadas' },
                    { key: 'rejected', label: 'Rechazadas' },
                ] as const).map((f) => (
                    <TouchableOpacity
                        key={f.key}
                        style={[styles.filterChip, statusFilter === f.key && styles.filterChipActive]}
                        onPress={() => setStatusFilter(f.key)}
                    >
                        <Text style={[styles.filterChipText, statusFilter === f.key && styles.filterChipTextActive]}>{f.label}</Text>
                    </TouchableOpacity>
                ))}
            </View>

            {assignees.length > 0 && (
                <View style={styles.assigneeRow}>
                    <TouchableOpacity
                        style={[styles.assigneeChip, !assigneeId && styles.assigneeChipActive]}
                        onPress={() => setAssigneeId(null)}
                    >
                        <Text style={[styles.assigneeChipText, !assigneeId && styles.assigneeChipTextActive]}>Todos</Text>
                    </TouchableOpacity>
                    {assignees.map((a: any) => (
                        <TouchableOpacity
                            key={a.id}
                            style={[styles.assigneeChip, assigneeId === a.id && styles.assigneeChipActive]}
                            onPress={() => setAssigneeId(a.id)}
                        >
                            <Text style={[styles.assigneeChipText, assigneeId === a.id && styles.assigneeChipTextActive]} numberOfLines={1}>
                                {a.full_name?.split(' ')[0] || 'Usuario'}
                            </Text>
                        </TouchableOpacity>
                    ))}
                </View>
            )}

            {isLoading ? (
                <View style={styles.loadingWrap}>
                    <ActivityIndicator size="small" color={theme.colors.accent} />
                </View>
            ) : (
                <FlatList
                    data={filteredTasks}
                    keyExtractor={(item) => item.id}
                    renderItem={renderItem}
                    contentContainerStyle={styles.listContent}
                    ListEmptyComponent={
                        <View style={styles.emptyWrap}>
                            <Ionicons name="clipboard-outline" size={48} color={theme.colors.separator} />
                            <Text style={styles.emptyText}>Sin resultados</Text>
                            <Text style={styles.emptySubtext}>Prueba cambiando el filtro o la búsqueda</Text>
                        </View>
                    }
                />
            )}
        </View>
    );
}

const createStyles = (theme: any) => StyleSheet.create({
    container: { flex: 1, backgroundColor: theme.colors.background, padding: 16 },
    searchRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        backgroundColor: theme.colors.surfaceMuted,
        borderRadius: 12,
        borderWidth: 1,
        borderColor: theme.colors.separator,
        paddingHorizontal: 12,
        paddingVertical: 8,
    },
    searchInput: { flex: 1, color: theme.colors.text.primary, fontSize: 14 },
    filterRow: { flexDirection: 'row', gap: 8, marginTop: 12, flexWrap: 'wrap' },
    filterChip: {
        paddingHorizontal: 10,
        paddingVertical: 6,
        borderRadius: 12,
        backgroundColor: theme.colors.surfaceMuted,
        borderWidth: 1,
        borderColor: theme.colors.separator,
    },
    filterChipActive: { backgroundColor: theme.colors.accent, borderColor: theme.colors.accent },
    filterChipText: { fontSize: 12, fontWeight: '700', color: theme.colors.text.secondary },
    filterChipTextActive: { color: theme.colors.white },
    assigneeRow: { flexDirection: 'row', gap: 8, marginTop: 10, flexWrap: 'wrap' },
    assigneeChip: {
        paddingHorizontal: 10,
        paddingVertical: 6,
        borderRadius: 12,
        backgroundColor: theme.colors.surfaceMuted,
        borderWidth: 1,
        borderColor: theme.colors.separator,
        maxWidth: 120,
    },
    assigneeChipActive: { backgroundColor: theme.colors.surface, borderColor: theme.colors.separator },
    assigneeChipText: { fontSize: 12, fontWeight: '700', color: theme.colors.text.secondary },
    assigneeChipTextActive: { color: theme.colors.text.primary },
    listContent: { paddingTop: 12, paddingBottom: 24, gap: 10 },
    rowCard: {
        backgroundColor: theme.colors.surface,
        borderRadius: 16,
        borderWidth: 1,
        borderColor: theme.colors.separator,
        padding: 12,
        gap: 6,
    },
    rowHeader: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10 },
    rowTitle: { flex: 1, fontSize: 15, fontWeight: '700', color: theme.colors.text.primary },
    statusPill: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 999, backgroundColor: theme.colors.surfaceMuted },
    statusPillText: { fontSize: 10, fontWeight: '800', color: theme.colors.text.secondary, textTransform: 'uppercase' },
    statusPillDone: { backgroundColor: theme.isDark ? '#1f3a2b' : '#dcfce7' },
    statusPillTextDone: { color: theme.isDark ? '#86efac' : '#166534' },
    statusPillRejected: { backgroundColor: theme.isDark ? '#3b1d1d' : '#fee2e2' },
    statusPillTextRejected: { color: theme.isDark ? '#fca5a5' : '#991b1b' },
    rowMeta: { fontSize: 12, color: theme.colors.text.secondary },
    loadingWrap: { paddingTop: 24, alignItems: 'center' },
    emptyWrap: { paddingTop: 48, alignItems: 'center' },
    emptyText: { marginTop: 10, fontSize: 15, fontWeight: '700', color: theme.colors.text.secondary },
    emptySubtext: { marginTop: 4, fontSize: 12, color: theme.colors.text.muted },
});
