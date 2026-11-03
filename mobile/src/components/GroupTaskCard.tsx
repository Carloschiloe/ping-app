import React, { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { View, Text, TouchableOpacity, StyleSheet, Alert, Modal, Pressable, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { useNavigation } from '@react-navigation/native';
import { useAuth } from '../context/AuthContext';
import type { ChatsTabNavigationProp } from '../navigation/types';
import { AISuggestionModal } from './AISuggestionModal';
import {
    useAcceptCommitment, useRejectCommitment, useUpdateCommitment, useSetActiveOperationCommitment,
    useResolveCommitment, useReopenCommitment, useMarkActionCompleted,
    useContacts, useCancelCommitment, useRespondToCommitmentProposal, useGroupParticipants,
} from '../api/queries';
import * as Haptics from 'expo-haptics';
import { normalizeCommitmentStatus } from '../utils/commitmentStatus';
import { getWaitingLabel, isActionCompletedPendingResolution as computeActionCompletedPendingResolution, resolveConversationId, getRejectionReason, getStatusLabel } from '../utils/commitmentDisplay';
import {
    getAgreementSummary,
    type AgreementResponse,
} from '../utils/agreement';
import { getProposalActorPresentation } from '../utils/actorPresentation';
import { AgreementParticipantsList } from './AgreementParticipantsList';
import { dayBadge } from './compromisos/dayBadge';
import { colors, gradients } from '../design/tokens';
import { fonts } from '../design/typography';
import { SheetFill, sheetSurface } from '../design/Sheet';

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
    const { mutate: resolveCommitment, isPending: isResolving } = useResolveCommitment();
    const { mutate: reopenCommitment } = useReopenCommitment();
    const { mutate: markActionCompleted, isPending: isMarkingActionCompleted } = useMarkActionCompleted();
    const { mutate: accept } = useAcceptCommitment();
    const { mutate: reject } = useRejectCommitment();
    const { mutateAsync: cancelCommitment, isPending: isCancelling } = useCancelCommitment();
    const { mutateAsync: updateCommitment } = useUpdateCommitment();
    const { mutateAsync: respondToProposal, isPending: isRespondingToProposal } = useRespondToCommitmentProposal();
    const { mutate: setActiveCommitment, isPending: isSettingActiveCommitment } = useSetActiveOperationCommitment(conversationId || '');
    const { data: myContacts } = useContacts();
    const navigation = useNavigation<ChatsTabNavigationProp>();
    const [showActions, setShowActions] = useState(false);
    const [showDetails, setShowDetails] = useState(false);
    const [showEditModal, setShowEditModal] = useState(false);
    const [editData, setEditData] = useState<any>(null);
    const { data: detailConversationParticipants = [] } = useGroupParticipants(
        showDetails ? conversationId : null
    );

    const currentUserId = user?.id?.toLowerCase();
    const assignedId = commitment.assigned_to_user_id?.toLowerCase();
    const isOwner = !!currentUserId && commitment.owner_user_id?.toLowerCase() === currentUserId;
    const isEveryone = !commitment.assigned_to_user_id;
    // You are an assignee if it's assigned to you specifically, or if it's for everyone and you're not the owner
    const isAssignee = (!!assignedId && currentUserId === assignedId) || (isEveryone && !isOwner);
    const isAgreementProposal = commitment._isAgreementProposal === true;
    const agreementResponses: AgreementResponse[] = Array.isArray(commitment.agreement_responses)
        ? commitment.agreement_responses
        : [];
    const currentAgreementResponse = agreementResponses.find(
        (response) => response.participant_user_id?.toLowerCase() === currentUserId
    );
    const agreementSummary = getAgreementSummary(agreementResponses);
    const canRespondToAgreement = isAgreementProposal && currentAgreementResponse?.status === 'pending';

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
    // COMMITMENT UX + ACTOR-AWARE SUGGESTIONS (sección 16/19/23 del ticket)
    // — reutiliza el MISMO helper canónico que CommitmentRow.tsx/
    // TodayItemRow.tsx, nunca una cuarta redacción independiente ("Te
    // corresponde responder" vs "Necesita tu respuesta" para el MISMO
    // actor/estado real era exactamente la inconsistencia cross-surface que
    // la sección 23 prohíbe).
    const proposalPresentation = isAgreementProposal ? getProposalActorPresentation(commitment, user?.id) : null;
    const agreementWaitingLabel = proposalPresentation?.statusLabel ?? null;

    const requesterName = commitment.owner?.full_name || (isOwner ? 'Tú' : 'Alguien');
    const assigneeName = (commitment as any)._isEveryoneSummary || !commitment.assigned_to_user_id
        ? 'Todos'
        : (currentUserId === assignedId ? 'Tú' : (commitment.assignee?.full_name || 'Alguien'));

    const dueDateFull = commitment.due_at
        ? format(new Date(commitment.due_at), "dd MMM yyyy · HH:mm", { locale: es }).replace('.', '')
        : null;

    const isMeeting = commitment.type === 'meeting';
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

    const handleAccept = async () => {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        if (isAgreementProposal) {
            try {
                await respondToProposal({ id: commitment.id, decision: 'approve' });
            } catch {
                Alert.alert('No se pudo aprobar', 'La respuesta no fue guardada. Inténtalo nuevamente.');
            }
            return;
        }
        accept(commitment.id);
    };

    const handleReject = () => {
        if (isAgreementProposal) {
            Alert.alert(
                `Rechazar ${typeLabel}`,
                'El compromiso no se creará y se conservará el rechazo en el acuerdo.',
                [
                    { text: 'Volver', style: 'cancel' },
                    {
                        text: 'Rechazar',
                        style: 'destructive',
                        onPress: async () => {
                            try {
                                await respondToProposal({ id: commitment.id, decision: 'reject' });
                            } catch {
                                Alert.alert('No se pudo rechazar', 'La respuesta no fue guardada. Inténtalo nuevamente.');
                            }
                        },
                    },
                ]
            );
            return;
        }
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

            if (isAgreementProposal) {
                await respondToProposal({
                    id: commitment.id,
                    decision: 'counter_propose',
                    proposedDueAt: editData.dueAt,
                });
                setShowEditModal(false);
                setEditData(null);
                return;
            }
            
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
        if (isAgreementProposal) {
            if (agreementSummary.rejected > 0) {
                return { label: 'Rechazado', color: colors.danger, bg: colors.dangerTint };
            }
            if (agreementSummary.counterProposed > 0 && agreementSummary.pending > 0) {
                return { label: 'Nuevo horario', color: colors.accentBright, bg: colors.accentTint };
            }
            return { label: agreementSummary.label, color: colors.warning, bg: colors.warningTint };
        }
        const label = getStatusLabel(status);
        if (isDone) return { label, color: colors.success, bg: colors.successTint };
        if (isCancelled) return { label, color: colors.textFaint, bg: colors.glassRaised };
        if (isRejected) return { label, color: colors.danger, bg: colors.dangerTint };
        if (isProposed) return { label, color: colors.warning, bg: colors.warningTint };
        if (isCounter) return { label, color: colors.accentBright, bg: colors.accentTint };
        return { label, color: colors.accentBright, bg: colors.accentTint };
    };

    const statusInfo = getStatusInfo();

    // Compact card: the day on the left (same badge as Hoy), the title, and
    // one quiet line with who it is for and what it is waiting on. Finished,
    // cancelled and rejected items fade so they never compete with the chat.
    const isFinished = isDone || isCancelled || isRejected;
    const badge = dayBadge(commitment.due_at);
    const assigneeShort = assigneeName === 'Tú' ? 'ti' : assigneeName === 'Todos' ? 'todos' : assigneeName;
    const hint = isFinished
        ? null
        : isActionCompletedPendingResolution
            ? 'Acción realizada · falta cerrar'
            : (agreementWaitingLabel || waitingLabel || (!isAccepted ? statusInfo.label : null));
    const hintIsMine = canRespondToAgreement || isWaitingOnMe;
    const metaParts = [isMeeting ? 'Reunión' : null, `Para ${assigneeShort}`].filter(Boolean).join(' · ');
    const canOpenMenu = !hideActions && !isCompactOperationCard && (!isFinished || (isReopenable && (isOwner || isAssignee)));

    return (
        <TouchableOpacity
            activeOpacity={0.92}
            onPress={() => setShowDetails(true)}
            accessibilityRole="button"
            accessibilityLabel={`${typeLabel}: ${commitment.title}`}
            style={[
            styles.cardContainer,
            { backgroundColor: colors.bubbleThem, borderColor: colors.separator },
            isTimelineNode && styles.timelineCard,
            (isFinished || isPast) && styles.cardFinished,
        ]}
        >
            <View style={[styles.dayBadge, { backgroundColor: colors.glassRaised }]}>
                <Text style={[styles.dayBadgeDay, { color: colors.text }]} numberOfLines={1}>{badge.day}</Text>
                {!!badge.detail && (
                    <Text style={[styles.dayBadgeDetail, { color: colors.textFaint }]} numberOfLines={1}>{badge.detail}</Text>
                )}
            </View>

            <View style={styles.mainContent}>
                <Text
                    style={[
                        styles.taskTitle,
                        { color: colors.text },
                        (isCancelled || isRejected) && styles.textStruck,
                    ]}
                    numberOfLines={1}
                >
                    {commitment.title}
                </Text>
                <Text style={[styles.metaLine, { color: colors.textFaint }]} numberOfLines={1}>
                    {metaParts}
                    {isFinished && (
                        <Text style={{ color: statusInfo.color, fontFamily: fonts.bold }}>{` · ${statusInfo.label}`}</Text>
                    )}
                    {!!hint && (
                        <Text style={{ color: hintIsMine ? colors.accent : colors.textFaint, fontWeight: hintIsMine ? '700' : '500' }}>{` · ${hint}`}</Text>
                    )}
                    {isActiveOperation && (
                        <Text style={{ color: colors.accent, fontFamily: fonts.bold }}>{' · En operación'}</Text>
                    )}
                </Text>
            </View>

            {canOpenMenu && (
                <TouchableOpacity
                    onPress={() => setShowActions(true)}
                    style={styles.moreBtn}
                    hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                    accessibilityRole="button"
                    accessibilityLabel="Acciones de la tarea"
                >
                    <Ionicons name="ellipsis-vertical" size={18} color={colors.textFaint} />
                </TouchableOpacity>
            )}

            {/* Actions Modal */}
            {!hideActions && (
                <Modal
                    visible={showActions}
                    transparent
                    animationType="fade"
                    onRequestClose={() => setShowActions(false)}
                >
                    <Pressable style={styles.modalOverlay} onPress={() => setShowActions(false)}>
                        <View style={styles.actionMenu}>
                            <SheetFill />
                            <Text style={[styles.actionMenuTitle]}>{commitment.title}</Text>

                        {((isAgreementProposal && canRespondToAgreement) || (!isAgreementProposal && isAssignee && (isProposed || isCounter))) && (
                            <TouchableOpacity
                                style={[styles.menuItem, { borderBottomWidth: 1, borderBottomColor: colors.separator }]}
                                onPress={() => { setShowActions(false); handleAccept(); }}
                                disabled={isRespondingToProposal}
                            >
                                <Ionicons name={isMeeting ? "calendar" : "checkmark-circle"} size={24} color={colors.success} />
                                <Text style={[styles.menuItemText]}>
                                    {isAgreementProposal ? 'Aprobar propuesta' : `Aceptar ${typeLabel}`}
                                </Text>
                            </TouchableOpacity>
                        )}

                        {!isAgreementProposal && (isAssignee || isOwner) && !isDone && !isRejected && !isCancelled && !commitment.action_completed_at && !isOperationMode && (
                            <TouchableOpacity
                                style={[styles.menuItem, { borderBottomWidth: 1, borderBottomColor: colors.separator }]}
                                onPress={() => { setShowActions(false); handleActionCompleted(); }}
                                disabled={isMarkingActionCompleted}
                            >
                                <Ionicons name="checkmark" size={24} color={colors.accentBright} />
                                <Text style={[styles.menuItemText]}>Marcar acción realizada</Text>
                            </TouchableOpacity>
                        )}

                        {!isAgreementProposal && (isAssignee || isOwner) && !isDone && !isRejected && !isCancelled && !isProposed && !isOperationMode && (
                            <TouchableOpacity
                                style={[styles.menuItem, { borderBottomWidth: 1, borderBottomColor: colors.separator }]}
                                onPress={() => { setShowActions(false); handleResolve(); }}
                                disabled={isResolving}
                            >
                                <Ionicons name="checkmark-done" size={24} color={colors.success} />
                                <Text style={[styles.menuItemText]}>Resolver</Text>
                            </TouchableOpacity>
                        )}

                        {!isAgreementProposal && isOwner && !isDone && !isRejected && !isCancelled && (
                            <TouchableOpacity
                                style={[styles.menuItem, { borderBottomWidth: 1, borderBottomColor: colors.separator }]}
                                onPress={() => { setShowActions(false); handleCancel(); }}
                            >
                                <Ionicons name="ban" size={24} color={colors.textFaint} />
                                <Text style={[styles.menuItemText]}>Cancelar {typeLabel}</Text>
                            </TouchableOpacity>
                        )}

                        {!isAgreementProposal && isReopenable && (isOwner || isAssignee) && (
                            <TouchableOpacity
                                style={[styles.menuItem, { borderBottomWidth: 1, borderBottomColor: colors.separator }]}
                                onPress={() => { setShowActions(false); handleReopen(); }}
                            >
                                <Ionicons name="refresh" size={24} color={colors.accentBright} />
                                <Text style={[styles.menuItemText]}>Reabrir</Text>
                            </TouchableOpacity>
                        )}

                        {!isAgreementProposal && isOwner && !isDone && !isRejected && !isCancelled && (
                            <TouchableOpacity
                                style={[styles.menuItem, { borderBottomWidth: 1, borderBottomColor: colors.separator }]}
                                onPress={() => { setShowActions(false); handleEdit(); }}
                            >
                                <Ionicons name="create" size={24} color={colors.accentBright} />
                                <Text style={[styles.menuItemText]}>Editar {typeLabel}</Text>
                            </TouchableOpacity>
                        )}

                        {/*
                            PARTICIPANT VISIBILITY + ACTOR PERMISSIONS — cierre de raíz
                            (root cause confirmado por auditoría real): `handlePostpone`
                            (abajo) es LITERALMENTE el mismo handler que `handleEdit` --
                            ambos abren el mismo AISuggestionModal con `isEditing=true`
                            para un commitment plano (isAgreementProposal=false), y
                            `onConfirmEdit` envía SIEMPRE title+due_at+assigned_to_user_id
                            juntos (un payload de EDICIÓN genérica, nunca una transición
                            de lifecycle acotada) a `updateCommitment` -- que el backend
                            (commitment.service.ts#editCommitment, doblemente forzado por
                            la RPC `apply_commitment_transition_with_evidence`) sólo
                            permite al OWNER real, nunca a un mero assignee/participante
                            (ni siquiera al asignado explícito, mucho menos a cualquiera
                            incluido sólo por el carve-out "para todos" de `isAssignee`).
                            Antes este ítem se ofrecía también a `isAssignee`, dejando a
                            un participante no-creador (ej. Alejandra sobre un
                            commitment "para todos" que Carlos escribió) abrir un flujo
                            de edición que el backend iba a rechazar de todas formas --
                            nunca fue una "contrapropuesta" real. Restringido a `isOwner`
                            para que el único caso NO-agreement que se ofrece sea el que
                            realmente puede tener éxito. Una contrapropuesta real de un
                            participante existe SÓLO para `commitment_proposals`
                            compartidas (`canRespondToAgreement`, arriba), vía su propia
                            fila de respuesta -- eso nunca cambia.
                        */}
                        {((isAgreementProposal && canRespondToAgreement) || (!isAgreementProposal && isOwner && !isMeeting && (isProposed || isCounter || isAccepted))) && (
                            <TouchableOpacity
                                style={[styles.menuItem, { borderBottomWidth: 1, borderBottomColor: colors.separator }]}
                                onPress={() => { setShowActions(false); handlePostpone(); }}
                            >
                                <Ionicons name="time" size={24} color={colors.accentBright} />
                                <Text style={[styles.menuItemText]}>
                                    {isAgreementProposal ? 'Sugerir otro horario' : 'Reprogramar fecha'}
                                </Text>
                            </TouchableOpacity>
                        )}

                        {((isAgreementProposal && canRespondToAgreement) || (!isAgreementProposal && isAssignee && (isProposed || isCounter))) && (
                            <TouchableOpacity
                                style={styles.menuItem}
                                onPress={() => { setShowActions(false); handleReject(); }}
                                disabled={isRespondingToProposal}
                            >
                                <Ionicons name="close-circle" size={24} color={colors.danger} />
                                <Text style={[styles.menuItemText, { color: colors.danger }]}>Rechazar</Text>
                            </TouchableOpacity>
                        )}

                        {!isAgreementProposal && isOperationMode && !isRejected && !isDone && canSetOperationFocus && isAccepted && (
                            <TouchableOpacity
                                style={[styles.menuItem, { borderTopWidth: 1, borderTopColor: colors.separator }]}
                                onPress={() => {
                                    setShowActions(false);
                                    handleSetActiveCommitment(isActiveOperation ? null : commitment.id);
                                }}
                                disabled={isSettingActiveCommitment}
                            >
                                <Ionicons name={isActiveOperation ? 'close-circle' : 'flash'} size={24} color={colors.accentBright} />
                                <Text style={[styles.menuItemText, { color: colors.accentBright }]}>
                                    {isActiveOperation ? 'Quitar de operación' : 'Poner en curso'}
                                </Text>
                            </TouchableOpacity>
                        )}

                            <TouchableOpacity style={styles.cancelBtn} onPress={() => setShowActions(false)}>
                                <Text style={[styles.cancelBtnText]}>Cancelar</Text>
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
                        isEditing={!isAgreementProposal}
                        isCounterProposal={isAgreementProposal}
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
                            const palette = gradients.avatar.map(([top]) => top);
                            return palette[Math.abs(hash) % palette.length];
                        }}
                        onClose={() => {
                            setShowEditModal(false);
                            setEditData(null);
                        }}
                        onUpdateData={setEditData}
                        onConfirm={onConfirmEdit}
                        isCancelling={isCancelling}
                        onCancel={isAgreementProposal ? undefined : async (reason?: string) => {
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
                <View style={styles.detailSheet}>
                    <SheetFill />
                    <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.detailContent}>
                    <View style={styles.detailHeader}>
                        <Text style={[styles.detailTitle]} numberOfLines={2}>{commitment.title}</Text>
                        <TouchableOpacity onPress={() => setShowDetails(false)}>
                            <Ionicons name="close" size={22} color={colors.textFaint} />
                        </TouchableOpacity>
                    </View>

                    <View style={styles.detailRow}>
                        <Text style={[styles.detailLabel]}>Estado</Text>
                        <View style={[styles.statusBadge, { backgroundColor: statusInfo.bg }]}>
                            <Text style={[styles.statusBadgeText, { color: statusInfo.color }]}> 
                                {statusInfo.label}
                            </Text>
                        </View>
                    </View>

                    <View style={styles.detailRow}>
                        <Text style={[styles.detailLabel]}>Responsable</Text>
                        <Text style={[styles.detailValue]}>
                            {commitment.counterparty_contact_id
                                ? ((myContacts || []).find((c: any) => c.id === commitment.counterparty_contact_id)?.display_name || 'Contacto externo')
                                : assigneeName}
                        </Text>
                    </View>

                    <View style={styles.detailRow}>
                        <Text style={[styles.detailLabel]}>Fecha</Text>
                        <Text style={[styles.detailValue]}>{dueDateFull || 'Sin fecha'}</Text>
                    </View>

                    <AgreementParticipantsList
                        responses={agreementResponses}
                        fallbackParticipants={
                            detailConversationParticipants.length > 0
                                ? detailConversationParticipants
                                : groupParticipants
                        }
                        currentUserId={user?.id}
                    />

                    {isCounter && commitment.proposed_due_at && (
                        <View style={styles.detailRow}>
                            <Text style={[styles.detailLabel]}>Fecha propuesta</Text>
                            <Text style={[styles.detailValue]}>{formatDetailDate(commitment.proposed_due_at)}</Text>
                        </View>
                    )}

                    {!isDone && !isRejected && !isCancelled && waitingLabel && (
                        <View style={styles.detailRow}>
                            <Text style={[styles.detailLabel]}>Seguimiento</Text>
                            <Text style={[styles.detailValue]}>{waitingLabel}</Text>
                        </View>
                    )}

                    {commitment.next_action && (
                        <View style={styles.detailRowBlock}>
                            <Text style={[styles.detailLabel]}>Próxima acción</Text>
                            <Text style={[styles.detailValue]}>{commitment.next_action}</Text>
                        </View>
                    )}

                    {commitment.follow_up_at && (
                        <View style={styles.detailRow}>
                            <Text style={[styles.detailLabel]}>Seguimiento programado</Text>
                            <Text style={[styles.detailValue]}>{formatDetailDate(commitment.follow_up_at)}</Text>
                        </View>
                    )}

                    {commitment.action_completed_at && (
                        <View style={styles.detailRow}>
                            <Text style={[styles.detailLabel]}>Acción realizada</Text>
                            <Text style={[styles.detailValue]}>{formatDetailDate(commitment.action_completed_at)}</Text>
                        </View>
                    )}

                    {isDone && (
                        <>
                            <View style={styles.detailRow}>
                                <Text style={[styles.detailLabel]}>Completado por</Text>
                                <Text style={[styles.detailValue]}>{completedBy}</Text>
                            </View>
                            <View style={styles.detailRow}>
                                <Text style={[styles.detailLabel]}>Resuelto</Text>
                                <Text style={[styles.detailValue]}>{formatDetailDate(commitment.resolved_at || completedAt)}</Text>
                            </View>
                        </>
                    )}

                    {isRejected && rejectionReason && (
                        <View style={styles.detailRowBlock}>
                            <Text style={[styles.detailLabel]}>Motivo</Text>
                            <Text style={[styles.detailValue]}>{rejectionReason}</Text>
                        </View>
                    )}

                    {completionOutcome && (
                        <View style={styles.detailRowBlock}>
                            <Text style={[styles.detailLabel]}>Resultado</Text>
                            <Text style={[styles.detailValue]}>{completionOutcome.replace('_', ' ')}</Text>
                        </View>
                    )}

                    {completionNote && (
                        <View style={styles.detailRowBlock}>
                            <Text style={[styles.detailLabel]}>Observación</Text>
                            <Text style={[styles.detailValue]}>{completionNote}</Text>
                        </View>
                    )}

                    {canViewOriginConversation && (
                        <TouchableOpacity style={styles.viewConversationBtn} onPress={handleViewConversation}>
                            <Ionicons name="chatbubble-ellipses-outline" size={16} color={colors.accentBright} />
                            <Text style={styles.viewConversationBtnText}>Ver conversación</Text>
                        </TouchableOpacity>
                    )}
                    </ScrollView>
                </View>
            </Modal>
        </TouchableOpacity>
    );
}

const styles = StyleSheet.create({
    cardContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
        borderRadius: 12,
        paddingVertical: 8,
        paddingHorizontal: 10,
        marginVertical: 3,
        borderWidth: StyleSheet.hairlineWidth,
    },
    cardFinished: { opacity: 0.55 },
    dayBadge: { width: 52, borderRadius: 8, paddingVertical: 4, alignItems: 'center' },
    dayBadgeDay: { fontSize: 12, fontFamily: fonts.extrabold, textTransform: 'capitalize' },
    dayBadgeDetail: { fontSize: 10.5, fontFamily: fonts.semibold, marginTop: 1 },
    textStruck: { textDecorationLine: 'line-through' },
    metaLine: { fontFamily: fonts.regular, fontSize: 12, marginTop: 2 },
    statusBadge: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 8 },
    statusBadgeText: { fontSize: 10, fontFamily: fonts.extrabold, textTransform: 'uppercase' },
    timelineCard: {
        marginLeft: 0, 
    },
    mainContent: {
        flex: 1,
        justifyContent: 'center',
    },
    taskTitle: { fontSize: 14.5, fontFamily: fonts.bold },
    moreBtn: {
        padding: 4,
    },
    modalOverlay: {
        flex: 1,
        backgroundColor: colors.scrim,
        justifyContent: 'center',
        alignItems: 'center',
        padding: 20,
    },
    actionMenu: {
        width: '100%',
        borderRadius: 24,
        padding: 24,
        alignItems: 'stretch',
        ...sheetSurface,
    },
    actionMenuTitle: {
        fontSize: 18,
        fontFamily: fonts.extrabold,
        color: colors.text,
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
        fontFamily: fonts.semibold,
        color: colors.text,
    },
    cancelBtn: {
        marginTop: 15,
        paddingVertical: 12,
        alignItems: 'center',
    },
    cancelBtnText: {
        fontSize: 15,
        fontFamily: fonts.bold,
        color: colors.textFaint,
    },
    detailOverlay: {
        flex: 1,
        backgroundColor: colors.scrim,
    },
    detailSheet: {
        maxHeight: '82%',
        padding: 16,
        borderTopLeftRadius: 26,
        borderTopRightRadius: 26,
        ...sheetSurface,
    },
    detailContent: {
        paddingBottom: 8,
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
        fontFamily: fonts.extrabold,
        color: colors.text,
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
        fontFamily: fonts.bold,
        color: colors.textFaint,
        textTransform: 'uppercase',
        letterSpacing: 0.3,
    },
    detailValue: {
        fontSize: 13,
        fontFamily: fonts.semibold,
        color: colors.text,
    },
    agreementSection: {
        marginBottom: 12,
        gap: 8,
    },
    agreementParticipantRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 10,
        paddingVertical: 5,
    },
    agreementParticipantInfo: {
        flex: 1,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
    },
    agreementParticipantCopy: {
        flex: 1,
    },
    agreementParticipantName: {
        fontSize: 13,
        fontFamily: fonts.bold,
        color: colors.text,
    },
    agreementParticipantDate: { fontFamily: fonts.regular,
        marginTop: 2,
        fontSize: 11,
        color: colors.textFaint,
    },
    agreementResponseBadge: {
        maxWidth: '48%',
        borderRadius: 999,
        paddingHorizontal: 9,
        paddingVertical: 4,
    },
    agreementResponseBadgeText: {
        fontSize: 10,
        fontFamily: fonts.extrabold,
        textAlign: 'center',
    },
    viewConversationBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
        marginTop: 10,
        paddingVertical: 12,
        borderRadius: 12,
        backgroundColor: colors.accentTint,
    },
    viewConversationBtnText: {
        color: colors.accentBright,
        fontFamily: fonts.bold,
        fontSize: 14,
    },
});
