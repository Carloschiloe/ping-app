import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
    View, Text, TextInput, TouchableOpacity, FlatList,
    KeyboardAvoidingView, Platform, ActivityIndicator, StyleSheet,
    StatusBar, Image, Alert, Pressable, Modal, Share, Animated, Clipboard, Linking, ScrollView
} from 'react-native';
import { useRoute } from '@react-navigation/native';
import * as ImagePicker from 'expo-image-picker';
import * as DocumentPicker from 'expo-document-picker';
import { Audio, Video, ResizeMode } from 'expo-av';
import { Ionicons } from '@expo/vector-icons';
import { useConversationMessages, useSendConversationMessage, useReactToMessage } from '../api/queries';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../lib/supabase';
import AudioPlayer from '../components/AudioPlayer';

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
import { uploadToSupabase } from '../lib/upload';

// ─── Component ──────────────────────────────────────────────────────────────

export default function ChatScreen({ navigation }: any) {
    const route = useRoute<any>();
    const { conversationId, otherUser, isSelf, isGroup, groupMetadata } = route.params;
    const [text, setText] = useState('');
    const [recording, setRecording] = useState<Audio.Recording | null>(null);
    const [isRecording, setIsRecording] = useState(false);
    const [sendingMedia, setSendingMedia] = useState(false);
    const [selectedMsg, setSelectedMsg] = useState<any>(null);      // context menu
    const [replyingToMsg, setReplyingToMsg] = useState<any>(null);  // reply state
    const [viewerMedia, setViewerMedia] = useState<{ url: string, type: 'image' | 'video' } | null>(null); // fullscreen
    const [multiSelect, setMultiSelect] = useState<string[]>([]);   // bulk select IDs
    const isMultiSelecting = multiSelect.length > 0;
    const menuAnim = useRef(new Animated.Value(300)).current;

    // Presence state
    const [typingUsers, setTypingUsers] = useState<string[]>([]);
    const presenceChannel = useRef<any>(null);
    let typingTimeout = useRef<NodeJS.Timeout | null>(null);

    const { data, isLoading, refetch } = useConversationMessages(conversationId);
    const { mutate: sendMessage, isPending } = useSendConversationMessage(conversationId);
    const { mutate: reactToMessage } = useReactToMessage(conversationId);
    const [viewingReactionsMsg, setViewingReactionsMsg] = useState<any>(null);
    const [highlightedMsgId, setHighlightedMsgId] = useState<string | null>(null);
    const listRef = useRef<FlatList>(null);

    const { user } = useAuth();
    const messages = data?.messages || [];

    const chatTitle = isSelf ? '📌 Mis Recordatorios' : (isGroup ? (groupMetadata?.name || otherUser?.email) : (otherUser?.email?.split('@')[0] || 'Chat'));
    const avatarUrl = isGroup ? groupMetadata?.avatar_url : otherUser?.avatar_url;

    // ─── Presence Channel ──────────────────────────────────────────────────
    useEffect(() => {
        if (!conversationId || !user) return;

        const channel = supabase.channel(`presence-${conversationId}`, {
            config: { presence: { key: user.id } },
        });

        channel
            .on('presence', { event: 'sync' }, () => {
                const state = channel.presenceState();
                const activeTypers: string[] = [];
                Object.keys(state).forEach((key) => {
                    if (key !== user.id) {
                        const presenceData: any = state[key][0];
                        if (presenceData?.typing) {
                            activeTypers.push(presenceData.email || 'Alguien');
                        }
                    }
                });
                setTypingUsers(activeTypers);
            })
            .subscribe();

        presenceChannel.current = channel;

        // ─── Reactions & Messages Realtime ───
        const reactionsChannel = supabase
            .channel(`reactions-${conversationId}`)
            .on('postgres_changes', {
                event: '*',
                schema: 'public',
                table: 'message_reactions'
            }, () => {
                refetch(); // Invalidate and refetch everything when any reaction changes
            })
            .on('postgres_changes', {
                event: '*',
                schema: 'public',
                table: 'messages',
                filter: `conversation_id=eq.${conversationId}`
            }, () => {
                refetch();
            })
            .subscribe();

        return () => {
            channel.unsubscribe();
            reactionsChannel.unsubscribe();
        };
    }, [conversationId, user, refetch]);

    // ─── Build flat list with date dividers ───
    const flatData: any[] = [];
    (() => {
        const reversed = [...messages].reverse();
        let currentDate = '';
        for (const msg of reversed) {
            const dateKey = new Date(msg.created_at).toDateString();
            if (dateKey !== currentDate) {
                currentDate = dateKey;
                flatData.push({ type: 'divider', date: formatDateDivider(msg.created_at), id: `d-${msg.created_at}` });
            }
            flatData.push({ ...msg, type: 'message' });
        }
        flatData.reverse();
    })();

    // ─── Scroll to Message ──────────────────────────────────────────────────
    useEffect(() => {
        if (route.params?.scrollToMessageId && messages.length > 0 && flatData.length > 0) {
            const index = flatData.findIndex(msg => msg.id === route.params.scrollToMessageId);
            if (index !== -1) {
                setHighlightedMsgId(route.params.scrollToMessageId);
                setTimeout(() => {
                    listRef.current?.scrollToIndex({ index, animated: true, viewPosition: 0.5 });
                }, 100);

                // Clear highlights and params after some time
                setTimeout(() => {
                    setHighlightedMsgId(null);
                    navigation.setParams({ scrollToMessageId: undefined });
                }, 3000);
            }
        }
    }, [route.params?.scrollToMessageId, messages.length, flatData.length]);

    const broadcastTyping = (isTyping: boolean) => {
        if (!presenceChannel.current || !user) return;
        presenceChannel.current.track({
            email: user.email?.split('@')[0] || 'Un usuario',
            typing: isTyping,
        });
    };

    const handleTextChange = (newText: string) => {
        setText(newText);

        // Broadcast typing = true
        broadcastTyping(true);

        // Auto-clear typing status after 2 seconds of inactivity
        if (typingTimeout.current) clearTimeout(typingTimeout.current);
        typingTimeout.current = setTimeout(() => {
            broadcastTyping(false);
        }, 2000);
    };

    React.useLayoutEffect(() => {
        navigation.setOptions({
            headerTitle: () => (
                <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                    {avatarUrl ? (
                        <View style={{ width: 32, height: 32, borderRadius: 16, overflow: 'hidden', marginRight: 10 }}>
                            <Image source={{ uri: avatarUrl }} style={{ width: '100%', height: '100%' }} />
                        </View>
                    ) : null}
                    <Text style={{ color: 'white', fontSize: 18, fontWeight: '700', paddingRight: avatarUrl ? 40 : 10 }} numberOfLines={1}>{chatTitle}</Text>
                </View>
            ),
            headerRight: () => (
                <TouchableOpacity onPress={() => navigation.navigate('ChatInfo', { conversationId, isGroup, groupMetadata, otherUser, isSelf })}>
                    <Ionicons name="ellipsis-vertical" size={24} color="white" />
                </TouchableOpacity>
            ),
            title: chatTitle, // fallback
        });
    }, [navigation, chatTitle, avatarUrl, conversationId, isGroup, groupMetadata, otherUser, isSelf]);

    // ─── Context Menu ────────────────────────────────────────────────────────

    const openMenu = useCallback((item: any) => {
        setSelectedMsg(item);
        Animated.spring(menuAnim, { toValue: 0, useNativeDriver: true, tension: 70, friction: 8 }).start();
    }, [menuAnim]);

    const closeMenu = useCallback(() => {
        Animated.timing(menuAnim, { toValue: 300, duration: 180, useNativeDriver: true }).start(() => {
            setSelectedMsg(null);
        });
    }, [menuAnim]);

    const handleCopy = () => {
        const t = selectedMsg?.text || '';
        const clean = t.match(/^\[(imagen|audio|video)\]/) ? '📷 Contenido multimedia' : t;
        Clipboard.setString(clean);
        closeMenu();
    };

    const handleReply = () => {
        setReplyingToMsg(selectedMsg);
        closeMenu();
    };

    const handleEdit = () => {
        const t = selectedMsg?.text || '';
        if (t.match(/^\[(imagen|audio|video)\]/)) { closeMenu(); return; }
        setText(t);
        closeMenu();
    };

    const handleDelete = () => {
        Alert.alert(
            'Eliminar mensaje',
            '¿Eliminar este mensaje para todos?',
            [
                { text: 'Cancelar', style: 'cancel', onPress: closeMenu },
                {
                    text: 'Eliminar', style: 'destructive', onPress: async () => {
                        closeMenu();
                        const { error } = await supabase.from('messages').delete().eq('id', selectedMsg?.id);
                        if (error) Alert.alert('Error', 'No se pudo eliminar el mensaje.');
                        else refetch();
                    }
                }
            ]
        );
    };

    const handleForward = () => {
        const t = selectedMsg?.text || '';
        const clean = t.startsWith('[imagen]') ? t.slice(8) : t.startsWith('[audio]') ? t.slice(7) : t.startsWith('[video]') ? t.slice(7) : t;
        closeMenu();
        // Wait for modal to close before opening system share sheet
        setTimeout(() => Share.share({ message: clean }), 350);
    };

    const handleSelect = () => {
        const id = selectedMsg?.id;
        closeMenu();
        if (id) setTimeout(() => setMultiSelect([id]), 200);
    };

    const isMyMessage = selectedMsg && (selectedMsg.sender_id || selectedMsg.user_id) === user?.id;
    const isTextMsg = selectedMsg && !selectedMsg.text?.match(/^\[(imagen|audio|video)\]/);

    // ─── Multi-select delete ─────────────────────────────────────────────────────

    const toggleSelect = (id: string) => {
        setMultiSelect(prev =>
            prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
        );
    };

    const cancelMultiSelect = () => setMultiSelect([]);

    const deleteSelected = () => {
        Alert.alert(
            `Eliminar ${multiSelect.length} mensaje(s)`,
            '¿Eliminar para todos?',
            [
                { text: 'Cancelar', style: 'cancel' },
                {
                    text: 'Eliminar', style: 'destructive', onPress: async () => {
                        await supabase.from('messages').delete().in('id', multiSelect);
                        setMultiSelect([]);
                        refetch();
                    }
                }
            ]
        );
    };

    const forwardSelected = async () => {
        const selectedMsgs = messages.filter((m: any) => multiSelect.includes(m.id)).reverse();
        const combinedText = selectedMsgs.map((m: any) => {
            const t = m.text || '';
            if (t.startsWith('[imagen]')) return t.slice(8);
            if (t.startsWith('[audio]')) return t.slice(7);
            if (t.startsWith('[video]')) return t.slice(7);
            return t;
        }).join('\n\n');

        cancelMultiSelect();
        // Short delay to avoid UI stutter when dismissing the bar and opening Share
        setTimeout(() => Share.share({ message: combinedText }), 200);
    };

    // ─── Send text ───────────────────────────────────────────────────────────

    const handleSend = () => {
        if (!text.trim()) return;
        sendMessage({ text, reply_to_id: replyingToMsg?.id }, { onSuccess: () => { setText(''); setReplyingToMsg(null); } });
    };

    // ─── Photo/Video picker ──────────────────────────────────────────────────

    const pickMediaSource = () => {
        Alert.alert(
            'Enviar archivo',
            '¿Qué quieres enviar?',
            [
                { text: '📷 Cámara (Foto o Video)', onPress: () => openCamera() },
                { text: '🖼️ Galería (Foto o Video)', onPress: () => openGallery() },
                { text: '📄 Documento (PDF, Word, Excel...)', onPress: () => openDocumentPicker() },
                { text: 'Cancelar', style: 'cancel' },
            ]
        );
    };

    const openDocumentPicker = async () => {
        try {
            const result = await DocumentPicker.getDocumentAsync({
                type: '*/*',
                copyToCacheDirectory: true,
            });

            if (result.canceled || !result.assets || result.assets.length === 0) return;

            const asset = result.assets[0];
            setSendingMedia(true);
            const url = await uploadToSupabase(asset.uri, 'chat-media', asset.mimeType || 'application/octet-stream', asset.name);
            setSendingMedia(false);

            if (url) {
                sendMessage({ text: `[document=${asset.name}]${url}`, reply_to_id: replyingToMsg?.id }, { onSuccess: () => setReplyingToMsg(null) });
            } else {
                Alert.alert('Error', 'No se pudo subir el documento.');
            }
        } catch (err) {
            setSendingMedia(false);
            Alert.alert('Error', 'Hubo un problema al seleccionar el documento.');
        }
    };

    const openGallery = async () => {
        const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (status !== 'granted') {
            Alert.alert('Permiso denegado', 'Necesitamos acceso a tu galería.');
            return;
        }
        const result = await ImagePicker.launchImageLibraryAsync({
            mediaTypes: ImagePicker.MediaTypeOptions.All,
            quality: 0.7,
            videoMaxDuration: 120,
        });
        if (result.canceled || !result.assets[0]) return;
        await uploadAndSendMedia(result.assets[0]);
    };

    const openCamera = async () => {
        const { status } = await ImagePicker.requestCameraPermissionsAsync();
        if (status !== 'granted') {
            Alert.alert('Permiso denegado', 'Necesitamos acceso a la cámara.');
            return;
        }
        const result = await ImagePicker.launchCameraAsync({
            mediaTypes: ImagePicker.MediaTypeOptions.All,
            quality: 0.7,
            videoMaxDuration: 120,
        });
        if (result.canceled || !result.assets[0]) return;
        await uploadAndSendMedia(result.assets[0]);
    };

    const uploadAndSendMedia = async (asset: any) => {
        setSendingMedia(true);
        const isVideo = asset.type === 'video' || asset.uri.endsWith('.mp4') || asset.uri.endsWith('.mov');
        const mimeType = isVideo ? 'video/mp4' : 'image/jpeg';
        const url = await uploadToSupabase(asset.uri, 'chat-media', mimeType);
        setSendingMedia(false);
        if (url) {
            sendMessage({ text: `[${isVideo ? 'video' : 'imagen'}]${url}`, reply_to_id: replyingToMsg?.id }, { onSuccess: () => setReplyingToMsg(null) });
        } else {
            Alert.alert('Error', 'No se pudo subir el archivo.');
        }
    };

    // ─── Audio recorder ──────────────────────────────────────────────────────

    const startRecording = async () => {
        if (isRecording || recording) return; // guard: only one at a time
        try {
            const { status } = await Audio.requestPermissionsAsync();
            if (status !== 'granted') {
                Alert.alert('Permiso denegado', 'Necesitamos acceso al micrófono.');
                return;
            }
            await Audio.setAudioModeAsync({ allowsRecordingIOS: true, playsInSilentModeIOS: true });

            // Broadcast recording status
            broadcastTyping(true);

            const { recording: rec } = await Audio.Recording.createAsync(
                Audio.RecordingOptionsPresets.HIGH_QUALITY
            );
            setRecording(rec);
            setIsRecording(true);
        } catch (e) {
            console.error('[Audio]', e);
            setIsRecording(false);
        }
    };

    const stopRecording = async () => {
        if (!recording || !isRecording) return;
        setIsRecording(false);
        try {
            await recording.stopAndUnloadAsync();
            const uri = recording.getURI();
            setRecording(null);
            if (!uri) return;
            setSendingMedia(true);
            const url = await uploadToSupabase(uri, 'chat-media', 'audio/m4a');
            setSendingMedia(false);
            if (url) {
                sendMessage({ text: `[audio]${url}`, reply_to_id: replyingToMsg?.id }, { onSuccess: () => setReplyingToMsg(null) });
            } else Alert.alert('Error', 'No se pudo subir el audio.');
        } catch (e) {
            console.error('[Audio stop]', e);
            setRecording(null);
        }
    };

    // ─── Render message ──────────────────────────────────────────────────────

    const renderMessage = ({ item }: { item: any }) => {
        if (item.type === 'divider') {
            return (
                <View style={styles.dateDivider}>
                    <Text style={styles.dateDividerText}>{item.date}</Text>
                </View>
            );
        }

        const isSystem = item.meta?.isSystem;
        const isMe = (item.sender_id || item.user_id) === user?.id && !isSystem;
        const time = formatTime(item.created_at);
        const msgText: string = item.text || '';

        if (isMe && item.message_reactions?.length > 0) {
            // No log
        }

        if (isSystem) {
            return (
                <View style={styles.systemWrap}>
                    <View style={styles.systemBubble}>
                        <Text style={styles.systemText}>{msgText}</Text>
                    </View>
                </View>
            );
        }

        let isImage = msgText.startsWith('[imagen]');
        const isAudio = msgText.startsWith('[audio]');
        let isVideo = msgText.startsWith('[video]');
        const isDocument = msgText.startsWith('[document=');

        let mediaUrl = null;
        let documentName = '';
        if (isImage) mediaUrl = msgText.slice(8);
        else if (isAudio) mediaUrl = msgText.slice(7);
        else if (isVideo) mediaUrl = msgText.slice(7);
        else if (isDocument) {
            const match = msgText.match(/^\[document=([^\]]+)\](.*)$/);
            if (match) {
                documentName = match[1];
                mediaUrl = match[2];
            }
        }

        // Backward compatibility: old videos were saved as [imagen]URL.mp4
        if (isImage && mediaUrl && (mediaUrl.toLowerCase().includes('.mp4') || mediaUrl.toLowerCase().includes('.mov'))) {
            isImage = false;
            isVideo = true;
        }
        const isSelected = multiSelect.includes(item.id);

        const handlePress = () => {
            if (isMultiSelecting) { toggleSelect(item.id); return; }
            if (isImage && mediaUrl) { setViewerMedia({ url: mediaUrl, type: 'image' }); }
            if (isVideo && mediaUrl) { setViewerMedia({ url: mediaUrl, type: 'video' }); }
            if (isDocument && mediaUrl) { Linking.openURL(mediaUrl); }
        };

        const handleLongPress = () => {
            if (isMultiSelecting) { toggleSelect(item.id); return; }
            // Enter multi-select mode OR show context menu
            if (!isMultiSelecting) {
                openMenu(item);
            }
        };

        return (
            <View key={item.id} style={[styles.msgRow, isMe ? styles.msgRowMe : styles.msgRowThem, { marginBottom: (item.message_reactions?.length > 0) ? 14 : 2 }]}>
                {isMultiSelecting && (
                    <TouchableOpacity onPress={() => toggleSelect(item.id)} style={styles.checkbox}>
                        <View style={[styles.checkCircle, isSelected && styles.checkCircleOn]}>
                            {isSelected && <Ionicons name="checkmark" size={14} color="white" />}
                        </View>
                    </TouchableOpacity>
                )}

                <View style={{ maxWidth: '80%', position: 'relative' }}>
                    <TouchableOpacity
                        activeOpacity={0.85}
                        onPress={handlePress}
                        onLongPress={handleLongPress}
                        delayLongPress={350}
                        style={[
                            styles.bubble,
                            isMe ? styles.bubbleMe : styles.bubbleThem,
                            (isImage || isVideo || isAudio) && styles.bubbleMedia,
                            isSelected && styles.bubbleSelected,
                            { overflow: 'hidden' }
                        ]}
                    >
                        {/* ─── Quoted Message (Reply) ─── */}
                        {item.reply_to && !Array.isArray(item.reply_to) && (
                            <View style={[styles.quotedContainer, isMe ? styles.quotedMe : styles.quotedThem]}>
                                <Text style={[styles.quotedName, isMe ? { color: 'white' } : { color: '#8b5cf6' }]} numberOfLines={1}>
                                    {(() => {
                                        const p = Array.isArray(item.reply_to.profiles) ? item.reply_to.profiles[0] : item.reply_to.profiles;
                                        return (p?.email || 'Usuario').split('@')[0];
                                    })()}
                                </Text>
                                <Text style={[styles.quotedText, isMe ? { color: 'rgba(255,255,255,0.8)' } : { color: '#4b5563' }]} numberOfLines={1}>
                                    {item.reply_to.text || 'Sin texto'}
                                </Text>
                            </View>
                        )}

                        {!isMe && !isSystem && !isImage && !isAudio && !isVideo && !isDocument && (
                            <Text style={[styles.senderName, item.reply_to && { marginTop: -2, marginBottom: 0 }]} numberOfLines={1}>
                                {isGroup
                                    ? (item.profiles?.email?.split('@')[0] || 'Miembro')
                                    : (otherUser?.email?.split('@')[0] || 'Usuario')
                                }
                            </Text>
                        )}

                        {isImage && mediaUrl ? (
                            <Image
                                source={{ uri: mediaUrl }}
                                style={styles.msgImage}
                                resizeMode="cover"
                            />
                        ) : isVideo && mediaUrl ? (
                            <View style={styles.inlineVideoWrap} pointerEvents="none">
                                <Video
                                    source={{ uri: mediaUrl }}
                                    style={styles.msgImage}
                                    useNativeControls={false}
                                    shouldPlay={false}
                                    isMuted={true}
                                    resizeMode={ResizeMode.COVER}
                                />
                                <View style={styles.videoPlayOverlay}>
                                    <Ionicons name="play-circle" size={48} color="white" />
                                </View>
                            </View>
                        ) : isAudio && mediaUrl ? (
                            <AudioPlayer url={mediaUrl} isMe={isMe} />
                        ) : isDocument && mediaUrl ? (
                            <View style={styles.documentBubble}>
                                <View style={[styles.docIconWrap, isMe ? { backgroundColor: 'rgba(255,255,255,0.2)' } : { backgroundColor: '#e5e7eb' }]}>
                                    <Ionicons name="document-text" size={24} color={isMe ? 'white' : '#6b7280'} />
                                </View>
                                <View style={{ flex: 1 }}>
                                    <Text style={[styles.msgText, isMe ? styles.msgTextMe : styles.msgTextThem, { fontWeight: '500' }]} numberOfLines={1}>{documentName}</Text>
                                    <Text style={[styles.timeText, isMe ? styles.timeMe : styles.timeThem, { fontSize: 10 }]}>Documento</Text>
                                </View>
                            </View>
                        ) : (
                            <Text style={[styles.msgText, isMe ? styles.msgTextMe : styles.msgTextThem]}>
                                {msgText}
                            </Text>
                        )}

                        <View style={styles.metaRow}>
                            {/* Pro-active Debug Info: R for ReplyTo, RT for Reactions Count */}
                            {item.reply_to_id && <Text style={{ fontSize: 8, color: isMe ? 'rgba(255,255,255,0.5)' : '#9ca3af', marginRight: 4 }}>R</Text>}
                            <Text style={[styles.timeText, isMe ? styles.timeMe : styles.timeThem]}>{time}</Text>
                            {isMe && <Text style={styles.readTick}> ✓✓</Text>}
                        </View>
                    </TouchableOpacity>

                    {/* ─── Reactions (Pinned to bubble corner) ─── */}
                    {item.message_reactions && item.message_reactions.length > 0 && (
                        <View style={[styles.reactionsContainer, isMe ? styles.reactionsMe : styles.reactionsThem]}>
                            {(() => {
                                const counts = item.message_reactions.reduce((acc: any, r: any) => {
                                    acc[r.emoji] = (acc[r.emoji] || 0) + 1;
                                    return acc;
                                }, {});
                                return Object.keys(counts).map(emoji => (
                                    <TouchableOpacity
                                        key={emoji}
                                        style={styles.reactionPill}
                                        onPress={() => setViewingReactionsMsg(item)}
                                    >
                                        <Text style={{ fontSize: 13 }}>{emoji}</Text>
                                        {counts[emoji] > 1 && <Text style={styles.reactionCount}>{counts[emoji]}</Text>}
                                    </TouchableOpacity>
                                ));
                            })()}
                        </View>
                    )}
                </View>
                {highlightedMsgId === item.id && (
                    <Animated.View style={{ ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(59, 130, 246, 0.2)', borderRadius: 12 }} />
                )}
            </View>
        );
    };

    const renderReactionDetailsModal = () => {
        if (!viewingReactionsMsg) return null;

        return (
            <Modal
                transparent
                visible={!!viewingReactionsMsg}
                animationType="fade"
                onRequestClose={() => setViewingReactionsMsg(null)}
            >
                <TouchableOpacity
                    style={styles.menuBackdrop}
                    activeOpacity={1}
                    onPress={() => setViewingReactionsMsg(null)}
                >
                    <View style={[styles.menuSheet, { maxHeight: '60%' }]}>
                        <View style={{ padding: 20, borderBottomWidth: 1, borderBottomColor: '#f1f5f9', alignItems: 'center' }}>
                            <Text style={{ fontSize: 18, fontWeight: '700', color: '#1e3a5f' }}>Reacciones</Text>
                        </View>
                        <ScrollView style={{ paddingHorizontal: 20 }}>
                            {viewingReactionsMsg.message_reactions.map((r: any, idx: number) => {
                                const profile = Array.isArray(r.profiles) ? r.profiles[0] : r.profiles;
                                const email = profile?.email || '';
                                const name = email ? email.split('@')[0] : 'Usuario';

                                return (
                                    <View key={idx} style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#f1f5f9' }}>
                                        <Text style={{ fontSize: 24, marginRight: 15 }}>{r.emoji}</Text>
                                        <View style={{ flex: 1 }}>
                                            <Text style={{ fontSize: 16, fontWeight: '600', color: '#374151' }}>
                                                {name}
                                            </Text>
                                            {email ? <Text style={{ fontSize: 13, color: '#6b7280' }}>{email}</Text> : null}
                                        </View>
                                    </View>
                                );
                            })}
                        </ScrollView>
                        <TouchableOpacity
                            style={styles.menuCancel}
                            onPress={() => setViewingReactionsMsg(null)}
                        >
                            <Text style={styles.menuCancelText}>Cerrar</Text>
                        </TouchableOpacity>
                    </View>
                </TouchableOpacity>
            </Modal>
        );
    };


    // ─── Render ──────────────────────────────────────────────────────────────

    return (
        <KeyboardAvoidingView
            behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
            style={styles.container}
            keyboardVerticalOffset={90}
        >
            <StatusBar barStyle="light-content" />

            {/* Typing Indicator */}
            {typingUsers.length > 0 && (
                <View style={styles.typingIndicatorContainer}>
                    <Text style={styles.typingIndicatorText}>
                        {typingUsers.join(', ')} {typingUsers.length > 1 ? 'están' : 'está'} escribiendo...
                    </Text>
                </View>
            )}

            {renderReactionDetailsModal()}

            <View style={styles.chatBg}>
                {isLoading ? (
                    <ActivityIndicator style={{ marginTop: 40 }} size="large" color="#1e3a5f" />
                ) : messages.length === 0 ? (
                    <View style={styles.emptyChat}>
                        <Text style={styles.emptyChatIcon}>💬</Text>
                        <Text style={styles.emptyChatText}>
                            {isSelf ? 'Anota tus recordatorios aquí' : 'Empieza la conversación'}
                        </Text>
                    </View>
                ) : (
                    <FlatList
                        ref={listRef}
                        data={flatData}
                        inverted
                        keyExtractor={(item) => item.id}
                        renderItem={renderMessage}
                        showsVerticalScrollIndicator={false}
                        contentContainerStyle={{ paddingVertical: 12, paddingHorizontal: 10 }}
                        onScrollToIndexFailed={(info) => {
                            listRef.current?.scrollToOffset({ offset: info.averageItemLength * info.index, animated: true });
                        }}
                    />
                )}
            </View>

            {/* Reply Preview */}
            {replyingToMsg && (
                <View style={styles.replyPreviewBar}>
                    <View style={{ flex: 1 }}>
                        <Text style={styles.replyPreviewName}>
                            {replyingToMsg.profiles?.email?.split('@')[0] || (replyingToMsg.user_id === user?.id ? 'Tú' : 'Alguien')}
                        </Text>
                        <Text style={styles.replyPreviewText} numberOfLines={1}>
                            {(() => {
                                const t = replyingToMsg.text || '';
                                if (t.startsWith('[imagen]')) return '📷 Imagen';
                                if (t.startsWith('[video]')) return '📹 Video';
                                if (t.startsWith('[audio]')) return '🎤 Audio';
                                if (t.startsWith('[document=')) return '📄 Documento';
                                return t;
                            })()}
                        </Text>
                    </View>
                    <TouchableOpacity onPress={() => setReplyingToMsg(null)} style={{ padding: 4 }}>
                        <Ionicons name="close-circle" size={24} color="#9ca3af" />
                    </TouchableOpacity>
                </View>
            )}

            {/* Input bar */}
            <View style={styles.inputBar}>
                <TouchableOpacity style={styles.mediaBtn} onPress={pickMediaSource} disabled={sendingMedia || isPending}>
                    <Ionicons name="image-outline" size={24} color="#6b7280" />
                </TouchableOpacity>
                <TextInput
                    style={styles.input}
                    placeholder={isSelf ? 'Escribe un recordatorio...' : 'Escribe un mensaje...'}
                    placeholderTextColor="#9ca3af"
                    value={text}
                    onChangeText={setText}
                    multiline
                />
                {text.trim() ? (
                    <TouchableOpacity style={[styles.sendBtn, isPending && styles.sendDisabled]} onPress={handleSend} disabled={isPending}>
                        {isPending ? <ActivityIndicator size="small" color="white" /> : <Ionicons name="send" size={18} color="white" />}
                    </TouchableOpacity>
                ) : sendingMedia ? (
                    <View style={styles.sendBtn}><ActivityIndicator size="small" color="white" /></View>
                ) : (
                    <Pressable style={[styles.sendBtn, isRecording && styles.recordingBtn]} onPressIn={startRecording} onPressOut={stopRecording}>
                        <Ionicons name={isRecording ? 'radio-button-on' : 'mic'} size={20} color="white" />
                    </Pressable>
                )}
            </View>

            {/* Multi-select top bar */}
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

            {isRecording && (
                <View style={styles.recordingBar}>
                    <Text style={styles.recordingText}>🎤 Grabando... suelta para enviar</Text>
                </View>
            )}

            {/* ─── Fullscreen Media Viewer ────────────────────────── */}
            <Modal visible={!!viewerMedia} transparent animationType="fade" onRequestClose={() => setViewerMedia(null)}>
                <View style={styles.viewerBackdrop}>
                    {viewerMedia?.type === 'video' ? (
                        <Video
                            source={{ uri: viewerMedia.url }}
                            style={styles.viewerImage}
                            useNativeControls
                            shouldPlay
                            resizeMode={ResizeMode.CONTAIN}
                        />
                    ) : (
                        <TouchableOpacity style={{ flex: 1, width: '100%' }} activeOpacity={1} onPress={() => setViewerMedia(null)}>
                            <Image
                                source={{ uri: viewerMedia?.url || '' }}
                                style={styles.viewerImage}
                                resizeMode="contain"
                            />
                        </TouchableOpacity>
                    )}
                    <TouchableOpacity style={styles.viewerClose} onPress={() => setViewerMedia(null)}>
                        <Ionicons name="close-circle" size={36} color="rgba(255,255,255,0.9)" />
                    </TouchableOpacity>
                </View>
            </Modal>

            {/* ─── Context Menu Modal ──────────────────────────────── */}
            <Modal visible={!!selectedMsg} transparent animationType="none" onRequestClose={closeMenu}>
                <TouchableOpacity style={styles.menuBackdrop} activeOpacity={1} onPress={closeMenu}>
                    <Animated.View style={[styles.menuSheet, { transform: [{ translateY: menuAnim }] }]}>
                        {/* Message preview */}
                        <View style={styles.menuPreview}>
                            <Text style={styles.menuPreviewText} numberOfLines={2}>
                                {(() => {
                                    const t = selectedMsg?.text || '';
                                    if (t.startsWith('[imagen]')) return '📷 Imagen';
                                    if (t.startsWith('[video]')) return '📹 Video';
                                    if (t.startsWith('[audio]')) return '🎤 Audio';
                                    return t;
                                })()}
                            </Text>
                        </View>

                        {/* Actions List (Vertical) */}
                        <View style={styles.menuActionsVertical}>
                            {/* Emojis row */}
                            <View style={styles.menuEmojiRow}>
                                {['👍', '❤️', '😂', '😮', '😢', '🙏'].map(emoji => (
                                    <TouchableOpacity
                                        key={emoji}
                                        style={styles.emojiBtn}
                                        onPress={() => { reactToMessage({ messageId: selectedMsg.id, emoji }); closeMenu(); }}
                                    >
                                        <Text style={{ fontSize: 26 }}>{emoji}</Text>
                                    </TouchableOpacity>
                                ))}
                            </View>

                            <TouchableOpacity style={styles.menuActionVertical} onPress={handleReply}>
                                <Ionicons name="arrow-undo-outline" size={22} color="#8b5cf6" style={styles.menuActionIcon} />
                                <Text style={styles.menuActionLabel}>Responder</Text>
                            </TouchableOpacity>

                            <TouchableOpacity style={styles.menuActionVertical} onPress={handleCopy}>
                                <Ionicons name="copy-outline" size={22} color="#6366f1" style={styles.menuActionIcon} />
                                <Text style={styles.menuActionLabel}>Copiar</Text>
                            </TouchableOpacity>

                            {isMyMessage && isTextMsg && (
                                <TouchableOpacity style={styles.menuActionVertical} onPress={handleEdit}>
                                    <Ionicons name="pencil-outline" size={22} color="#f59e0b" style={styles.menuActionIcon} />
                                    <Text style={styles.menuActionLabel}>Editar</Text>
                                </TouchableOpacity>
                            )}

                            <TouchableOpacity style={styles.menuActionVertical} onPress={handleForward}>
                                <Ionicons name="arrow-redo-outline" size={22} color="#10b981" style={styles.menuActionIcon} />
                                <Text style={styles.menuActionLabel}>Reenviar</Text>
                            </TouchableOpacity>

                            <TouchableOpacity style={styles.menuActionVertical} onPress={handleSelect}>
                                <Ionicons name="checkmark-circle-outline" size={22} color="#3b82f6" style={styles.menuActionIcon} />
                                <Text style={styles.menuActionLabel}>Seleccionar</Text>
                            </TouchableOpacity>

                            {isMyMessage && (
                                <TouchableOpacity style={[styles.menuActionVertical, { borderBottomWidth: 0 }]} onPress={handleDelete}>
                                    <Ionicons name="trash-outline" size={22} color="#ef4444" style={styles.menuActionIcon} />
                                    <Text style={[styles.menuActionLabel, { color: '#ef4444' }]}>Eliminar</Text>
                                </TouchableOpacity>
                            )}
                        </View>

                        <TouchableOpacity style={styles.menuCancel} onPress={closeMenu}>
                            <Text style={styles.menuCancelText}>Cancelar</Text>
                        </TouchableOpacity>
                    </Animated.View>
                </TouchableOpacity>
            </Modal>
        </KeyboardAvoidingView>
    );
}

// ─── Styles ──────────────────────────────────────────────────────────────────

const BLUE = '#1e3a5f';
const BUBBLE_BLUE = '#0a84ff';
const BG_CHAT = '#ECE5DD';

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: BG_CHAT },
    chatBg: { flex: 1 },

    dateDivider: { alignItems: 'center', marginVertical: 10 },
    dateDividerText: {
        backgroundColor: 'rgba(0,0,0,0.2)', color: 'white',
        fontSize: 12, paddingHorizontal: 12, paddingVertical: 4,
        borderRadius: 10, overflow: 'hidden', fontWeight: '500',
    },

    msgRow: { marginVertical: 2, flexDirection: 'row' },
    msgRowMe: { justifyContent: 'flex-end' },
    msgRowThem: { justifyContent: 'flex-start' },
    bubble: {
        borderRadius: 16, paddingHorizontal: 12,
        paddingTop: 8, paddingBottom: 6,
        shadowColor: '#000', shadowOpacity: 0.08, shadowRadius: 2, elevation: 1,
    },
    bubbleMe: { backgroundColor: BUBBLE_BLUE, borderBottomRightRadius: 4 },
    bubbleThem: { backgroundColor: 'white', borderBottomLeftRadius: 4 },
    bubbleMedia: { padding: 3, overflow: 'hidden' },
    bubbleImage: {
        backgroundColor: 'transparent',
        padding: 0,
        overflow: 'hidden',
    },
    senderName: { fontSize: 12, fontWeight: '700', color: BUBBLE_BLUE, marginBottom: 2, paddingHorizontal: 8, paddingTop: 4 },
    msgText: { fontSize: 15.5, lineHeight: 21 },
    msgTextMe: { color: 'white' },
    msgTextThem: { color: '#111827' },
    metaRow: { flexDirection: 'row', justifyContent: 'flex-end', alignItems: 'center', marginTop: 3, paddingHorizontal: 4 },
    metaRowOverImage: {
        position: 'absolute', bottom: 4, right: 8,
        backgroundColor: 'rgba(0,0,0,0.4)', borderRadius: 8,
        paddingHorizontal: 6, paddingVertical: 2,
    },
    timeText: { fontSize: 11 },
    timeMe: { color: 'rgba(255,255,255,0.7)' },
    timeThem: { color: '#9ca3af' },
    readTick: { fontSize: 11, color: 'rgba(255,255,255,0.85)', marginLeft: 2 },

    // Image message — responsive
    msgImage: { width: 220, height: 220, borderRadius: 10 },
    bubbleImageFrame: { padding: 1, paddingBottom: 1 },
    inlineVideoWrap: { position: 'relative', width: 220, height: 220, borderRadius: 10, overflow: 'hidden' },
    videoPlayOverlay: {
        position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
        backgroundColor: 'rgba(0,0,0,0.3)',
        justifyContent: 'center', alignItems: 'center',
    },

    // Audio player
    audioPlayer: { flexDirection: 'row', alignItems: 'center', padding: 8, gap: 8, minWidth: 180 },
    audioWave: { flexDirection: 'row', alignItems: 'center', gap: 2, flex: 1 },
    audioBar: { width: 3, borderRadius: 2 },
    audioBarMe: { backgroundColor: 'rgba(255,255,255,0.7)' },
    audioBarThem: { backgroundColor: '#0a84ff' },
    audioLabel: { fontSize: 11 },
    audioLabelMe: { color: 'rgba(255,255,255,0.75)' },
    audioLabelThem: { color: '#6b7280' },

    // Document message
    documentBubble: { flexDirection: 'row', alignItems: 'center', minWidth: 200, maxWidth: 260, paddingVertical: 4, paddingRight: 8 },
    docIconWrap: { width: 44, height: 44, borderRadius: 8, alignItems: 'center', justifyContent: 'center', marginRight: 10 },

    // System messages
    systemWrap: { alignItems: 'center', marginVertical: 6 },
    systemBubble: {
        backgroundColor: '#d1fae5', borderRadius: 12,
        paddingHorizontal: 16, paddingVertical: 8,
        borderWidth: 1, borderColor: '#a7f3d0', maxWidth: '90%',
    },
    systemText: { fontSize: 13, color: '#065f46', textAlign: 'center', fontWeight: '500' },

    // Empty state
    emptyChat: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingBottom: 80 },
    emptyChatIcon: { fontSize: 52, marginBottom: 12 },
    emptyChatText: { fontSize: 15, color: '#6b7280' },

    // Input bar
    inputBar: {
        flexDirection: 'row', alignItems: 'flex-end',
        paddingHorizontal: 8, paddingVertical: 8,
        backgroundColor: '#f1f0f0',
        paddingBottom: Platform.OS === 'ios' ? 24 : 8,
        gap: 6,
    },
    mediaBtn: {
        width: 42, height: 42, borderRadius: 21,
        backgroundColor: 'white', alignItems: 'center', justifyContent: 'center',
        shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 2, elevation: 1,
    },
    input: {
        flex: 1, backgroundColor: 'white', borderRadius: 24,
        paddingHorizontal: 16, paddingVertical: 10,
        fontSize: 15.5, maxHeight: 120, color: '#111',
        shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 2, elevation: 1,
    },
    sendBtn: {
        backgroundColor: BUBBLE_BLUE, width: 42, height: 42,
        borderRadius: 21, alignItems: 'center', justifyContent: 'center',
    },
    sendDisabled: { opacity: 0.4 },
    recordingBtn: { backgroundColor: '#ef4444' },
    recordingBar: {
        backgroundColor: '#fef2f2', paddingVertical: 10, alignItems: 'center',
        borderTopWidth: 1, borderTopColor: '#fecaca',
    },
    recordingText: { color: '#dc2626', fontWeight: '600', fontSize: 14 },

    // ─── Multi-select bar ─────────────────────────────────────────────────────
    selectBar: {
        flexDirection: 'row', alignItems: 'center',
        backgroundColor: '#1e3a5f', paddingHorizontal: 16, paddingVertical: 10,
        gap: 10,
    },
    selectBarBtn: { padding: 4 },
    selectBarText: { flex: 1, color: 'white', fontSize: 15, fontWeight: '600' },
    selectBarForward: {
        alignItems: 'center', justifyContent: 'center',
        backgroundColor: '#10b981', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 6,
    },
    selectBarDelete: {
        flexDirection: 'row', alignItems: 'center', gap: 4,
        backgroundColor: '#ef4444', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 6,
    },
    selectBarDeleteText: { color: 'white', fontWeight: '700', fontSize: 13 },

    // ─── Checkboxes ──────────────────────────────────────────────────────────
    checkbox: { justifyContent: 'center', paddingRight: 8, paddingLeft: 2 },
    checkCircle: {
        width: 22, height: 22, borderRadius: 11,
        borderWidth: 2, borderColor: '#9ca3af',
        alignItems: 'center', justifyContent: 'center',
    },
    checkCircleOn: { backgroundColor: '#0a84ff', borderColor: '#0a84ff' },
    bubbleSelected: { opacity: 0.75 },

    // ─── Fullscreen image viewer ───────────────────────────────────────────
    viewerBackdrop: {
        flex: 1, backgroundColor: 'black',
        justifyContent: 'center', alignItems: 'center',
    },
    viewerImage: { width: '100%', height: '100%' },
    viewerClose: { position: 'absolute', top: 48, right: 20 },

    // ─── Context Menu ────────────────────────────────────────────────────────
    menuBackdrop: {
        flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end',
    },
    menuSheet: {
        backgroundColor: '#f9fafb', borderTopLeftRadius: 24, borderTopRightRadius: 24,
        paddingTop: 12, paddingBottom: Platform.OS === 'ios' ? 36 : 20,
        shadowColor: '#000', shadowOpacity: 0.25, shadowRadius: 20, elevation: 20,
    },
    menuPreview: {
        marginHorizontal: 20, marginBottom: 12, padding: 12,
        backgroundColor: 'white', borderRadius: 12,
        borderWidth: 1, borderColor: '#e5e7eb',
    },
    menuPreviewText: { fontSize: 13, color: '#6b7280', fontStyle: 'italic' },

    menuActionsVertical: {
        backgroundColor: 'white',
        marginHorizontal: 20,
        borderRadius: 16,
        overflow: 'hidden',
        borderWidth: 1,
        borderColor: '#e5e7eb',
    },
    menuActionVertical: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: 14,
        paddingHorizontal: 16,
        borderBottomWidth: StyleSheet.hairlineWidth,
        borderBottomColor: '#f3f4f6',
    },
    menuActionIcon: { width: 28, marginRight: 12 },
    menuActionLabel: { fontSize: 16, color: '#374151', fontWeight: '500' },

    menuEmojiRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        paddingHorizontal: 12,
        paddingVertical: 12,
        backgroundColor: '#f9fafb',
        borderBottomWidth: 1,
        borderBottomColor: '#f1f5f9'
    },
    emojiBtn: { padding: 4 },

    menuCancel: {
        marginHorizontal: 20, marginTop: 12, paddingVertical: 14,
        backgroundColor: 'white', borderRadius: 12, alignItems: 'center',
        borderWidth: 1, borderColor: '#e5e7eb',
    },
    menuCancelText: { fontSize: 16, color: '#111', fontWeight: '600' },

    // ─── Typing Indicator ────────────────────────────────────────────────────
    typingIndicatorContainer: {
        backgroundColor: '#f3f4f6',
        paddingHorizontal: 16,
        paddingVertical: 6,
        alignItems: 'center',
        borderBottomWidth: 1,
        borderBottomColor: '#e5e7eb',
    },
    typingIndicatorText: {
        fontSize: 12,
        color: '#6b7280',
        fontStyle: 'italic',
    },

    replyPreviewBar: { flexDirection: 'row', backgroundColor: '#e5e7eb', padding: 10, marginHorizontal: 10, marginTop: 4, borderRadius: 8, borderLeftWidth: 4, borderLeftColor: '#8b5cf6', alignItems: 'center' },
    replyPreviewName: { fontSize: 13, fontWeight: '700', color: '#8b5cf6', marginBottom: 2 },
    replyPreviewText: { fontSize: 13, color: '#4b5563' },

    quotedContainer: { padding: 8, borderRadius: 8, marginBottom: 6, borderLeftWidth: 3 },
    quotedMe: { backgroundColor: 'rgba(255,255,255,0.15)', borderLeftColor: 'white' },
    quotedThem: { backgroundColor: '#f3f4f6', borderLeftColor: '#8b5cf6' },
    quotedName: { fontSize: 12, fontWeight: '700', marginBottom: 2 },
    quotedText: { fontSize: 12 },

    reactionsContainer: { flexDirection: 'row', flexWrap: 'wrap', position: 'absolute', bottom: -10, gap: 4, zIndex: 100 },
    reactionsMe: { right: 8 },
    reactionsThem: { left: 8 },
    reactionPill: { flexDirection: 'row', alignItems: 'center', backgroundColor: 'white', borderRadius: 12, paddingHorizontal: 6, paddingVertical: 2, borderWidth: 1, borderColor: '#e5e7eb', gap: 2, shadowColor: '#000', shadowOpacity: 0.1, shadowRadius: 2, elevation: 1 },
    reactionCount: { fontSize: 11, fontWeight: '700', color: '#4b5563' },
});
