import React, { useState, useEffect, useRef } from 'react';
import {
    View, Text, FlatList, KeyboardAvoidingView, Platform, ActivityIndicator, StyleSheet,
    StatusBar, Image, Alert, TouchableOpacity, Share, Animated, Linking, ScrollView, Modal
} from 'react-native';
import { useRoute } from '@react-navigation/native';
import { Video, ResizeMode } from 'expo-av';
import { Ionicons } from '@expo/vector-icons';
import { useQueryClient } from '@tanstack/react-query';
import { useIsFocused } from '@react-navigation/native';
import { useConversationGroupTasks, useCreateCommitment } from '../api/queries';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../lib/supabase';
import MentionPopup from '../components/MentionPopup';
import MessageItem from '../components/MessageItem';
import TypingIndicator from '../components/TypingIndicator';
import { apiClient } from '../api/client';
import { useMediaPicker } from '../hooks/useMediaPicker';
import { useAudioRecorder } from '../hooks/useAudioRecorder';
import { useChatPresence } from '../hooks/useChatPresence';
import { useChatMessages } from '../hooks/useChatMessages';
import { ChatHeader } from '../components/ChatHeader';
import { ChatInput } from '../components/ChatInput';
import { AISuggestionModal } from '../components/AISuggestionModal';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import * as Haptics from 'expo-haptics';
import * as Clipboard from 'expo-clipboard';
import { theme } from '../theme/theme';

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

export default function ChatScreen({ navigation }: any) {
    const route = useRoute<any>();
    const { conversationId, otherUser, isSelf, isGroup, groupMetadata } = route.params;
    const { user } = useAuth();
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
    const [multiSelect, setMultiSelect] = useState<string[]>([]);
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
    const { mutate: createCommitment, isPending: isPendingCommitment } = useCreateCommitment();

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
                        { id: user?.id || '', full_name: (user as any).user_metadata?.full_name || '', email: user?.email || '' },
                        { id: otherUser.id, full_name: otherUser.full_name, email: otherUser.email }
                    ]);
                }
            } catch (err) {
                console.error('[Mention] Failed to fetch participants:', err);
            }
        };
        fetchParticipants();
    }, [conversationId, isGroup, otherUser, user]);

    // ─── Header Navigation Options ──────────────────────────────────────────
    useEffect(() => {
        navigation.setOptions({
            headerTitle: () => (
                <ChatHeader
                    chatTitle={isSelf ? 'Mi Espacio' : (isGroup ? groupMetadata?.name : otherUser?.full_name)}
                    avatarUrl={isGroup ? groupMetadata?.avatar_url : otherUser?.avatar_url}
                    isGroup={isGroup}
                    isSummarizing={isSummarizing}
                    onSummarize={handleSummarize}
                    onVoiceCall={() => navigation.navigate('Call', { conversationId, otherUser, isGroup, type: 'voice' })}
                    onVideoCall={() => navigation.navigate('Call', { conversationId, otherUser, isGroup, type: 'video' })}
                    onInfo={() => navigation.navigate('ChatInfo', { conversationId, otherUser, isGroup })}
                />
            ),
            headerStyle: { backgroundColor: theme.colors.primary },
            headerTintColor: theme.colors.white,
            headerRight: () => null, // Explicitly clear any right buttons
        });
    }, [navigation, isSelf, isGroup, groupMetadata, otherUser, isSummarizing]);

    // ─── Handlers ────────────────────────────────────────────────────────────

    const handleSummarize = async () => {
        setIsSummarizing(true);
        try {
            const res = await apiClient.post('/ai/summarize', { conversationId });
            setSummary(res.summary || 'No se pudo generar el resumen.');
        } catch (err) {
            console.error('[AI] Summarize failed:', err);
            Alert.alert('Error', 'No se pudo generar el resumen.');
        } finally {
            setIsSummarizing(false);
        }
    };

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

    const { pickMediaSource } = useMediaPicker({
        onMediaSent: (t) => sendMessage({ text: t, reply_to_id: replyingToMsg?.id }),
        setSendingMedia
    });

    const { startRecording, stopRecording, isRecording, recordingUri, cancelAudio, uploadAudio } = useAudioRecorder({
        onAudioSent: (t) => sendMessage({ text: t, reply_to_id: replyingToMsg?.id }),
        onRecordingStateChange: (isRecording) => broadcastRecording(isRecording),
        setSendingMedia
    });

    // ─── Scroll to Message logic ─────────────────────────────────────────────
    useEffect(() => {
        if (route.params?.scrollToMessageId && messages.length > 0) {
            const index = messages.findIndex(m => m.id === route.params.scrollToMessageId);
            if (index !== -1) {
                setHighlightedMsgId(route.params.scrollToMessageId);
                setTimeout(() => {
                    listRef.current?.scrollToIndex({ index, animated: true, viewPosition: 0.5 });
                }, 100);
                setTimeout(() => setHighlightedMsgId(null), 3000);
            }
        }
    }, [route.params?.scrollToMessageId, messages]);

    // ─── Multi-select Logic ───
    const toggleSelect = (id: string) => {
        setMultiSelect(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
    };
    const cancelMultiSelect = () => setMultiSelect([]);
    const deleteSelected = () => {
        Alert.alert('Eliminar', `¿Eliminar ${multiSelect.length} mensajes?`, [
            { text: 'Cancelar', style: 'cancel' },
            { text: 'Eliminar', style: 'destructive', onPress: async () => {
                await supabase.from('messages').delete().in('id', multiSelect);
                setMultiSelect([]);
            }}
        ]);
    };
    const forwardSelected = () => {
        const combined = messages.filter(m => multiSelect.includes(m.id)).map(m => m.text).join('\n\n');
        Share.share({ message: combined });
        setMultiSelect([]);
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
                <MessageItem
                    item={item}
                    user={user}
                    isGroup={isGroup}
                    isMultiSelecting={isMultiSelecting}
                    isSelected={multiSelect.includes(item.id)}
                    highlightedMsgId={highlightedMsgId}
                    groupTasks={groupTasks}
                    groupParticipants={groupParticipants}
                    onPress={(msg) => {
                        if (isMultiSelecting) { toggleSelect(msg.id); return; }
                        if (msg?._isSuggestionTap || msg?.meta?.suggestedTask) {
                            setSuggestionData({ ...msg.meta.suggestedTask, messageId: msg.id });
                            setSuggestionModalVisible(true);
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
                />
            </>
        );
    };

    return (
        <GestureHandlerRootView style={{ flex: 1 }}>
            <KeyboardAvoidingView
                behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
                style={styles.container}
                keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}
            >
                <StatusBar barStyle="light-content" />

                <AISuggestionModal
                    visible={suggestionModalVisible}
                    suggestionData={suggestionData}
                    user={user}
                    isGroup={isGroup}
                    groupParticipants={groupParticipants}
                    onClose={() => setSuggestionModalVisible(false)}
                    onUpdateData={setSuggestionData}
                    onConfirm={async () => {
                        await createCommitment({ 
                            ...suggestionData, 
                            group_conversation_id: conversationId 
                        });
                        // Force refresh of messages to show system message
                        queryClient.invalidateQueries({ queryKey: ['conversation-messages', conversationId] });
                        setSuggestionModalVisible(false);
                    }}
                    avatarColor={avatarColor}
                />

                <View style={styles.chatBg}>
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

                <ChatInput
                    text={text}
                    onTextChange={handleTextChange}
                    onSend={handleSend}
                    isSelf={isSelf}
                    isPending={isSending || isPendingCommitment}
                    sendingMedia={sendingMedia}
                    recordingUri={recordingUri}
                    isRecording={isRecording}
                    onPickMedia={pickMediaSource}
                    onStartRecording={startRecording}
                    onStopRecording={stopRecording}
                    onCancelAudio={cancelAudio}
                    onUploadAudio={uploadAudio}
                />

                {isMultiSelecting && (
                    <View style={styles.selectBar}>
                        <TouchableOpacity onPress={cancelMultiSelect} style={styles.selectBarBtn}>
                            <Ionicons name="close" size={22} color="white" />
                        </TouchableOpacity>
                        <Text style={styles.selectBarText}>{multiSelect.length} seleccionado(s)</Text>
                        <TouchableOpacity onPress={forwardSelected} style={styles.selectBarForward}>
                            <Ionicons name="arrow-redo" size={18} color="white" />
                        </TouchableOpacity>
                        <TouchableOpacity onPress={deleteSelected} style={styles.selectBarDelete}>
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

                {/* AI Summary Modal */}
                <Modal visible={!!summary} transparent animationType="slide" onRequestClose={() => setSummary(null)}>
                    <View style={styles.summaryBackdrop}>
                        <View style={styles.summarySheet}>
                            <View style={styles.summaryHeader}>
                                <Ionicons name="sparkles" size={24} color="#8b5cf6" />
                                <Text style={styles.summaryTitle}>Resumen</Text>
                                <TouchableOpacity onPress={() => setSummary(null)}>
                                    <Ionicons name="close" size={24} color="#6b7280" />
                                </TouchableOpacity>
                            </View>
                            <ScrollView style={styles.summaryScroll}><Text style={styles.summaryContent}>{summary}</Text></ScrollView>
                            <TouchableOpacity style={styles.summaryDoneBtn} onPress={() => setSummary(null)}>
                                <Text style={styles.summaryDoneText}>Entendido</Text>
                            </TouchableOpacity>
                        </View>
                    </View>
                </Modal>

                {/* Context Menu Modal */}
                <Modal visible={!!selectedMsg} transparent animationType="none" onRequestClose={() => setSelectedMsg(null)}>
                    <TouchableOpacity style={styles.menuBackdrop} activeOpacity={1} onPress={() => setSelectedMsg(null)}>
                        <Animated.View style={[styles.menuSheet, { transform: [{ translateY: menuAnim }] }]}>
                             <View style={styles.menuEmojiRow}>
                                {['👍', '❤️', '😂', '😮', '😢', '🙏'].map(emoji => (
                                    <TouchableOpacity key={emoji} style={styles.emojiBtn} onPress={() => { reactToMessage({ messageId: selectedMsg.id, emoji }); setSelectedMsg(null); }}>
                                        <Text style={{ fontSize: 26 }}>{emoji}</Text>
                                    </TouchableOpacity>
                                ))}
                            </View>
                            <View style={styles.menuActionsVertical}>
                                <TouchableOpacity style={styles.menuActionVertical} onPress={() => { setReplyingToMsg(selectedMsg); setSelectedMsg(null); }}>
                                    <Ionicons name="arrow-undo-outline" size={22} color="#8b5cf6" />
                                    <Text style={styles.menuActionLabel}>Responder</Text>
                                </TouchableOpacity>
                                <TouchableOpacity 
                                    style={styles.menuActionVertical} 
                                    onPress={async () => { 
                                        if (selectedMsg?.text) {
                                            await Clipboard.setStringAsync(selectedMsg.text);
                                            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                                        }
                                        setSelectedMsg(null); 
                                    }}
                                >
                                    <Ionicons name="copy-outline" size={22} color={theme.colors.secondary} />
                                    <Text style={styles.menuActionLabel}>Copiar</Text>
                                </TouchableOpacity>
                                <TouchableOpacity style={styles.menuActionVertical} onPress={() => { toggleSelect(selectedMsg.id); setSelectedMsg(null); }}>
                                    <Ionicons name="checkmark-circle-outline" size={22} color="#3b82f6" />
                                    <Text style={styles.menuActionLabel}>Seleccionar</Text>
                                </TouchableOpacity>
                                {selectedMsg?.sender_id === user?.id && (
                                    <TouchableOpacity style={[styles.menuActionVertical, { borderBottomWidth: 0 }]} onPress={() => {
                                        supabase.from('messages').delete().eq('id', selectedMsg.id).then(() => setSelectedMsg(null));
                                    }}>
                                        <Ionicons name="trash-outline" size={22} color="#ef4444" />
                                        <Text style={[styles.menuActionLabel, { color: '#ef4444' }]}>Eliminar</Text>
                                    </TouchableOpacity>
                                )}
                            </View>
                            <TouchableOpacity style={styles.menuCancel} onPress={() => setSelectedMsg(null)}>
                                <Text style={styles.menuCancelText}>Cancelar</Text>
                            </TouchableOpacity>
                        </Animated.View>
                    </TouchableOpacity>
                </Modal>
            </KeyboardAvoidingView>
        </GestureHandlerRootView>
    );
}

const BG_CHAT = '#ECE5DD';

const styles = StyleSheet.create({
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
    summaryBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
    summarySheet: { backgroundColor: theme.colors.white, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24, maxHeight: '80%' },
    summaryHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 20, gap: 10 },
    summaryTitle: { fontSize: 18, fontWeight: '700', flex: 1 },
    summaryScroll: { marginBottom: 20 },
    summaryContent: { fontSize: 15, lineHeight: 22, color: theme.colors.text.primary },
    summaryDoneBtn: { backgroundColor: theme.colors.secondary, borderRadius: 12, padding: 16, alignItems: 'center' },
    summaryDoneText: { color: theme.colors.white, fontWeight: '700' },
    menuBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
    menuSheet: { backgroundColor: theme.colors.white, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 20 },
    menuEmojiRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 20, paddingHorizontal: 10 },
    emojiBtn: { padding: 8 },
    menuActionsVertical: { backgroundColor: '#f9fafb', borderRadius: 16, overflow: 'hidden', marginBottom: 15 },
    menuActionVertical: { flexDirection: 'row', alignItems: 'center', padding: 16, gap: 12, borderBottomWidth: 1, borderBottomColor: theme.colors.border },
    menuActionLabel: { fontSize: 16, color: theme.colors.text.primary, fontWeight: '500' },
    menuCancel: { alignItems: 'center', padding: 16 },
    menuCancelText: { fontSize: 16, fontWeight: '600', color: theme.colors.secondary },
    selectBar: { position: 'absolute', top: 0, left: 0, right: 0, backgroundColor: theme.colors.primary, height: 60, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 15, zIndex: 1000 },
    selectBarBtn: { padding: 8 },
    selectBarText: { flex: 1, color: theme.colors.white, fontSize: 16, fontWeight: '700', textAlign: 'center' },
    selectBarForward: { padding: 8 },
    selectBarDelete: { flexDirection: 'row', alignItems: 'center', gap: 5, padding: 8, backgroundColor: 'rgba(239, 68, 68, 0.2)', borderRadius: 8 },
    selectBarDeleteText: { color: theme.colors.danger, fontWeight: '700' },
    replyPreview: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 15,
        paddingVertical: 10,
        backgroundColor: '#f9fafb',
        borderTopWidth: 1,
        borderTopColor: theme.colors.border,
    },
    replyPreviewContent: { flex: 1, borderLeftWidth: 3, borderLeftColor: theme.colors.whatsapp.teal, paddingLeft: 10 },
    replyPreviewName: { fontSize: 13, fontWeight: '700', color: theme.colors.whatsapp.teal, marginBottom: 2 },
    replyPreviewText: { fontSize: 13, color: theme.colors.text.secondary },
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
