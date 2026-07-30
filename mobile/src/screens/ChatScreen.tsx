import React, { useState, useEffect, useRef } from 'react';
import {
    View, Text, FlatList, KeyboardAvoidingView, Platform, ActivityIndicator, StyleSheet,
    StatusBar, Image, Alert, TouchableOpacity, Animated, Linking, Modal
} from 'react-native';
import { Video, ResizeMode } from 'expo-av';
import { Ionicons } from '@expo/vector-icons';
import { useQueryClient } from '@tanstack/react-query';
import { useIsFocused, useNavigation } from '@react-navigation/native';
import {
    useConversationGroupTasks,
    useCreateCommitment,
    useCreateSharedCommitmentProposal,
    useConversationOperationState,
    useToggleOperationChecklistItem,
    useCommitmentOperationAction,
    useSetPinnedMessage,
    useSetActiveOperationCommitment,
    useConversations,
    useDeleteMessage,
} from '../api/queries';
import { useAuth } from '../context/AuthContext';
import MentionPopup from '../components/MentionPopup';
import MessageItemCard from '../components/MessageItem';
import TypingIndicator from '../components/TypingIndicator';
import { apiClient } from '../api/client';
import { useMediaPicker } from '../hooks/useMediaPicker';
import { useAudioRecorder } from '../hooks/useAudioRecorder';
import { useChatPresence } from '../hooks/useChatPresence';
import { useChatMessages } from '../hooks/useChatMessages';
import { ChatHeader } from '../components/ChatHeader';
import { ChatInput } from '../components/ChatInput';
import { AISuggestionModal } from '../components/AISuggestionModal';
import { OperationPanel } from '../components/OperationPanel';
import { ReactionsModal } from '../components/ReactionsModal';
import { SummaryModal } from '../components/SummaryModal';
import { MessageActionsModal } from '../components/MessageActionsModal';
import { ForwardMessagesModal } from '../components/ForwardMessagesModal';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import * as Haptics from 'expo-haptics';
import * as Clipboard from 'expo-clipboard';
import { theme } from '../theme/theme';
import { ChatCompositeNavigationProp, ChatScreenProps } from '../navigation/types';
import { useChatOperation } from '../hooks/useChatOperation';
import { useAppTheme } from '../theme/ThemeContext';
import { createClientMessageId } from '../utils/synchronization';
import {
    canDeleteMessages,
    isForwardableMessage,
    orderMessagesForForward,
} from '../utils/messageActions';
import { resolveMessageMetadata, resolveReactionEmoji } from '../utils/messageCompat';

// ─── Helpers ────────────────────────────────────────────────────────────────

function formatTime(iso: string) {
    return new Date(iso).toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' });
}

function formatDateDivider(iso: string) {
    const d = new Date(iso);
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(today.getDate() - 1);
    if (d.toDateString() === today.toDateString()) return 'Hoy';
    if (d.toDateString() === yesterday.toDateString()) return 'Ayer';
    return d.toLocaleDateString('es-CL', { weekday: 'long', day: 'numeric', month: 'long' });
}

const COLORS = ['#0a84ff', '#30d158', '#ff6b35', '#bf5af2', '#ff9f0a', '#32ade6'];
function avatarColor(str: string) {
    let hash = 0;
    for (let i = 0; i < str.length; i++) hash = str.charCodeAt(i) + ((hash << 5) - hash);
    return COLORS[Math.abs(hash) % COLORS.length];
}

// ─── Component ──────────────────────────────────────────────────────────────

export default function ChatScreen({ route }: ChatScreenProps) {
    const navigation = useNavigation<ChatCompositeNavigationProp>();
    const { theme: appTheme } = useAppTheme();
    const styles = React.useMemo(() => createStyles(appTheme), [appTheme]);
    const { conversationId, otherUser, isSelf, isGroup, groupMetadata } = route.params;
    const { user, profile } = useAuth();
    const isFocused = useIsFocused();
    const queryClient = useQueryClient();

    // UI States
    const [text, setText] = useState('');
    const [sendingMedia, setSendingMedia] = useState(false);
    const [selectedMsg, setSelectedMsg] = useState<any>(null);
    const [replyingToMsg, setReplyingToMsg] = useState<any>(null);
    const [viewerMedia, setViewerMedia] = useState<{ url: string, type: 'image' | 'video' } | null>(null);
    const [summary, setSummary] = useState<string | null>(null);
    const [isSummarizing, setIsSummarizing] = useState(false);
    const [headerMenuVisible, setHeaderMenuVisible] = useState(false);
    const [multiSelect, setMultiSelect] = useState<string[]>([]);
    const [forwardModalVisible, setForwardModalVisible] = useState(false);
    const [isForwarding, setIsForwarding] = useState(false);
    const [isDeleting, setIsDeleting] = useState(false);
    const [suggestionModalVisible, setSuggestionModalVisible] = useState(false);
    const [suggestionData, setSuggestionData] = useState<any>(null);
    const [viewingReactionsMsg, setViewingReactionsMsg] = useState<any>(null);
    const [highlightedMsgId, setHighlightedMsgId] = useState<string | null>(null);
    const [mentionQuery, setMentionQuery] = useState<string | null>(null);
    const [mentionedUserId, setMentionedUserId] = useState<string | null>(null);
    const [groupParticipants, setGroupParticipants] = useState<{ id: string; full_name: string; email: string }[]>([]);
    const [filteredParticipants, setFilteredParticipants] = useState<typeof groupParticipants>([]);
    const menuAnim = useRef(new Animated.Value(300)).current;
    const listRef = useRef<FlatList>(null);
    const swipeableRowRefs = useRef(new Map());

    const isMultiSelecting = multiSelect.length > 0;

    // Hooks Logic
    const {
        messages,
        isLoading: isMessagesLoading,
        isSending,
        fetchNextPage,
        hasNextPage,
        isFetchingNextPage,
        sendMessage,
        reactToMessage
    } = useChatMessages(conversationId, user, isFocused);

    const { activeTypers, handleTyping, broadcastRecording } = useChatPresence(conversationId, user);
    const { data: groupTasks = [] } = useConversationGroupTasks(conversationId);
    const { data: operationState, isLoading: isOperationStateLoading } = useConversationOperationState(conversationId);
    const { mutateAsync: createCommitment, isPending: isPendingCommitment } = useCreateCommitment();
    const {
        mutateAsync: createSharedProposal,
        isPending: isPendingSharedProposal,
    } = useCreateSharedCommitmentProposal();
    const { mutate: toggleChecklistItem } = useToggleOperationChecklistItem(conversationId);
    const { mutateAsync: runCommitmentAction } = useCommitmentOperationAction();
    const { mutate: setPinnedMessage } = useSetPinnedMessage(conversationId);
    const { mutateAsync: deleteMessage } = useDeleteMessage(conversationId);
    const { data: conversationsData } = useConversations();
    const { mutate: setActiveCommitment } = useSetActiveOperationCommitment(conversationId);

    const {
        conversationMode,
        pinnedMessageId,
        activeOperationCommitment,
        openOperationTasks,
        pendingOperationAction,
        operationFeedback,
        locationFeedback,
        handleShareLocation,
        handleOperationAction,
        handleClearActiveCommitment,
        handleClearPinnedMessage,
    } = useChatOperation({
        conversationId,
        routeMode: route.params.mode,
        operationState,
        groupTasks,
        sendMessage,
        runCommitmentAction,
        setPinnedMessage,
        setActiveCommitment,
        invalidateOperationState: () => queryClient.invalidateQueries({ queryKey: ['conversation-operation-state', conversationId] }),
    });

    const reactionGroups = React.useMemo(() => {
        const reactions = viewingReactionsMsg?.message_reactions;
        if (!Array.isArray(reactions) || reactions.length === 0) return [];
        const counts = reactions.reduce((acc: Record<string, number>, r: any) => {
            const emoji = resolveReactionEmoji(r);
            if (emoji) acc[emoji] = (acc[emoji] || 0) + 1;
            return acc;
        }, {} as Record<string, number>);
        return Object.keys(counts).map((emoji) => ({ emoji, count: counts[emoji] }));
    }, [viewingReactionsMsg]);

    // ─── Phase 7/26: Fetch Group Participants ──────────────────────────────
    useEffect(() => {
        if (!conversationId) return;
        const fetchParticipants = async () => {
            try {
                const response = await apiClient.get(`/conversations/${conversationId}/participants`);
                const participantsArray = Array.isArray(response) ? response : (response?.data || []);
                if (Array.isArray(participantsArray) && participantsArray.length > 0) {
                    const profiles = participantsArray.map((p: any) => p.profiles).filter(Boolean);
                    setGroupParticipants(profiles);
                } else if (!isGroup && otherUser) {
                    setGroupParticipants([
                        { id: user?.id || '', full_name: profile?.full_name || '', email: user?.email || '' },
                        { id: otherUser.id, full_name: otherUser.full_name, email: otherUser.email }
                    ]);
                }
            } catch (err) {
                console.error('[Mention] Failed to fetch participants', err);
            }
        };
        fetchParticipants();
    }, [conversationId, isGroup, otherUser, profile?.full_name, user]);

    // ─── Header Navigation Options ──────────────────────────────────────────
    const handleSummarize = React.useCallback(async () => {
        setIsSummarizing(true);
        try {
            const res = await apiClient.post('/ai/summarize', { conversationId });
            setSummary(res.summary || 'No se pudo generar el resumen.');
        } catch {
            console.error('[AI] Summarize failed');
            Alert.alert('Error', 'No se pudo generar el resumen.');
        } finally {
            setIsSummarizing(false);
        }
    }, [conversationId]);

    useEffect(() => {
        navigation.setOptions({
            headerTitle: () => (
                <ChatHeader
                    chatTitle={isSelf ? 'Para mí' : (isGroup ? groupMetadata?.name : otherUser?.full_name)}
                    avatarUrl={isGroup ? groupMetadata?.avatar_url : otherUser?.avatar_url}
                    isGroup={!!isGroup}
                    onVoiceCall={() => navigation.navigate('Call', { conversationId, otherUser, isGroup: !!isGroup, type: 'voice' })}
                    onVideoCall={() => navigation.navigate('Call', { conversationId, otherUser, isGroup: !!isGroup, type: 'video' })}
                    onInfo={() => navigation.navigate('ChatInfo', { conversationId, otherUser, isGroup: !!isGroup, isSelf: !!isSelf, mode: conversationMode })}
                    onMenu={() => setHeaderMenuVisible(true)}
                />
            ),
            headerStyle: { backgroundColor: theme.colors.primary },
            headerTintColor: theme.colors.white,
            headerRight: () => null, // Explicitly clear any right buttons
        });
    }, [navigation, isSelf, isGroup, groupMetadata, otherUser, isSummarizing, conversationMode, handleSummarize, conversationId]);

    // ─── Handlers ────────────────────────────────────────────────────────────

    const handleSend = () => {
        if (!text.trim()) return;
        sendMessage({
            text: text.trim(),
            reply_to_id: replyingToMsg?.id,
            mentioned_user_id: mentionedUserId || undefined
        });
        setText('');
        setReplyingToMsg(null);
        setMentionedUserId(null);
        setMentionQuery(null);
    };

    const handleTextChange = (t: string) => {
        setText(t);
        handleTyping();

        // Mention Logic
        const atIndex = t.lastIndexOf('@');
        if (atIndex !== -1 && (atIndex === 0 || t[atIndex - 1] === ' ')) {
            const query = t.substring(atIndex + 1);
            setMentionQuery(query);
            setFilteredParticipants(
                groupParticipants.filter(p =>
                    p.full_name?.toLowerCase().includes(query.toLowerCase()) ||
                    p.email?.toLowerCase().includes(query.toLowerCase())
                )
            );
        } else {
            setMentionQuery(null);
        }
    };

    const handleSelectMention = (p: any) => {
        const atIndex = text.lastIndexOf('@');
        const before = text.substring(0, atIndex);
        setText(`${before}@${p.full_name || p.email.split('@')[0]} `);
        setMentionedUserId(p.id);
        setMentionQuery(null);
    };

    const scrollToMessage = React.useCallback((messageId: string) => {
        const index = messages.findIndex(m => m.id === messageId);
        if (index !== -1) {
            setHighlightedMsgId(messageId);
            setTimeout(() => listRef.current?.scrollToIndex({ index, animated: true, viewPosition: 0.5 }), 100);
            setTimeout(() => setHighlightedMsgId(null), 3000);
        }
    }, [messages]);

    const { pickMediaSource } = useMediaPicker({
        conversationId,
        onMediaSent: (payload) => sendMessage({ ...payload, reply_to_id: replyingToMsg?.id }),
        setSendingMedia
    });

    const { startRecording, stopRecording, isRecording, recordingUri, cancelAudio, uploadAudio } = useAudioRecorder({
        conversationId,
        onAudioSent: (payload) => sendMessage({ ...payload, reply_to_id: replyingToMsg?.id }),
        onRecordingStateChange: (isRecording) => broadcastRecording(isRecording),
        setSendingMedia
    });

    // ─── Scroll to Message logic ─────────────────────────────────────────────
    useEffect(() => {
        if (messages.length === 0) return;

        if (route.params?.scrollToMessageId) {
            scrollToMessage(route.params.scrollToMessageId);
            return;
        }

        if (route.params?.commitmentTitle) {
            const title = route.params.commitmentTitle.toLowerCase();
            const systemMatch = messages.find(m => m?.meta?.isSystem && m.text?.toLowerCase().includes(title));
            const anyMatch = messages.find(m => m.text?.toLowerCase().includes(title));
            const target = systemMatch || anyMatch;
            if (target?.id) {
                scrollToMessage(target.id);
            }
        }
    }, [route.params?.scrollToMessageId, route.params?.commitmentTitle, messages, scrollToMessage]);

    // ─── Multi-select Logic ───
    const toggleSelect = (id: string) => {
        setMultiSelect(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
    };
    const cancelMultiSelect = () => setMultiSelect([]);

    const selectedMessages = messages.filter((message) => multiSelect.includes(message.id));
    const canDeleteSelection = canDeleteMessages(selectedMessages, user?.id);

    const confirmDelete = (messageIds: string[]) => {
        const count = messageIds.length;
        if (!count || isDeleting) return;

        Alert.alert(
            count === 1 ? 'Eliminar mensaje' : `Eliminar ${count} mensajes`,
            count === 1
                ? 'Se eliminará para todos los participantes. Esta acción no se puede deshacer.'
                : 'Se eliminarán para todos los participantes. Esta acción no se puede deshacer.',
            [
                { text: 'Cancelar', style: 'cancel' },
                {
                    text: 'Eliminar',
                    style: 'destructive',
                    onPress: async () => {
                        setIsDeleting(true);
                        let deletedCount = 0;
                        try {
                            for (const messageId of messageIds) {
                                await deleteMessage(messageId);
                                deletedCount += 1;
                            }
                            setMultiSelect([]);
                            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                        } catch (error) {
                            console.warn('[Chat] Message delete rejected', {
                                requested: messageIds.length,
                                deleted: deletedCount,
                                error: error instanceof Error ? error.message : 'unknown',
                            });
                            if (deletedCount > 0) {
                                const remainingIds = messageIds.slice(deletedCount);
                                setMultiSelect((current) => current.filter((id) => remainingIds.includes(id)));
                            }
                            Alert.alert(
                                'No se pudo completar',
                                deletedCount > 0
                                    ? `Se eliminaron ${deletedCount} de ${messageIds.length} mensajes. Los demás permanecen en el chat.`
                                    : 'No se eliminó ningún mensaje. Comprueba tu conexión e inténtalo nuevamente.'
                            );
                        } finally {
                            setIsDeleting(false);
                        }
                    },
                },
            ]
        );
    };

    const deleteSelected = () => {
        if (!canDeleteSelection) {
            Alert.alert(
                'Selección no eliminable',
                'Sólo puedes eliminar tus propios mensajes que ya fueron enviados.'
            );
            return;
        }
        confirmDelete(selectedMessages.map((message) => message.id));
    };

    const forwardSelected = () => {
        if (selectedMessages.some((message) => !isForwardableMessage(message))) {
            Alert.alert(
                'No se puede reenviar esta selección',
                'Por seguridad, esta versión permite reenviar sólo mensajes de texto confirmados. Archivos y mensajes del sistema no se copian entre conversaciones.'
            );
            return;
        }
        setForwardModalVisible(true);
    };

    const forwardToConversation = async (targetConversationId: string) => {
        if (isForwarding) return;
        const messagesToForward = orderMessagesForForward(selectedMessages);
        if (!messagesToForward.length) return;

        setIsForwarding(true);
        let sentCount = 0;
        try {
            for (const message of messagesToForward) {
                await apiClient.post(`/conversations/${targetConversationId}/messages`, {
                    text: message.text || message.content,
                    client_message_id: createClientMessageId(),
                    meta: { forwarded: true },
                });
                sentCount += 1;
            }
            queryClient.invalidateQueries({ queryKey: ['conversations'] });
            queryClient.invalidateQueries({ queryKey: ['conversation-messages', targetConversationId] });
            setForwardModalVisible(false);
            setMultiSelect([]);
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
            Alert.alert('Reenviado', sentCount === 1 ? 'Mensaje reenviado.' : `${sentCount} mensajes reenviados.`);
        } catch (error) {
            console.warn('[Chat] Message forward rejected', {
                requested: messagesToForward.length,
                sent: sentCount,
                error: error instanceof Error ? error.message : 'unknown',
            });
            Alert.alert(
                'No se pudo completar',
                sentCount > 0
                    ? `Se reenviaron ${sentCount} de ${messagesToForward.length} mensajes.`
                    : 'No se reenvió ningún mensaje. Comprueba tu conexión e inténtalo nuevamente.'
            );
        } finally {
            setIsForwarding(false);
        }
    };

    // ─── Rendering ───────────────────────────────────────────────────────────

    const renderMessage = ({ item, index }: { item: any; index: number }) => {
        const showDate = index === messages.length - 1 ||
            formatDateDivider(item.created_at) !== formatDateDivider(messages[index + 1]?.created_at);

        return (
            <>
                {showDate && (
                    <View style={styles.dateDivider}>
                        <Text style={styles.dateDividerText}>{formatDateDivider(item.created_at)}</Text>
                    </View>
                )}
                <MessageItemCard
                    item={item}
                    user={user}
                    isGroup={!!isGroup}
                    isMultiSelecting={isMultiSelecting}
                    isSelected={multiSelect.includes(item.id)}
                    highlightedMsgId={highlightedMsgId}
                    groupTasks={groupTasks}
                    groupParticipants={groupParticipants}
                    onPress={(msg) => {
                        if (isMultiSelecting) { toggleSelect(msg.id); return; }
                        const messageMeta = resolveMessageMetadata(msg);
                        if (msg?._isSuggestionTap || messageMeta.suggestedTask) {
                            const suggestion = messageMeta.suggestedTask;
                            if (!suggestion) return;
                            setSuggestionData({
                                ...suggestion,
                                messageId: msg.id,
                                assignedToUserId: suggestion.assignedToUserId || user?.id,
                            });
                            setSuggestionModalVisible(true);
                            return;
                        }
                        if (msg?._resolvedMediaUrl) {
                            const mimeType = msg?.meta?.attachment?.mimeType || '';
                            if (mimeType.startsWith('image/')) {
                                setViewerMedia({ url: msg._resolvedMediaUrl, type: 'image' });
                            } else if (mimeType.startsWith('video/')) {
                                setViewerMedia({ url: msg._resolvedMediaUrl, type: 'video' });
                            } else {
                                Linking.openURL(msg._resolvedMediaUrl);
                            }
                            return;
                        }
                        const t = msg.text || '';
                        if (t.startsWith('[imagen]')) setViewerMedia({ url: t.slice(8), type: 'image' });
                        else if (t.startsWith('[video]')) setViewerMedia({ url: t.slice(7), type: 'video' });
                        else if (t.startsWith('[document=')) Linking.openURL(t.match(/\](.*)$/)?.[1] || '');
                    }}
                    onLongPress={(msg) => {
                        if (isMultiSelecting) { toggleSelect(msg.id); return; }
                        setSelectedMsg(msg);
                        Animated.spring(menuAnim, { toValue: 0, useNativeDriver: true }).start();
                    }}
                    onToggleSelect={toggleSelect}
                    onSwipeLeft={setReplyingToMsg}
                    onViewReactions={setViewingReactionsMsg}
                    formatTime={formatTime}
                    avatarColor={avatarColor}
                    swipeableRowRefs={swipeableRowRefs}
                    conversationMode={conversationMode}
                    activeCommitmentId={activeOperationCommitment?.id || null}
                />
            </>
        );
    };

    return (
        <GestureHandlerRootView style={{ flex: 1 }}>
            <KeyboardAvoidingView
                behavior={Platform.OS === 'ios' ? 'padding' : undefined}
                style={styles.container}
                keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}
            >
                <StatusBar barStyle="light-content" />

                <AISuggestionModal
                    visible={suggestionModalVisible}
                    suggestionData={suggestionData}
                    user={user}
                    isGroup={!!isGroup}
                    groupParticipants={groupParticipants}
                    onClose={() => setSuggestionModalVisible(false)}
                    onUpdateData={setSuggestionData}
                    onConfirm={async () => {
                        try {
                            const payload = {
                                ...suggestionData,
                                conversation_id: conversationId,
                                message_id: suggestionData.messageId,
                            };
                            if (isSelf) {
                                await createCommitment(payload);
                            } else {
                                await createSharedProposal(payload);
                            }
                            queryClient.invalidateQueries({ queryKey: ['conversation-messages', conversationId] });
                            setSuggestionModalVisible(false);
                        } catch (error) {
                            console.warn('[Commitment] Confirmation failed', {
                                message: error instanceof Error ? error.message : 'unknown',
                            });
                            Alert.alert(
                                'No se pudo agendar',
                                isSelf
                                    ? 'El compromiso no fue guardado. Revisa los datos e inténtalo nuevamente.'
                                    : 'La propuesta no fue enviada. Revisa los datos e inténtalo nuevamente.'
                            );
                        }
                    }}
                    avatarColor={avatarColor}
                />

                <View style={styles.chatBg}>
                    {conversationMode === 'operation' && (
                        <OperationPanel
                            loading={isOperationStateLoading}
                            activeCommitment={activeOperationCommitment}
                            pinnedMessage={operationState?.pinnedMessage}
                            checklists={operationState?.checklists || []}
                            checklist={operationState?.activeChecklist}
                            openTasksCount={openOperationTasks.length}
                            onOpenPinnedMessage={scrollToMessage}
                            onClearPinnedMessage={handleClearPinnedMessage}
                            onToggleChecklistItem={(itemId, result) => toggleChecklistItem({ id: itemId, result })}
                            onCommitmentAction={handleOperationAction}
                            onClearActiveCommitment={handleClearActiveCommitment}
                            pendingAction={pendingOperationAction}
                            feedbackMessage={operationFeedback || locationFeedback}
                        />
                    )}

                    {isMessagesLoading ? (
                        <ActivityIndicator style={{ marginTop: 40 }} size="large" color="#1e3a5f" />
                    ) : (
                        <FlatList
                            ref={listRef}
                            data={messages}
                            inverted
                            keyExtractor={(item) => item.id}
                            renderItem={renderMessage}
                            onEndReached={() => { if (hasNextPage && !isFetchingNextPage) fetchNextPage(); }}
                            onEndReachedThreshold={0.3}
                            initialNumToRender={20}
                            maxToRenderPerBatch={12}
                            windowSize={10}
                            removeClippedSubviews={Platform.OS === 'android'}
                            keyboardShouldPersistTaps="handled"
                            keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
                            onScrollToIndexFailed={(info) => {
                                setTimeout(() => {
                                    listRef.current?.scrollToOffset({
                                        offset: Math.max(0, info.averageItemLength * info.index),
                                        animated: true,
                                    });
                                }, 150);
                            }}
                            ListFooterComponent={() => isFetchingNextPage ? <ActivityIndicator size="small" color="#999" /> : null}
                            contentContainerStyle={{ paddingVertical: 12, paddingHorizontal: 10 }}
                        />
                    )}
                </View>

                {activeTypers.length > 0 && (
                    <View style={styles.typingIndicatorContainer}>
                        <View style={styles.typingRow}>
                            {activeTypers.some(t => t.isRecording) ? <Ionicons name="mic" size={16} color="#6b7280" /> : <TypingIndicator />}
                            <Text style={styles.typingIndicatorText} numberOfLines={1}>
                                {activeTypers.map(t => t.name).join(', ')} {activeTypers.length > 1 ? 'están' : 'está'} {activeTypers.some(t => t.isRecording) ? 'grabando...' : 'escribiendo...'}
                            </Text>
                        </View>
                    </View>
                )}

                {isGroup && mentionQuery !== null && (
                    <MentionPopup participants={filteredParticipants} onSelect={handleSelectMention} />
                )}

                {replyingToMsg && (
                    <View style={styles.replyPreview}>
                        <View style={styles.replyPreviewContent}>
                            <Text style={styles.replyPreviewName} numberOfLines={1}>
                                {replyingToMsg.profiles?.full_name || replyingToMsg.profiles?.email?.split('@')[0] || 'Usuario'}
                            </Text>
                            <Text style={styles.replyPreviewText} numberOfLines={1}>
                                {replyingToMsg.text}
                            </Text>
                        </View>
                        <TouchableOpacity onPress={() => setReplyingToMsg(null)}>
                            <Ionicons name="close-circle" size={20} color="#9ca3af" />
                        </TouchableOpacity>
                    </View>
                )}

                {(isSending || isPendingCommitment || isPendingSharedProposal || sendingMedia) && (
                    <View style={styles.sendStatusBar}>
                        <ActivityIndicator size="small" color={theme.colors.text.muted} />
                        <Text style={styles.sendStatusText}>
                            {sendingMedia
                                ? 'Subiendo archivo...'
                                : (isPendingCommitment || isPendingSharedProposal)
                                    ? (isSelf ? 'Creando compromiso...' : 'Enviando propuesta...')
                                    : 'Enviando mensaje...'}
                        </Text>
                    </View>
                )}

                <ChatInput
                    text={text}
                    onTextChange={handleTextChange}
                    onSend={handleSend}
                    isSelf={!!isSelf}
                    isPending={isSending || isPendingCommitment || isPendingSharedProposal}
                    sendingMedia={sendingMedia}
                    recordingUri={recordingUri}
                    isRecording={isRecording}
                    onPickMedia={pickMediaSource}
                    onShareLocation={handleShareLocation}
                    onStartRecording={startRecording}
                    onStopRecording={stopRecording}
                    onCancelAudio={cancelAudio}
                    onUploadAudio={uploadAudio}
                    onFocus={() => {
                        setTimeout(() => {
                            listRef.current?.scrollToOffset({ offset: 0, animated: true });
                        }, 120);
                    }}
                />

                <Modal visible={headerMenuVisible} transparent animationType="fade" onRequestClose={() => setHeaderMenuVisible(false)}>
                    <TouchableOpacity style={styles.headerMenuOverlay} activeOpacity={1} onPress={() => setHeaderMenuVisible(false)}>
                        <View style={styles.headerMenuCard}>
                            <TouchableOpacity
                                style={styles.headerMenuItem}
                                onPress={() => {
                                    setHeaderMenuVisible(false);
                                    navigation.navigate('TaskHistory', { conversationId, isGroup: !!isGroup });
                                }}
                            >
                                <Ionicons name="time-outline" size={18} color={appTheme.colors.text.primary} />
                                <Text style={styles.headerMenuText}>Historial de tareas</Text>
                            </TouchableOpacity>
                            <TouchableOpacity
                                style={styles.headerMenuItem}
                                onPress={() => {
                                    setHeaderMenuVisible(false);
                                    handleSummarize();
                                }}
                                disabled={isSummarizing}
                            >
                                {isSummarizing ? (
                                    <ActivityIndicator size="small" color={appTheme.colors.accent} />
                                ) : (
                                    <Ionicons name="sparkles" size={18} color={appTheme.colors.text.primary} />
                                )}
                                <Text style={styles.headerMenuText}>Resumen</Text>
                            </TouchableOpacity>
                            <TouchableOpacity
                                style={styles.headerMenuItem}
                                onPress={() => {
                                    setHeaderMenuVisible(false);
                                    navigation.navigate('ChatInfo', { conversationId, otherUser, isGroup: !!isGroup, isSelf: !!isSelf, mode: conversationMode });
                                }}
                            >
                                <Ionicons name="information-circle-outline" size={18} color={appTheme.colors.text.primary} />
                                <Text style={styles.headerMenuText}>Info del chat</Text>
                            </TouchableOpacity>
                        </View>
                    </TouchableOpacity>
                </Modal>

                {isMultiSelecting && (
                    <View style={styles.selectBar}>
                        <TouchableOpacity onPress={cancelMultiSelect} style={styles.selectBarBtn}>
                            <Ionicons name="close" size={22} color="white" />
                        </TouchableOpacity>
                        <Text style={styles.selectBarText}>{multiSelect.length} seleccionado(s)</Text>
                        <TouchableOpacity onPress={forwardSelected} style={styles.selectBarForward}>
                            <Ionicons name="arrow-redo" size={18} color="white" />
                        </TouchableOpacity>
                        <TouchableOpacity
                            disabled={isDeleting || !canDeleteSelection}
                            onPress={deleteSelected}
                            style={[
                                styles.selectBarDelete,
                                (!canDeleteSelection || isDeleting) && styles.selectBarActionDisabled,
                            ]}
                        >
                            <Ionicons name="trash" size={20} color="white" />
                            <Text style={styles.selectBarDeleteText}>Eliminar</Text>
                        </TouchableOpacity>
                    </View>
                )}

                {/* Media Viewer Modal */}
                <Modal visible={!!viewerMedia} transparent animationType="fade" onRequestClose={() => setViewerMedia(null)}>
                    <View style={styles.viewerBackdrop}>
                        {viewerMedia?.type === 'video' ? (
                            <Video source={{ uri: viewerMedia.url }} style={styles.viewerImage} useNativeControls shouldPlay resizeMode={ResizeMode.CONTAIN} />
                        ) : (
                            <TouchableOpacity style={{ flex: 1, width: '100%' }} activeOpacity={1} onPress={() => setViewerMedia(null)}>
                                <Image source={{ uri: viewerMedia?.url || '' }} style={styles.viewerImage} resizeMode="contain" />
                            </TouchableOpacity>
                        )}
                        <TouchableOpacity style={styles.viewerClose} onPress={() => setViewerMedia(null)}>
                            <Ionicons name="close-circle" size={36} color="white" />
                        </TouchableOpacity>
                    </View>
                </Modal>

                <SummaryModal
                    visible={!!summary}
                    summary={summary}
                    onClose={() => setSummary(null)}
                />

                <MessageActionsModal
                    visible={!!selectedMsg}
                    menuAnim={menuAnim}
                    canPin={conversationMode === 'operation'}
                    isPinned={pinnedMessageId === selectedMsg?.id}
                    isOwnMessage={selectedMsg?.sender_id === user?.id}
                    onClose={() => setSelectedMsg(null)}
                    onReact={(emoji) => {
                        reactToMessage({ messageId: selectedMsg.id, emoji });
                        setSelectedMsg(null);
                    }}
                    onReply={() => {
                        setReplyingToMsg(selectedMsg);
                        setSelectedMsg(null);
                    }}
                    onForward={() => {
                        toggleSelect(selectedMsg.id);
                        setSelectedMsg(null);
                        setForwardModalVisible(true);
                    }}
                    onCopy={async () => {
                        if (selectedMsg?.text) {
                            await Clipboard.setStringAsync(selectedMsg.text);
                            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                        }
                        setSelectedMsg(null);
                    }}
                    onToggleSelect={() => {
                        toggleSelect(selectedMsg.id);
                        setSelectedMsg(null);
                    }}
                    onTogglePin={() => {
                        const nextPinnedId = pinnedMessageId === selectedMsg?.id ? null : selectedMsg?.id;
                        setPinnedMessage(nextPinnedId);
                        setSelectedMsg(null);
                    }}
                    onDelete={() => {
                        const message = selectedMsg;
                        setSelectedMsg(null);
                        if (!canDeleteMessages([message], user?.id)) {
                            Alert.alert('No se puede eliminar', 'El mensaje todavía no fue confirmado o no te pertenece.');
                            return;
                        }
                        confirmDelete([message.id]);
                    }}
                />

                <ForwardMessagesModal
                    visible={forwardModalVisible}
                    conversations={conversationsData?.conversations || []}
                    currentConversationId={conversationId}
                    selectedCount={selectedMessages.length}
                    isForwarding={isForwarding}
                    onClose={() => {
                        if (!isForwarding) setForwardModalVisible(false);
                    }}
                    onSelectConversation={forwardToConversation}
                />

                <ReactionsModal
                    visible={!!viewingReactionsMsg}
                    reactions={reactionGroups}
                    onClose={() => setViewingReactionsMsg(null)}
                />
            </KeyboardAvoidingView>
        </GestureHandlerRootView>
    );
}

const createStyles = (theme: any) => StyleSheet.create({
    container: { flex: 1, backgroundColor: theme.colors.chatBackground },
    chatBg: { flex: 1 },
    dateDivider: { alignItems: 'center', marginVertical: theme.spacing.sm + 2 },
    dateDividerText: {
        backgroundColor: 'rgba(0,0,0,0.2)', color: theme.colors.white,
        fontSize: 12, paddingHorizontal: 12, paddingVertical: 4,
        borderRadius: 10, overflow: 'hidden', fontWeight: '500',
    },
    typingIndicatorContainer: { height: 24, paddingHorizontal: 15, justifyContent: 'center' },
    typingRow: { flexDirection: 'row', alignItems: 'center', gap: 5 },
    typingIndicatorText: { fontSize: 12, color: theme.colors.text.secondary },
    viewerBackdrop: { flex: 1, backgroundColor: theme.colors.black, justifyContent: 'center', alignItems: 'center' },
    viewerImage: { width: '100%', height: '100%' },
    viewerClose: { position: 'absolute', top: 50, right: 20 },
    selectBar: { position: 'absolute', top: 0, left: 0, right: 0, backgroundColor: theme.colors.primary, height: 60, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 15, zIndex: 1000 },
    selectBarBtn: { padding: 8 },
    selectBarText: { flex: 1, color: theme.colors.white, fontSize: 16, fontWeight: '700', textAlign: 'center' },
    selectBarForward: { padding: 8 },
    selectBarDelete: { flexDirection: 'row', alignItems: 'center', gap: 5, padding: 8, backgroundColor: 'rgba(239, 68, 68, 0.2)', borderRadius: 8 },
    selectBarDeleteText: { color: theme.colors.danger, fontWeight: '700' },
    selectBarActionDisabled: { opacity: 0.4 },
    replyPreview: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 15,
        paddingVertical: 10,
        backgroundColor: theme.colors.surfaceMuted,
        borderTopWidth: 1,
        borderTopColor: theme.colors.border,
    },
    replyPreviewContent: { flex: 1, borderLeftWidth: 3, borderLeftColor: theme.colors.whatsapp.teal, paddingLeft: 10 },
    replyPreviewName: { fontSize: 13, fontWeight: '700', color: theme.colors.whatsapp.teal, marginBottom: 2 },
    replyPreviewText: { fontSize: 13, color: theme.colors.text.secondary },
    sendStatusBar: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        paddingHorizontal: 15,
        paddingVertical: 6,
        backgroundColor: theme.colors.surfaceMuted,
        borderTopWidth: 1,
        borderTopColor: theme.colors.border,
    },
    sendStatusText: { fontSize: 12, color: theme.colors.text.muted, fontWeight: '600' },
    headerMenuOverlay: {
        flex: 1,
        backgroundColor: 'rgba(0,0,0,0.25)',
        justifyContent: 'flex-start',
        alignItems: 'flex-end',
        paddingTop: 86,
        paddingRight: 12,
    },
    headerMenuCard: {
        backgroundColor: theme.colors.surface,
        borderRadius: 14,
        borderWidth: 1,
        borderColor: theme.colors.separator,
        paddingVertical: 6,
        minWidth: 210,
        shadowColor: '#000',
        shadowOpacity: theme.isDark ? 0.3 : 0.12,
        shadowRadius: 12,
        shadowOffset: { width: 0, height: 8 },
        elevation: 6,
    },
    headerMenuItem: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
        paddingHorizontal: 14,
        paddingVertical: 10,
    },
    headerMenuText: {
        fontSize: 13,
        fontWeight: '700',
        color: theme.colors.text.primary,
    },
    listHeaderSummary: {
        width: '100%',
        alignItems: 'center',
        marginVertical: 10,
    },
    floatingSummarizeBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: 'rgba(99, 102, 241, 0.9)',
        paddingHorizontal: 16,
        paddingVertical: 10,
        borderRadius: 20,
        gap: 8,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.2,
        shadowRadius: 4,
        elevation: 5,
    },
    floatingSummarizeText: {
        color: 'white',
        fontSize: 14,
        fontWeight: '600',
    },
});
