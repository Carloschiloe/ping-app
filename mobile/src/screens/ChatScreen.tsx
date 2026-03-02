import React, { useState, useRef } from 'react';
import {
    View, Text, TextInput, TouchableOpacity, FlatList,
    KeyboardAvoidingView, Platform, ActivityIndicator, StyleSheet, StatusBar
} from 'react-native';
import { useConversationMessages, useSendConversationMessage } from '../api/queries';
import { useAuth } from '../context/AuthContext';

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

function groupByDate(messages: any[]) {
    const groups: { date: string; data: any[] }[] = [];
    let currentDate = '';
    const reversed = [...messages].reverse(); // newest first → show oldest at top

    for (const msg of reversed) {
        const dateKey = new Date(msg.created_at).toDateString();
        if (dateKey !== currentDate) {
            currentDate = dateKey;
            groups.push({ date: formatDateDivider(msg.created_at), data: [] });
        }
        groups[groups.length - 1].data.push(msg);
    }
    return groups.reverse(); // newest group on top (inverted FlatList)
}

export default function ChatScreen({ route, navigation }: any) {
    const { conversationId, otherUser, isSelf } = route.params;
    const [text, setText] = useState('');
    const inputRef = useRef<TextInput>(null);
    const { data, isLoading } = useConversationMessages(conversationId);
    const { mutate: sendMessage, isPending } = useSendConversationMessage(conversationId);
    const { user } = useAuth();
    const messages = data?.messages || [];

    const chatTitle = isSelf
        ? '📌 Mis Recordatorios'
        : otherUser?.email?.split('@')[0] || 'Chat';

    React.useLayoutEffect(() => {
        navigation.setOptions({
            title: chatTitle,
            headerStyle: { backgroundColor: '#1e3a5f' },
            headerTintColor: 'white',
            headerTitleStyle: { fontWeight: '700' },
        });
    }, [navigation, chatTitle]);

    const handleSend = () => {
        if (!text.trim()) return;
        sendMessage(text, { onSuccess: () => setText('') });
    };

    const renderItem = ({ item, index }: { item: any; index: number }) => {
        const isSystem = item.meta?.isSystem;
        const isMe = (item.sender_id || item.user_id) === user?.id && !isSystem;
        const time = formatTime(item.created_at);

        if (isSystem) {
            return (
                <View style={styles.systemWrap}>
                    <View style={styles.systemBubble}>
                        <Text style={styles.systemText}>{item.text}</Text>
                    </View>
                </View>
            );
        }

        return (
            <View style={[styles.msgRow, isMe ? styles.msgRowMe : styles.msgRowThem]}>
                <View style={[styles.bubble, isMe ? styles.bubbleMe : styles.bubbleThem]}>
                    {!isMe && !isSelf && (
                        <Text style={styles.senderName}>
                            {otherUser?.email?.split('@')[0] || 'Usuario'}
                        </Text>
                    )}
                    <Text style={[styles.msgText, isMe ? styles.msgTextMe : styles.msgTextThem]}>
                        {item.text}
                    </Text>
                    <View style={styles.metaRow}>
                        <Text style={[styles.timeText, isMe ? styles.timeMe : styles.timeThem]}>
                            {time}
                        </Text>
                        {isMe && (
                            <Text style={styles.readTick}> ✓✓</Text>
                        )}
                    </View>
                </View>
            </View>
        );
    };

    // Flat list item with date dividers
    const flatData: any[] = [];
    const groups = groupByDate(messages);
    for (const group of groups) {
        flatData.push({ type: 'divider', date: group.date, id: `divider-${group.date}` });
        flatData.push(...group.data.map(m => ({ ...m, type: 'message' })));
    }
    flatData.reverse(); // for inverted list

    const renderRow = ({ item }: { item: any }) => {
        if (item.type === 'divider') {
            return (
                <View style={styles.dateDivider}>
                    <Text style={styles.dateDividerText}>{item.date}</Text>
                </View>
            );
        }
        return renderItem({ item, index: 0 });
    };

    return (
        <KeyboardAvoidingView
            behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
            style={styles.container}
            keyboardVerticalOffset={90}
        >
            <StatusBar barStyle="light-content" />
            {/* Chat background */}
            <View style={styles.chatBg}>
                {isLoading ? (
                    <ActivityIndicator style={{ marginTop: 40 }} size="large" color="#3b82f6" />
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
                        renderItem={renderRow}
                        showsVerticalScrollIndicator={false}
                        contentContainerStyle={{ paddingVertical: 12, paddingHorizontal: 10 }}
                    />
                )}
            </View>

            {/* Input bar */}
            <View style={styles.inputBar}>
                <TextInput
                    ref={inputRef}
                    style={styles.input}
                    placeholder={isSelf ? 'Escribe un recordatorio...' : 'Escribe un mensaje...'}
                    placeholderTextColor="#9ca3af"
                    value={text}
                    onChangeText={setText}
                    multiline
                    onSubmitEditing={handleSend}
                />
                <TouchableOpacity
                    style={[styles.sendBtn, (!text.trim() || isPending) && styles.sendDisabled]}
                    onPress={handleSend}
                    disabled={!text.trim() || isPending}
                >
                    {isPending
                        ? <ActivityIndicator size="small" color="white" />
                        : <Text style={styles.sendIcon}>➤</Text>
                    }
                </TouchableOpacity>
            </View>
        </KeyboardAvoidingView>
    );
}

const BUBBLE_BLUE = '#0a84ff';
const BUBBLE_WHITE = '#ffffff';
const BG_CHAT = '#ECE5DD'; // WhatsApp-style warm gray

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: BG_CHAT },
    chatBg: { flex: 1 },

    // Date divider
    dateDivider: { alignItems: 'center', marginVertical: 10 },
    dateDividerText: {
        backgroundColor: 'rgba(0,0,0,0.18)', color: 'white',
        fontSize: 12, paddingHorizontal: 12, paddingVertical: 4,
        borderRadius: 10, overflow: 'hidden', fontWeight: '500'
    },

    // Messages
    msgRow: { marginVertical: 2, flexDirection: 'row' },
    msgRowMe: { justifyContent: 'flex-end' },
    msgRowThem: { justifyContent: 'flex-start' },
    bubble: {
        maxWidth: '78%', borderRadius: 16, paddingHorizontal: 12,
        paddingTop: 8, paddingBottom: 6,
        shadowColor: '#000', shadowOpacity: 0.08, shadowRadius: 2, elevation: 1,
    },
    bubbleMe: {
        backgroundColor: BUBBLE_BLUE,
        borderBottomRightRadius: 4,
    },
    bubbleThem: {
        backgroundColor: BUBBLE_WHITE,
        borderBottomLeftRadius: 4,
    },
    senderName: { fontSize: 12, fontWeight: '700', color: '#0a84ff', marginBottom: 2 },
    msgText: { fontSize: 15.5, lineHeight: 21 },
    msgTextMe: { color: 'white' },
    msgTextThem: { color: '#111827' },
    metaRow: { flexDirection: 'row', justifyContent: 'flex-end', alignItems: 'center', marginTop: 3 },
    timeText: { fontSize: 11 },
    timeMe: { color: 'rgba(255,255,255,0.7)' },
    timeThem: { color: '#9ca3af' },
    readTick: { fontSize: 11, color: 'rgba(255,255,255,0.85)', marginLeft: 2 },

    // System messages
    systemWrap: { alignItems: 'center', marginVertical: 6 },
    systemBubble: {
        backgroundColor: '#d1fae5', borderRadius: 12,
        paddingHorizontal: 16, paddingVertical: 8,
        borderWidth: 1, borderColor: '#a7f3d0', maxWidth: '90%'
    },
    systemText: { fontSize: 13, color: '#065f46', textAlign: 'center', fontWeight: '500' },

    // Empty state
    emptyChat: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingBottom: 80 },
    emptyChatIcon: { fontSize: 52, marginBottom: 12 },
    emptyChatText: { fontSize: 15, color: '#6b7280', textAlign: 'center' },

    // Input bar
    inputBar: {
        flexDirection: 'row', alignItems: 'flex-end',
        paddingHorizontal: 10, paddingVertical: 8,
        backgroundColor: '#f1f0f0', borderTopWidth: 0,
        paddingBottom: Platform.OS === 'ios' ? 12 : 8,
    },
    input: {
        flex: 1, backgroundColor: 'white', borderRadius: 24,
        paddingHorizontal: 16, paddingVertical: 10,
        fontSize: 15.5, maxHeight: 120, marginRight: 8,
        color: '#111',
        shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 2, elevation: 1,
    },
    sendBtn: {
        backgroundColor: BUBBLE_BLUE, width: 46, height: 46,
        borderRadius: 23, alignItems: 'center', justifyContent: 'center',
    },
    sendDisabled: { opacity: 0.4 },
    sendIcon: { color: 'white', fontSize: 20 },
});
