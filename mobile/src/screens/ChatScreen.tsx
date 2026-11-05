import React, { useState, useEffect, useRef } from 'react';
import {
    View,
    Text,
    FlatList,
    KeyboardAvoidingView,
    Platform,
    ActivityIndicator,
    StyleSheet,
    StatusBar,
    Alert,
    TouchableOpacity,
    Animated,
    Linking,
    Modal,
} from 'react-native';
import { CachedImage } from '../design/CachedImage';
import { useVideoPlayer, VideoView } from 'expo-video';
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
import { LiveActivityBubble } from '../components/LiveActivityBubble';
import { apiClient } from '../api/client';
import { useMediaPicker, LocalMediaDraft } from '../hooks/useMediaPicker';
import { useAudioRecorder } from '../hooks/useAudioRecorder';
import { useChatPresence } from '../hooks/useChatPresence';
import { useChatMessages } from '../hooks/useChatMessages';
import { ChatHeader } from '../components/ChatHeader';
import { ChatInput, ChatInputHandle } from '../components/ChatInput';
import { AISuggestionModal } from '../components/AISuggestionModal';
import { OperationPanel } from '../components/OperationPanel';
import { ReactionsModal } from '../components/ReactionsModal';
import { SummaryModal } from '../components/SummaryModal';
import { MessageActionsModal } from '../components/MessageActionsModal';
import { ForwardMessagesModal } from '../components/ForwardMessagesModal';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import * as Haptics from 'expo-haptics';
import * as Clipboard from 'expo-clipboard';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ChatCompositeNavigationProp, ChatScreenProps } from '../navigation/types';
import { useChatOperation } from '../hooks/useChatOperation';
import LocationConfirmModal from '../components/LocationConfirmModal';
import { Glass, GlassBackdrop } from '../design/Glass';
import { colors, gradients, radius, space } from '../design/tokens';
import { fonts } from '../design/typography';
import { SheetFill, sheetSurface } from '../design/Sheet';
import { createClientMessageId } from '../utils/synchronization';
import {
    canDeleteMessages,
    isForwardableMessage,
    orderMessagesForForward,
} from '../utils/messageActions';
import {
    resolveMessageAttachmentPresentation,
    resolveMessageContent,
    resolveMessageMetadata,
    resolvableAttachmentId,
    resolveReactionEmoji,
} from '../utils/messageCompat';
import { resolveMediaTapPresentation } from '../utils/messagePresentation';
import { getChatKeyboardBehavior, getChatKeyboardOffset } from '../utils/chatKeyboard';
import { formatRecordingDuration } from '../utils/audioRecording';
import { getMessageFocusDecision } from '../utils/messageFocus';
import { publicPingSurface } from '../api/agentSurfaceAdapter';
import { PingActivityCard } from '../components/PingActivityCard';
import {
    copyAttachmentImageAsync,
    saveAttachmentForUserAsync,
    shareAttachmentAsync,
} from '../utils/attachmentActions';
import { resolveAttachmentUrl, resolvePrivateFileUrl } from '../lib/privateFiles';
import { confirmAction } from '../design/ConfirmDialog';

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

const COLORS = gradients.avatar.map(([top]) => top);
function avatarColor(str: string) {
    let hash = 0;
    for (let i = 0; i < str.length; i++) hash = str.charCodeAt(i) + ((hash << 5) - hash);
    return COLORS[Math.abs(hash) % COLORS.length];
}

// ─── Component ──────────────────────────────────────────────────────────────

export default function ChatScreen({ route }: ChatScreenProps) {
    const navigation = useNavigation<ChatCompositeNavigationProp>();
    const { conversationId, otherUser, isSelf, isGroup, groupMetadata } = route.params;
    const [messageWindowTarget, setMessageWindowTarget] = useState(route.params.scrollToMessageId);
    const handledScrollTargetRef = useRef<string | null>(null);
    const { user, profile } = useAuth();
    const isFocused = useIsFocused();
    const queryClient = useQueryClient();
    const safeAreaInsets = useSafeAreaInsets();

    // UI States
    const [text, setText] = useState('');
    const [sendingMedia, setSendingMedia] = useState(false);
    const [selectedMsg, setSelectedMsg] = useState<any>(null);
    const [replyingToMsg, setReplyingToMsg] = useState<any>(null);
    const [viewerMedia, setViewerMedia] = useState<{ url: string, type: 'image' | 'video' } | null>(null);
    const viewerVideoPlayer = useVideoPlayer(null);

    useEffect(() => {
        if (viewerMedia?.type === 'video') {
            viewerVideoPlayer.replace(viewerMedia.url);
            viewerVideoPlayer.play();
        } else {
            viewerVideoPlayer.pause();
        }
    }, [viewerMedia, viewerVideoPlayer]);

    // Canonical pre-send media preview (video only — see useMediaPicker's
    // LocalMediaDraft). Selecting/recording a video freezes a draft here
    // instead of uploading immediately; Cancel discards it with zero
    // attachment/message/storage writes, Send performs exactly one upload
    // attempt from the frozen draft. Reuses the same in-app VideoView player
    // pattern as the sent-message viewer above — never a browser/Supabase URL.
    const [videoDraft, setVideoDraft] = useState<LocalMediaDraft | null>(null);
    const draftVideoPlayer = useVideoPlayer(null);

    useEffect(() => {
        if (videoDraft) {
            draftVideoPlayer.replace(videoDraft.uri);
            draftVideoPlayer.play();
        } else {
            draftVideoPlayer.pause();
        }
    }, [videoDraft, draftVideoPlayer]);

    const [summary, setSummary] = useState<string | null>(null);
    const [isSummarizing, setIsSummarizing] = useState(false);
    const [headerMenuVisible, setHeaderMenuVisible] = useState(false);
    const [multiSelect, setMultiSelect] = useState<string[]>([]);
    const [forwardModalVisible, setForwardModalVisible] = useState(false);
    const [isForwarding, setIsForwarding] = useState(false);
    const [isDeleting, setIsDeleting] = useState(false);
    const [isAttachmentActionBusy, setIsAttachmentActionBusy] = useState(false);
    const [suggestionModalVisible, setSuggestionModalVisible] = useState(false);
    const [suggestionData, setSuggestionData] = useState<any>(null);
    const [viewingReactionsMsg, setViewingReactionsMsg] = useState<any>(null);
    const [highlightedMsgId, setHighlightedMsgId] = useState<string | null>(null);
    const [mentionQuery, setMentionQuery] = useState<string | null>(null);
    const [mentionedUserId, setMentionedUserId] = useState<string | null>(null);
    const [groupParticipants, setGroupParticipants] = useState<{ id: string; full_name: string; email: string }[]>([]);
    const menuAnim = useRef(new Animated.Value(300)).current;
    const listRef = useRef<FlatList>(null);
    const swipeableRowRefs = useRef(new Map());

    const isMultiSelecting = multiSelect.length > 0;
    const selectedMessageIds = React.useMemo(() => new Set(multiSelect), [multiSelect]);

    // Hooks Logic
    const {
        messages,
        isLoading: isMessagesLoading,
        isError: isMessagesError,
        isFetching: isMessagesFetching,
        retryMessages,
        isSending,
        fetchNextPage,
        hasNextPage,
        isFetchingNextPage,
        targetFound,
        sendMessage,
        reactToMessage,
        retryPendingMessage,
        discardPendingMessage,
    } = useChatMessages(conversationId, user, isFocused, messageWindowTarget);

    useEffect(() => {
        if (route.params.scrollToMessageId) setMessageWindowTarget(route.params.scrollToMessageId);
    }, [route.params.scrollToMessageId]);

    const { activeTypers, handleTyping, broadcastRecording } = useChatPresence(conversationId, user);
    const [activityClock, setActivityClock] = useState(Date.now());
    const remoteRecorder = activeTypers.find((activity) => activity.isRecording);

    useEffect(() => {
        if (!remoteRecorder) return;
        setActivityClock(Date.now());
        const timer = setInterval(() => setActivityClock(Date.now()), 1_000);
        return () => clearInterval(timer);
    }, [remoteRecorder]);
    const { data: groupTasks = [] } = useConversationGroupTasks(conversationId);
    // Only operation chats have operation state; asking for it in a plain chat is a wasted
    // request that fails while the operation module is off.
    const { data: operationState, isLoading: isOperationStateLoading } = useConversationOperationState(
        route.params.mode === 'operation' ? conversationId : null,
    );
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
        pendingLocation,
        locationLoading,
        locationError,
        handleShareLocation,
        confirmShareLocation,
        cancelShareLocation,
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
        handleTyping(t.trim().length > 0);

        // Mention Logic
        const atIndex = t.lastIndexOf('@');
        if (atIndex !== -1 && (atIndex === 0 || t[atIndex - 1] === ' ')) {
            const query = t.substring(atIndex + 1);
            setMentionQuery(query);
        } else {
            setMentionQuery(null);
        }
    };

    const filteredMentionParticipants = React.useMemo(() => {
        if (mentionQuery === null) return [];
        const normalizedQuery = mentionQuery.toLowerCase();
        return groupParticipants.filter((participant) =>
            participant.full_name?.toLowerCase().includes(normalizedQuery) ||
            participant.email?.toLowerCase().includes(normalizedQuery)
        );
    }, [groupParticipants, mentionQuery]);

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
            return true;
        }
        return false;
    }, [messages]);

    // Canonical native-media launch boundary: the chat composer's TextInput
    // must relinquish focus/dismiss the keyboard before any camera/gallery/
    // document picker is presented (see useMediaPicker.ts's
    // dismissComposerKeyboard) — otherwise the software keyboard remains
    // visible over the native fullscreen surface, since presenting an
    // unrelated native modal never implicitly blurs the still-focused
    // TextInput that triggered it.
    const chatInputRef = useRef<ChatInputHandle>(null);

    const {
        prewarmAppConfig,
        openCamera,
        openGallery,
        openDocumentPicker,
        sendMediaDraft,
    } = useMediaPicker({
        conversationId,
        onMediaSent: (payload) => sendMessage({ ...payload, reply_to_id: replyingToMsg?.id }),
        setSendingMedia,
        onVideoDraft: (draft) => setVideoDraft(draft),
        isComposerFocused: () => chatInputRef.current?.isComposerFocused() ?? false,
        blurComposer: () => chatInputRef.current?.blurComposer(),
    });

    // A blank commitment for this chat, filled in by the user.
    const startNewCommitment = () => {
        setSuggestionData({ title: '', type: 'task', dueAt: null, assignedToUserId: user?.id });
        setSuggestionModalVisible(true);
    };

    const cancelVideoDraft = () => setVideoDraft(null);

    const confirmVideoDraft = async () => {
        if (!videoDraft) return;
        const draft = videoDraft;
        setVideoDraft(null);
        await sendMediaDraft(draft);
    };

    const {
        startRecording,
        stopRecording,
        isRecording,
        recordingUri,
        recordingDurationMs,
        cancelAudio,
        uploadAudio,
    } = useAudioRecorder({
        conversationId,
        onAudioSent: (payload) => sendMessage({ ...payload, reply_to_id: replyingToMsg?.id }),
        onRecordingStateChange: (isRecording) => broadcastRecording(isRecording),
        setSendingMedia
    });

    // ─── Scroll to Message logic ─────────────────────────────────────────────
    useEffect(() => {
        const requestedMessageId = route.params?.scrollToMessageId;
        const focusDecision = getMessageFocusDecision({
            requestedMessageId,
            handledMessageId: handledScrollTargetRef.current,
            targetFound,
            loadedMessageIds: messages.map((message) => message.id),
        });
        if (requestedMessageId && focusDecision !== 'idle' && focusDecision !== 'already_handled') {
            if (focusDecision === 'unavailable') {
                handledScrollTargetRef.current = requestedMessageId;
                Alert.alert('Mensaje no disponible', 'El mensaje fue eliminado o ya no está disponible.');
                navigation.setParams({ scrollToMessageId: undefined });
                return;
            }
            if (focusDecision === 'ready' && scrollToMessage(requestedMessageId)) {
                handledScrollTargetRef.current = requestedMessageId;
                navigation.setParams({ scrollToMessageId: undefined });
            }
            return;
        }

        if (messages.length === 0) return;
        if (route.params?.commitmentTitle) {
            const title = route.params.commitmentTitle.toLowerCase();
            const target = messages.find(m => m.text?.toLowerCase().includes(title));
            if (target?.id) {
                scrollToMessage(target.id);
            }
        }
    }, [route.params?.scrollToMessageId, route.params?.commitmentTitle, messages, navigation, scrollToMessage, targetFound]);

    // ─── Multi-select Logic ───
    const toggleSelect = React.useCallback((id: string) => {
        setMultiSelect(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
    }, []);
    const cancelMultiSelect = () => setMultiSelect([]);

    const selectedMessages = messages.filter((message) => selectedMessageIds.has(message.id));
    const canDeleteSelection = canDeleteMessages(selectedMessages, user?.id);

    const confirmDelete = async (messageIds: string[]) => {
        const count = messageIds.length;
        if (!count || isDeleting) return;

        const ok = await confirmAction({
            title: count === 1 ? 'Eliminar mensaje' : `Eliminar ${count} mensajes`,
            message: count === 1
                ? 'Se eliminará para todos los participantes. Esta acción no se puede deshacer.'
                : 'Se eliminarán para todos los participantes. Esta acción no se puede deshacer.',
        });
        if (!ok) return;

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

    // Signed links last a minute and the list no longer renews them, so a
    // file the user opens, shares or saves gets a link that is valid now.
    const currentMediaUrl = async (message: any): Promise<string | null> => {
        try {
            const attachmentId = resolvableAttachmentId(message);
            if (attachmentId) return (await resolveAttachmentUrl(attachmentId)).signedUrl;
            if (message?.media_bucket && message?.media_object_path) {
                return (await resolvePrivateFileUrl('message', message.id)).signedUrl;
            }
        } catch { /* fall back to the link already on screen */ }
        return typeof message?._resolvedMediaUrl === 'string' ? message._resolvedMediaUrl : null;
    };

    const resolveAttachmentForAction = async (message: any) => {
        const presentation = resolveMessageAttachmentPresentation(message);
        if (!presentation.kind) return null;

        let signedUrl = await currentMediaUrl(message);
        if (!signedUrl) {
            if (presentation.legacyUrl) {
                signedUrl = presentation.legacyUrl;
            } else {
                const legacyMatch = resolveMessageContent(message).match(/^\[(?:imagen|video|audio)\]\s+([^\s]+)/i);
                signedUrl = legacyMatch?.[1] || null;
            }
        }

        if (!signedUrl) return null;
        const fallbackMimeType: Record<string, string> = {
            image: 'image/jpeg',
            video: 'video/mp4',
            audio: 'audio/m4a',
            document: 'application/octet-stream',
        };
        return {
            signedUrl,
            mimeType: presentation.mimeType || fallbackMimeType[presentation.kind],
            fileName: presentation.fileName || undefined,
            kind: presentation.kind,
        };
    };

    const runAttachmentAction = async (
        message: any,
        action: 'copy' | 'share' | 'save',
    ) => {
        if (isAttachmentActionBusy) return;
        setIsAttachmentActionBusy(true);
        try {
            const attachment = await resolveAttachmentForAction(message);
            if (!attachment) {
                Alert.alert('Archivo no disponible', 'No se pudo obtener el archivo. Comprueba tu conexión e inténtalo nuevamente.');
                return;
            }

            if (action === 'copy') {
                if (attachment.kind !== 'image') {
                    const textToCopy = resolveMessageContent(message).trim();
                    if (textToCopy) await Clipboard.setStringAsync(textToCopy);
                    else Alert.alert('No se puede copiar', 'Este tipo de archivo no tiene texto copiable.');
                } else {
                    await copyAttachmentImageAsync(attachment);
                }
                Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                return;
            }

            if (action === 'share') {
                await shareAttachmentAsync(attachment);
                return;
            }

            const savedDestination = await saveAttachmentForUserAsync(attachment);
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
            Alert.alert('Guardado', savedDestination === 'gallery'
                ? 'El archivo se guardó en la galería del dispositivo.'
                : 'El archivo se guardó en el dispositivo.');
        } catch (error) {
            console.warn('[Chat] Attachment action failed', {
                action,
                code: error && typeof error === 'object' && 'code' in error ? (error as any).code : 'unknown',
            });
            if (error && typeof error === 'object' && 'code' in error && (error as any).code === 'save_cancelled') {
                return;
            }
            Alert.alert('No se pudo completar', 'El archivo no pudo procesarse. Inténtalo nuevamente.');
        } finally {
            setIsAttachmentActionBusy(false);
        }
    };

    const forwardSelected = () => {
        if (selectedMessages.some((message) => !isForwardableMessage(message))) {
            Alert.alert(
                'No se puede reenviar esta selección',
                'Sólo se pueden reenviar mensajes confirmados, archivos adjuntos disponibles y mensajes no pertenecientes al sistema.'
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
                await apiClient.post(`/conversations/${conversationId}/messages/${message.id}/forward`, {
                    targetConversationId,
                    clientMessageId: createClientMessageId(),
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

    const renderMessage = React.useCallback(({ item, index }: { item: any; index: number }) => {
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
                    isSelected={selectedMessageIds.has(item.id)}
                    highlightedMsgId={highlightedMsgId}
                    groupTasks={groupTasks}
                    groupParticipants={groupParticipants}
                    onPress={async (msg) => {
                        if (isMultiSelecting) { toggleSelect(msg.id); return; }
                        if (msg?.status === 'rejected_offline') {
                            Alert.alert('No se envió', '¿Qué quieres hacer con este mensaje?', [
                                { text: 'Volver', style: 'cancel' },
                                { text: 'Eliminar', style: 'destructive', onPress: () => discardPendingMessage(msg.id) },
                                { text: 'Reintentar', onPress: () => retryPendingMessage(msg.id) },
                            ]);
                            return;
                        }
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
                            // Canonical attachment MIME lives at msg.attachment.mimeType
                            // (see messageCompat.ts toLegacyMessageListShape) for server-
                            // confirmed messages; the offline queue mapping in
                            // useChatMessages.ts additionally mirrors it under
                            // meta.attachment.mimeType before the message round-trips.
                            // Reading only meta.attachment here made every confirmed
                            // attachment (image included) fall through to
                            // Linking.openURL on the raw signed Storage URL instead of
                            // the in-app viewer — masked for images (Safari renders a
                            // JPEG fine) but visibly broken for video.
                            const mimeType = msg?.attachment?.mimeType || msg?.meta?.attachment?.mimeType || '';
                            const mediaUrl = (await currentMediaUrl(msg)) ?? msg._resolvedMediaUrl;
                            const presentation = resolveMediaTapPresentation(mediaUrl, mimeType);
                            if (presentation.kind === 'image') {
                                setViewerMedia({ url: presentation.url, type: 'image' });
                            } else if (presentation.kind === 'video') {
                                setViewerMedia({ url: presentation.url, type: 'video' });
                            } else {
                                Linking.openURL(presentation.url);
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
                    onAvatarPress={(url) => setViewerMedia({ url, type: 'image' })}
                    formatTime={formatTime}
                    avatarColor={avatarColor}
                    swipeableRowRefs={swipeableRowRefs}
                    conversationMode={conversationMode}
                    activeCommitmentId={activeOperationCommitment?.id || null}
                />
            </>
        );
    }, [activeOperationCommitment?.id, conversationMode, discardPendingMessage, groupParticipants, groupTasks, highlightedMsgId, isGroup, isMultiSelecting, menuAnim, messages, retryPendingMessage, selectedMessageIds, swipeableRowRefs, toggleSelect, user]);

    // The line under the name says what is happening right now.
    const isOtherOnline = !isGroup && !isSelf && !!otherUser?.last_seen
        && Date.now() - new Date(otherUser.last_seen).getTime() < 5 * 60 * 1000;
    const headerSubtitle = activeTypers.length > 0
        ? (remoteRecorder ? 'grabando audio…' : 'escribiendo…')
        : isSelf ? 'Solo tú' : isGroup ? 'Grupo' : isOtherOnline ? 'en línea' : null;

    return (
        <GestureHandlerRootView style={{ flex: 1 }}>
            <GlassBackdrop>
            <View pointerEvents="none" style={styles.veil} />
            <StatusBar barStyle="light-content" />
            <ChatHeader
                chatTitle={isSelf ? 'Para mí' : (isGroup ? groupMetadata?.name : otherUser?.full_name)}
                subtitle={headerSubtitle}
                online={isOtherOnline}
                avatarUrl={isGroup ? groupMetadata?.avatar_url : otherUser?.avatar_url}
                profileId={!isGroup && !isSelf ? otherUser?.id : undefined}
                isGroup={!!isGroup}
                isSelf={!!isSelf}
                onBack={() => navigation.goBack()}
                onPing={() => navigation.navigate('PingAI', { conversationId, surface: publicPingSurface() })}
                onInfo={() => navigation.navigate('ChatInfo', { conversationId, otherUser, isGroup: !!isGroup, isSelf: !!isSelf, mode: conversationMode })}
                onCommitments={() => navigation.navigate('TaskHistory', {
                    conversationId,
                    isGroup: !!isGroup,
                    title: isSelf ? 'Para mí' : (isGroup ? groupMetadata?.name : otherUser?.full_name?.split(' ')[0]),
                })}
                onMenu={() => setHeaderMenuVisible(true)}
                onAvatarPress={(url) => setViewerMedia({ url, type: 'image' })}
            />
            <KeyboardAvoidingView
                behavior={getChatKeyboardBehavior(Platform.OS)}
                style={styles.container}
                keyboardVerticalOffset={getChatKeyboardOffset(Platform.OS, safeAreaInsets.bottom)}
            >

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
                            // The server only accepts its own field names and
                            // silently drops the rest, so the suggestion's
                            // camelCase date and assignee are mapped here.
                            const payload = {
                                title: suggestionData.title,
                                type: suggestionData.type === 'meeting' ? 'meeting' : 'task',
                                due_at: suggestionData.dueAt || null,
                                assigned_to_user_id: suggestionData.assignedToUserId || null,
                                conversation_id: conversationId,
                                message_id: suggestionData.messageId,
                                source_kind: suggestionData.messageId ? 'ai_suggestion' : 'manual',
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
                                'No se pudo crear el compromiso',
                                isSelf
                                    ? 'El compromiso no fue guardado. Revisa los datos e inténtalo nuevamente.'
                                    : 'La propuesta no fue enviada. Revisa los datos e inténtalo nuevamente.'
                            );
                        }
                    }}
                    avatarColor={avatarColor}
                />

                <View style={styles.chatBg}>
                    <PingActivityCard
                        conversationId={conversationId}
                        onOpen={() => navigation.navigate('PingAI', { conversationId, surface: publicPingSurface() })}
                    />
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

                    {isMessagesLoading && messages.length === 0 ? (
                        <ActivityIndicator style={{ marginTop: 40 }} size="large" color={colors.accentBright} />
                    ) : isMessagesError && messages.length === 0 ? (
                        <View style={styles.messageLoadError}>
                            <Text style={styles.messageLoadErrorText}>No se pudieron cargar los mensajes.</Text>
                            <TouchableOpacity
                                onPress={() => { void retryMessages(); }}
                                disabled={isMessagesFetching}
                                accessibilityRole="button"
                                accessibilityLabel="Reintentar cargar mensajes"
                            >
                                {isMessagesFetching ? (
                                    <ActivityIndicator size="small" color={colors.accentBright} />
                                ) : (
                                    <Text style={styles.messageLoadRetry}>Reintentar</Text>
                                )}
                            </TouchableOpacity>
                        </View>
                    ) : (
                        <>
                            {isMessagesError && (
                                <View style={styles.messageLoadWarning}>
                                    <Text style={styles.messageLoadWarningText}>No se pudo actualizar el chat.</Text>
                                    <TouchableOpacity
                                        onPress={() => { void retryMessages(); }}
                                        disabled={isMessagesFetching}
                                        accessibilityRole="button"
                                        accessibilityLabel="Reintentar actualizar mensajes"
                                    >
                                        <Text style={styles.messageLoadRetry}>{isMessagesFetching ? 'Reintentando…' : 'Reintentar'}</Text>
                                    </TouchableOpacity>
                                </View>
                            )}
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
                                ListFooterComponent={() => isFetchingNextPage ? <ActivityIndicator size="small" color={colors.textFaint} /> : null}
                                contentContainerStyle={{ paddingVertical: 12, paddingHorizontal: 10 }}
                            />
                        </>
                    )}
                </View>

                {activeTypers.length > 0 && (
                    <LiveActivityBubble
                        names={(remoteRecorder ? activeTypers.filter((t) => t.isRecording) : activeTypers).map((t) => t.name)}
                        recording={!!remoteRecorder}
                        elapsed={remoteRecorder ? formatRecordingDuration(
                            Math.max(0, activityClock - (remoteRecorder.recordingStartedAt || activityClock))
                        ) : ''}
                        showNames={!!isGroup}
                    />
                )}

                {isGroup && mentionQuery !== null && (
                    <MentionPopup participants={filteredMentionParticipants} onSelect={handleSelectMention} />
                )}

                {replyingToMsg && (
                    <Glass style={styles.replyPreview} intensity={50}>
                        <View style={styles.replyPreviewContent}>
                            <Text style={styles.replyPreviewName} numberOfLines={1}>
                                {replyingToMsg.profiles?.full_name || replyingToMsg.profiles?.email?.split('@')[0] || 'Usuario'}
                            </Text>
                            <Text style={styles.replyPreviewText} numberOfLines={1}>
                                {replyingToMsg.text}
                            </Text>
                        </View>
                        <TouchableOpacity onPress={() => setReplyingToMsg(null)}>
                            <Ionicons name="close-circle" size={20} color={colors.textFaint} />
                        </TouchableOpacity>
                    </Glass>
                )}

                {(isSending || isPendingCommitment || isPendingSharedProposal || sendingMedia) && (
                    <View style={styles.sendStatusBar}>
                        <ActivityIndicator size="small" color={colors.textFaint} />
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
                    ref={chatInputRef}
                    text={text}
                    onTextChange={handleTextChange}
                    onSend={handleSend}
                    isSelf={!!isSelf}
                    isPending={isSending || isPendingCommitment || isPendingSharedProposal}
                    sendingMedia={sendingMedia}
                    recordingUri={recordingUri}
                    isRecording={isRecording}
                    recordingDurationMs={recordingDurationMs}
                    onOpenAttachments={prewarmAppConfig}
                    onTakePhoto={() => void openCamera('photo')}
                    onPickGallery={() => void openGallery()}
                    onRecordVideo={() => void openCamera('video')}
                    onPickDocument={() => void openDocumentPicker()}
                    onShareLocation={handleShareLocation}
                    onCreateCommitment={startNewCommitment}
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


                <LocationConfirmModal
                    visible={!!(pendingLocation || locationLoading || locationError)}
                    location={pendingLocation}
                    loading={locationLoading}
                    error={locationError}
                    onConfirm={confirmShareLocation}
                    onCancel={cancelShareLocation}
                />

                <Modal visible={headerMenuVisible} transparent animationType="fade" onRequestClose={() => setHeaderMenuVisible(false)}>
                    <TouchableOpacity style={[styles.headerMenuOverlay, { paddingTop: safeAreaInsets.top + 58 }]} activeOpacity={1} onPress={() => setHeaderMenuVisible(false)}>
                        <View style={styles.headerMenuCard}>
                            <SheetFill />
                            <TouchableOpacity
                                style={styles.headerMenuItem}
                                onPress={() => {
                                    setHeaderMenuVisible(false);
                                    handleSummarize();
                                }}
                                disabled={isSummarizing}
                            >
                                {isSummarizing ? (
                                    <ActivityIndicator size="small" color={colors.accentBright} />
                                ) : (
                                    <Ionicons name="sparkles" size={18} color={colors.text} />
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
                                <Ionicons name="information-circle-outline" size={18} color={colors.text} />
                                <Text style={styles.headerMenuText}>Info del chat</Text>
                            </TouchableOpacity>
                        </View>
                    </TouchableOpacity>
                </Modal>

                {isMultiSelecting && (
                    <View style={styles.selectBar}>
                        <TouchableOpacity onPress={cancelMultiSelect} style={styles.selectBarBtn}>
                            <Ionicons name="close" size={22} color={colors.onAccent} />
                        </TouchableOpacity>
                        <Text style={styles.selectBarText}>{multiSelect.length} seleccionado(s)</Text>
                        <TouchableOpacity onPress={forwardSelected} style={styles.selectBarForward}>
                            <Ionicons name="arrow-redo" size={18} color={colors.onAccent} />
                        </TouchableOpacity>
                        <TouchableOpacity
                            disabled={isDeleting || !canDeleteSelection}
                            onPress={deleteSelected}
                            style={[
                                styles.selectBarDelete,
                                (!canDeleteSelection || isDeleting) && styles.selectBarActionDisabled,
                            ]}
                        >
                            <Ionicons name="trash" size={20} color={colors.onAccent} />
                            <Text style={styles.selectBarDeleteText}>Eliminar</Text>
                        </TouchableOpacity>
                    </View>
                )}

                {/* Media Viewer Modal */}
                <Modal visible={!!viewerMedia} transparent animationType="fade" onRequestClose={() => setViewerMedia(null)}>
                    <View style={styles.viewerBackdrop}>
                        {viewerMedia?.type === 'video' ? (
                            <VideoView player={viewerVideoPlayer} style={styles.viewerImage} nativeControls contentFit="contain" />
                        ) : (
                            <TouchableOpacity style={{ flex: 1, width: '100%' }} activeOpacity={1} onPress={() => setViewerMedia(null)}>
                                <CachedImage uri={viewerMedia?.url || ''} style={styles.viewerImage} contentFit="contain" />
                            </TouchableOpacity>
                        )}
                        <TouchableOpacity style={styles.viewerClose} onPress={() => setViewerMedia(null)}>
                            <Ionicons name="close-circle" size={36} color={colors.onAccent} />
                        </TouchableOpacity>
                    </View>
                </Modal>

                {/* Canonical pre-send video preview — camera and gallery both
                    feed the same LocalMediaDraft here. Cancel discards the
                    draft with zero writes; Send performs exactly one upload
                    attempt via sendMediaDraft. */}
                <Modal visible={!!videoDraft} transparent animationType="fade" onRequestClose={cancelVideoDraft}>
                    <View style={styles.viewerBackdrop}>
                        <VideoView player={draftVideoPlayer} style={styles.viewerImage} nativeControls contentFit="contain" />
                        <View style={styles.draftActionsBar}>
                            <TouchableOpacity
                                style={[styles.draftActionBtn, styles.draftCancelBtn]}
                                onPress={cancelVideoDraft}
                                disabled={sendingMedia}
                            >
                                <Ionicons name="close" size={20} color={colors.onAccent} />
                                <Text style={styles.draftActionText}>Cancelar</Text>
                            </TouchableOpacity>
                            <TouchableOpacity
                                style={[styles.draftActionBtn, styles.draftSendBtn]}
                                onPress={confirmVideoDraft}
                                disabled={sendingMedia}
                            >
                                <Ionicons name="send" size={18} color={colors.onAccent} />
                                <Text style={styles.draftActionText}>{sendingMedia ? 'Enviando...' : 'Enviar'}</Text>
                            </TouchableOpacity>
                        </View>
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
                    isAttachment={Boolean(resolveMessageAttachmentPresentation(selectedMsg).kind)}
                    attachmentKind={resolveMessageAttachmentPresentation(selectedMsg).kind}
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
                        const message = selectedMsg;
                        setSelectedMsg(null);
                        if (!message || !isForwardableMessage(message)) {
                            Alert.alert(
                                'No se puede reenviar',
                                'Este mensaje todavía no está disponible para reenviar.',
                            );
                            return;
                        }
                        setMultiSelect([message.id]);
                        setForwardModalVisible(true);
                    }}
                    onCopy={async () => {
                        const message = selectedMsg;
                        if (!message) return;
                        if (resolveMessageAttachmentPresentation(message).kind) {
                            setSelectedMsg(null);
                            await runAttachmentAction(message, 'copy');
                            return;
                        }
                        if (selectedMsg?.text) {
                            await Clipboard.setStringAsync(selectedMsg.text);
                            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                        } else {
                            const textToCopy = resolveMessageContent(message);
                            if (textToCopy) {
                                await Clipboard.setStringAsync(textToCopy);
                                Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                            }
                        }
                        setSelectedMsg(null);
                    }}
                    onShare={() => {
                        const message = selectedMsg;
                        setSelectedMsg(null);
                        if (message) void runAttachmentAction(message, 'share');
                    }}
                    onSave={() => {
                        const message = selectedMsg;
                        setSelectedMsg(null);
                        if (message) void runAttachmentAction(message, 'save');
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
            </GlassBackdrop>
        </GestureHandlerRootView>
    );
}

const styles = StyleSheet.create({
    // Darkens the waves behind the messages so the bubbles lead.
    veil: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: colors.chatVeil },
    container: { flex: 1 },
    chatBg: { flex: 1 },
    messageLoadError: {
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        padding: space.xxl,
        gap: space.md,
    },
    messageLoadErrorText: { fontFamily: fonts.regular, color: colors.textSoft, textAlign: 'center', fontSize: 14 },
    messageLoadWarning: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 10,
        paddingHorizontal: space.md,
        paddingVertical: 7,
        backgroundColor: colors.glassDim,
        borderBottomWidth: StyleSheet.hairlineWidth,
        borderBottomColor: colors.glassBorder,
    },
    messageLoadWarningText: { fontFamily: fonts.regular, color: colors.textSoft, fontSize: 12 },
    messageLoadRetry: { fontFamily: fonts.semibold, color: colors.accentBright, fontSize: 13 },
    dateDivider: { alignItems: 'center', marginVertical: space.sm + 2 },
    dateDividerText: {
        fontFamily: fonts.medium,
        backgroundColor: colors.glassDim,
        color: colors.textSoft,
        fontSize: 12,
        paddingHorizontal: space.md,
        paddingVertical: 4,
        borderRadius: radius.sm,
        overflow: 'hidden',
    },
    viewerBackdrop: { flex: 1, backgroundColor: colors.ink, justifyContent: 'center', alignItems: 'center' },
    viewerImage: { width: '100%', height: '100%' },
    viewerClose: { position: 'absolute', top: 50, right: 20 },
    draftActionsBar: {
        position: 'absolute', bottom: 40, left: 24, right: 24,
        flexDirection: 'row', justifyContent: 'space-between', gap: space.lg,
    },
    draftActionBtn: {
        flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
        paddingVertical: 14, borderRadius: radius.full, gap: space.sm,
    },
    draftCancelBtn: { backgroundColor: colors.glassRaised },
    draftSendBtn: { backgroundColor: colors.accent },
    draftActionText: { fontFamily: fonts.semibold, color: colors.onAccent, fontSize: 15 },
    selectBar: {
        position: 'absolute', top: 0, left: 0, right: 0, height: 60, zIndex: 1000,
        flexDirection: 'row', alignItems: 'center', paddingHorizontal: 15,
        backgroundColor: colors.surfaceSolid,
        borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.glassBorder,
    },
    selectBarBtn: { padding: 8 },
    selectBarText: { flex: 1, fontFamily: fonts.semibold, color: colors.text, fontSize: 16, textAlign: 'center' },
    selectBarForward: { padding: 8 },
    selectBarDelete: { flexDirection: 'row', alignItems: 'center', gap: 5, padding: 8, backgroundColor: colors.glassRaised, borderRadius: radius.sm },
    selectBarDeleteText: { fontFamily: fonts.semibold, color: colors.danger },
    selectBarActionDisabled: { opacity: 0.4 },
    replyPreview: {
        flexDirection: 'row',
        alignItems: 'center',
        marginHorizontal: space.sm + 2,
        marginTop: space.xs,
        paddingHorizontal: space.md + 2,
        paddingVertical: 10,
        borderRadius: radius.md,
    },
    replyPreviewContent: { flex: 1, borderLeftWidth: 3, borderLeftColor: colors.accentBright, paddingLeft: 10 },
    replyPreviewName: { fontFamily: fonts.semibold, fontSize: 13, color: colors.accentBright, marginBottom: 2 },
    replyPreviewText: { fontFamily: fonts.regular, fontSize: 13, color: colors.textSoft },
    sendStatusBar: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: space.sm,
        paddingHorizontal: 15,
        paddingVertical: 6,
    },
    sendStatusText: { fontFamily: fonts.medium, fontSize: 12, color: colors.textFaint },
    headerMenuOverlay: {
        flex: 1,
        backgroundColor: colors.glassTintLight,
        justifyContent: 'flex-start',
        alignItems: 'flex-end',
        paddingRight: space.md,
    },
    headerMenuCard: {
        borderRadius: radius.md,
        paddingVertical: 6,
        minWidth: 210,
        elevation: 6,
        ...sheetSurface,
    },
    headerMenuItem: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
        paddingHorizontal: 14,
        paddingVertical: 11,
    },
    headerMenuText: { fontFamily: fonts.medium, fontSize: 14, color: colors.text },
});
