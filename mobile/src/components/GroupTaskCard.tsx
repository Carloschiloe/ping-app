import React, { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { View, Text, TouchableOpacity, StyleSheet, Alert, Modal, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { useAuth } from '../context/AuthContext';
import { useAppTheme } from '../theme/ThemeContext';
import { AISuggestionModal } from './AISuggestionModal';
import { useMarkCommitmentDone, useAcceptCommitment, useRejectCommitment, useUpdateCommitment, useSetActiveOperationCommitment } from '../api/queries';
import * as Haptics from 'expo-haptics';
import { normalizeCommitmentStatus } from '../utils/commitmentStatus';

interface GroupTaskCardProps {
    commitment: any;
    conversationId?: string;
    groupParticipants?: any[];
    isTimelineNode?: boolean;
    isPast?: boolean;
    conversationMode?: 'chat' | 'operation';
    activeCommitmentId?: string | null;
}

export default function GroupTaskCard({ 
    commitment, 
    conversationId: manualConversationId,
    groupParticipants = [],
    isTimelineNode = false,
    isPast = false,
    conversationMode = 'chat',
    activeCommitmentId = null,
}: GroupTaskCardProps) {
    const queryClient = useQueryClient();
    const conversationId = manualConversationId || commitment.group_conversation_id;
    const { user } = useAuth();
    const { theme } = useAppTheme();
    const { mutate: markDone, isPending: isMarkingDone } = useMarkCommitmentDone();
    const { mutate: accept } = useAcceptCommitment();
    const { mutate: reject } = useRejectCommitment();
    const { mutateAsync: updateCommitment } = useUpdateCommitment();
    const { mutate: setActiveCommitment, isPending: isSettingActiveCommitment } = useSetActiveOperationCommitment(conversationId || '');
    const [showActions, setShowActions] = useState(false);
    const [showEditModal, setShowEditModal] = useState(false);
    const [editData, setEditData] = useState<any>(null);

    const currentUserId = user?.id?.toLowerCase();
    const assignedId = commitment.assigned_to_user_id?.toLowerCase();
    const isOwner = !!currentUserId && commitment.owner_user_id?.toLowerCase() === currentUserId;
    const isEveryone = !commitment.assigned_to_user_id;
    // You are an assignee if it's assigned to you specifically, or if it's for everyone and you're not the owner
    const isAssignee = (!!assignedId && currentUserId === assignedId) || (isEveryone && !isOwner);

    const status = normalizeCommitmentStatus(commitment.status);
    const isDone = status === 'completed';
    const isProposed = status === 'proposed';
    const isRejected = status === 'rejected';
    const isCounter = status === 'counter_proposal';
    const isAccepted = status === 'accepted';

    const requesterName = commitment.owner?.full_name || (isOwner ? 'Tú' : 'Alguien');
    const assigneeName = (commitment as any)._isEveryoneSummary || !commitment.assigned_to_user_id
        ? 'Todos'
        : (currentUserId === assignedId ? 'Tú' : (commitment.assignee?.full_name || 'Alguien'));

    const responsibilityLabel = `Responsable: ${assigneeName}`;
    const requesterLabel = isOwner ? 'Creada por ti' : `Solicita: ${requesterName}`;

    const dueDateStr = commitment.due_at
        ? format(new Date(commitment.due_at), "HH:mm", { locale: es })
        : null;

    const isMeetingRaw = commitment.type === 'meeting';
    const isMeeting = isMeetingRaw || /reuni[oó]n|llamada|junta|meet|zoom|call|cita/i.test(commitment.title || '');
    const typeLabel = isMeeting ? 'Reunión' : 'Tarea';
    const isOperationMode = conversationMode === 'operation';
    const isActiveOperation = !!activeCommitmentId && activeCommitmentId === commitment.id;
    const isCompactOperationCard = isOperationMode && isActiveOperation && !isProposed;
    const canSetOperationFocus = !commitment.assigned_to_user_id || currentUserId === assignedId;

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
            console.error('[GroupTaskCard] Edit confirm failed', err);
        }
    };

    const handleSetActiveCommitment = (nextCommitmentId: string | null) => {
        if (!conversationId) return;
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        setActiveCommitment(nextCommitmentId);
    };

    const getStatusInfo = () => {
        const isDark = theme.isDark;
        if (isDone) return { label: '✅ Completada', color: isDark ? '#86efac' : '#166534', bg: isDark ? '#1f3a2b' : '#dcfce7' };
        if (isRejected) return { label: '❌ Rechazada', color: isDark ? '#fca5a5' : '#991b1b', bg: isDark ? '#3b1d1d' : '#fee2e2' };
        if (isProposed) return { label: '⏳ Propuesta', color: isDark ? '#fcd34d' : '#92400e', bg: isDark ? '#3b2a15' : '#fef3c7' };
        if (isCounter) return { label: '🔄 Contrapropuesta', color: isDark ? '#c4b5fd' : '#3730a3', bg: isDark ? '#2b2141' : '#e0e7ff' };
        return { label: '🚀 Activa', color: isDark ? '#93c5fd' : '#1e40af', bg: isDark ? '#1f2c45' : '#dbeafe' };
    };

    const statusInfo = getStatusInfo();

    const meetingStyle = isMeeting
        ? (theme.isDark
            ? {
                backgroundColor: theme.colors.surfaceMuted,
                borderColor: theme.colors.separator,
                borderLeftWidth: 4,
                borderLeftColor: theme.colors.accent,
            }
            : styles.cardMeeting)
        : null;

    return (
        <View style={[
            styles.cardContainer,
            theme.isDark && {
                backgroundColor: theme.colors.surface,
                borderColor: theme.colors.separator,
                shadowOpacity: 0,
            },
            isTimelineNode && styles.timelineCard,
            meetingStyle,
            isPast && (theme.isDark ? { opacity: 0.6, backgroundColor: theme.colors.surfaceMuted } : styles.cardPast),
            isRejected && (theme.isDark ? { backgroundColor: '#3b1d1d', borderColor: '#7f1d1d' } : styles.cardRejected),
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
                <Text style={[styles.nodeTime, theme.isDark && { color: theme.colors.text.muted }]}>{dueDateStr || '--:--'}</Text>
            </View>

            {/* Center: Main Info */}
            <View style={styles.mainContent}>
                <Text style={[styles.taskTitle, theme.isDark && { color: theme.colors.text.primary }, isDone && styles.textDone]} numberOfLines={2}>
                    {commitment.title}
                </Text>
                
                <View style={styles.footerRow}>
                    <View style={styles.assigneeInfo}>
                        <Text style={[styles.assigneeText, theme.isDark && { color: theme.colors.text.secondary }]} numberOfLines={1}>{responsibilityLabel}</Text>
                        <Text style={[styles.requesterText, theme.isDark && { color: theme.colors.text.muted }]} numberOfLines={1}>{requesterLabel}</Text>
                    </View>

                    <View style={styles.badgesRow}>
                        {isActiveOperation && (
                            <View style={[styles.activeOperationBadge, theme.isDark && { backgroundColor: theme.colors.accentSoft }]}>
                                <Text style={[styles.activeOperationBadgeText, theme.isDark && { color: theme.colors.accent }]}>EN OPERACION</Text>
                            </View>
                        )}
                        {!isCompactOperationCard && (
                        <View style={[styles.statusBadge, { backgroundColor: statusInfo.bg }]}> 
                            <Text style={[styles.statusBadgeText, { color: statusInfo.color }]}> 
                                {statusInfo.label.split(' ')[1] || statusInfo.label}
                            </Text>
                        </View>
                        )}
                    </View>
                </View>

                {isRejected && commitment.rejection_reason && (
                    <Text style={[styles.rejectionText, theme.isDark && { color: theme.colors.danger }]}>Motivo: {commitment.rejection_reason}</Text>
                )}

                {isOperationMode && isActiveOperation && (
                    <Text style={[styles.operationHint, theme.isDark && { color: theme.colors.text.secondary }]}>
                        {isProposed
                            ? 'Acepta o ajusta esta tarea aqui. Luego sigue la ejecucion desde la franja superior.'
                            : 'La planificacion queda aqui. La ejecucion se marca desde la franja superior.'}
                    </Text>
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
                {!isDone && !isRejected && !isCompactOperationCard && (
                    <TouchableOpacity onPress={() => setShowActions(true)} style={styles.moreBtn}>
                        <Ionicons name="ellipsis-vertical" size={20} color={theme.isDark ? theme.colors.text.muted : '#94a3b8'} />
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
                    <View style={[styles.actionMenu, theme.isDark && { backgroundColor: theme.colors.surfaceElevated }]}> 
                        <Text style={[styles.actionMenuTitle, theme.isDark && { color: theme.colors.text.primary }]}>{commitment.title}</Text>

                        {isAssignee && isProposed && (
                            <TouchableOpacity
                                style={[styles.menuItem, { borderBottomWidth: 1, borderBottomColor: theme.colors.separator }]}
                                onPress={() => { setShowActions(false); handleAccept(); }}
                            >
                                <Ionicons name={isMeeting ? "calendar" : "checkmark-circle"} size={24} color="#22c55e" />
                                <Text style={[styles.menuItemText, theme.isDark && { color: theme.colors.text.primary }]}>Aceptar {typeLabel}</Text>
                            </TouchableOpacity>
                        )}

                        {isOwner && !isDone && (
                            <TouchableOpacity
                                style={[styles.menuItem, { borderBottomWidth: 1, borderBottomColor: theme.colors.separator }]}
                                onPress={() => { setShowActions(false); handleEdit(); }}
                            >
                                <Ionicons name="create" size={24} color="#8b5cf6" />
                                <Text style={[styles.menuItemText, theme.isDark && { color: theme.colors.text.primary }]}>Editar {typeLabel}</Text>
                            </TouchableOpacity>
                        )}

                        {isAssignee && !isMeeting && isProposed && (
                            <TouchableOpacity
                                style={[styles.menuItem, { borderBottomWidth: 1, borderBottomColor: theme.colors.separator }]}
                                onPress={() => { setShowActions(false); handlePostpone(); }}
                            >
                                <Ionicons name="time" size={24} color="#6366f1" />
                                <Text style={[styles.menuItemText, theme.isDark && { color: theme.colors.text.primary }]}>Posponer</Text>
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

                        {isOperationMode && !isRejected && !isDone && canSetOperationFocus && isAccepted && (
                            <TouchableOpacity
                                style={[styles.menuItem, { borderTopWidth: 1, borderTopColor: theme.colors.separator }]}
                                onPress={() => {
                                    setShowActions(false);
                                    handleSetActiveCommitment(isActiveOperation ? null : commitment.id);
                                }}
                                disabled={isSettingActiveCommitment}
                            >
                                <Ionicons name={isActiveOperation ? 'close-circle' : 'flash'} size={24} color="#2563eb" />
                                <Text style={[styles.menuItemText, { color: '#2563eb' }]}>
                                    {isActiveOperation ? 'Quitar de operación' : 'Poner en curso'}
                                </Text>
                            </TouchableOpacity>
                        )}

                        <TouchableOpacity style={styles.cancelBtn} onPress={() => setShowActions(false)}>
                            <Text style={[styles.cancelBtnText, theme.isDark && { color: theme.colors.text.secondary }]}>Cancelar</Text>
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
        borderRadius: 16,
        padding: 10,
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
    badgesRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
    },
    assigneeInfo: {
        flex: 1,
        minWidth: 0,
    },
    assigneeText: {
        fontSize: 12,
        color: '#334155',
        fontWeight: '700',
    },
    requesterText: {
        fontSize: 11,
        color: '#64748b',
        marginTop: 2,
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
    operationHint: {
        fontSize: 12,
        color: '#64748b',
        marginTop: 10,
    },
    activeOperationBadge: {
        paddingHorizontal: 8,
        paddingVertical: 3,
        borderRadius: 8,
        backgroundColor: '#dbeafe',
    },
    activeOperationBadgeText: {
        fontSize: 10,
        fontWeight: '800',
        color: '#1d4ed8',
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
