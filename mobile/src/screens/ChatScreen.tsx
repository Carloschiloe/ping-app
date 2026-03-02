import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, FlatList, KeyboardAvoidingView, Platform, ActivityIndicator, StyleSheet } from 'react-native';
import { useConversationMessages, useSendConversationMessage } from '../api/queries';
import { useAuth } from '../context/AuthContext';

export default function ChatScreen({ route, navigation }: any) {
    const { conversationId, otherUser } = route.params;
    const [text, setText] = useState('');
    const { data, isLoading } = useConversationMessages(conversationId);
    const { mutate: sendMessage, isPending } = useSendConversationMessage(conversationId);
    const { user } = useAuth();
    const messages = data?.messages || [];

    React.useLayoutEffect(() => {
        navigation.setOptions({
            title: otherUser?.email || 'Chat',
        });
    }, [navigation, otherUser]);

    const handleSend = () => {
        if (!text.trim()) return;
        sendMessage(text, { onSuccess: () => setText('') });
    };

    const renderMessage = ({ item }: { item: any }) => {
        const isSystem = item.meta?.isSystem;
        const isMe = (item.sender_id || item.user_id) === user?.id && !isSystem;

        return (
            <View style={[styles.bubble, isSystem ? styles.system : isMe ? styles.mine : styles.theirs]}>
                {!isMe && !isSystem && (
                    <Text style={styles.senderLabel}>{item.profiles?.email?.split('@')[0] || 'Usuario'}</Text>
                )}
                <Text style={isMe ? styles.myText : styles.theirText}>{item.text}</Text>
            </View>
        );
    };

    return (
        <KeyboardAvoidingView
            behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
            style={styles.container}
            keyboardVerticalOffset={90}
        >
            <View style={styles.messageList}>
                {isLoading ? (
                    <ActivityIndicator style={{ marginTop: 40 }} size="large" color="#3b82f6" />
                ) : (
                    <FlatList
                        data={messages}
                        inverted
                        keyExtractor={(item) => item.id}
                        renderItem={renderMessage}
                        showsVerticalScrollIndicator={false}
                        contentContainerStyle={{ paddingVertical: 8 }}
                    />
                )}
            </View>
            <View style={styles.inputRow}>
                <TextInput
                    style={styles.input}
                    placeholder="Escribe un mensaje o compromiso..."
                    value={text}
                    onChangeText={setText}
                    multiline
                />
                <TouchableOpacity
                    style={[styles.sendBtn, (!text.trim() || isPending) && styles.sendDisabled]}
                    onPress={handleSend}
                    disabled={!text.trim() || isPending}
                >
                    <Text style={styles.sendText}>›</Text>
                </TouchableOpacity>
            </View>
        </KeyboardAvoidingView>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#f9fafb' },
    messageList: { flex: 1 },
    bubble: { marginVertical: 3, marginHorizontal: 14, padding: 12, borderRadius: 14, maxWidth: '80%' },
    system: { backgroundColor: '#e5e7eb', alignSelf: 'center', borderRadius: 10, paddingVertical: 6, paddingHorizontal: 14 },
    mine: { backgroundColor: '#3b82f6', alignSelf: 'flex-end' },
    theirs: { backgroundColor: 'white', alignSelf: 'flex-start', borderWidth: 1, borderColor: '#e5e7eb' },
    senderLabel: { fontSize: 11, color: '#3b82f6', fontWeight: '600', marginBottom: 3 },
    myText: { color: 'white', fontSize: 15 },
    theirText: { color: '#111', fontSize: 15 },
    inputRow: { flexDirection: 'row', padding: 12, backgroundColor: 'white', borderTopWidth: 1, borderTopColor: '#e5e7eb', alignItems: 'flex-end' },
    input: { flex: 1, backgroundColor: '#f3f4f6', padding: 12, borderRadius: 24, marginRight: 8, maxHeight: 120, fontSize: 15 },
    sendBtn: { backgroundColor: '#3b82f6', width: 46, height: 46, borderRadius: 23, alignItems: 'center', justifyContent: 'center' },
    sendDisabled: { opacity: 0.4 },
    sendText: { color: 'white', fontWeight: 'bold', fontSize: 24 },
});
