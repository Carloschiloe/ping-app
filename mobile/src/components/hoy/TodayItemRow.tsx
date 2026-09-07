import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ActionSheetIOS, Alert, Platform, Modal, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { useNavigation } from '@react-navigation/native';
import { useAppTheme } from '../../theme/ThemeContext';
import { normalizeCommitmentStatus } from '../../utils/commitmentStatus';
import { resolveConversationId, canViewOriginConversation } from '../../utils/commitmentDisplay';
import { getCommitmentPrimaryAction } from '../../utils/commitmentPrimaryAction';
import { getActorPresentation } from '../../utils/actorPresentation';
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

    // COMMITMENT UX + ACTOR-AWARE SUGGESTIONS (sección 19/23) — misma
    // presentación canónica que CommitmentRow.tsx, nunca un rowLabel()
    // independiente ("Mía"/"Encargada") que pudiera decir algo distinto
    // para la MISMA entidad/actor que Compromisos (sección 23: cross-surface
    // consistency).
    const presentation = getActorPresentation(c, currentUserId);

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
        // Sección 9/11/12: el statusLabel actor-aware/lifecycle-aware se
        // muestra como línea propia en la jerarquía principal (ver
        // statusLine), nunca su propio badge horizontal aquí.
        if (primaryAction === 'waiting' || primaryAction === 'none') return null;
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

            {/* Content — misma jerarquía vertical que CommitmentRow.tsx
                (sección 9/23: consistencia entre pantallas para la MISMA
                entidad/actor): TITLE propio -> metaLine (relación) ->
                statusLine (actor-aware) -> acciones con ancho completo. */}
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
                    <TouchableOpacity
                        onPress={openMenu}
                        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                        style={styles.moreBtn}
                    >
                        <Ionicons name="ellipsis-horizontal" size={18} color={theme.colors.text.muted} />
                    </TouchableOpacity>
                </View>

                <Text style={[styles.metaLine, { color: theme.colors.text.secondary }]} numberOfLines={1}>
                    {presentation.relationLabel}
                </Text>

                {!!presentation.statusLabel && (
                    <Text style={[styles.statusLine, { color: theme.colors.text.secondary }]} numberOfLines={2}>
                        {presentation.statusLabel}{presentation.proposalDatePassed ? ' · Fecha propuesta ya pasó' : ''}
                    </Text>
                )}

                <View style={styles.actionsRow}>
                    {renderPrimaryAction()}
                    {hasConversation && !isPast && (
                        <TouchableOpacity onPress={goToChat} style={styles.chatLink}>
                            <Ionicons name="chatbubble-ellipses-outline" size={11} color={theme.colors.accent} />
                            <Text style={[styles.chatLinkText, { color: theme.colors.accent }]}>Ver conversación</Text>
                        </TouchableOpacity>
                    )}
                </View>
            </View>

            {/* Sección 17: menú de overflow -- ANTES un View absolutamente
                posicionado dentro de la propia fila (podía superponerse a la
                mayoría de la fila en Android angosto, hallazgo físico real).
                Ahora reutiliza el MISMO primitivo ya probado en
                GroupTaskCard.tsx: un Modal real, que siempre se pinta por
                encima de TODO (incluida cualquier fila vecina del FlatList),
                nunca sujeto al stacking local de esta fila. Nunca se
                rediseña la navegación -- mismas acciones (Ver conversación /
                Ver en Compromisos / Proponer otra fecha / Rechazar). */}
            <Modal visible={menuVisible} transparent animationType="fade" onRequestClose={() => setMenuVisible(false)}>
                <Pressable style={styles.modalOverlay} onPress={() => setMenuVisible(false)}>
                    <View style={[styles.actionMenu, { backgroundColor: theme.colors.surface }]}>
                        {hasConversation && (
                            <TouchableOpacity style={styles.androidMenuItem} onPress={() => { setMenuVisible(false); goToChat(); }}>
                                <Ionicons name="chatbubble-ellipses-outline" size={18} color={theme.colors.text.primary} />
                                <Text style={[styles.androidMenuText, { color: theme.colors.text.primary }]}>Ver conversación</Text>
                            </TouchableOpacity>
                        )}
                        {canRespondToProposal && onOpenReschedule && (
                            <TouchableOpacity style={styles.androidMenuItem} onPress={() => { setMenuVisible(false); onOpenReschedule(c); }}>
                                <Ionicons name="calendar-outline" size={18} color={theme.colors.text.primary} />
                                <Text style={[styles.androidMenuText, { color: theme.colors.text.primary }]}>Proponer otra fecha</Text>
                            </TouchableOpacity>
                        )}
                        {canRespondToProposal && onReject && (
                            <TouchableOpacity style={styles.androidMenuItem} onPress={() => { setMenuVisible(false); onReject(c); }}>
                                <Ionicons name="close-circle-outline" size={18} color={theme.colors.danger} />
                                <Text style={[styles.androidMenuText, { color: theme.colors.danger }]}>Rechazar propuesta</Text>
                            </TouchableOpacity>
                        )}
                        <TouchableOpacity style={styles.androidMenuItem} onPress={() => { setMenuVisible(false); navigation.navigate('Insights' as any); }}>
                            <Ionicons name="list-outline" size={18} color={theme.colors.text.primary} />
                            <Text style={[styles.androidMenuText, { color: theme.colors.text.primary }]}>Ver en Compromisos</Text>
                        </TouchableOpacity>
                        <TouchableOpacity style={styles.androidMenuItem} onPress={() => setMenuVisible(false)}>
                            <Ionicons name="close-outline" size={18} color={theme.colors.text.muted} />
                            <Text style={[styles.androidMenuText, { color: theme.colors.text.muted }]}>Cancelar</Text>
                        </TouchableOpacity>
                    </View>
                </Pressable>
            </Modal>
        </View>
    );
}

const styles = StyleSheet.create({
    row: {
        flexDirection: 'row',
        // Sección 9/14: contenido ahora es una pila vertical -- alinear al
        // inicio evita centrar timeCol/typeBar a media altura de un bloque
        // de 3-4 líneas.
        alignItems: 'flex-start',
        paddingVertical: 12,
        borderBottomWidth: StyleSheet.hairlineWidth,
        gap: 10,
    },
    timeCol: {
        width: 44,
        alignItems: 'flex-end',
        flexShrink: 0,
        marginTop: 1,
    },
    timeText: {
        fontSize: 12,
        fontWeight: '600',
        fontVariant: ['tabular-nums'],
    },
    typeBar: {
        width: 3,
        minHeight: 36,
        borderRadius: 2,
        flexShrink: 0,
        marginTop: 1,
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
    // Sección 9/14: el título es lo ÚNICO en su línea salvo el botón "..."
    // -- causa mecánica real del wrap-a-mitad-de-palabra reportado
    // ("Ver Spid/erman") era competir por ancho con el labelChip.
    title: {
        flex: 1,
        flexShrink: 1,
        fontSize: 15,
        fontWeight: '600',
        lineHeight: 20,
    },
    strikethrough: {
        textDecorationLine: 'line-through',
    },
    // Sección 10/13: relación actor-aware ("Mía"/"Encargado a Alejandra"/
    // "Carlos propone"), nunca un chip de una palabra ambigua.
    metaLine: {
        fontSize: 12,
        fontWeight: '500',
    },
    statusLine: {
        fontSize: 12,
        fontWeight: '600',
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
    // Sección 9: acciones DEBAJO de título/metadata, nunca al lado.
    actionsRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        marginTop: 2,
    },
    primaryBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 10,
        paddingVertical: 5,
        borderRadius: 6,
        gap: 4,
        alignSelf: 'flex-start',
    },
    primaryBtnText: {
        fontSize: 12,
        fontWeight: '700',
    },
    moreBtn: {
        width: 28,
        height: 28,
        alignItems: 'center',
        justifyContent: 'center',
    },
    // Sección 17 del ticket: reemplaza el View absolutamente posicionado
    // dentro de la fila (podía superponerse a la mayoría de la fila en
    // Android angosto) por el MISMO Modal real ya usado en GroupTaskCard.tsx
    // -- se pinta siempre por encima de todo, nunca sujeto al stacking local
    // de esta fila ni a filas vecinas del FlatList.
    modalOverlay: {
        flex: 1,
        backgroundColor: 'rgba(0,0,0,0.4)',
        justifyContent: 'flex-end',
    },
    actionMenu: {
        borderTopLeftRadius: 16,
        borderTopRightRadius: 16,
        paddingVertical: 8,
        paddingBottom: 24,
    },
    androidMenuItem: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 20,
        paddingVertical: 14,
        gap: 12,
    },
    androidMenuText: {
        fontSize: 15,
        fontWeight: '500',
    },
});
