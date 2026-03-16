import React, { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { View, Text, TouchableOpacity, StyleSheet, Image, Alert, Modal, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { useAuth } from '../context/AuthContext';
import { AISuggestionModal } from './AISuggestionModal';
import { useMarkCommitmentDone, useAcceptCommitment, useRejectCommitment, usePostponeCommitment, useUpdateCommitment, useCommitmentOperationAction } from '../api/queries';
import * as Haptics from 'expo-haptics';
import { apiClient } from '../api/client';

interface GroupTaskCardProps {
    commitment: any;
    conversationId?: string;
    groupParticipants?: any[];
    isTimelineNode?: boolean;
    isPast?: boolean;
    conversationMode?: 'chat' | 'operation';
}

export default function GroupTaskCard({ 
    commitment, 
    conversationId: manualConversationId,
    groupParticipants = [],
    isTimelineNode = false,
    isPast = false,
    conversationMode = 'chat'
}: GroupTaskCardProps) {
    const queryClient = useQueryClient();
    const conversationId = manualConversationId || commitment.group_conversation_id;
    const { user } = useAuth();
    const { mutate: markDone, isPending: isMarkingDone } = useMarkCommitmentDone();
    const { mutate: accept, isPending: isAccepting } = useAcceptCommitment();
    const { mutate: reject, isPending: isRejecting } = useRejectCommitment();
    const { mutate: postpone, isPending: isPostponing } = usePostponeCommitment();
    const { mutateAsync: updateCommitment } = useUpdateCommitment();
    const { mutate: runOperationAction, isPending: isRunningOperationAction } = useCommitmentOperationAction();
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
    const operationMeta = commitment.meta?.operational || {};
    const isDone = status === 'completed';
    const isProposed = status === 'proposed' || status === 'pending'; // Combined for robustness
    const isRejected = status === 'rejected';
    const isCounter = status === 'counter_proposal';
    const isAccepted = status === 'accepted' || status === 'in_progress';

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
    const isOperationMode = conversationMode === 'operation';
    const opStatus = {
        acknowledged: !!operationMeta.acknowledged_at,
        arrived: !!operationMeta.arrived_at,
        completed: !!operationMeta.completed_at || isDone,
    };

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

    const handleOperationAction = (action: 'acknowledged' | 'arrived' | 'completed') => {
        if (!conversationId) return;
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        runOperationAction({ id: commitment.id, action, conversationId });
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
        <View style={[
            styles.cardContainer,
            isTimelineNode && styles.timelineCard,
            isMeeting && styles.cardMeeting,
            isPast && styles.cardPast,
            isRejected && styles.cardRejected
        ]}>
            {/* Left side: Time or Timeline Circle */}
            <View style={styles.leftTimeline}>
                <View style={[
                    styles.nodeCircle,
                    isMeeting && styles.nodeCircleMeeting,
                    isDone && styles.nodeCircleDone,
                    isPast && styles.nodeCirclePast
                ]}>
                   <Ionicons 
                        name={isMeeting ? "calendar" : isDone ? "checkmark" : "list"} 
                        size={12} 
                        color="white" 
                    />
                </View>
                <Text style={styles.nodeTime}>{dueDateStr || '--:--'}</Text>
            </View>

            {/* Center: Main Info */}
            <View style={styles.mainContent}>
                <Text style={[styles.taskTitle, isDone && styles.textDone]} numberOfLines={2}>
                    {commitment.title}
                </Text>
                
                <View style={styles.footerRow}>
                    <View style={styles.assigneeInfo}>
                        <View style={styles.avatarStack}>
                            {/* Simple avatar summary or single avatar */}
                            {commitment.assignee?.avatar_url ? (
                                <Image source={{ uri: commitment.assignee.avatar_url }} style={styles.miniAvatar} />
                            ) : (
                                <View style={[styles.miniAvatar, styles.miniAvatarFallback]}>
                                    <Text style={styles.miniAvatarLetter}>{assigneeName[0]}</Text>
                                </View>
                            )}
                        </View>
                        <Text style={styles.assigneeText} numberOfLines={1}>{displayName}</Text>
                    </View>

                    <View style={[styles.statusBadge, { backgroundColor: statusInfo.bg }]}>
                        <Text style={[styles.statusBadgeText, { color: statusInfo.color }]}>
                            {statusInfo.label.split(' ')[1] || statusInfo.label}
                        </Text>
                    </View>
                </View>

                {isRejected && commitment.rejection_reason && (
                    <Text style={styles.rejectionText}>Motivo: {commitment.rejection_reason}</Text>
                )}

                {isOperationMode && isAssignee && !isRejected && (
                    <View style={styles.operationRow}>
                        <TouchableOpacity
                            style={[styles.operationBtn, opStatus.acknowledged && styles.operationBtnDone]}
                            onPress={() => handleOperationAction('acknowledged')}
                            disabled={opStatus.acknowledged || isRunningOperationAction}
                        >
                            <Text style={[styles.operationBtnText, opStatus.acknowledged && styles.operationBtnTextDone]}>Entendido</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                            style={[styles.operationBtn, opStatus.arrived && styles.operationBtnDone]}
                            onPress={() => handleOperationAction('arrived')}
                            disabled={opStatus.arrived || isRunningOperationAction}
                        >
                            <Text style={[styles.operationBtnText, opStatus.arrived && styles.operationBtnTextDone]}>Llegué</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                            style={[styles.operationBtn, opStatus.completed && styles.operationBtnDone]}
                            onPress={() => handleOperationAction('completed')}
                            disabled={opStatus.completed || isRunningOperationAction}
                        >
                            <Text style={[styles.operationBtnText, opStatus.completed && styles.operationBtnTextDone]}>Terminado</Text>
                        </TouchableOpacity>
                    </View>
                )}
            </View>

            {/* Right: Quick Actions */}
            <View style={styles.rightActions}>
                {isAssignee && isAccepted && !isDone && !isOperationMode && (
                    <TouchableOpacity
                        style={styles.actionBtnPrimary}
                        onPress={handleMarkDone}
                        disabled={isMarkingDone}
                    >
                        <Ionicons name="checkmark" size={18} color="white" />
                    </TouchableOpacity>
                )}
                {!isDone && !isRejected && (
                    <TouchableOpacity onPress={() => setShowActions(true)} style={styles.moreBtn}>
                        <Ionicons name="ellipsis-vertical" size={20} color="#94a3b8" />
                    </TouchableOpacity>
                )}
                {isDone && (
                    <View style={styles.doneIcon}>
                        <Ionicons name="checkmark-done-circle" size={24} color="#10b981" />
                    </View>
                )}
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

const styles = StyleSheet.create({
    cardContainer: {
        flexDirection: 'row',
        backgroundColor: 'white',
        borderRadius: 20,
        padding: 12,
        marginVertical: 4,
        shadowColor: '#6366f1',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.05,
        shadowRadius: 10,
        elevation: 2,
        borderWidth: 1,
        borderColor: '#f1f5f9',
    },
    timelineCard: {
        marginLeft: 0, 
    },
    cardMeeting: {
        backgroundColor: '#f8faff',
        borderColor: '#e0e7ff',
        borderLeftWidth: 4,
        borderLeftColor: '#6366f1',
    },
    cardPast: {
        opacity: 0.6,
        backgroundColor: '#f8fafc',
    },
    cardRejected: {
        backgroundColor: '#fff1f1',
        borderColor: '#fee2e2',
    },
    leftTimeline: {
        width: 40,
        alignItems: 'center',
        paddingTop: 4,
        marginRight: 8,
    },
    nodeCircle: {
        width: 20,
        height: 20,
        borderRadius: 10,
        backgroundColor: '#10b981', // Task green
        alignItems: 'center',
        justifyContent: 'center',
        borderWidth: 2,
        borderColor: 'white',
        zIndex: 5,
    },
    nodeCircleMeeting: {
        backgroundColor: '#6366f1', // Meeting indigo
    },
    nodeCircleDone: {
        backgroundColor: '#10b981',
    },
    nodeCirclePast: {
        backgroundColor: '#94a3b8',
    },
    nodeTime: {
        fontSize: 11,
        fontWeight: '800',
        color: '#64748b',
        marginTop: 6,
    },
    mainContent: {
        flex: 1,
        justifyContent: 'center',
    },
    taskTitle: {
        fontSize: 16,
        fontWeight: '700',
        color: '#1e293b',
        marginBottom: 8,
    },
    textDone: {
        textDecorationLine: 'line-through',
        color: '#94a3b8',
    },
    footerRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
    },
    assigneeInfo: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
    },
    avatarStack: {
        flexDirection: 'row',
    },
    miniAvatar: {
        width: 20,
        height: 20,
        borderRadius: 10,
        borderWidth: 1,
        borderColor: 'white',
    },
    miniAvatarFallback: {
        backgroundColor: '#e2e8f0',
        alignItems: 'center',
        justifyContent: 'center',
    },
    miniAvatarLetter: {
        fontSize: 10,
        fontWeight: 'bold',
        color: '#64748b',
    },
    assigneeText: {
        fontSize: 12,
        color: '#64748b',
        fontWeight: '500',
    },
    statusBadge: {
        paddingHorizontal: 8,
        paddingVertical: 2,
        borderRadius: 8,
    },
    statusBadgeText: {
        fontSize: 10,
        fontWeight: '800',
        textTransform: 'uppercase',
    },
    rejectionText: {
        fontSize: 11,
        color: '#ef4444',
        fontStyle: 'italic',
        marginTop: 6,
    },
    operationRow: {
        flexDirection: 'row',
        gap: 8,
        marginTop: 10,
    },
    operationBtn: {
        flex: 1,
        paddingVertical: 8,
        borderRadius: 10,
        backgroundColor: '#e2e8f0',
        alignItems: 'center',
    },
    operationBtnDone: {
        backgroundColor: '#dcfce7',
    },
    operationBtnText: {
        fontSize: 12,
        fontWeight: '700',
        color: '#0f172a',
    },
    operationBtnTextDone: {
        color: '#166534',
    },
    rightActions: {
        width: 40,
        alignItems: 'flex-end',
        justifyContent: 'center',
    },
    actionBtnPrimary: {
        width: 32,
        height: 32,
        borderRadius: 16,
        backgroundColor: '#6366f1',
        alignItems: 'center',
        justifyContent: 'center',
        shadowColor: '#6366f1',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.3,
        shadowRadius: 6,
        elevation: 3,
    },
    moreBtn: {
        padding: 4,
    },
    doneIcon: {
        alignItems: 'center',
        justifyContent: 'center',
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
        borderRadius: 24,
        padding: 24,
        alignItems: 'stretch',
    },
    actionMenuTitle: {
        fontSize: 18,
        fontWeight: '800',
        color: '#0f172a',
        marginBottom: 20,
        textAlign: 'center',
    },
    menuItem: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: 16,
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
        fontWeight: '700',
        color: '#64748b',
    },
});
