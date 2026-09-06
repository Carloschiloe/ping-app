import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ActionSheetIOS, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { format, isToday, isTomorrow } from 'date-fns';
import { es } from 'date-fns/locale';
import { useNavigation } from '@react-navigation/native';
import { useAppTheme } from '../../theme/ThemeContext';
import { normalizeCommitmentStatus } from '../../utils/commitmentStatus';
import { resolveConversationId, canViewOriginConversation, isCommitmentOverdue, isProposalDatePassed } from '../../utils/commitmentDisplay';
import { getCommitmentPrimaryAction } from '../../utils/commitmentPrimaryAction';
import { getProposalWaitingLabel } from '../../utils/agreement';
import type { ChatsTabNavigationProp } from '../../navigation/types';

interface CommitmentRowProps {
    commitment: any;
    currentUserId?: string;
    contactNameMap?: Record<string, string>;
    onMarkDone: (id: string) => void;
    // M-1H fix — recibe el objeto completo, no sólo el id: el caller necesita
    // `commitment._isAgreementProposal` para despachar al endpoint correcto
    // (proposal vs commitment canónico son entidades distintas con IDs de
    // tablas distintas — ver docs del hallazgo real, caso "Entrenar").
    onConfirm: (commitment: any) => void;
    onOpenReschedule: (commitment: any) => void;
    onOpenDetail: (commitment: any) => void;
    onCancel?: (id: string) => void;
    // M-1H v6 (Gap A del final proposal lifecycle gate): rechazar una
    // commitment_proposal pendiente -- sólo ofrecido cuando el actor mismo
    // puede responder (nunca "rechazar por Alejandra").
    onReject?: (commitment: any) => void;
}

export function formatWhen(iso?: string | null): string {
    if (!iso) return 'Sin fecha';
    const date = new Date(iso);
    const time = format(date, 'HH:mm', { locale: es });

    if (isToday(date)) return `Hoy · ${time}`;
    if (isTomorrow(date)) return `Mañana · ${time}`;

    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    if (diffMs > 0) {
        const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
        if (diffDays === 0) return `hoy · ${time}`;
        if (diffDays === 1) return `ayer · ${time}`;
        return `hace ${diffDays}d · ${time}`;
    }

    return `${format(date, 'd MMM', { locale: es })} · ${time}`;
}

export function CommitmentRow({
    commitment: c,
    currentUserId,
    contactNameMap = {},
    onMarkDone,
    onConfirm,
    onOpenReschedule,
    onOpenDetail,
    onCancel,
    onReject,
}: CommitmentRowProps) {
    const { theme } = useAppTheme();
    const navigation = useNavigation<ChatsTabNavigationProp>();
    const [menuVisible, setMenuVisible] = useState(false);

    const status = normalizeCommitmentStatus(c.status);
    const isMe = !!currentUserId && c.assigned_to_user_id?.toLowerCase() === currentUserId.toLowerCase();
    const isDelegated = !!currentUserId && c.owner_user_id?.toLowerCase() === currentUserId.toLowerCase() && c.assigned_to_user_id?.toLowerCase() !== currentUserId.toLowerCase();
    const isMeeting = c.type === 'meeting' || /reuni[oó]n|llamada|junta|meet|zoom|call|cita/i.test(c.title || '');
    const hasConversation = canViewOriginConversation(c);
    const conversationId = resolveConversationId(c);
    // M-1H v5: isCommitmentOverdue ya excluye toda commitment_proposal
    // (regla principal) -- antes esta fila tenía su PROPIA cuarta fórmula de
    // "vencido" (dateFnsIsPast + status abierto, sin el carve-out de mismo
    // día ni la exclusión de proposals), que sí marcaba "Entrenar" en rojo.
    const isOverdueItem = isCommitmentOverdue(c);
    const isFinished = ['resolved', 'cancelled', 'rejected'].includes(status);
    const primaryAction = getCommitmentPrimaryAction(c, currentUserId);
    const isProposal = c._isAgreementProposal === true;
    // M-1H v6 (Gap A, secciones 2/6): "Proponer otra fecha"/"Rechazar
    // propuesta" sólo se ofrecen cuando el actor mismo puede responder --
    // nunca para el caso Carlos (primaryAction==='waiting'), donde "rechazar
    // por Alejandra" sería exactamente el error que este ticket prohíbe.
    const canRespondToProposal = isProposal && primaryAction === 'accept';

    const goToChat = () => {
        if (!conversationId) return;
        navigation.navigate('Chats', {
            screen: 'Chat',
            params: {
                conversationId,
                isGroup: true,
                otherUser: null,
                groupMetadata: { id: conversationId, name: null, avatar_url: null },
                mode: 'chat',
                scrollToMessageId: c.message_id || undefined,
                commitmentId: c.id,
                commitmentTitle: c.title,
            },
        });
    };

    // ─── Primary Action Button ─────────────────────────────────────────────
    // M-1H v5 — getCommitmentPrimaryAction reemplaza el chequeo directo de
    // `status==='proposed'` (regla principal del ticket): para una
    // commitment_proposal donde el actor ya aprobó y sólo falta otra
    // persona (caso real "Entrenar"), NUNCA se ofrece "Confirmar" -- se
    // muestra en cambio "Esperando a <persona>", sin acción disponible.
    const renderPrimaryAction = () => {
        if (isFinished) return null;

        if (primaryAction === 'waiting') {
            const waitingLabel = getProposalWaitingLabel(c, currentUserId);
            const datePassed = isProposalDatePassed(c.due_at);
            return (
                <View style={styles.waitingBadge}>
                    <Text style={[styles.waitingBadgeText, { color: theme.colors.text.secondary }]} numberOfLines={2}>
                        {waitingLabel}{datePassed ? ' · Fecha propuesta ya pasó' : ''}
                    </Text>
                </View>
            );
        }

        if (!c.due_at) {
            return (
                <TouchableOpacity
                    style={[styles.primaryBtn, { backgroundColor: theme.colors.accentSoft }]}
                    onPress={() => onOpenReschedule(c)}
                >
                    <Ionicons name="calendar-outline" size={13} color={theme.colors.accent} />
                    <Text style={[styles.primaryBtnText, { color: theme.colors.accent }]}>Agendar</Text>
                </TouchableOpacity>
            );
        }
        if (primaryAction === 'accept') {
            return (
                <TouchableOpacity
                    style={[styles.primaryBtn, { backgroundColor: theme.colors.accentSoft }]}
                    onPress={() => onConfirm(c)}
                >
                    <Text style={[styles.primaryBtnText, { color: theme.colors.accent }]}>
                        {c._isAgreementProposal ? 'Aceptar' : 'Confirmar'}
                    </Text>
                </TouchableOpacity>
            );
        }
        if (primaryAction === 'complete') {
            return (
                <TouchableOpacity
                    style={[styles.primaryBtn, { backgroundColor: theme.colors.accentSoft }]}
                    onPress={() => onMarkDone(c.id)}
                >
                    <Ionicons name="checkmark" size={13} color={theme.colors.accent} />
                    <Text style={[styles.primaryBtnText, { color: theme.colors.accent }]}>Listo</Text>
                </TouchableOpacity>
            );
        }
        return null;
    };

    // ─── Menu ─────────────────────────────────────────────────────────────
    // M-1H v6 (Gap A, secciones 2/3/4/5 del ticket): "Reprogramar fecha"/
    // "Archivar / Cancelar" son transiciones de un commitment YA activo --
    // nunca se ofrecen para una commitment_proposal (llamarían al endpoint
    // equivocado con un proposal_id). "Proponer otra fecha"/"Rechazar
    // propuesta" reutilizan el flujo REAL ya existente
    // (respond_to_commitment_proposal, decision counter_propose/reject) y
    // sólo aparecen cuando el actor mismo puede responder -- nunca para
    // Carlos (caso "Entrenar", esperando a Alejandra).
    const openMenu = () => {
        if (Platform.OS === 'ios') {
            const options = [
                'Cancelar',
                'Ver detalle',
                !isProposal ? 'Reprogramar fecha' : null,
                canRespondToProposal ? 'Proponer otra fecha' : null,
                hasConversation ? 'Ver conversación' : null,
                canRespondToProposal ? 'Rechazar propuesta' : null,
                onCancel && !isFinished && !isProposal ? 'Archivar / Cancelar' : null,
            ].filter(Boolean) as string[];
            const destructiveButtonIndex = canRespondToProposal ? options.indexOf('Rechazar propuesta') : undefined;

            ActionSheetIOS.showActionSheetWithOptions(
                { options, cancelButtonIndex: 0, destructiveButtonIndex, title: c.title },
                (idx) => {
                    if (idx === 0) return;
                    const opt = options[idx];
                    if (opt === 'Ver detalle') onOpenDetail(c);
                    else if (opt === 'Reprogramar fecha' || opt === 'Proponer otra fecha') onOpenReschedule(c);
                    else if (opt === 'Ver conversación') goToChat();
                    else if (opt === 'Rechazar propuesta' && onReject) onReject(c);
                    else if (opt === 'Archivar / Cancelar' && onCancel) onCancel(c.id);
                }
            );
        } else {
            setMenuVisible(true);
        }
    };

    // ─── Role / Person Chip ──────────────────────────────────────────────
    const roleLabel = () => {
        if (isFinished) {
            if (status === 'resolved') return { text: 'Resuelto', color: theme.colors.success };
            if (status === 'cancelled') return { text: 'Cancelado', color: theme.colors.text.muted };
            return { text: 'Rechazado', color: theme.colors.danger };
        }
        if (isDelegated) {
            const assigneeName = c.assignee?.full_name?.split(' ')[0] || contactNameMap[c.assigned_to_user_id] || 'Otro';
            return { text: `→ ${assigneeName}`, color: theme.colors.secondary };
        }
        if (c.owner_user_id && c.owner_user_id !== currentUserId) {
            const ownerName = c.owner?.full_name?.split(' ')[0] || 'Asignado';
            return { text: `← ${ownerName}`, color: theme.colors.accent };
        }
        return null;
    };

    const label = roleLabel();

    return (
        <TouchableOpacity
            style={[
                styles.row,
                { borderBottomColor: theme.colors.border },
                isFinished && { opacity: 0.6 },
            ]}
            onPress={() => onOpenDetail(c)}
            activeOpacity={0.7}
        >
            {/* Status / Urgency Bar */}
            <View
                style={[
                    styles.indicatorBar,
                    {
                        backgroundColor: isOverdueItem
                            ? theme.colors.danger
                            : isMeeting
                            ? theme.colors.secondary
                            : isFinished
                            ? theme.colors.border
                            : theme.colors.accent,
                    },
                ]}
            />

            {/* Content */}
            <View style={styles.content}>
                <View style={styles.titleRow}>
                    <Text
                        style={[
                            styles.title,
                            { color: theme.colors.text.primary },
                            status === 'resolved' && styles.strikethrough,
                            status === 'cancelled' && { color: theme.colors.text.muted },
                        ]}
                        numberOfLines={2}
                    >
                        {c.title}
                    </Text>
                    {label && (
                        <View style={[styles.labelChip, { backgroundColor: `${label.color}15` }]}>
                            <Text style={[styles.labelText, { color: label.color }]}>{label.text}</Text>
                        </View>
                    )}
                </View>

                <View style={styles.subRow}>
                    <Text style={[styles.timeText, { color: isOverdueItem ? theme.colors.danger : theme.colors.text.secondary }]}>
                        {formatWhen(c.due_at)}
                    </Text>
                    {hasConversation && (
                        <TouchableOpacity onPress={goToChat} style={styles.chatLink}>
                            <Ionicons name="chatbubble-ellipses-outline" size={11} color={theme.colors.accent} />
                            <Text style={[styles.chatLinkText, { color: theme.colors.accent }]}>Conversación</Text>
                        </TouchableOpacity>
                    )}
                </View>
            </View>

            {/* Actions */}
            <View style={styles.actions}>
                {renderPrimaryAction()}
                <TouchableOpacity onPress={openMenu} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }} style={styles.moreBtn}>
                    <Ionicons name="ellipsis-horizontal" size={18} color={theme.colors.text.muted} />
                </TouchableOpacity>
            </View>

            {/* Android menu fallback */}
            {Platform.OS !== 'ios' && menuVisible && (
                <TouchableOpacity style={StyleSheet.absoluteFill} activeOpacity={1} onPress={() => setMenuVisible(false)}>
                    <View style={[styles.androidMenu, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border }]}>
                        <TouchableOpacity style={styles.androidMenuItem} onPress={() => { setMenuVisible(false); onOpenDetail(c); }}>
                            <Ionicons name="information-circle-outline" size={16} color={theme.colors.text.primary} />
                            <Text style={[styles.androidMenuText, { color: theme.colors.text.primary }]}>Ver detalle</Text>
                        </TouchableOpacity>
                        {!isProposal && (
                            <TouchableOpacity style={styles.androidMenuItem} onPress={() => { setMenuVisible(false); onOpenReschedule(c); }}>
                                <Ionicons name="calendar-outline" size={16} color={theme.colors.text.primary} />
                                <Text style={[styles.androidMenuText, { color: theme.colors.text.primary }]}>Reprogramar fecha</Text>
                            </TouchableOpacity>
                        )}
                        {canRespondToProposal && (
                            <TouchableOpacity style={styles.androidMenuItem} onPress={() => { setMenuVisible(false); onOpenReschedule(c); }}>
                                <Ionicons name="calendar-outline" size={16} color={theme.colors.text.primary} />
                                <Text style={[styles.androidMenuText, { color: theme.colors.text.primary }]}>Proponer otra fecha</Text>
                            </TouchableOpacity>
                        )}
                        {hasConversation && (
                            <TouchableOpacity style={styles.androidMenuItem} onPress={() => { setMenuVisible(false); goToChat(); }}>
                                <Ionicons name="chatbubble-ellipses-outline" size={16} color={theme.colors.text.primary} />
                                <Text style={[styles.androidMenuText, { color: theme.colors.text.primary }]}>Ver conversación</Text>
                            </TouchableOpacity>
                        )}
                        {canRespondToProposal && onReject && (
                            <TouchableOpacity style={styles.androidMenuItem} onPress={() => { setMenuVisible(false); onReject(c); }}>
                                <Ionicons name="close-circle-outline" size={16} color={theme.colors.danger} />
                                <Text style={[styles.androidMenuText, { color: theme.colors.danger }]}>Rechazar propuesta</Text>
                            </TouchableOpacity>
                        )}
                        {onCancel && !isFinished && !isProposal && (
                            <TouchableOpacity style={styles.androidMenuItem} onPress={() => { setMenuVisible(false); onCancel(c.id); }}>
                                <Ionicons name="trash-outline" size={16} color={theme.colors.danger} />
                                <Text style={[styles.androidMenuText, { color: theme.colors.danger }]}>Archivar / Cancelar</Text>
                            </TouchableOpacity>
                        )}
                    </View>
                </TouchableOpacity>
            )}
        </TouchableOpacity>
    );
}

const styles = StyleSheet.create({
    row: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: 10,
        paddingHorizontal: 16,
        borderBottomWidth: StyleSheet.hairlineWidth,
        gap: 10,
    },
    indicatorBar: {
        width: 3,
        height: 38,
        borderRadius: 2,
        flexShrink: 0,
    },
    content: {
        flex: 1,
        gap: 2,
    },
    titleRow: {
        flexDirection: 'row',
        alignItems: 'flex-start',
        gap: 6,
    },
    title: {
        flex: 1,
        fontSize: 14,
        fontWeight: '600',
        lineHeight: 19,
    },
    strikethrough: {
        textDecorationLine: 'line-through',
    },
    labelChip: {
        paddingHorizontal: 6,
        paddingVertical: 2,
        borderRadius: 4,
        flexShrink: 0,
    },
    labelText: {
        fontSize: 10,
        fontWeight: '700',
    },
    subRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
    },
    timeText: {
        fontSize: 11,
        fontWeight: '500',
    },
    chatLink: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 3,
    },
    chatLinkText: {
        fontSize: 11,
        fontWeight: '500',
    },
    actions: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        flexShrink: 0,
    },
    primaryBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 9,
        paddingVertical: 5,
        borderRadius: 6,
        gap: 4,
    },
    primaryBtnText: {
        fontSize: 12,
        fontWeight: '700',
    },
    waitingBadge: {
        maxWidth: 130,
        paddingHorizontal: 2,
    },
    waitingBadgeText: {
        fontSize: 11,
        fontWeight: '600',
        textAlign: 'right',
    },
    moreBtn: {
        width: 28,
        height: 28,
        alignItems: 'center',
        justifyContent: 'center',
    },
    androidMenu: {
        position: 'absolute',
        right: 16,
        top: 36,
        borderRadius: 8,
        borderWidth: 1,
        paddingVertical: 4,
        zIndex: 100,
        minWidth: 180,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.12,
        shadowRadius: 6,
        elevation: 6,
    },
    androidMenuItem: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 14,
        paddingVertical: 10,
        gap: 10,
    },
    androidMenuText: {
        fontSize: 14,
        fontWeight: '500',
    },
});
