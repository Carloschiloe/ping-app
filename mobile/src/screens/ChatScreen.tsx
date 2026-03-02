import React, { useState, useRef, useEffect } from 'react';
import {
    View, Text, TextInput, TouchableOpacity, FlatList,
    KeyboardAvoidingView, Platform, ActivityIndicator, StyleSheet,
    StatusBar, Image, Alert, Pressable
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
        const ext = uri.split('.').pop() || 'bin';
        const path = `${Date.now()}.${ext}`;
        const response = await fetch(uri);
        const blob = await response.blob();
        const { error } = await supabase.storage.from(bucket).upload(path, blob, { contentType: mimeType });
        if (error) throw error;
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
    const { data, isLoading } = useConversationMessages(conversationId);
    const { mutate: sendMessage, isPending } = useSendConversationMessage(conversationId);
    const { user } = useAuth();
    const messages = data?.messages || [];

    const chatTitle = isSelf ? '📌 Mis Recordatorios' : (otherUser?.email?.split('@')[0] || 'Chat');

    React.useLayoutEffect(() => {
        navigation.setOptions({ title: chatTitle });
    }, [navigation, chatTitle]);

    // ─── Send text ───────────────────────────────────────────────────────────

    const handleSend = () => {
        if (!text.trim()) return;
        sendMessage(text, { onSuccess: () => setText('') });
    };

    // ─── Photo picker ────────────────────────────────────────────────────────

    const handlePickImage = async () => {
        const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (status !== 'granted') {
            Alert.alert('Permiso denegado', 'Necesitamos acceso a tu galería para enviar fotos.');
            return;
        }
        const result = await ImagePicker.launchImageLibraryAsync({
            mediaTypes: ImagePicker.MediaTypeOptions.Images,
            quality: 0.7,
            allowsEditing: false,
        });
        if (result.canceled || !result.assets[0]) return;
        const asset = result.assets[0];
        setSendingMedia(true);
        const url = await uploadToSupabase(asset.uri, 'chat-media', 'image/jpeg');
        setSendingMedia(false);
        if (url) {
            sendMessage(`[imagen]${url}`, {});
        } else {
            Alert.alert('Error', 'No se pudo subir la imagen. Intenta de nuevo.');
        }
    };

    // ─── Audio recorder ──────────────────────────────────────────────────────

    const startRecording = async () => {
        try {
            const { status } = await Audio.requestPermissionsAsync();
            if (status !== 'granted') {
                Alert.alert('Permiso denegado', 'Necesitamos acceso al micrófono para grabar audio.');
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
        }
    };

    const stopRecording = async () => {
        if (!recording) return;
        setIsRecording(false);
        await recording.stopAndUnloadAsync();
        const uri = recording.getURI();
        setRecording(null);
        if (!uri) return;
        setSendingMedia(true);
        const url = await uploadToSupabase(uri, 'chat-media', 'audio/m4a');
        setSendingMedia(false);
        if (url) {
            sendMessage(`[audio]${url}`, {});
        } else {
            Alert.alert('Error', 'No se pudo subir el audio.');
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

        return (
            <View style={[styles.msgRow, isMe ? styles.msgRowMe : styles.msgRowThem]}>
                <View style={[styles.bubble, isMe ? styles.bubbleMe : styles.bubbleThem,
                (isImage || isAudio) && styles.bubbleMedia]}>
                    {!isMe && !isSelf && (
                        <Text style={styles.senderName}>
                            {otherUser?.email?.split('@')[0] || 'Usuario'}
                        </Text>
                    )}
                    {isImage && mediaUrl ? (
                        <Image source={{ uri: mediaUrl }} style={styles.msgImage} resizeMode="cover" />
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
                </View>
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
                {/* Photo button */}
                <TouchableOpacity style={styles.mediaBtn} onPress={handlePickImage} disabled={sendingMedia || isPending}>
                    <Ionicons name="image-outline" size={24} color="#6b7280" />
                </TouchableOpacity>

                {/* Text input */}
                <TextInput
                    style={styles.input}
                    placeholder={isSelf ? 'Escribe un recordatorio...' : 'Escribe un mensaje...'}
                    placeholderTextColor="#9ca3af"
                    value={text}
                    onChangeText={setText}
                    multiline
                />

                {/* Audio or Send button */}
                {text.trim() ? (
                    <TouchableOpacity
                        style={[styles.sendBtn, isPending && styles.sendDisabled]}
                        onPress={handleSend}
                        disabled={isPending}
                    >
                        {isPending
                            ? <ActivityIndicator size="small" color="white" />
                            : <Ionicons name="send" size={18} color="white" />
                        }
                    </TouchableOpacity>
                ) : sendingMedia ? (
                    <View style={styles.sendBtn}>
                        <ActivityIndicator size="small" color="white" />
                    </View>
                ) : (
                    <Pressable
                        style={[styles.sendBtn, isRecording && styles.recordingBtn]}
                        onPressIn={startRecording}
                        onPressOut={stopRecording}
                    >
                        <Ionicons name={isRecording ? 'radio-button-on' : 'mic'} size={20} color="white" />
                    </Pressable>
                )}
            </View>

            {isRecording && (
                <View style={styles.recordingBar}>
                    <Text style={styles.recordingText}>🎙️ Grabando... suelta para enviar</Text>
                </View>
            )}
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
    senderName: { fontSize: 12, fontWeight: '700', color: BUBBLE_BLUE, marginBottom: 2, paddingHorizontal: 8, paddingTop: 4 },
    msgText: { fontSize: 15.5, lineHeight: 21 },
    msgTextMe: { color: 'white' },
    msgTextThem: { color: '#111827' },
    metaRow: { flexDirection: 'row', justifyContent: 'flex-end', alignItems: 'center', marginTop: 3, paddingHorizontal: 4 },
    timeText: { fontSize: 11 },
    timeMe: { color: 'rgba(255,255,255,0.7)' },
    timeThem: { color: '#9ca3af' },
    readTick: { fontSize: 11, color: 'rgba(255,255,255,0.85)', marginLeft: 2 },

    // Image message
    msgImage: { width: 200, height: 200, borderRadius: 12 },

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
});
