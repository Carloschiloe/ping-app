import { View, Text, TouchableOpacity, StyleSheet, Image, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { useAuth } from '../context/AuthContext';
import { useMarkCommitmentDone, useAcceptCommitment, useRejectCommitment, usePostponeCommitment } from '../api/queries';
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
        rejection_reason?: string | null;
        proposed_due_at?: string | null;
    };
}

export default function GroupTaskCard({ commitment }: GroupTaskCardProps) {
    const { user } = useAuth();
    const { mutate: markDone, isPending: isMarkingDone } = useMarkCommitmentDone();
    const { mutate: accept, isPending: isAccepting } = useAcceptCommitment();
    const { mutate: reject, isPending: isRejecting } = useRejectCommitment();
    const { mutate: postpone, isPending: isPostponing } = usePostponeCommitment();

    const currentUserId = user?.id?.toLowerCase();
    const assignedId = commitment.assigned_to_user_id?.toLowerCase();
    const isAssignee = !!currentUserId && !!assignedId && currentUserId === assignedId;

    const status = commitment.status;
    const isDone = status === 'done';
    const isProposed = status === 'proposed';
    const isRejected = status === 'rejected';
    const isCounter = status === 'counter_proposal';
    const isAccepted = status === 'accepted' || status === 'pending' || status === 'in_progress';

    const assigneeName = commitment.assignee?.full_name
        || commitment.assignee?.email?.split('@')[0]
        || (commitment.assigned_to_user_id ? `Usuario` : 'Alguien');

    // Remove debug logs for production feel

    const dueDateStr = commitment.due_at
        ? format(new Date(commitment.due_at), "EEE d MMM 'a las' HH:mm", { locale: es })
        : null;

    const handleMarkDone = () => {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        markDone(commitment.id);
    };

    const handleAccept = () => {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        accept(commitment.id);
    };

    const handleReject = () => {
        Alert.prompt(
            'Rechazar Tarea',
            'Indica el motivo del rechazo:',
            [
                { text: 'Cancelar', style: 'cancel' },
                {
                    text: 'Rechazar',
                    style: 'destructive',
                    onPress: (reason?: string) => {
                        if (!reason) return Alert.alert('Error', 'Debes indicar un motivo');
                        reject({ id: commitment.id, reason });
                    }
                }
            ]
        );
    };

    const handlePostpone = () => {
        // Simple implementation for now, ideally shows a date picker
        Alert.alert('Posponer', '¿Posponer para mañana a esta misma hora?', [
            { text: 'No', style: 'cancel' },
            {
                text: 'Sí',
                onPress: () => {
                    const newDate = new Date(new Date(commitment.due_at).getTime() + 24 * 60 * 60 * 1000).toISOString();
                    postpone({ id: commitment.id, newDate });
                }
            }
        ]);
    };

    const handlePing = () => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
        Alert.alert('Recordar', `Has enviado un recordatorio a ${assigneeName}.`);
        apiClient.post(`/commitments/${commitment.id}/ping`, {}).catch(() => { });
    };

    const getStatusInfo = () => {
        if (isDone) return { label: '✅ Completada', color: '#166534', bg: '#dcfce7' };
        if (isRejected) return { label: '❌ Rechazada', color: '#991b1b', bg: '#fee2e2' };
        if (isProposed) return { label: '⏳ Propuesta', color: '#92400e', bg: '#fef3c7' };
        if (isCounter) return { label: '🔄 Contrapropuesta', color: '#3730a3', bg: '#e0e7ff' };
        return { label: '🚀 Activa', color: '#1e40af', bg: '#dbeafe' };
    };

    const statusInfo = getStatusInfo();

    return (
        <View style={[styles.row, isRejected && styles.rowRejected]}>
            <View style={styles.leftContent}>
                {commitment.assignee?.avatar_url ? (
                    <Image source={{ uri: commitment.assignee.avatar_url }} style={styles.avatar} />
                ) : (
                    <View style={[styles.avatar, styles.avatarFallback]}>
                        <Text style={styles.avatarLetter}>{assigneeName[0]?.toUpperCase()}</Text>
                    </View>
                )}
            </View>

            <View style={styles.centerContent}>
                <Text style={styles.taskTitle} numberOfLines={1}>{commitment.title}</Text>
                <View style={styles.metaRow}>
                    <View style={[styles.miniBadge, { backgroundColor: statusInfo.bg }]}>
                        <Text style={[styles.miniBadgeText, { color: statusInfo.color }]}>
                            {statusInfo.label.split(' ')[1] || statusInfo.label}
                        </Text>
                    </View>
                    {dueDateStr && (
                        <Text style={styles.metaText}>• {format(new Date(commitment.due_at), "HH:mm", { locale: es })}</Text>
                    )}
                    <Text style={styles.metaText} numberOfLines={1}>• {assigneeName}</Text>
                </View>

                {isRejected && commitment.rejection_reason && (
                    <Text style={styles.rejectionMini}>Motivo: {commitment.rejection_reason}</Text>
                )}
            </View>

            <View style={styles.rightContent}>
                {isAssignee && isAccepted && !isDone && (
                    <TouchableOpacity
                        style={styles.circleComplete}
                        onPress={handleMarkDone}
                        disabled={isMarkingDone}
                        activeOpacity={0.7}
                    >
                        {isMarkingDone ? (
                            <Text style={{ fontSize: 8, color: 'white' }}>...</Text>
                        ) : (
                            <Ionicons name="checkmark" size={20} color="white" />
                        )}
                    </TouchableOpacity>
                )}

                {isAssignee && isProposed && (
                    <View style={styles.miniActions}>
                        <TouchableOpacity style={styles.miniActionBtn} onPress={handleAccept}>
                            <Ionicons name="checkmark-circle" size={22} color="#22c55e" />
                        </TouchableOpacity>
                        <TouchableOpacity style={styles.miniActionBtn} onPress={handleReject}>
                            <Ionicons name="close-circle" size={22} color="#ef4444" />
                        </TouchableOpacity>
                    </View>
                )}

                {!isAssignee && !isDone && !isRejected && (
                    <TouchableOpacity onPress={handlePing}>
                        <Ionicons name="notifications-outline" size={20} color="#f59e0b" />
                    </TouchableOpacity>
                )}

                {isDone && <Ionicons name="checkmark-done-circle" size={22} color="#166534" style={{ opacity: 0.5 }} />}
            </View>
        </View>
    );
}

const styles = StyleSheet.create({
    row: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: 12,
        paddingHorizontal: 16,
        backgroundColor: 'white',
        borderBottomWidth: 1,
        borderBottomColor: '#f1f5f9',
    },
    rowRejected: {
        backgroundColor: '#fff1f1',
    },
    leftContent: {
        marginRight: 12,
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
        fontSize: 12,
    },
    centerContent: {
        flex: 1,
        justifyContent: 'center',
    },
    taskTitle: {
        fontSize: 15,
        fontWeight: '700',
        color: '#0f172a',
        marginBottom: 2,
    },
    metaRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
    },
    metaText: {
        fontSize: 11,
        color: '#64748b',
        fontWeight: '500',
    },
    miniBadge: {
        paddingHorizontal: 5,
        paddingVertical: 1,
        borderRadius: 4,
    },
    miniBadgeText: {
        fontSize: 9,
        fontWeight: '800',
        textTransform: 'uppercase',
    },
    rejectionMini: {
        fontSize: 10,
        color: '#ef4444',
        fontStyle: 'italic',
        marginTop: 2,
    },
    rightContent: {
        marginLeft: 10,
        alignItems: 'center',
        justifyContent: 'center',
        width: 44,
    },
    circleComplete: {
        width: 36,
        height: 36,
        borderRadius: 18,
        backgroundColor: '#6366f1',
        alignItems: 'center',
        justifyContent: 'center',
        shadowColor: '#6366f1',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.3,
        shadowRadius: 6,
        elevation: 4,
    },
    miniActions: {
        flexDirection: 'row',
        gap: 8,
    },
    miniActionBtn: {
        padding: 2,
    }
});
