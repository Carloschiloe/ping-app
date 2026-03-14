import React, { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { View, Text, TouchableOpacity, StyleSheet, Image, Alert, Modal, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { useAuth } from '../context/AuthContext';
import { useMarkCommitmentDone, useAcceptCommitment, useRejectCommitment, usePostponeCommitment } from '../api/queries';
import * as Haptics from 'expo-haptics';
import { apiClient } from '../api/client';

interface GroupTaskCardProps {
    commitment: any;
    conversationId?: string;
    groupParticipants?: any[];
}

export default function GroupTaskCard({ 
    commitment, 
    conversationId: manualConversationId,
    groupParticipants = []
}: GroupTaskCardProps) {
    const queryClient = useQueryClient();
    const conversationId = manualConversationId || commitment.group_conversation_id;
    const { user } = useAuth();
    const { mutate: markDone, isPending: isMarkingDone } = useMarkCommitmentDone();
    const { mutate: accept, isPending: isAccepting } = useAcceptCommitment();
    const { mutate: reject, isPending: isRejecting } = useRejectCommitment();
    const { mutate: postpone, isPending: isPostponing } = usePostponeCommitment();
    const { mutate: updateCommitment } = useUpdateCommitment();
    const [showActions, setShowActions] = useState(false);
    const [showEditModal, setShowEditModal] = useState(false);
    const [editData, setEditData] = useState<any>(null);

    const currentUserId = user?.id?.toLowerCase();
    const assignedId = commitment.assigned_to_user_id?.toLowerCase();
    const isOwner = !!currentUserId && commitment.owner_user_id?.toLowerCase() === currentUserId;
    const isEveryone = !commitment.assigned_to_user_id;
    // You are an assignee if it's assigned to you specifically, or if it's for everyone and you're not the owner
    const isAssignee = (!!assignedId && currentUserId === assignedId) || (isEveryone && !isOwner);

    const status = commitment.status;
    const isDone = status === 'completed';
    const isProposed = status === 'proposed' || status === 'pending'; // Combined for robustness
    const isRejected = status === 'rejected';
    const isCounter = status === 'counter_proposal';
    const isAccepted = status === 'accepted' || status === 'in_progress';

    // DEBUG: Commitment State
    console.warn(`[DEBUG-CARD] Task: ${commitment.title.substring(0,15)} | Status: ${status} | isAssignee: ${isAssignee} | IDs: Me=${currentUserId?.substring(0,6)} Target=${assignedId?.substring(0,6)} Owner=${commitment.owner_user_id?.substring(0,6)}`);

    // Improve name resolution
    const requesterName = commitment.owner?.full_name || (isOwner ? 'Mí' : 'Alguien');
    const assigneeName = (commitment as any)._isEveryoneSummary || !commitment.assigned_to_user_id
        ? 'Todos'
        : (commitment.assignee?.full_name || (isAssignee ? 'Mí' : 'Alguien'));

    const displayName = isAssignee
        ? `De: ${requesterName}`
        : (isOwner ? `Para: ${assigneeName}` : `Para: ${assigneeName}`);

    const dueDateStr = commitment.due_at
        ? format(new Date(commitment.due_at), "HH:mm", { locale: es })
        : null;

    const isMeetingRaw = commitment.type === 'meeting';
    const isMeeting = isMeetingRaw || /reuni[oó]n|llamada|junta|meet|zoom|call|cita/i.test(commitment.title || '');
    const typeLabel = isMeeting ? 'Reunión' : 'Tarea';

    const handleMarkDone = () => {
        Alert.alert(
            `Completar ${typeLabel}`,
            `¿Confirmas que ya has completado esta ${typeLabel.toLowerCase()}?`,
            [
                { text: 'Cancelar', style: 'cancel' },
                {
                    text: 'Sí, completar',
                    onPress: () => {
                        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                        markDone(commitment.id);
                    }
                }
            ]
        );
    };

    const handleAccept = () => {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        accept(commitment.id);
    };

    const handleReject = () => {
        Alert.prompt(
            `Rechazar ${typeLabel}`,
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
        setEditData({ 
            id: commitment.id,
            title: commitment.title,
            dueAt: commitment.due_at,
            type: commitment.type,
            assignedToUserId: commitment.assigned_to_user_id,
            groupConversationId: commitment.group_conversation_id
        });
        setShowEditModal(true);
    };

    const handleEdit = () => {
        setEditData({ 
            id: commitment.id,
            title: commitment.title,
            dueAt: commitment.due_at,
            type: commitment.type,
            assignedToUserId: commitment.assigned_to_user_id,
            groupConversationId: commitment.group_conversation_id
        });
        setShowEditModal(true);
    };

    const onConfirmEdit = async () => {
        if (!editData) return;
        try {
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
            
            // Map camelCase to snake_case for API
            const payload = {
                title: editData.title,
                due_at: editData.dueAt,
                assigned_to_user_id: editData.assignedToUserId
            };

            console.warn('[DEBUG-MOBILE] Sending update payload:', JSON.stringify(payload));

            await updateCommitment({ 
                id: commitment.id, 
                data: payload 
            });
            
            // Force refresh of messages to show system message with the NEW time
            if (conversationId) {
                queryClient.invalidateQueries({ queryKey: ['conversation-messages', conversationId] });
            }
            setShowEditModal(false);
            setEditData(null);
        } catch (err) {
            console.error('[GroupTaskCard] Edit confirm failed:', err);
        }
    };

    const handlePing = () => {
        const nameToPing = assigneeName;
        Alert.alert(
            'Enviar Recordatorio',
            `¿Quieres enviar un recordatorio a ${nameToPing}?`,
            [
                { text: 'Cancelar', style: 'cancel' },
                {
                    text: 'Enviar',
                    onPress: () => {
                        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
                        apiClient.post(`/commitments/${commitment.id}/ping`, {}).catch(() => { });
                        Alert.alert('Ping!', `Has recordado a ${nameToPing}.`);
                    }
                }
            ]
        );
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
                <View style={styles.timeBadgeContainer}>
                    <Text style={styles.timeBadgeText}>{dueDateStr || '--:--'}</Text>
                </View>
            </View>

            <View style={styles.centerContent}>
                <Text style={styles.taskTitle} numberOfLines={1}>{commitment.title}</Text>
                <View style={styles.metaRow}>
                    <View style={[styles.miniBadge, { backgroundColor: statusInfo.bg }]}>
                        <Text style={[styles.miniBadgeText, { color: statusInfo.color }]}>
                            {statusInfo.label.split(' ')[1] || statusInfo.label}
                        </Text>
                    </View>
                    <Text style={styles.metaText}>
                        • {format(new Date(commitment.due_at), "d MMM", { locale: es })}
                    </Text>
                    <Text style={styles.metaText} numberOfLines={1}>• {displayName}</Text>
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

                {(isAssignee || isOwner) && !isDone && !isRejected && (
                    <TouchableOpacity onPress={() => setShowActions(true)} style={styles.actionsBtn}>
                        <Ionicons name="ellipsis-horizontal-circle" size={26} color="#6366f1" />
                    </TouchableOpacity>
                )}

                {isDone && <Ionicons name="checkmark-done-circle" size={26} color="#22c55e" />}
            </View>

            {/* Actions Modal */}
            <Modal
                visible={showActions}
                transparent
                animationType="fade"
                onRequestClose={() => setShowActions(false)}
            >
                <Pressable style={styles.modalOverlay} onPress={() => setShowActions(false)}>
                    <View style={styles.actionMenu}>
                        <Text style={styles.actionMenuTitle}>{commitment.title}</Text>

                        {isAssignee && isProposed && (
                            <TouchableOpacity
                                style={[styles.menuItem, { borderBottomWidth: 1, borderBottomColor: '#f1f5f9' }]}
                                onPress={() => { setShowActions(false); handleAccept(); }}
                            >
                                <Ionicons name={isMeeting ? "calendar" : "checkmark-circle"} size={24} color="#22c55e" />
                                <Text style={styles.menuItemText}>Aceptar {typeLabel}</Text>
                            </TouchableOpacity>
                        )}

                        {isOwner && !isDone && (
                            <TouchableOpacity
                                style={[styles.menuItem, { borderBottomWidth: 1, borderBottomColor: '#f1f5f9' }]}
                                onPress={() => { setShowActions(false); handleEdit(); }}
                            >
                                <Ionicons name="create" size={24} color="#8b5cf6" />
                                <Text style={styles.menuItemText}>Editar {typeLabel}</Text>
                            </TouchableOpacity>
                        )}

                        {isAssignee && !isMeeting && isProposed && (
                            <TouchableOpacity
                                style={[styles.menuItem, { borderBottomWidth: 1, borderBottomColor: '#f1f5f9' }]}
                                onPress={() => { setShowActions(false); handlePostpone(); }}
                            >
                                <Ionicons name="time" size={24} color="#6366f1" />
                                <Text style={styles.menuItemText}>Posponer</Text>
                            </TouchableOpacity>
                        )}

                        {isAssignee && isProposed && (
                            <TouchableOpacity
                                style={styles.menuItem}
                                onPress={() => { setShowActions(false); handleReject(); }}
                            >
                                <Ionicons name="close-circle" size={24} color="#ef4444" />
                                <Text style={[styles.menuItemText, { color: '#ef4444' }]}>Rechazar</Text>
                            </TouchableOpacity>
                        )}

                        <TouchableOpacity style={styles.cancelBtn} onPress={() => setShowActions(false)}>
                            <Text style={styles.cancelBtnText}>Cancelar</Text>
                        </TouchableOpacity>
                    </View>
                </Pressable>
            </Modal>

            {/* Edit/Postpone Modal Wrapper */}
            {editData && (
                <View style={{ position: 'absolute' }}>
                    <AISuggestionModal
                        visible={showEditModal}
                        isEditing={true}
                        suggestionData={editData}
                        user={user}
                        isGroup={true}
                        groupParticipants={groupParticipants}
                        avatarColor={(str: string) => {
                            // Simple hash for consistent colors
                            let hash = 0;
                            for (let i = 0; i < str.length; i++) {
                                hash = str.charCodeAt(i) + ((hash << 5) - hash);
                            }
                            const colors = ['#6366f1', '#8b5cf6', '#ec4899', '#f59e0b', '#10b981', '#3b82f6'];
                            return colors[Math.abs(hash) % colors.length];
                        }}
                        onClose={() => {
                            setShowEditModal(false);
                            setEditData(null);
                        }}
                        onUpdateData={setEditData}
                        onConfirm={onConfirmEdit}
                    />
                </View>
            )}
        </View>
    );
}

// Inline Mock/Import AISuggestionModal if needed, but it should be available in the project
import { AISuggestionModal } from './AISuggestionModal';
import { useUpdateCommitment } from '../api/queries';

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
        marginRight: 10,
        width: 55,
        alignItems: 'center',
    },
    timeBadgeContainer: {
        backgroundColor: '#f8fafc',
        paddingVertical: 6,
        paddingHorizontal: 4,
        borderRadius: 8,
        borderWidth: 1.5,
        borderColor: '#e2e8f0',
        width: '100%',
        alignItems: 'center',
    },
    timeBadgeText: {
        fontSize: 13,
        fontWeight: '800',
        color: '#1e293b',
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
    actionsBtn: {
        padding: 4,
    },
    modalOverlay: {
        flex: 1,
        backgroundColor: 'rgba(0,0,0,0.5)',
        justifyContent: 'center',
        alignItems: 'center',
        padding: 20,
    },
    actionMenu: {
        width: '100%',
        backgroundColor: 'white',
        borderRadius: 16,
        padding: 20,
        alignItems: 'stretch',
    },
    actionMenuTitle: {
        fontSize: 16,
        fontWeight: '700',
        color: '#0f172a',
        marginBottom: 20,
        textAlign: 'center',
    },
    menuItem: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: 15,
        gap: 12,
    },
    menuItemText: {
        fontSize: 16,
        fontWeight: '600',
        color: '#0f172a',
    },
    cancelBtn: {
        marginTop: 15,
        paddingVertical: 12,
        alignItems: 'center',
    },
    cancelBtnText: {
        fontSize: 15,
        fontWeight: '600',
        color: '#64748b',
    },
});
