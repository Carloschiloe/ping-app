import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ActionSheetIOS, Platform, Modal, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { format, isToday, isTomorrow } from 'date-fns';
import { es } from 'date-fns/locale';
import { useNavigation } from '@react-navigation/native';
import { useAppTheme } from '../../theme/ThemeContext';
import { normalizeCommitmentStatus } from '../../utils/commitmentStatus';
import { resolveConversationId, canViewOriginConversation, isCommitmentOverdue } from '../../utils/commitmentDisplay';
import { getCommitmentPrimaryAction } from '../../utils/commitmentPrimaryAction';
import { getActorPresentation } from '../../utils/actorPresentation';
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

    // COMMITMENT UX + ACTOR-AWARE SUGGESTIONS (sección 19) — presentación
    // canónica única, nunca un roleLabel()/waiting-label reimplementado por
    // pantalla. `contactNameMap` fallback preservado tal cual (mismo lookup
    // que ya existía) para no regresionar el caso de un commitment delegado
    // a un contacto externo sin perfil real.
    const presentation = getActorPresentation(
        {
            ...c,
            assignee: c.assignee || (contactNameMap[c.assigned_to_user_id] ? { full_name: contactNameMap[c.assigned_to_user_id] } : null),
        },
        currentUserId,
    );

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

        // Sección 9/11/12: "waiting" ya no renderiza su propio badge aquí --
        // el statusLabel actor-aware/lifecycle-aware se muestra como línea
        // propia en la jerarquía principal (ver statusLine más abajo), nunca
        // compitiendo por ancho con el título ni con el resto de acciones.
        if (primaryAction === 'waiting' || primaryAction === 'none') return null;

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

            {/* Content — jerarquía vertical (sección 9 del ticket): TITLE
                propio (nunca comparte línea con nada que le quite ancho) ->
                metaLine (relación · cuándo) -> statusLine (actor-aware,
                sección 10/11/12) -> actionsRow (con ancho completo
                disponible, nunca comprimida contra el título). */}
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
                    <TouchableOpacity onPress={openMenu} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }} style={styles.moreBtn}>
                        <Ionicons name="ellipsis-horizontal" size={18} color={theme.colors.text.muted} />
                    </TouchableOpacity>
                </View>

                <Text
                    style={[styles.metaLine, { color: isOverdueItem ? theme.colors.danger : theme.colors.text.secondary }]}
                    numberOfLines={2}
                >
                    {presentation.relationLabel} · {formatWhen(c.due_at)}
                </Text>

                {!!presentation.statusLabel && (
                    <Text style={[styles.statusLine, { color: theme.colors.text.secondary }]} numberOfLines={2}>
                        {presentation.statusLabel}{presentation.proposalDatePassed ? ' · Fecha propuesta ya pasó' : ''}
                    </Text>
                )}

                <View style={styles.actionsRow}>
                    {renderPrimaryAction()}
                    {hasConversation && (
                        <TouchableOpacity onPress={goToChat} style={styles.chatLink}>
                            <Ionicons name="chatbubble-ellipses-outline" size={11} color={theme.colors.accent} />
                            <Text style={[styles.chatLinkText, { color: theme.colors.accent }]}>Conversación</Text>
                        </TouchableOpacity>
                    )}
                </View>
            </View>

            {/* Sección 17 del ticket: reemplaza el View absolutamente
                posicionado (podía superponerse a la fila) por el mismo
                Modal real ya probado en GroupTaskCard.tsx/TodayItemRow.tsx
                -- se pinta siempre por encima de todo. */}
            <Modal visible={Platform.OS !== 'ios' && menuVisible} transparent animationType="fade" onRequestClose={() => setMenuVisible(false)}>
                <Pressable style={styles.modalOverlay} onPress={() => setMenuVisible(false)}>
                    <View style={[styles.actionMenu, { backgroundColor: theme.colors.surface }]}>
                        <TouchableOpacity style={styles.androidMenuItem} onPress={() => { setMenuVisible(false); onOpenDetail(c); }}>
                            <Ionicons name="information-circle-outline" size={18} color={theme.colors.text.primary} />
                            <Text style={[styles.androidMenuText, { color: theme.colors.text.primary }]}>Ver detalle</Text>
                        </TouchableOpacity>
                        {!isProposal && (
                            <TouchableOpacity style={styles.androidMenuItem} onPress={() => { setMenuVisible(false); onOpenReschedule(c); }}>
                                <Ionicons name="calendar-outline" size={18} color={theme.colors.text.primary} />
                                <Text style={[styles.androidMenuText, { color: theme.colors.text.primary }]}>Reprogramar fecha</Text>
                            </TouchableOpacity>
                        )}
                        {canRespondToProposal && (
                            <TouchableOpacity style={styles.androidMenuItem} onPress={() => { setMenuVisible(false); onOpenReschedule(c); }}>
                                <Ionicons name="calendar-outline" size={18} color={theme.colors.text.primary} />
                                <Text style={[styles.androidMenuText, { color: theme.colors.text.primary }]}>Proponer otra fecha</Text>
                            </TouchableOpacity>
                        )}
                        {hasConversation && (
                            <TouchableOpacity style={styles.androidMenuItem} onPress={() => { setMenuVisible(false); goToChat(); }}>
                                <Ionicons name="chatbubble-ellipses-outline" size={18} color={theme.colors.text.primary} />
                                <Text style={[styles.androidMenuText, { color: theme.colors.text.primary }]}>Ver conversación</Text>
                            </TouchableOpacity>
                        )}
                        {canRespondToProposal && onReject && (
                            <TouchableOpacity style={styles.androidMenuItem} onPress={() => { setMenuVisible(false); onReject(c); }}>
                                <Ionicons name="close-circle-outline" size={18} color={theme.colors.danger} />
                                <Text style={[styles.androidMenuText, { color: theme.colors.danger }]}>Rechazar propuesta</Text>
                            </TouchableOpacity>
                        )}
                        {onCancel && !isFinished && !isProposal && (
                            <TouchableOpacity style={styles.androidMenuItem} onPress={() => { setMenuVisible(false); onCancel(c.id); }}>
                                <Ionicons name="trash-outline" size={18} color={theme.colors.danger} />
                                <Text style={[styles.androidMenuText, { color: theme.colors.danger }]}>Archivar / Cancelar</Text>
                            </TouchableOpacity>
                        )}
                        <TouchableOpacity style={styles.androidMenuItem} onPress={() => setMenuVisible(false)}>
                            <Ionicons name="close-outline" size={18} color={theme.colors.text.muted} />
                            <Text style={[styles.androidMenuText, { color: theme.colors.text.muted }]}>Cancelar</Text>
                        </TouchableOpacity>
                    </View>
                </Pressable>
            </Modal>
        </TouchableOpacity>
    );
}

const styles = StyleSheet.create({
    row: {
        flexDirection: 'row',
        // Sección 9/14: el contenido ahora es una pila vertical (título ->
        // metaLine -> statusLine -> acciones) que puede crecer más alto que
        // el bar/moreBtn -- alinear al inicio evita que el indicatorBar
        // quede centrado a media altura de un bloque de 3-4 líneas.
        alignItems: 'flex-start',
        paddingVertical: 12,
        paddingHorizontal: 16,
        borderBottomWidth: StyleSheet.hairlineWidth,
        gap: 10,
    },
    indicatorBar: {
        width: 3,
        // Altura fija reemplazada por 'stretch' vía alignSelf implícito
        // (View sin height explícita, alineada dentro de un row
        // flex-start) no es viable en RN sin flex:1 en el padre -- se deja
        // una altura mínima razonable para una fila de 1 línea; filas más
        // altas (proposals con metaLine+statusLine+acciones) simplemente
        // dejan la barra más corta que el contenido, nunca al revés.
        minHeight: 38,
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
    // Sección 9/14 del ticket: el título es la ÚNICA cosa en su línea salvo
    // el botón "..." (28x28, flexShrink:0) -- nunca comparte ancho con un
    // person-chip ni con un badge de estado, causa mecánica real del
    // wrap-a-mitad-de-palabra ("Levanta/rse") reportado en la certificación
    // física. `flexShrink: 1` explícito (además de flex:1) para que RN
    // nunca intente medir el texto a su ancho intrínseco completo antes de
    // encogerlo -- necesario en Android para envolver por palabra completa.
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
    // Sección 10/13: "Carlos propone · Hoy 18:00" -- relación + cuándo en
    // una sola línea secundaria, nunca un arrow-glyph ambiguo ("← Carlos").
    metaLine: {
        fontSize: 12,
        fontWeight: '500',
    },
    // Sección 10/11: "Necesita tu respuesta" / "Esperando a Alejandra" --
    // línea propia, con el ancho COMPLETO de la fila disponible (nunca los
    // 150px que tenía el badge horizontal antiguo).
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
    // Sección 9: fila de acciones DEBAJO del título/metadata, nunca al
    // lado -- el botón primario ya no compite por ancho con el título.
    actionsRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        marginTop: 2,
    },
    primaryBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 9,
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
