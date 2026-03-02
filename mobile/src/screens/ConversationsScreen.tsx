import React from 'react';
import { View, Text, FlatList, TouchableOpacity, StyleSheet, ActivityIndicator } from 'react-native';
import { useConversations, useCreateConversation, useGetOrCreateSelfConversation } from '../api/queries';

export default function ConversationsScreen({ navigation }: any) {
    const { data, isLoading } = useConversations();
    const conversations = data?.conversations || [];
    const { mutate: openSelf, isPending: selfPending } = useGetOrCreateSelfConversation();

    const renderItem = ({ item }: { item: any }) => {
        const otherUser = item.otherUser;
        const lastMsg = item.lastMessage;
        const initials = otherUser?.email
            ? otherUser.email.substring(0, 2).toUpperCase()
            : '??';
        const isSystem = lastMsg?.meta?.isSystem;
        const preview = lastMsg
            ? (isSystem ? `🤖 ${lastMsg.text}` : lastMsg.text)
            : 'Sin mensajes aún';

        return (
            <TouchableOpacity
                style={styles.row}
                onPress={() => navigation.navigate('Chat', {
                    conversationId: item.id,
                    otherUser,
                })}
            >
                <View style={styles.avatar}>
                    <Text style={styles.avatarText}>{initials}</Text>
                </View>
                <View style={styles.info}>
                    <Text style={styles.name} numberOfLines={1}>
                        {otherUser?.email || 'Chat personal'}
                    </Text>
                    <Text style={styles.preview} numberOfLines={1}>{preview}</Text>
                </View>
                {lastMsg && (
                    <Text style={styles.time}>
                        {new Date(lastMsg.created_at).toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' })}
                    </Text>
                )}
            </TouchableOpacity>
        );
    };

    return (
        <View style={styles.container}>
            <View style={styles.header}>
                <Text style={styles.title}>Ping</Text>
                <TouchableOpacity style={styles.newBtn} onPress={() => navigation.navigate('NewChat')}>
                    <Text style={styles.newBtnText}>✎</Text>
                </TouchableOpacity>
            </View>

            {isLoading ? (
                <ActivityIndicator size="large" color="#3b82f6" style={{ marginTop: 40 }} />
            ) : (
                <>
                    {/* Pinned self-chat */}
                    <TouchableOpacity
                        style={styles.selfRow}
                        onPress={() => openSelf(undefined, {
                            onSuccess: ({ conversationId }) =>
                                navigation.navigate('Chat', { conversationId, otherUser: null, isSelf: true }),
                        })}
                        disabled={selfPending}
                    >
                        <View style={[styles.avatar, styles.selfAvatar]}>
                            <Text style={styles.avatarText}>📌</Text>
                        </View>
                        <View style={styles.info}>
                            <Text style={styles.name}>Mis Recordatorios</Text>
                            <Text style={styles.preview}>Enviarte notas y compromisos a ti mismo</Text>
                        </View>
                    </TouchableOpacity>

                    {conversations.length === 0 ? (
                        <View style={styles.empty}>
                            <Text style={styles.emptyIcon}>💬</Text>
                            <Text style={styles.emptyTitle}>Inicia una conversación</Text>
                            <Text style={styles.emptyText}>Toca el ícono ✎ arriba para buscar un contacto</Text>
                        </View>
                    ) : (
                        <FlatList
                            data={conversations}
                            keyExtractor={item => item.id}
                            renderItem={renderItem}
                            showsVerticalScrollIndicator={false}
                        />
                    )}
                </>
            )}
        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: 'white', paddingTop: 56 },
    header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, paddingBottom: 16, borderBottomWidth: 1, borderBottomColor: '#f0f0f0' },
    title: { fontSize: 24, fontWeight: '700', color: '#111' },
    newBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: '#eff6ff', alignItems: 'center', justifyContent: 'center' },
    newBtnText: { fontSize: 20, color: '#3b82f6' },
    selfRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: '#e5e7eb', backgroundColor: '#f0f7ff' },
    selfAvatar: { backgroundColor: '#dbeafe' },
    row: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: '#f7f7f7' },
    avatar: { width: 52, height: 52, borderRadius: 26, backgroundColor: '#3b82f6', alignItems: 'center', justifyContent: 'center', marginRight: 14 },
    avatarText: { color: 'white', fontWeight: '700', fontSize: 18 },
    info: { flex: 1 },
    name: { fontSize: 16, fontWeight: '600', color: '#111', marginBottom: 3 },
    preview: { fontSize: 14, color: '#6b7280' },
    time: { fontSize: 12, color: '#9ca3af', marginLeft: 8 },
    empty: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 40 },
    emptyIcon: { fontSize: 60, marginBottom: 16 },
    emptyTitle: { fontSize: 20, fontWeight: '700', color: '#111', marginBottom: 8 },
    emptyText: { fontSize: 15, color: '#6b7280', textAlign: 'center' },
});
