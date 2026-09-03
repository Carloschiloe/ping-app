import React from 'react';
import { View, Text, Modal, TouchableOpacity, StyleSheet, ScrollView, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { useAppTheme } from '../../theme/ThemeContext';
import { normalizeCommitmentStatus } from '../../utils/commitmentStatus';
import { resolveConversationId, canViewOriginConversation, getWaitingLabel } from '../../utils/commitmentDisplay';
import { AgreementParticipantsList } from '../AgreementParticipantsList';
import { useNavigation } from '@react-navigation/native';
import type { ChatsTabNavigationProp } from '../../navigation/types';

interface CommitmentDetailSheetProps {
    item: any | null;
    currentUserId?: string;
    contacts?: any[];
    participants?: any[];
    onClose: () => void;
    onMarkDone?: (id: string) => void;
    onReschedule?: (item: any) => void;
    onReopen?: (id: string) => void;
    onCancel?: (id: string) => void;
}

function formatDetailDate(iso?: string | null) {
    if (!iso) return 'Sin fecha asignada';
    return format(new Date(iso), "eeee d 'de' MMMM yyyy · HH:mm", { locale: es });
}

export function CommitmentDetailSheet({
    item,
    currentUserId,
    contacts = [],
    participants = [],
    onClose,
    onMarkDone,
    onReschedule,
    onReopen,
    onCancel,
}: CommitmentDetailSheetProps) {
    const { theme } = useAppTheme();
    const navigation = useNavigation<ChatsTabNavigationProp>();

    if (!item) return null;

    const status = normalizeCommitmentStatus(item.status);
    const conversationId = resolveConversationId(item);
    const hasConversation = canViewOriginConversation(item);
    const waiting = getWaitingLabel(item, currentUserId, contacts);

    const isFinished = ['resolved', 'cancelled', 'rejected'].includes(status);

    const goToChat = () => {
        if (!conversationId) return;
        onClose();
        navigation.navigate('Chats', {
            screen: 'Chat',
            params: {
                conversationId,
                isGroup: true,
                otherUser: null,
                groupMetadata: { id: conversationId, name: null, avatar_url: null },
                mode: 'chat',
                scrollToMessageId: item.message_id || undefined,
                commitmentId: item.id,
                commitmentTitle: item.title,
            },
        });
    };

    return (
        <Modal visible={!!item} transparent animationType="slide" onRequestClose={onClose}>
            <Pressable style={styles.overlay} onPress={onClose} />
            <View style={[styles.sheet, { backgroundColor: theme.colors.surface }]}>
                <View style={styles.handle} />

                {/* Header */}
                <View style={styles.header}>
                    <Text style={[styles.title, { color: theme.colors.text.primary }]} numberOfLines={2}>
                        {item.title}
                    </Text>
                    <TouchableOpacity onPress={onClose} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                        <Ionicons name="close" size={22} color={theme.colors.text.secondary} />
                    </TouchableOpacity>
                </View>

                <ScrollView style={{ flex: 1 }} contentContainerStyle={styles.scrollBody} showsVerticalScrollIndicator={false}>
                    {/* Meta Grid */}
                    <View style={[styles.metaBlock, { backgroundColor: theme.colors.surfaceMuted, borderColor: theme.colors.border }]}>
                        <View style={styles.metaRow}>
                            <Text style={[styles.metaLabel, { color: theme.colors.text.secondary }]}>Estado</Text>
                            <Text style={[styles.metaValue, { color: theme.colors.accent }]}>{status.toUpperCase()}</Text>
                        </View>
                        <View style={styles.metaRow}>
                            <Text style={[styles.metaLabel, { color: theme.colors.text.secondary }]}>Fecha</Text>
                            <Text style={[styles.metaValue, { color: theme.colors.text.primary }]}>{formatDetailDate(item.due_at)}</Text>
                        </View>
                        {item.owner?.full_name && (
                            <View style={styles.metaRow}>
                                <Text style={[styles.metaLabel, { color: theme.colors.text.secondary }]}>Creador</Text>
                                <Text style={[styles.metaValue, { color: theme.colors.text.primary }]}>{item.owner.full_name}</Text>
                            </View>
                        )}
                        {item.assignee?.full_name && (
                            <View style={styles.metaRow}>
                                <Text style={[styles.metaLabel, { color: theme.colors.text.secondary }]}>Responsable</Text>
                                <Text style={[styles.metaValue, { color: theme.colors.text.primary }]}>{item.assignee.full_name}</Text>
                            </View>
                        )}
                        {!!waiting && (
                            <View style={styles.metaRow}>
                                <Text style={[styles.metaLabel, { color: theme.colors.text.secondary }]}>Seguimiento</Text>
                                <Text style={[styles.metaValue, { color: theme.colors.warning }]}>{waiting}</Text>
                            </View>
                        )}
                    </View>

                    {/* Agreement Responses if multipartite */}
                    {item.agreement_responses && item.agreement_responses.length > 0 && (
                        <View style={styles.sectionBlock}>
                            <Text style={[styles.sectionTitle, { color: theme.colors.text.secondary }]}>Respuestas del equipo</Text>
                            <AgreementParticipantsList
                                responses={item.agreement_responses}
                                fallbackParticipants={participants}
                                currentUserId={currentUserId}
                            />
                        </View>
                    )}

                    {/* Next Action if present */}
                    {!!item.next_action && (
                        <View style={[styles.sectionBlock, { backgroundColor: theme.colors.surfaceMuted, padding: 12, borderRadius: 8 }]}>
                            <Text style={[styles.sectionTitle, { color: theme.colors.text.secondary }]}>Próxima acción</Text>
                            <Text style={[styles.bodyText, { color: theme.colors.text.primary }]}>{item.next_action}</Text>
                        </View>
                    )}

                    {/* Resolution result if present */}
                    {!!item.result && (
                        <View style={[styles.sectionBlock, { backgroundColor: 'rgba(34,197,94,0.1)', padding: 12, borderRadius: 8 }]}>
                            <Text style={[styles.sectionTitle, { color: theme.colors.success }]}>Nota de resolución</Text>
                            <Text style={[styles.bodyText, { color: theme.colors.text.primary }]}>{item.result}</Text>
                        </View>
                    )}
                </ScrollView>

                {/* Actions Footer */}
                <View style={[styles.footer, { borderTopColor: theme.colors.border }]}>
                    {hasConversation && (
                        <TouchableOpacity style={[styles.actionBtn, { backgroundColor: theme.colors.surfaceMuted }]} onPress={goToChat}>
                            <Ionicons name="chatbubble-ellipses-outline" size={16} color={theme.colors.accent} />
                            <Text style={[styles.actionBtnText, { color: theme.colors.accent }]}>Ver en chat</Text>
                        </TouchableOpacity>
                    )}

                    {!isFinished && onReschedule && (
                        <TouchableOpacity style={[styles.actionBtn, { backgroundColor: theme.colors.surfaceMuted }]} onPress={() => { onClose(); onReschedule(item); }}>
                            <Ionicons name="calendar-outline" size={16} color={theme.colors.accent} />
                            <Text style={[styles.actionBtnText, { color: theme.colors.accent }]}>Reprogramar</Text>
                        </TouchableOpacity>
                    )}

                    {!isFinished && onMarkDone && (
                        <TouchableOpacity style={[styles.actionBtn, { backgroundColor: theme.colors.accent }]} onPress={() => { onClose(); onMarkDone(item.id); }}>
                            <Ionicons name="checkmark" size={16} color={theme.colors.white} />
                            <Text style={[styles.actionBtnText, { color: theme.colors.white }]}>Completar</Text>
                        </TouchableOpacity>
                    )}

                    {isFinished && onReopen && (
                        <TouchableOpacity style={[styles.actionBtn, { backgroundColor: theme.colors.accent }]} onPress={() => { onClose(); onReopen(item.id); }}>
                            <Ionicons name="refresh-outline" size={16} color={theme.colors.white} />
                            <Text style={[styles.actionBtnText, { color: theme.colors.white }]}>Reabrir</Text>
                        </TouchableOpacity>
                    )}

                    {!isFinished && onCancel && (
                        <TouchableOpacity style={[styles.actionBtn, { backgroundColor: 'rgba(239,68,68,0.1)' }]} onPress={() => { onClose(); onCancel(item.id); }}>
                            <Ionicons name="trash-outline" size={16} color={theme.colors.danger} />
                            <Text style={[styles.actionBtnText, { color: theme.colors.danger }]}>Archivar</Text>
                        </TouchableOpacity>
                    )}
                </View>
            </View>
        </Modal>
    );
}

const styles = StyleSheet.create({
    overlay: {
        flex: 1,
        backgroundColor: 'rgba(0,0,0,0.45)',
    },
    sheet: {
        borderTopLeftRadius: 20,
        borderTopRightRadius: 20,
        maxHeight: '80%',
        minHeight: 320,
        paddingBottom: 32,
    },
    handle: {
        alignSelf: 'center',
        width: 36,
        height: 4,
        borderRadius: 2,
        backgroundColor: '#d1d5db',
        marginTop: 10,
        marginBottom: 8,
    },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 20,
        paddingVertical: 10,
    },
    title: {
        fontSize: 17,
        fontWeight: '700',
        flex: 1,
        marginRight: 10,
    },
    scrollBody: {
        paddingHorizontal: 20,
        paddingVertical: 10,
        gap: 14,
    },
    metaBlock: {
        borderRadius: 10,
        borderWidth: 1,
        padding: 14,
        gap: 8,
    },
    metaRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
    },
    metaLabel: {
        fontSize: 12,
        fontWeight: '600',
    },
    metaValue: {
        fontSize: 13,
        fontWeight: '600',
    },
    sectionBlock: {
        gap: 6,
    },
    sectionTitle: {
        fontSize: 12,
        fontWeight: '700',
        textTransform: 'uppercase',
        letterSpacing: 0.5,
    },
    bodyText: {
        fontSize: 14,
        lineHeight: 20,
    },
    footer: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'flex-end',
        paddingHorizontal: 20,
        paddingTop: 12,
        borderTopWidth: StyleSheet.hairlineWidth,
        gap: 8,
        flexWrap: 'wrap',
    },
    actionBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 12,
        paddingVertical: 8,
        borderRadius: 8,
        gap: 6,
    },
    actionBtnText: {
        fontSize: 13,
        fontWeight: '700',
    },
});
