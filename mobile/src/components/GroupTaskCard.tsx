import { View, Text, TouchableOpacity, StyleSheet, Image, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { useAuth } from '../context/AuthContext';
import { useMarkCommitmentDone } from '../api/queries';
import * as Haptics from 'expo-haptics';
import { apiClient } from '../api/client';

interface GroupTaskCardProps {
    commitment: {
        id: string;
        title: string;
        due_at: string;
        status: 'pending' | 'done' | string;
        assigned_to_user_id: string | null;
        assignee?: {
            full_name: string;
            avatar_url: string | null;
            email: string;
        } | null;
    };
}

export default function GroupTaskCard({ commitment }: GroupTaskCardProps) {
    const { user } = useAuth();
    const { mutate: markDone, isPending } = useMarkCommitmentDone();
    const isAssignee = commitment.assigned_to_user_id === user?.id;
    const isDone = commitment.status === 'done';
    const isPendingStatus = commitment.status === 'pending';
    const isInProgress = commitment.status === 'in_progress';

    const assigneeName = commitment.assignee?.full_name
        || commitment.assignee?.email?.split('@')[0]
        || 'Alguien';

    const dueDateStr = commitment.due_at
        ? format(new Date(commitment.due_at), "EEE d MMM 'a las' HH:mm", { locale: es })
        : null;

    const handleMarkDone = () => {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        markDone(commitment.id);
    };

    const handlePing = () => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
        Alert.alert('¡Pinga!', `Has enviado un recordatorio a ${assigneeName}.`);
        // In a real app, this would call an endpoint to send a push notification
        apiClient.post(`/commitments/${commitment.id}/ping`, {}).catch(() => { });
    };

    return (
        <View style={styles.card}>
            <View style={styles.header}>
                <View style={styles.titleRow}>
                    <Ionicons name="checkbox-outline" size={16} color="#6366f1" />
                    <Text style={styles.label}>Tarea Asignada</Text>
                </View>
                <View style={[
                    styles.badge,
                    isDone ? styles.badgeDone : (isInProgress ? styles.badgeProgress : styles.badgePending)
                ]}>
                    <Text style={[
                        styles.badgeText,
                        isDone ? styles.badgeDoneText : (isInProgress ? styles.badgeProgressText : styles.badgePendingText)
                    ]}>
                        {isDone ? '✅ Completada' : (isInProgress ? '⚙️ En Progreso' : '⏳ Pendiente')}
                    </Text>
                </View>
            </View>

            <Text style={styles.taskTitle}>{commitment.title}</Text>

            <View style={styles.meta}>
                {commitment.assignee?.avatar_url ? (
                    <Image source={{ uri: commitment.assignee.avatar_url }} style={styles.avatar} />
                ) : (
                    <View style={[styles.avatar, styles.avatarFallback]}>
                        <Text style={styles.avatarLetter}>{assigneeName[0]?.toUpperCase()}</Text>
                    </View>
                )}
                <View>
                    <Text style={styles.assigneeName}>{assigneeName}</Text>
                    {dueDateStr && <Text style={styles.dueDate}>📅 {dueDateStr}</Text>}
                </View>
            </View>

            <View style={styles.actions}>
                {isAssignee && !isDone && (
                    <TouchableOpacity
                        style={styles.completeBtn}
                        onPress={handleMarkDone}
                        disabled={isPending}
                        activeOpacity={0.8}
                    >
                        <Ionicons name="checkmark-circle" size={18} color="white" />
                        <Text style={styles.completeBtnText}>
                            {isPending ? 'Guardando...' : 'Completar'}
                        </Text>
                    </TouchableOpacity>
                )}

                {!isAssignee && !isDone && (
                    <TouchableOpacity
                        style={styles.pingBtn}
                        onPress={handlePing}
                        activeOpacity={0.8}
                    >
                        <Ionicons name="notifications" size={18} color="#f59e0b" />
                        <Text style={styles.pingBtnText}>¡Pinga!</Text>
                    </TouchableOpacity>
                )}
            </View>
        </View>
    );
}

const styles = StyleSheet.create({
    card: {
        backgroundColor: '#f0f0ff',
        borderRadius: 12,
        padding: 12,
        marginTop: 6,
        marginHorizontal: 8,
        borderLeftWidth: 4,
        borderLeftColor: '#6366f1',
    },
    header: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 8,
    },
    titleRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
    },
    label: {
        fontSize: 11,
        fontWeight: '700',
        color: '#6366f1',
        textTransform: 'uppercase',
        letterSpacing: 0.5,
    },
    badge: {
        borderRadius: 20,
        paddingHorizontal: 8,
        paddingVertical: 2,
    },
    badgePending: { backgroundColor: '#fef3c7' },
    badgeDone: { backgroundColor: '#dcfce7' },
    badgeProgress: { backgroundColor: '#e0e7ff' },
    badgeText: { fontSize: 11, fontWeight: '600' },
    badgePendingText: { color: '#92400e' },
    badgeDoneText: { color: '#166534' },
    badgeProgressText: { color: '#3730a3' },
    taskTitle: {
        fontSize: 14,
        fontWeight: '600',
        color: '#1e1b4b',
        marginBottom: 10,
        lineHeight: 20,
    },
    meta: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
        marginBottom: 12,
    },
    avatar: {
        width: 32,
        height: 32,
        borderRadius: 16,
    },
    avatarFallback: {
        backgroundColor: '#6366f1',
        alignItems: 'center',
        justifyContent: 'center',
    },
    avatarLetter: {
        color: 'white',
        fontWeight: '700',
        fontSize: 14,
    },
    assigneeName: {
        fontSize: 13,
        fontWeight: '600',
        color: '#374151',
    },
    dueDate: {
        fontSize: 11,
        color: '#6b7280',
        marginTop: 1,
    },
    actions: {
        flexDirection: 'row',
        gap: 8,
    },
    completeBtn: {
        flex: 1,
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#6366f1',
        paddingVertical: 10,
        borderRadius: 10,
        gap: 8,
        justifyContent: 'center',
    },
    completeBtnText: {
        color: 'white',
        fontWeight: '700',
        fontSize: 14,
    },
    pingBtn: {
        flex: 1,
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#fffbeb',
        borderWidth: 1,
        borderColor: '#fde68a',
        paddingVertical: 10,
        borderRadius: 10,
        gap: 8,
        justifyContent: 'center',
    },
    pingBtnText: {
        color: '#b45309',
        fontWeight: '700',
        fontSize: 14,
    },
});
