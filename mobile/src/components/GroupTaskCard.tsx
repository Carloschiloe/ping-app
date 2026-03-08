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
    const { mutate: markDone, isPending: isMarkingDone } = useMarkCommitmentDone();
    const { mutate: accept, isPending: isAccepting } = useAcceptCommitment();
    const { mutate: reject, isPending: isRejecting } = useRejectCommitment();
    const { mutate: postpone, isPending: isPostponing } = usePostponeCommitment();

    const isAssignee = commitment.assigned_to_user_id === user?.id;
    const status = commitment.status;
    const isDone = status === 'done';
    const isProposed = status === 'proposed';
    const isRejected = status === 'rejected';
    const isCounter = status === 'counter_proposal';
    const isAccepted = status === 'accepted' || status === 'pending' || status === 'in_progress';

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
                    onPress: (reason) => {
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
        Alert.alert('¡Pinga!', `Has enviado un recordatorio a ${assigneeName}.`);
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
        <View style={[styles.card, isRejected && styles.cardRejected]}>
            <View style={styles.header}>
                <View style={styles.titleRow}>
                    <Ionicons name="checkbox-outline" size={16} color="#6366f1" />
                    <Text style={styles.label}>Tarea Asignada</Text>
                </View>
                <View style={[styles.badge, { backgroundColor: statusInfo.bg }]}>
                    <Text style={[styles.badgeText, { color: statusInfo.color }]}>
                        {statusInfo.label}
                    </Text>
                </View>
            </View>

            <Text style={styles.taskTitle}>{commitment.title}</Text>

            {isRejected && (commitment as any).rejection_reason && (
                <View style={styles.rejectionBox}>
                    <Text style={styles.rejectionText}>Motivo: {(commitment as any).rejection_reason}</Text>
                </View>
            )}

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
                {isAssignee && isProposed && (
                    <>
                        <TouchableOpacity style={[styles.actionBtn, styles.acceptBtn]} onPress={handleAccept} disabled={isAccepting}>
                            <Ionicons name="checkmark" size={18} color="white" />
                            <Text style={styles.btnText}>Aceptar</Text>
                        </TouchableOpacity>
                        <TouchableOpacity style={[styles.actionBtn, styles.postponeBtn]} onPress={handlePostpone} disabled={isPostponing}>
                            <Ionicons name="time-outline" size={18} color="#374151" />
                            <Text style={[styles.btnText, { color: '#374151' }]}>Posponer</Text>
                        </TouchableOpacity>
                        <TouchableOpacity style={[styles.actionBtn, styles.rejectBtn]} onPress={handleReject} disabled={isRejecting}>
                            <Ionicons name="close" size={18} color="white" />
                        </TouchableOpacity>
                    </>
                )}

                {isAssignee && isAccepted && !isDone && (
                    <TouchableOpacity
                        style={styles.completeBtn}
                        onPress={handleMarkDone}
                        disabled={isMarkingDone}
                        activeOpacity={0.8}
                    >
                        <Ionicons name="checkmark-circle" size={18} color="white" />
                        <Text style={styles.completeBtnText}>
                            {isMarkingDone ? 'Guardando...' : 'Completar'}
                        </Text>
                    </TouchableOpacity>
                )}

                {!isAssignee && !isDone && !isRejected && (
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
    cardRejected: {
        backgroundColor: '#fff1f1',
        borderLeftColor: '#ef4444',
        opacity: 0.9,
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
    badgeText: { fontSize: 11, fontWeight: '700' },
    taskTitle: {
        fontSize: 14,
        fontWeight: '600',
        color: '#1e1b4b',
        marginBottom: 10,
        lineHeight: 20,
    },
    rejectionBox: {
        backgroundColor: '#fee2e2',
        padding: 8,
        borderRadius: 8,
        marginBottom: 10,
        borderWidth: 1,
        borderColor: '#fecaca',
    },
    rejectionText: {
        fontSize: 12,
        color: '#991b1b',
        fontWeight: '500',
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
    actionBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        paddingVertical: 8,
        borderRadius: 10,
        gap: 6,
    },
    acceptBtn: {
        flex: 2,
        backgroundColor: '#22c55e',
    },
    postponeBtn: {
        flex: 2,
        backgroundColor: '#f3f4f6',
        borderWidth: 1,
        borderColor: '#d1d5db',
    },
    rejectBtn: {
        flex: 1,
        backgroundColor: '#ef4444',
    },
    btnText: {
        color: 'white',
        fontWeight: '700',
        fontSize: 13,
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
