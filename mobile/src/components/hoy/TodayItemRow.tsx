import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ActionSheetIOS, Alert, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { useNavigation } from '@react-navigation/native';
import { useAppTheme } from '../../theme/ThemeContext';
import { normalizeCommitmentStatus } from '../../utils/commitmentStatus';
import { resolveConversationId, canViewOriginConversation, isProposalDatePassed } from '../../utils/commitmentDisplay';
import { getCommitmentPrimaryAction } from '../../utils/commitmentPrimaryAction';
import { getProposalWaitingLabel } from '../../utils/agreement';
import type { ChatsTabNavigationProp } from '../../navigation/types';

const MEETING_RE = /reuni[oó]n|llamada|junta|meet|zoom|call|cita/i;

function isMeeting(c: any): boolean {
    return c.type === 'meeting' || MEETING_RE.test(c.title || '');
}

interface TodayItemRowProps {
    commitment: any;
    currentUserId?: string;
    /** Mutations passed from parent to avoid prop drilling hooks */
    onMarkDone: (id: string) => void;
    // M-1H fix — recibe el objeto completo, no sólo el id: el caller necesita
    // `commitment._isAgreementProposal` para despachar al endpoint correcto.
    onConfirm: (commitment: any) => void;
    // M-1H v6 (Gap A del final proposal lifecycle gate): "Proponer otra
    // fecha"/"Rechazar propuesta" -- mismo flujo real, sólo ofrecidos cuando
    // el actor mismo puede responder (nunca "por Alejandra").
    onOpenReschedule?: (commitment: any) => void;
    onReject?: (commitment: any) => void;
}

export function TodayItemRow({ commitment: c, currentUserId, onMarkDone, onConfirm, onOpenReschedule, onReject }: TodayItemRowProps) {
    const { theme } = useAppTheme();
    const navigation = useNavigation<ChatsTabNavigationProp>();
    const [menuVisible, setMenuVisible] = useState(false);

    const status = normalizeCommitmentStatus(c.status);
    const isMe = !!currentUserId && c.assigned_to_user_id?.toLowerCase() === currentUserId.toLowerCase();
    const isDelegated = !!currentUserId && c.owner_user_id?.toLowerCase() === currentUserId.toLowerCase() && c.assigned_to_user_id?.toLowerCase() !== currentUserId.toLowerCase();
    const meeting = isMeeting(c);
    const hasConversation = canViewOriginConversation(c);
    const conversationId = resolveConversationId(c);
    const externalUrl = c.meta?.external_event_url;

    const timeStr = c.due_at ? format(new Date(c.due_at), 'HH:mm') : '--:--';
    const isCancelled = status === 'cancelled';
    const isResolved = status === 'resolved';
    const isPast = isCancelled || isResolved;
    const primaryAction = getCommitmentPrimaryAction(c, currentUserId);
    const canRespondToProposal = c._isAgreementProposal === true && primaryAction === 'accept';

    // ─── Primary Action ─────────────────────────────────────────────────────
    // M-1H v5 — getCommitmentPrimaryAction reemplaza el chequeo directo de
    // `status==='proposed'` (regla principal): una commitment_proposal
    // donde el actor ya aprobó y falta otra persona nunca ofrece
    // "Confirmar" -- muestra "Esperando a <persona>" en su lugar.
    const renderPrimaryAction = () => {
        if (isPast) return null;
        if (meeting && externalUrl) {
            return (
                <TouchableOpacity
                    style={[styles.primaryBtn, { backgroundColor: theme.colors.accent }]}
                    onPress={() => {
                        const { Linking } = require('react-native');
                        Linking.openURL(externalUrl);
                    }}
                >
                    <Ionicons name="videocam" size={13} color={theme.colors.white} />
                    <Text style={[styles.primaryBtnText, { color: theme.colors.white }]}>Unirse</Text>
                </TouchableOpacity>
            );
        }
        if (primaryAction === 'waiting') {
            const waitingLabel = getProposalWaitingLabel(c, currentUserId);
            const datePassed = isProposalDatePassed(c.due_at);
            return (
                <View style={styles.waitingBadge}>
                    <Text style={[styles.waitingBadgeText, { color: theme.colors.text.secondary }]} numberOfLines={3}>
                        {waitingLabel}{datePassed ? '\nFecha propuesta ya pasó' : ''}
                    </Text>
                </View>
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

    // ─── Context Menu ────────────────────────────────────────────────────────
    // M-1H v6 (Gap A del final proposal lifecycle gate): "Proponer otra
    // fecha"/"Rechazar propuesta" reutilizan el mismo flujo real que
    // CommitmentRow.tsx (respond_to_commitment_proposal) -- sólo aparecen
    // cuando el actor mismo puede responder, nunca para el caso Carlos.
    const openMenu = () => {
        if (Platform.OS === 'ios') {
            const options = [
                'Cancelar',
                hasConversation ? 'Ver conversación' : null,
                canRespondToProposal && onOpenReschedule ? 'Proponer otra fecha' : null,
                canRespondToProposal && onReject ? 'Rechazar propuesta' : null,
                'Ver en Compromisos',
            ].filter(Boolean) as string[];
            const destructiveButtonIndex = canRespondToProposal ? options.indexOf('Rechazar propuesta') : undefined;

            ActionSheetIOS.showActionSheetWithOptions(
                { options, cancelButtonIndex: 0, destructiveButtonIndex, title: c.title },
                (index) => {
                    if (index === 0) return;
                    const opt = options[index];
                    if (opt === 'Ver conversación') goToChat();
                    else if (opt === 'Proponer otra fecha' && onOpenReschedule) onOpenReschedule(c);
                    else if (opt === 'Rechazar propuesta' && onReject) onReject(c);
                    else if (opt === 'Ver en Compromisos') navigation.navigate('Insights' as any);
                }
            );
        } else {
            setMenuVisible(true);
        }
    };

    const goToChat = () => {
        if (!conversationId) return;
        navigation.navigate('Chat' as any, {
            conversationId,
            isSelf: false,
            scrollToMessageId: c.message_id,
        });
    };

    // ─── Row label ───────────────────────────────────────────────────────────
    const rowLabel = () => {
        if (isResolved) return { text: 'Listo', color: theme.colors.success };
        if (isCancelled) return { text: 'Cancelado', color: theme.colors.text.muted };
        if (isDelegated) return { text: 'Encargada', color: theme.colors.secondary };
        if (isMe || !c.assigned_to_user_id) return { text: 'Mía', color: theme.colors.accent };
        return null;
    };
    const label = rowLabel();

    return (
        <View style={[
            styles.row,
            { borderBottomColor: theme.colors.border },
            isPast && { opacity: 0.55 },
        ]}>
            {/* Time column */}
            <View style={styles.timeCol}>
                <Text style={[styles.timeText, { color: theme.colors.text.muted }]}>{timeStr}</Text>
            </View>

            {/* Type indicator */}
            <View style={[
                styles.typeBar,
                { backgroundColor: meeting ? theme.colors.secondary : theme.colors.accent },
                isPast && { backgroundColor: theme.colors.border },
            ]} />

            {/* Content */}
            <View style={styles.content}>
                <View style={styles.titleRow}>
                    <Text
                        style={[
                            styles.title,
                            { color: theme.colors.text.primary },
                            isResolved && styles.strikethrough,
                            isCancelled && { color: theme.colors.text.muted },
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

                {/* Conversation link */}
                {hasConversation && !isPast && (
                    <TouchableOpacity onPress={goToChat} style={styles.chatLink}>
                        <Ionicons name="chatbubble-ellipses-outline" size={11} color={theme.colors.accent} />
                        <Text style={[styles.chatLinkText, { color: theme.colors.accent }]}>Ver conversación</Text>
                    </TouchableOpacity>
                )}
            </View>

            {/* Actions */}
            <View style={styles.actions}>
                {renderPrimaryAction()}
                <TouchableOpacity
                    onPress={openMenu}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                    style={styles.moreBtn}
                >
                    <Ionicons name="ellipsis-horizontal" size={18} color={theme.colors.text.muted} />
                </TouchableOpacity>
            </View>

            {/* Android menu fallback */}
            {Platform.OS !== 'ios' && menuVisible && (
                <TouchableOpacity
                    style={StyleSheet.absoluteFill}
                    activeOpacity={1}
                    onPress={() => setMenuVisible(false)}
                >
                    <View style={[styles.androidMenu, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border }]}>
                        {hasConversation && (
                            <TouchableOpacity style={styles.androidMenuItem} onPress={() => { setMenuVisible(false); goToChat(); }}>
                                <Ionicons name="chatbubble-ellipses-outline" size={16} color={theme.colors.text.primary} />
                                <Text style={[styles.androidMenuText, { color: theme.colors.text.primary }]}>Ver conversación</Text>
                            </TouchableOpacity>
                        )}
                        {canRespondToProposal && onOpenReschedule && (
                            <TouchableOpacity style={styles.androidMenuItem} onPress={() => { setMenuVisible(false); onOpenReschedule(c); }}>
                                <Ionicons name="calendar-outline" size={16} color={theme.colors.text.primary} />
                                <Text style={[styles.androidMenuText, { color: theme.colors.text.primary }]}>Proponer otra fecha</Text>
                            </TouchableOpacity>
                        )}
                        {canRespondToProposal && onReject && (
                            <TouchableOpacity style={styles.androidMenuItem} onPress={() => { setMenuVisible(false); onReject(c); }}>
                                <Ionicons name="close-circle-outline" size={16} color={theme.colors.danger} />
                                <Text style={[styles.androidMenuText, { color: theme.colors.danger }]}>Rechazar propuesta</Text>
                            </TouchableOpacity>
                        )}
                        <TouchableOpacity style={styles.androidMenuItem} onPress={() => { setMenuVisible(false); }}>
                            <Ionicons name="list-outline" size={16} color={theme.colors.text.primary} />
                            <Text style={[styles.androidMenuText, { color: theme.colors.text.primary }]}>Ver en Compromisos</Text>
                        </TouchableOpacity>
                    </View>
                </TouchableOpacity>
            )}
        </View>
    );
}

const styles = StyleSheet.create({
    row: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: 11,
        borderBottomWidth: StyleSheet.hairlineWidth,
        gap: 10,
    },
    timeCol: {
        width: 44,
        alignItems: 'flex-end',
        flexShrink: 0,
    },
    timeText: {
        fontSize: 12,
        fontWeight: '600',
        fontVariant: ['tabular-nums'],
    },
    typeBar: {
        width: 3,
        height: 36,
        borderRadius: 2,
        flexShrink: 0,
    },
    content: {
        flex: 1,
        gap: 3,
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
        paddingHorizontal: 10,
        paddingVertical: 5,
        borderRadius: 6,
        gap: 4,
    },
    primaryBtnText: {
        fontSize: 12,
        fontWeight: '700',
    },
    waitingBadge: {
        maxWidth: 150,
        paddingHorizontal: 2,
    },
    waitingBadgeText: {
        fontSize: 11,
        fontWeight: '600',
        textAlign: 'right',
        lineHeight: 14,
    },
    moreBtn: {
        width: 28,
        height: 28,
        alignItems: 'center',
        justifyContent: 'center',
    },
    androidMenu: {
        position: 'absolute',
        right: 0,
        top: 32,
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
