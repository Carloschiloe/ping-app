import React, { useState, useRef, useEffect } from 'react';
import {
    View, Text, TextInput, TouchableOpacity, FlatList,
    KeyboardAvoidingView, Platform, ActivityIndicator, StyleSheet,
    StatusBar, SafeAreaView, Alert
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAskPing, useAIHistory, useClearAIHistory } from '../api/queries';
import { Audio } from 'expo-av';
import { uploadToSupabase } from '../lib/upload';
import AudioPlayer from '../components/AudioPlayer';

export default function PingAIScreen({ navigation }: any) {
    const [text, setText] = useState('');
    const { data: historyData } = useAIHistory();
    const { mutate: clearHistory } = useClearAIHistory();
    const [messages, setMessages] = useState<any[]>([]);

    const { mutate: askPing, isPending } = useAskPing();
    const listRef = useRef<FlatList>(null);

    // Load history when data arrives
    useEffect(() => {
        if (historyData?.messages) {
            const history = historyData.messages.map((m: any) => ({
                id: m.id,
                text: m.text,
                isAi: m.is_ai,
                created_at: m.created_at
            }));

            if (history.length === 0) {
                setMessages([
                    { id: 'welcome', text: '¡Hola! Soy Ping. 🤖\n\nPuedes preguntarme sobre tus compromisos, tareas pendientes o cualquier cosa que hayamos anotado.', isAi: true }
                ]);
            } else {
                setMessages(history);
            }
        }
    }, [historyData]);

    const [recording, setRecording] = useState<Audio.Recording | null>(null);
    const [isRecording, setIsRecording] = useState(false);
    const [sendingMedia, setSendingMedia] = useState(false);

    const handleSend = (overrideText?: string) => {
        const messageToSend = overrideText || text;
        if (!messageToSend.trim() || isPending) return;

        const userMsg = {
            id: Date.now().toString(),
            text: messageToSend.startsWith('[audio]') ? '🎤 Audio enviado...' : messageToSend.trim(),
            isAi: false,
            // Store the raw audio tag if it's there
            rawText: messageToSend.startsWith('[audio]') ? messageToSend : undefined
        };
        setMessages(prev => [...prev, userMsg]);

        if (!overrideText) setText('');

        askPing(messageToSend.trim(), {
            onSuccess: (data: any) => {
                const aiMsg = {
                    id: (Date.now() + 1).toString(),
                    text: data.answer,
                    isAi: true,
                    transcript: data.transcript
                };
                setMessages(prev => [...prev, aiMsg]);
            },
            onError: () => {
                const errorMsg = { id: (Date.now() + 1).toString(), text: 'Desconectado. Por favor intenta de nuevo.', isAi: true, isError: true };
                setMessages(prev => [...prev, errorMsg]);
            }
        });
    };

    const startRecording = async () => {
        if (isRecording || recording) return;
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
            console.error('[AI Audio]', e);
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
                handleSend(`[audio]${url}`);
            } else {
                Alert.alert('Error', 'No se pudo subir el audio.');
            }
        } catch (e) {
            console.error('[AI Audio stop]', e);
            setRecording(null);
        }
    };

    useEffect(() => {
        setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 100);
    }, [messages]);

    const renderItem = ({ item }: { item: any }) => {
        const audioUrl = (item.rawText?.startsWith('[audio]') ? item.rawText.slice(7) : (item.text?.startsWith('[audio]') ? item.text.slice(7) : null));
        const isAudio = !!audioUrl;

        return (
            <View style={[styles.messageRow, item.isAi ? styles.aiRow : styles.userRow]}>
                <View style={[styles.bubble, item.isAi ? styles.aiBubble : styles.userBubble, item.isError && styles.errorBubble]}>
                    {item.isAi && item.transcript && (
                        <Text style={styles.transcriptText}>Transcripción: &quot;{item.transcript}&quot;</Text>
                    )}
                    {isAudio ? (
                        <AudioPlayer url={audioUrl} isMe={!item.isAi} />
                    ) : (
                        <Text style={[styles.messageText, !item.isAi && { color: 'white' }]}>
                            {item.text}
                        </Text>
                    )}
                </View>
            </View>
        );
    };

    return (
        <SafeAreaView style={styles.container}>
            <StatusBar barStyle="light-content" />

            {/* Header */}
            <View style={styles.header}>
                <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
                    <Ionicons name="arrow-back" size={24} color="white" />
                </TouchableOpacity>
                <View style={styles.headerInfo}>
                    <Text style={styles.title}>Preguntar a Ping</Text>
                    <Text style={styles.subtitle}>IA que recuerda</Text>
                </View>
                <TouchableOpacity onPress={() => {
                    Alert.alert('Borrar historial', '¿Estás seguro?', [
                        { text: 'Cancelar', style: 'cancel' },
                        { text: 'Borrar', style: 'destructive', onPress: () => clearHistory() }
                    ]);
                }} style={styles.backBtn}>
                    <Ionicons name="trash-outline" size={24} color="white" />
                </TouchableOpacity>
            </View>

            <FlatList
                ref={listRef}
                data={messages}
                keyExtractor={item => item.id}
                renderItem={renderItem}
                contentContainerStyle={styles.listContent}
            />

            {isPending && (
                <View style={styles.loadingRow}>
                    <ActivityIndicator size="small" color="#3b82f6" />
                    <Text style={styles.loadingText}>Ping está pensando...</Text>
                </View>
            )}

            <KeyboardAvoidingView
                behavior={Platform.OS === 'ios' ? 'padding' : undefined}
                keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 0}
            >
                <View style={styles.inputContainer}>
                    <TextInput
                        style={styles.input}
                        placeholder={isRecording ? "Grabando audio..." : "Pregúntame lo que sea..."}
                        value={text}
                        onChangeText={setText}
                        multiline
                        maxLength={500}
                        editable={!isRecording && !sendingMedia}
                    />

                    {text.trim() ? (
                        <TouchableOpacity
                            style={[styles.sendBtn, isPending && styles.sendBtnDisabled]}
                            onPress={() => handleSend()}
                            disabled={isPending}
                        >
                            <Ionicons name="send" size={20} color="white" />
                        </TouchableOpacity>
                    ) : (
                        <TouchableOpacity
                            style={[styles.sendBtn, isRecording && styles.recordingBtn, (isPending || sendingMedia) && styles.sendBtnDisabled]}
                            onPressIn={startRecording}
                            onPressOut={stopRecording}
                            disabled={isPending || sendingMedia}
                        >
                            {sendingMedia ? (
                                <ActivityIndicator size="small" color="white" />
                            ) : (
                                <Ionicons name={isRecording ? "stop" : "mic"} size={22} color="white" />
                            )}
                        </TouchableOpacity>
                    )}
                </View>
            </KeyboardAvoidingView>
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#f3f4f6' },
    header: {
        backgroundColor: '#1e3a5f',
        flexDirection: 'row', alignItems: 'center',
        paddingHorizontal: 16, paddingVertical: 12,
        paddingTop: Platform.OS === 'android' ? StatusBar.currentHeight : 0,
    },
    backBtn: { padding: 8 },
    headerInfo: { flex: 1, alignItems: 'center' },
    title: { color: 'white', fontSize: 18, fontWeight: '700' },
    subtitle: { color: 'rgba(255,255,255,0.7)', fontSize: 12 },

    listContent: { padding: 16, paddingBottom: 24 },
    messageRow: { flexDirection: 'row', marginBottom: 12 },
    aiRow: { justifyContent: 'flex-start' },
    userRow: { justifyContent: 'flex-end' },

    bubble: {
        maxWidth: '85%',
        paddingHorizontal: 16, paddingVertical: 10,
        borderRadius: 20,
    },
    aiBubble: { backgroundColor: 'white', borderBottomLeftRadius: 4 },
    userBubble: { backgroundColor: '#3b82f6', borderBottomRightRadius: 4 },
    errorBubble: { backgroundColor: '#fee2e2', borderWidth: 1, borderColor: '#ef4444' },

    messageText: { fontSize: 15, color: '#1f2937', lineHeight: 20 },

    inputContainer: {
        flexDirection: 'row', alignItems: 'center',
        padding: 12, backgroundColor: 'white',
        borderTopWidth: 1, borderTopColor: '#e5e7eb',
    },
    input: {
        flex: 1, backgroundColor: '#f9fafb',
        borderRadius: 20, paddingHorizontal: 16,
        paddingVertical: 8, marginRight: 8,
        fontSize: 15, maxHeight: 100,
    },
    sendBtn: {
        backgroundColor: '#3b82f6',
        width: 40, height: 40, borderRadius: 20,
        alignItems: 'center', justifyContent: 'center',
    },
    sendBtnDisabled: { backgroundColor: '#9ca3af' },
    recordingBtn: { backgroundColor: '#ef4444' },

    loadingRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, marginBottom: 8 },
    loadingText: { marginLeft: 8, fontSize: 13, color: '#6b7280', fontStyle: 'italic' },

    transcriptText: { fontSize: 11, color: '#6b7280', marginBottom: 4, fontStyle: 'italic' },
});
