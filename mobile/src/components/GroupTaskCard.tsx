import React, { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { View, Text, TouchableOpacity, StyleSheet, Alert, Modal, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { useNavigation } from '@react-navigation/native';
import { useAuth } from '../context/AuthContext';
import { useAppTheme } from '../theme/ThemeContext';
import type { ChatsTabNavigationProp } from '../navigation/types';
import { AISuggestionModal } from './AISuggestionModal';
import {
    useAcceptCommitment, useRejectCommitment, useUpdateCommitment, useSetActiveOperationCommitment,
    useResolveCommitment, useReopenCommitment, useMarkActionCompleted,
    useContacts, useCancelCommitment,
} from '../api/queries';
import * as Haptics from 'expo-haptics';
import { normalizeCommitmentStatus } from '../utils/commitmentStatus';
import { getWaitingLabel, isActionCompletedPendingResolution as computeActionCompletedPendingResolution, resolveConversationId, getRejectionReason, getStatusLabel } from '../utils/commitmentDisplay';

interface GroupTaskCardProps {
    commitment: any;
    conversationId?: string;
    groupParticipants?: any[];
    isTimelineNode?: boolean;
    isPast?: boolean;
    conversationMode?: 'chat' | 'operation';
    activeCommitmentId?: string | null;
    hideActions?: boolean;
}

export default function GroupTaskCard({ 
    commitment, 
    conversationId: manualConversationId,
    groupParticipants = [],
    isTimelineNode = false,
    isPast = false,
    conversationMode = 'chat',
    activeCommitmentId = null,
    hideActions = false,
}: GroupTaskCardProps) {
    const queryClient = useQueryClient();
    // V2: conversation_id es la columna real; group_conversation_id se
    // conserva solo como fallback defensivo (alias temporal del backend).
    const conversationId = manualConversationId || resolveConversationId(commitment);
    const { user } = useAuth();
    const { theme } = useAppTheme();
    const { mutate: resolveCommitment, isPending: isResolving } = useResolveCommitment();
    const { mutate: reopenCommitment } = useReopenCommitment();
    const { mutate: markActionCompleted, isPending: isMarkingActionCompleted } = useMarkActionCompleted();
    const { mutate: accept } = useAcceptCommitment();
    const { mutate: reject } = useRejectCommitment();
    const { mutateAsync: cancelCommitment, isPending: isCancelling } = useCancelCommitment();
    const { mutateAsync: updateCommitment } = useUpdateCommitment();
    const { mutate: setActiveCommitment, isPending: isSettingActiveCommitment } = useSetActiveOperationCommitment(conversationId || '');
    const { data: myContacts } = useContacts();
    const navigation = useNavigation<ChatsTabNavigationProp>();
    const [showActions, setShowActions] = useState(false);
    const [showDetails, setShowDetails] = useState(false);
    const [showEditModal, setShowEditModal] = useState(false);
    const [editData, setEditData] = useState<any>(null);

    const currentUserId = user?.id?.toLowerCase();
    const assignedId = commitment.assigned_to_user_id?.toLowerCase();
    const isOwner = !!currentUserId && commitment.owner_user_id?.toLowerCase() === currentUserId;
    const isEveryone = !commitment.assigned_to_user_id;
    // You are an assignee if it's assigned to you specifically, or if it's for everyone and you're not the owner
    const isAssignee = (!!assignedId && currentUserId === assignedId) || (isEveryone && !isOwner);

    const status = normalizeCommitmentStatus(commitment.status);
    // V2: 'completed' ya no es un estado (ver utils/commitmentStatus.ts). Lo
    // que antes era "isDone" ahora es "resuelto" (status === 'resolved').
    const isDone = status === 'resolved';
    const isProposed = status === 'proposed';
    const isRejected = status === 'rejected';
    const isCounter = status === 'counter_proposal';
    const isAccepted = status === 'accepted';
    const isCancelled = status === 'cancelled';
    const isReopenable = isRejected || isDone || isCancelled;
    // Parte 10: accion realizada vs asunto resuelto son conceptos
    // independientes — action_completed_at puede existir sin resolved_at.
    const isActionCompletedPendingResolution = computeActionCompletedPendingResolution(commitment);
    const waitingLabel = getWaitingLabel(commitment, user?.id, myContacts || [], groupParticipants);
    const isWaitingOnMe = waitingLabel === 'Te corresponde actuar';

    const requesterName = commitment.owner?.full_name || (isOwner ? 'Tú' : 'Alguien');
    const assigneeName = (commitment as any)._isEveryoneSummary || !commitment.assigned_to_user_id
        ? 'Todos'
        : (currentUserId === assignedId ? 'Tú' : (commitment.assignee?.full_name || 'Alguien'));

    const responsibilityLabel = `Responsable: ${assigneeName}`;
    const requesterLabel = isOwner ? 'Creada por ti' : `Solicita: ${requesterName}`;

    const dueDateStr = commitment.due_at
        ? format(new Date(commitment.due_at), "dd MMM · HH:mm", { locale: es }).replace('.', '')
        : null;
    const dueDateFull = commitment.due_at
        ? format(new Date(commitment.due_at), "dd MMM yyyy · HH:mm", { locale: es }).replace('.', '')
        : null;

    const isMeetingRaw = commitment.type === 'meeting';
    const isMeeting = isMeetingRaw || /reuni[oó]n|llamada|junta|meet|zoom|call|cita/i.test(commitment.title || '');
    const typeLabel = isMeeting ? 'Reunión' : 'Tarea';
    const isOperationMode = conversationMode === 'operation';
    const isActiveOperation = !!activeCommitmentId && activeCommitmentId === commitment.id;
    const isCompactOperationCard = isOperationMode && isActiveOperation && !isProposed;
    const canSetOperationFocus = !commitment.assigned_to_user_id || currentUserId === assignedId;

    const completionMeta = commitment?.meta?.operational || {};
    const completedAt = completionMeta.completed_at || commitment?.updated_at || commitment?.created_at;
    const completedBy = completionMeta.completed_by_name || assigneeName;
    const completionOutcome = completionMeta.completion_outcome || null;
    const completionNote = completionMeta.completion_note || null;
    const rejectionReason = getRejectionReason(commitment);

    const formatDetailDate = (iso?: string | null) => {
        if (!iso) return 'Sin fecha';
        return format(new Date(iso), "dd MMM yyyy · HH:mm", { locale: es }).replace('.', '');
    };

    // Parte 10: "accion realizada" y "resolver" son acciones separadas.
    const handleActionCompleted = () => {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        markActionCompleted(commitment.id);
    };

    const handleResolve = () => {
        Alert.alert(
            `Resolver ${typeLabel}`,
            `¿Confirmas que este asunto quedo resuelto?`,
            [
                { text: 'Cancelar', style: 'cancel' },
                {
                    text: 'Sí, resolver',
                    onPress: () => {
                        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                        resolveCommitment({
                            id: commitment.id,
                            result: completionNote?.trim() || 'El usuario confirmó que el asunto quedó resuelto.',
                        });
                    }
                }
            ]
        );
    };

    const handleCancel = () => {
        Alert.alert(
            `Cancelar ${typeLabel}`,
            `¿Confirmas que quieres cancelar esta ${isMeeting ? 'reunión' : 'tarea'}? Se conservará su historial.`,
            [
                { text: 'Volver', style: 'cancel' },
                {
                    text: 'Sí, cancelar',
                    style: 'destructive',
                    onPress: () => {
                        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
                        cancelCommitment({ id: commitment.id }).catch((error) => {
                            console.warn('[Commitment] Cancellation rejected', {
                                message: error instanceof Error ? error.message : 'unknown',
                            });
                            Alert.alert(
                                'No se pudo cancelar',
                                `La ${isMeeting ? 'reunión' : 'tarea'} no fue cancelada. Inténtalo nuevamente.`
                            );
                        });
                    }
                }
            ]
        );
    };

    const handleReopen = () => {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        reopenCommitment(commitment.id);
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
            groupConversationId: conversationId
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
            groupConversationId: conversationId
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

    // Parte 15: solo se muestra si hay tanto mensaje de origen como
    // conversacion — sin ambos, el compromiso debe seguir siendo utilizable
    // sin este boton.
    const canViewOriginConversation = !!commitment.message_id && !!conversationId;
    const handleViewConversation = () => {
        if (!canViewOriginConversation) return;
        setShowDetails(false);
        navigation.navigate('Chats', {
            screen: 'Chat',
            params: {
                conversationId,
                isGroup: true,
                otherUser: null,
                groupMetadata: { id: conversationId, name: null, avatar_url: null },
                mode: conversationMode,
                scrollToMessageId: commitment.message_id,
                commitmentId: commitment.id,
                commitmentTitle: commitment.title,
            },
        });
    };

    const handleSetActiveCommitment = (nextCommitmentId: string | null) => {
        if (!conversationId) return;
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        setActiveCommitment(nextCommitmentId);
    };

    const getStatusInfo = () => {
        const isDark = theme.isDark;
        const label = getStatusLabel(status);
        if (isDone) return { label, color: isDark ? '#86efac' : '#166534', bg: isDark ? '#1f3a2b' : '#dcfce7' };
        if (isCancelled) return { label, color: isDark ? '#cbd5e1' : '#475569', bg: isDark ? '#233044' : '#e2e8f0' };
        if (isRejected) return { label, color: isDark ? '#fca5a5' : '#991b1b', bg: isDark ? '#3b1d1d' : '#fee2e2' };
        if (isProposed) return { label, color: isDark ? '#fcd34d' : '#92400e', bg: isDark ? '#3b2a15' : '#fef3c7' };
        if (isCounter) return { label, color: isDark ? '#c4b5fd' : '#3730a3', bg: isDark ? '#2b2141' : '#e0e7ff' };
        return { label, color: isDark ? '#93c5fd' : '#1e40af', bg: isDark ? '#1f2c45' : '#dbeafe' };
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
        <TouchableOpacity
            activeOpacity={0.92}
            onPress={() => setShowDetails(true)}
            style={[
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
        ]}
        >
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

                {isRejected && rejectionReason && (
                    <Text style={[styles.rejectionText, theme.isDark && { color: theme.colors.danger }]}>Motivo: {rejectionReason}</Text>
                )}

                {isActionCompletedPendingResolution && (
                    <Text style={[styles.operationHint, theme.isDark && { color: theme.colors.text.secondary }]}>
                        ☑️ Acción realizada · pendiente de confirmar resolución
                    </Text>
                )}

                {!isDone && !isRejected && !isCancelled && waitingLabel && (
                    <Text style={[styles.operationHint, theme.isDark && { color: theme.colors.text.secondary }]}>
                        {isWaitingOnMe ? '👉 ' : '⏳ '}{waitingLabel}
                    </Text>
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
                {!hideActions && !isCompactOperationCard && (!isDone && !isRejected && !isCancelled || (isReopenable && (isOwner || isAssignee))) && (
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
            {!hideActions && (
                <Modal
                    visible={showActions}
                    transparent
                    animationType="fade"
                    onRequestClose={() => setShowActions(false)}
                >
                    <Pressable style={styles.modalOverlay} onPress={() => setShowActions(false)}>
                        <View style={[styles.actionMenu, theme.isDark && { backgroundColor: theme.colors.surfaceElevated }]}>
                            <Text style={[styles.actionMenuTitle, theme.isDark && { color: theme.colors.text.primary }]}>{commitment.title}</Text>

                        {isAssignee && (isProposed || isCounter) && (
                            <TouchableOpacity
                                style={[styles.menuItem, { borderBottomWidth: 1, borderBottomColor: theme.colors.separator }]}
                                onPress={() => { setShowActions(false); handleAccept(); }}
                            >
                                <Ionicons name={isMeeting ? "calendar" : "checkmark-circle"} size={24} color="#22c55e" />
                                <Text style={[styles.menuItemText, theme.isDark && { color: theme.colors.text.primary }]}>Aceptar {typeLabel}</Text>
                            </TouchableOpacity>
                        )}

                        {(isAssignee || isOwner) && !isDone && !isRejected && !isCancelled && !commitment.action_completed_at && !isOperationMode && (
                            <TouchableOpacity
                                style={[styles.menuItem, { borderBottomWidth: 1, borderBottomColor: theme.colors.separator }]}
                                onPress={() => { setShowActions(false); handleActionCompleted(); }}
                                disabled={isMarkingActionCompleted}
                            >
                                <Ionicons name="checkmark" size={24} color="#6366f1" />
                                <Text style={[styles.menuItemText, theme.isDark && { color: theme.colors.text.primary }]}>Marcar acción realizada</Text>
                            </TouchableOpacity>
                        )}

                        {(isAssignee || isOwner) && !isDone && !isRejected && !isCancelled && !isProposed && !isOperationMode && (
                            <TouchableOpacity
                                style={[styles.menuItem, { borderBottomWidth: 1, borderBottomColor: theme.colors.separator }]}
                                onPress={() => { setShowActions(false); handleResolve(); }}
                                disabled={isResolving}
                            >
                                <Ionicons name="checkmark-done" size={24} color="#10b981" />
                                <Text style={[styles.menuItemText, theme.isDark && { color: theme.colors.text.primary }]}>Resolver</Text>
                            </TouchableOpacity>
                        )}

                        {isOwner && !isDone && !isRejected && !isCancelled && (
                            <TouchableOpacity
                                style={[styles.menuItem, { borderBottomWidth: 1, borderBottomColor: theme.colors.separator }]}
                                onPress={() => { setShowActions(false); handleCancel(); }}
                            >
                                <Ionicons name="ban" size={24} color="#64748b" />
                                <Text style={[styles.menuItemText, theme.isDark && { color: theme.colors.text.primary }]}>Cancelar {typeLabel}</Text>
                            </TouchableOpacity>
                        )}

                        {isReopenable && (isOwner || isAssignee) && (
                            <TouchableOpacity
                                style={[styles.menuItem, { borderBottomWidth: 1, borderBottomColor: theme.colors.separator }]}
                                onPress={() => { setShowActions(false); handleReopen(); }}
                            >
                                <Ionicons name="refresh" size={24} color="#6366f1" />
                                <Text style={[styles.menuItemText, theme.isDark && { color: theme.colors.text.primary }]}>Reabrir</Text>
                            </TouchableOpacity>
                        )}

                        {isOwner && !isDone && !isRejected && !isCancelled && (
                            <TouchableOpacity
                                style={[styles.menuItem, { borderBottomWidth: 1, borderBottomColor: theme.colors.separator }]}
                                onPress={() => { setShowActions(false); handleEdit(); }}
                            >
                                <Ionicons name="create" size={24} color="#8b5cf6" />
                                <Text style={[styles.menuItemText, theme.isDark && { color: theme.colors.text.primary }]}>Editar {typeLabel}</Text>
                            </TouchableOpacity>
                        )}

                        {(isOwner || isAssignee) && !isMeeting && (isProposed || isCounter || isAccepted) && (
                            <TouchableOpacity
                                style={[styles.menuItem, { borderBottomWidth: 1, borderBottomColor: theme.colors.separator }]}
                                onPress={() => { setShowActions(false); handlePostpone(); }}
                            >
                                <Ionicons name="time" size={24} color="#6366f1" />
                                <Text style={[styles.menuItemText, theme.isDark && { color: theme.colors.text.primary }]}>Contraproponer fecha</Text>
                            </TouchableOpacity>
                        )}

                        {isAssignee && (isProposed || isCounter) && (
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
            )}

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
                        isCancelling={isCancelling}
                        onCancel={async (reason?: string) => {
                            try {
                                await cancelCommitment({ id: commitment.id, reason });
                                Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                                if (conversationId) {
                                    queryClient.invalidateQueries({ queryKey: ['conversation-messages', conversationId] });
                                }
                                setShowEditModal(false);
                                setEditData(null);
                            } catch (error) {
                                console.warn('[Commitment] Cancellation rejected', {
                                    message: error instanceof Error ? error.message : 'unknown',
                                });
                                Alert.alert(
                                    'No se pudo cancelar',
                                    `La ${isMeeting ? 'reunión' : 'tarea'} no fue cancelada. Inténtalo nuevamente.`
                                );
                                throw error;
                            }
                        }}
                    />
                </View>
            )}
            <Modal visible={showDetails} transparent animationType="slide" onRequestClose={() => setShowDetails(false)}>
                <Pressable style={styles.detailOverlay} onPress={() => setShowDetails(false)} />
                <View style={[styles.detailSheet, theme.isDark && { backgroundColor: theme.colors.surfaceElevated }]}> 
                    <View style={styles.detailHeader}>
                        <Text style={[styles.detailTitle, theme.isDark && { color: theme.colors.text.primary }]} numberOfLines={2}>{commitment.title}</Text>
                        <TouchableOpacity onPress={() => setShowDetails(false)}>
                            <Ionicons name="close" size={22} color={theme.colors.text.muted} />
                        </TouchableOpacity>
                    </View>

                    <View style={styles.detailRow}>
                        <Text style={[styles.detailLabel, theme.isDark && { color: theme.colors.text.muted }]}>Estado</Text>
                        <View style={[styles.statusBadge, { backgroundColor: statusInfo.bg }]}>
                            <Text style={[styles.statusBadgeText, { color: statusInfo.color }]}> 
                                {statusInfo.label.split(' ')[1] || statusInfo.label}
                            </Text>
                        </View>
                    </View>

                    <View style={styles.detailRow}>
                        <Text style={[styles.detailLabel, theme.isDark && { color: theme.colors.text.muted }]}>Responsable</Text>
                        <Text style={[styles.detailValue, theme.isDark && { color: theme.colors.text.primary }]}>
                            {commitment.counterparty_contact_id
                                ? ((myContacts || []).find((c: any) => c.id === commitment.counterparty_contact_id)?.display_name || 'Contacto externo')
                                : assigneeName}
                        </Text>
                    </View>

                    <View style={styles.detailRow}>
                        <Text style={[styles.detailLabel, theme.isDark && { color: theme.colors.text.muted }]}>Fecha</Text>
                        <Text style={[styles.detailValue, theme.isDark && { color: theme.colors.text.primary }]}>{dueDateFull || 'Sin fecha'}</Text>
                    </View>

                    {isCounter && commitment.proposed_due_at && (
                        <View style={styles.detailRow}>
                            <Text style={[styles.detailLabel, theme.isDark && { color: theme.colors.text.muted }]}>Fecha propuesta</Text>
                            <Text style={[styles.detailValue, theme.isDark && { color: theme.colors.text.primary }]}>{formatDetailDate(commitment.proposed_due_at)}</Text>
                        </View>
                    )}

                    {!isDone && !isRejected && !isCancelled && waitingLabel && (
                        <View style={styles.detailRow}>
                            <Text style={[styles.detailLabel, theme.isDark && { color: theme.colors.text.muted }]}>Seguimiento</Text>
                            <Text style={[styles.detailValue, theme.isDark && { color: theme.colors.text.primary }]}>{waitingLabel}</Text>
                        </View>
                    )}

                    {commitment.next_action && (
                        <View style={styles.detailRowBlock}>
                            <Text style={[styles.detailLabel, theme.isDark && { color: theme.colors.text.muted }]}>Próxima acción</Text>
                            <Text style={[styles.detailValue, theme.isDark && { color: theme.colors.text.primary }]}>{commitment.next_action}</Text>
                        </View>
                    )}

                    {commitment.follow_up_at && (
                        <View style={styles.detailRow}>
                            <Text style={[styles.detailLabel, theme.isDark && { color: theme.colors.text.muted }]}>Seguimiento programado</Text>
                            <Text style={[styles.detailValue, theme.isDark && { color: theme.colors.text.primary }]}>{formatDetailDate(commitment.follow_up_at)}</Text>
                        </View>
                    )}

                    {commitment.action_completed_at && (
                        <View style={styles.detailRow}>
                            <Text style={[styles.detailLabel, theme.isDark && { color: theme.colors.text.muted }]}>Acción realizada</Text>
                            <Text style={[styles.detailValue, theme.isDark && { color: theme.colors.text.primary }]}>{formatDetailDate(commitment.action_completed_at)}</Text>
                        </View>
                    )}

                    {isDone && (
                        <>
                            <View style={styles.detailRow}>
                                <Text style={[styles.detailLabel, theme.isDark && { color: theme.colors.text.muted }]}>Completado por</Text>
                                <Text style={[styles.detailValue, theme.isDark && { color: theme.colors.text.primary }]}>{completedBy}</Text>
                            </View>
                            <View style={styles.detailRow}>
                                <Text style={[styles.detailLabel, theme.isDark && { color: theme.colors.text.muted }]}>Resuelto</Text>
                                <Text style={[styles.detailValue, theme.isDark && { color: theme.colors.text.primary }]}>{formatDetailDate(commitment.resolved_at || completedAt)}</Text>
                            </View>
                        </>
                    )}

                    {isRejected && rejectionReason && (
                        <View style={styles.detailRowBlock}>
                            <Text style={[styles.detailLabel, theme.isDark && { color: theme.colors.text.muted }]}>Motivo</Text>
                            <Text style={[styles.detailValue, theme.isDark && { color: theme.colors.text.primary }]}>{rejectionReason}</Text>
                        </View>
                    )}

                    {completionOutcome && (
                        <View style={styles.detailRowBlock}>
                            <Text style={[styles.detailLabel, theme.isDark && { color: theme.colors.text.muted }]}>Resultado</Text>
                            <Text style={[styles.detailValue, theme.isDark && { color: theme.colors.text.primary }]}>{completionOutcome.replace('_', ' ')}</Text>
                        </View>
                    )}

                    {completionNote && (
                        <View style={styles.detailRowBlock}>
                            <Text style={[styles.detailLabel, theme.isDark && { color: theme.colors.text.muted }]}>Observación</Text>
                            <Text style={[styles.detailValue, theme.isDark && { color: theme.colors.text.primary }]}>{completionNote}</Text>
                        </View>
                    )}

                    {canViewOriginConversation && (
                        <TouchableOpacity style={styles.viewConversationBtn} onPress={handleViewConversation}>
                            <Ionicons name="chatbubble-ellipses-outline" size={16} color="#6366f1" />
                            <Text style={styles.viewConversationBtnText}>Ver conversación</Text>
                        </TouchableOpacity>
                    )}
                </View>
            </Modal>
        </TouchableOpacity>
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
        width: 72,
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
        fontSize: 10,
        fontWeight: '800',
        color: '#64748b',
        marginTop: 6,
        textAlign: 'center',
        lineHeight: 12,
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
    detailOverlay: {
        flex: 1,
        backgroundColor: 'rgba(0,0,0,0.3)',
    },
    detailSheet: {
        padding: 16,
        borderTopLeftRadius: 18,
        borderTopRightRadius: 18,
        backgroundColor: 'white',
        borderTopWidth: 1,
        borderTopColor: '#e2e8f0',
    },
    detailHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 12,
        marginBottom: 12,
    },
    detailTitle: {
        flex: 1,
        fontSize: 16,
        fontWeight: '800',
        color: '#0f172a',
    },
    detailRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 10,
        marginBottom: 10,
    },
    detailRowBlock: {
        marginBottom: 10,
    },
    detailLabel: {
        fontSize: 12,
        fontWeight: '700',
        color: '#64748b',
        textTransform: 'uppercase',
        letterSpacing: 0.3,
    },
    detailValue: {
        fontSize: 13,
        fontWeight: '600',
        color: '#0f172a',
    },
    viewConversationBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
        marginTop: 10,
        paddingVertical: 12,
        borderRadius: 12,
        backgroundColor: '#eef2ff',
    },
    viewConversationBtnText: {
        color: '#6366f1',
        fontWeight: '700',
        fontSize: 14,
    },
});
