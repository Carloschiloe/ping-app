import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
    View, Text, TextInput, TouchableOpacity, FlatList,
    KeyboardAvoidingView, Platform, ActivityIndicator, StyleSheet,
    StatusBar, Image, Alert, Pressable, Modal, Share, Animated, Clipboard
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { Audio } from 'expo-av';
import { Ionicons } from '@expo/vector-icons';
import { useConversationMessages, useSendConversationMessage } from '../api/queries';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../lib/supabase';

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

async function uploadToSupabase(uri: string, bucket: string, mimeType: string): Promise<string | null> {
    try {
        const ext = mimeType.includes('audio') ? 'm4a' : 'jpg';
        const path = `${Date.now()}.${ext}`;

        // React Native compatible upload using FormData
        const formData = new FormData();
        formData.append('file', { uri, name: path, type: mimeType } as any);

        const { data: { session } } = await supabase.auth.getSession();
        const token = session?.access_token;
        const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;

        const res = await fetch(
            `${supabaseUrl}/storage/v1/object/${bucket}/${path}`,
            {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'x-upsert': 'true',
                },
                body: formData,
            }
        );

        if (!res.ok) {
            const err = await res.text();
            throw new Error(`Upload failed: ${err}`);
        }

        const { data } = supabase.storage.from(bucket).getPublicUrl(path);
        return data.publicUrl;
    } catch (e) {
        console.error('[Upload]', e);
        return null;
    }
}

// ─── Component ──────────────────────────────────────────────────────────────

export default function ChatScreen({ route, navigation }: any) {
    const { conversationId, otherUser, isSelf } = route.params;
    const [text, setText] = useState('');
    const [recording, setRecording] = useState<Audio.Recording | null>(null);
    const [isRecording, setIsRecording] = useState(false);
    const [sendingMedia, setSendingMedia] = useState(false);
    const [selectedMsg, setSelectedMsg] = useState<any>(null);      // context menu
    const [viewerUrl, setViewerUrl] = useState<string | null>(null); // fullscreen image
    const [multiSelect, setMultiSelect] = useState<string[]>([]);   // bulk select IDs
    const isMultiSelecting = multiSelect.length > 0;
    const menuAnim = useRef(new Animated.Value(300)).current;
    const { data, isLoading, refetch } = useConversationMessages(conversationId);
    const { mutate: sendMessage, isPending } = useSendConversationMessage(conversationId);
    const { user } = useAuth();
    const messages = data?.messages || [];

    const chatTitle = isSelf ? '📌 Mis Recordatorios' : (otherUser?.email?.split('@')[0] || 'Chat');

    React.useLayoutEffect(() => {
        navigation.setOptions({ title: chatTitle });
    }, [navigation, chatTitle]);

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
        const clean = t.startsWith('[imagen]') || t.startsWith('[audio]') ? '📷 Contenido multimedia' : t;
        Clipboard.setString(clean);
        closeMenu();
    };

    const handleEdit = () => {
        const t = selectedMsg?.text || '';
        if (t.startsWith('[imagen]') || t.startsWith('[audio]')) { closeMenu(); return; }
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

    const handleForward = async () => {
        const t = selectedMsg?.text || '';
        const clean = t.startsWith('[imagen]') ? t.slice(8) : t.startsWith('[audio]') ? t.slice(7) : t;
        closeMenu();
        await Share.share({ message: clean });
    };

    const isMyMessage = selectedMsg && (selectedMsg.sender_id || selectedMsg.user_id) === user?.id;
    const isTextMsg = selectedMsg && !selectedMsg.text?.startsWith('[imagen]') && !selectedMsg.text?.startsWith('[audio]');

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
    // ─── Send text ───────────────────────────────────────────────────────────

    const handleSend = () => {
        if (!text.trim()) return;
        sendMessage(text, { onSuccess: () => setText('') });
    };

    // ─── Photo picker ────────────────────────────────────────────────────────

    const pickImageSource = () => {
        Alert.alert(
            'Enviar foto',
            '¿Cómo quieres agregar la foto?',
            [
                { text: '📷 Tomar foto', onPress: () => openCamera() },
                { text: '🖼️ Elegir de galería', onPress: () => openGallery() },
                { text: 'Cancelar', style: 'cancel' },
            ]
        );
    };

    const openGallery = async () => {
        const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (status !== 'granted') {
            Alert.alert('Permiso denegado', 'Necesitamos acceso a tu galería.');
            return;
        }
        const result = await ImagePicker.launchImageLibraryAsync({
            mediaTypes: ImagePicker.MediaTypeOptions.Images,
            quality: 0.7,
        });
        if (result.canceled || !result.assets[0]) return;
        await uploadAndSendImage(result.assets[0].uri);
    };

    const openCamera = async () => {
        const { status } = await ImagePicker.requestCameraPermissionsAsync();
        if (status !== 'granted') {
            Alert.alert('Permiso denegado', 'Necesitamos acceso a la cámara.');
            return;
        }
        const result = await ImagePicker.launchCameraAsync({
            mediaTypes: ImagePicker.MediaTypeOptions.Images,
            quality: 0.7,
        });
        if (result.canceled || !result.assets[0]) return;
        await uploadAndSendImage(result.assets[0].uri);
    };

    const uploadAndSendImage = async (uri: string) => {
        setSendingMedia(true);
        const url = await uploadToSupabase(uri, 'chat-media', 'image/jpeg');
        setSendingMedia(false);
        if (url) {
            sendMessage(`[imagen]${url}`, {});
        } else {
            Alert.alert('Error', 'No se pudo subir la imagen.');
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
            if (url) sendMessage(`[audio]${url}`, {});
            else Alert.alert('Error', 'No se pudo subir el audio.');
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

        if (isSystem) {
            return (
                <View style={styles.systemWrap}>
                    <View style={styles.systemBubble}>
                        <Text style={styles.systemText}>{msgText}</Text>
                    </View>
                </View>
            );
        }

        const isImage = msgText.startsWith('[imagen]');
        const isAudio = msgText.startsWith('[audio]');
        const mediaUrl = isImage ? msgText.slice(8) : isAudio ? msgText.slice(7) : null;
        const isSelected = multiSelect.includes(item.id);

        const handlePress = () => {
            if (isMultiSelecting) { toggleSelect(item.id); return; }
            if (isImage && mediaUrl) { setViewerUrl(mediaUrl); }
        };

        const handleLongPress = () => {
            if (isMultiSelecting) { toggleSelect(item.id); return; }
            // Enter multi-select mode OR show context menu
            if (!isMultiSelecting) {
                openMenu(item);
            }
        };

        return (
            <View style={[styles.msgRow, isMe ? styles.msgRowMe : styles.msgRowThem]}>
                {isMultiSelecting && (
                    <TouchableOpacity onPress={() => toggleSelect(item.id)} style={styles.checkbox}>
                        <View style={[styles.checkCircle, isSelected && styles.checkCircleOn]}>
                            {isSelected && <Ionicons name="checkmark" size={14} color="white" />}
                        </View>
                    </TouchableOpacity>
                )}
                <TouchableOpacity
                    activeOpacity={0.85}
                    onPress={handlePress}
                    onLongPress={handleLongPress}
                    delayLongPress={350}
                    style={[
                        styles.bubble,
                        isMe ? styles.bubbleMe : styles.bubbleThem,
                        isAudio && styles.bubbleMedia,
                        isImage && styles.bubbleImageFrame,
                        isSelected && styles.bubbleSelected,
                    ]}
                >
                    {!isMe && !isSelf && !isImage && !isAudio && (
                        <Text style={styles.senderName}>
                            {otherUser?.email?.split('@')[0] || 'Usuario'}
                        </Text>
                    )}
                    {isImage && mediaUrl ? (
                        <Image
                            source={{ uri: mediaUrl }}
                            style={styles.msgImage}
                            resizeMode="cover"
                            onError={() => console.warn('[Image] failed to load:', mediaUrl)}
                        />
                    ) : isAudio && mediaUrl ? (
                        <AudioPlayer url={mediaUrl} isMe={isMe} />
                    ) : (
                        <Text style={[styles.msgText, isMe ? styles.msgTextMe : styles.msgTextThem]}>
                            {msgText}
                        </Text>
                    )}
                    <View style={styles.metaRow}>
                        <Text style={[styles.timeText, isMe ? styles.timeMe : styles.timeThem]}>{time}</Text>
                        {isMe && <Text style={styles.readTick}> ✓✓</Text>}
                    </View>
                </TouchableOpacity>
            </View>
        );
    };

    // Build flat list with date dividers
    const flatData: any[] = [];
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

    // ─── Render ──────────────────────────────────────────────────────────────

    return (
        <KeyboardAvoidingView
            behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
            style={styles.container}
            keyboardVerticalOffset={90}
        >
            <StatusBar barStyle="light-content" />
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
                        data={flatData}
                        inverted
                        keyExtractor={(item) => item.id}
                        renderItem={renderMessage}
                        showsVerticalScrollIndicator={false}
                        contentContainerStyle={{ paddingVertical: 12, paddingHorizontal: 10 }}
                    />
                )}
            </View>

            {/* Input bar */}
            <View style={styles.inputBar}>
                <TouchableOpacity style={styles.mediaBtn} onPress={pickImageSource} disabled={sendingMedia || isPending}>
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

            {/* ─── Fullscreen Image Viewer ────────────────────────── */}
            <Modal visible={!!viewerUrl} transparent animationType="fade" onRequestClose={() => setViewerUrl(null)}>
                <TouchableOpacity style={styles.viewerBackdrop} activeOpacity={1} onPress={() => setViewerUrl(null)}>
                    <Image
                        source={{ uri: viewerUrl || '' }}
                        style={styles.viewerImage}
                        resizeMode="contain"
                    />
                    <TouchableOpacity style={styles.viewerClose} onPress={() => setViewerUrl(null)}>
                        <Ionicons name="close-circle" size={36} color="rgba(255,255,255,0.9)" />
                    </TouchableOpacity>
                </TouchableOpacity>
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
                                    if (t.startsWith('[audio]')) return '🎤 Audio';
                                    return t;
                                })()}
                            </Text>
                        </View>

                        {/* Actions */}
                        <View style={styles.menuActions}>
                            <TouchableOpacity style={styles.menuAction} onPress={handleCopy}>
                                <View style={[styles.menuIcon, { backgroundColor: '#6366f1' }]}>
                                    <Ionicons name="copy-outline" size={22} color="white" />
                                </View>
                                <Text style={styles.menuLabel}>Copiar</Text>
                            </TouchableOpacity>

                            {isMyMessage && isTextMsg && (
                                <TouchableOpacity style={styles.menuAction} onPress={handleEdit}>
                                    <View style={[styles.menuIcon, { backgroundColor: '#f59e0b' }]}>
                                        <Ionicons name="pencil-outline" size={22} color="white" />
                                    </View>
                                    <Text style={styles.menuLabel}>Editar</Text>
                                </TouchableOpacity>
                            )}

                            <TouchableOpacity style={styles.menuAction} onPress={handleForward}>
                                <View style={[styles.menuIcon, { backgroundColor: '#10b981' }]}>
                                    <Ionicons name="arrow-redo-outline" size={22} color="white" />
                                </View>
                                <Text style={styles.menuLabel}>Reenviar</Text>
                            </TouchableOpacity>

                            {isMyMessage && (
                                <TouchableOpacity style={styles.menuAction} onPress={handleDelete}>
                                    <View style={[styles.menuIcon, { backgroundColor: '#ef4444' }]}>
                                        <Ionicons name="trash-outline" size={22} color="white" />
                                    </View>
                                    <Text style={styles.menuLabel}>Eliminar</Text>
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

// ─── Audio Player sub-component ─────────────────────────────────────────────

function AudioPlayer({ url, isMe }: { url: string; isMe: boolean }) {
    const [sound, setSound] = useState<Audio.Sound | null>(null);
    const [playing, setPlaying] = useState(false);

    const toggle = async () => {
        if (playing && sound) {
            await sound.stopAsync();
            setPlaying(false);
            return;
        }
        const { sound: s } = await Audio.Sound.createAsync({ uri: url });
        setSound(s);
        setPlaying(true);
        await s.playAsync();
        s.setOnPlaybackStatusUpdate((status: any) => {
            if (status.didJustFinish) { setPlaying(false); }
        });
    };

    useEffect(() => {
        return () => { sound?.unloadAsync(); };
    }, [sound]);

    return (
        <TouchableOpacity style={styles.audioPlayer} onPress={toggle}>
            <Ionicons name={playing ? 'pause-circle' : 'play-circle'} size={32} color={isMe ? 'white' : '#1e3a5f'} />
            <View style={styles.audioWave}>
                {[...Array(12)].map((_, i) => (
                    <View key={i} style={[styles.audioBar, { height: 4 + Math.random() * 14, opacity: playing ? 1 : 0.5 }, isMe ? styles.audioBarMe : styles.audioBarThem]} />
                ))}
            </View>
            <Text style={[styles.audioLabel, isMe ? styles.audioLabelMe : styles.audioLabelThem]}>
                {playing ? 'Detener' : 'Audio'}
            </Text>
        </TouchableOpacity>
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
        maxWidth: '78%', borderRadius: 16, paddingHorizontal: 12,
        paddingTop: 8, paddingBottom: 6,
        shadowColor: '#000', shadowOpacity: 0.08, shadowRadius: 2, elevation: 1,
    },
    bubbleMe: { backgroundColor: BUBBLE_BLUE, borderBottomRightRadius: 4 },
    bubbleThem: { backgroundColor: 'white', borderBottomLeftRadius: 4 },
    bubbleMedia: { padding: 4 },
    bubbleImage: {
        backgroundColor: 'transparent',
        padding: 0,
        paddingHorizontal: 0,
        paddingTop: 0,
        paddingBottom: 0,
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

    // Image message — minimal 1px frame
    msgImage: { width: 160, height: 160, borderRadius: 10 },
    bubbleImageFrame: { padding: 1, paddingBottom: 1 },

    // Audio player
    audioPlayer: { flexDirection: 'row', alignItems: 'center', padding: 8, gap: 8, minWidth: 180 },
    audioWave: { flexDirection: 'row', alignItems: 'center', gap: 2, flex: 1 },
    audioBar: { width: 3, borderRadius: 2 },
    audioBarMe: { backgroundColor: 'rgba(255,255,255,0.7)' },
    audioBarThem: { backgroundColor: '#0a84ff' },
    audioLabel: { fontSize: 11 },
    audioLabelMe: { color: 'rgba(255,255,255,0.75)' },
    audioLabelThem: { color: '#6b7280' },

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
        marginHorizontal: 20, marginBottom: 16, padding: 14,
        backgroundColor: 'white', borderRadius: 14,
        borderWidth: 1, borderColor: '#e5e7eb',
    },
    menuPreviewText: { fontSize: 14, color: '#374151', lineHeight: 20 },
    menuActions: {
        flexDirection: 'row', justifyContent: 'space-around',
        paddingHorizontal: 20, marginBottom: 12,
    },
    menuAction: { alignItems: 'center', gap: 6, minWidth: 64 },
    menuIcon: {
        width: 52, height: 52, borderRadius: 26,
        alignItems: 'center', justifyContent: 'center',
        shadowColor: '#000', shadowOpacity: 0.12, shadowRadius: 4, elevation: 3,
    },
    menuLabel: { fontSize: 12, color: '#374151', fontWeight: '500', marginTop: 4 },
    menuCancel: {
        marginHorizontal: 20, marginTop: 4, paddingVertical: 14,
        backgroundColor: 'white', borderRadius: 14, alignItems: 'center',
        borderWidth: 1, borderColor: '#e5e7eb',
    },
    menuCancelText: { fontSize: 16, color: '#ef4444', fontWeight: '600' },
});
