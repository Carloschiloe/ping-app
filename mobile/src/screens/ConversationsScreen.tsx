import React from 'react';
import {
    View, Text, FlatList, TouchableOpacity, StyleSheet,
    ActivityIndicator, StatusBar, Platform
} from 'react-native';
import { useConversations, useGetOrCreateSelfConversation } from '../api/queries';
import { useAuth } from '../context/AuthContext';

function formatTime(iso: string) {
    const d = new Date(iso);
    const now = new Date();
    const isToday = d.toDateString() === now.toDateString();
    if (isToday) return d.toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' });
    return d.toLocaleDateString('es-CL', { day: '2-digit', month: '2-digit' });
}

function avatarInitials(email?: string) {
    if (!email) return '?';
    return email.substring(0, 2).toUpperCase();
}

const COLORS = ['#0a84ff', '#30d158', '#ff6b35', '#bf5af2', '#ff9f0a', '#32ade6'];
function avatarColor(str: string) {
    let hash = 0;
    for (let i = 0; i < str.length; i++) hash = str.charCodeAt(i) + ((hash << 5) - hash);
    return COLORS[Math.abs(hash) % COLORS.length];
}

export default function ConversationsScreen({ navigation }: any) {
    const { data, isLoading } = useConversations();
    const { user } = useAuth();
    const conversations = data?.conversations || [];
    const { mutate: openSelf, isPending: selfPending } = useGetOrCreateSelfConversation();

    const renderItem = ({ item }: { item: any }) => {
        const otherUser = item.otherUser;
        const lastMsg = item.lastMessage;
        const isSystem = lastMsg?.meta?.isSystem;
        const email = otherUser?.email || 'chat';
        const initials = avatarInitials(email);
        const color = avatarColor(email);
        const preview = lastMsg
            ? (isSystem ? `🤖 ${lastMsg.text}` : lastMsg.text)
            : 'Sin mensajes aún';
        const isByMe = lastMsg && (lastMsg.sender_id === user?.id || lastMsg.user_id === user?.id);

        return (
            <TouchableOpacity
                style={styles.row}
                activeOpacity={0.7}
                onPress={() => navigation.navigate('Chat', { conversationId: item.id, otherUser })}
            >
                {/* Avatar */}
                <View style={[styles.avatar, { backgroundColor: color }]}>
                    <Text style={styles.avatarText}>{initials}</Text>
                </View>

                {/* Info */}
                <View style={styles.info}>
                    <View style={styles.topRow}>
                        <Text style={styles.name} numberOfLines={1}>
                            {email.split('@')[0]}
                        </Text>
                        {lastMsg && (
                            <Text style={styles.time}>{formatTime(lastMsg.created_at)}</Text>
                        )}
                    </View>
                    <View style={styles.bottomRow}>
                        {isByMe && <Text style={styles.myTick}>✓✓ </Text>}
                        <Text style={styles.preview} numberOfLines={1}>{preview}</Text>
                    </View>
                </View>
            </TouchableOpacity>
        );
    };

    return (
        <View style={styles.container}>
            <StatusBar barStyle="light-content" backgroundColor="#1e3a5f" />

            {/* Header */}
            <View style={styles.header}>
                <Text style={styles.title}>Ping</Text>
                <TouchableOpacity style={styles.newBtn} onPress={() => navigation.navigate('NewChat')}>
                    <Text style={styles.newBtnText}>✏️</Text>
                </TouchableOpacity>
            </View>

            {isLoading ? (
                <ActivityIndicator size="large" color="#0a84ff" style={{ marginTop: 40 }} />
            ) : (
                <>
                    {/* Pinned: Mis Recordatorios */}
                    <TouchableOpacity
                        style={styles.selfRow}
                        activeOpacity={0.7}
                        onPress={() => openSelf(undefined, {
                            onSuccess: ({ conversationId }) =>
                                navigation.navigate('Chat', { conversationId, otherUser: null, isSelf: true }),
                        })}
                        disabled={selfPending}
                    >
                        <View style={[styles.avatar, styles.selfAvatar]}>
                            <Text style={{ fontSize: 22 }}>📌</Text>
                        </View>
                        <View style={styles.info}>
                            <Text style={styles.name}>Mis Recordatorios</Text>
                            <Text style={styles.preview}>Notas y compromisos personales</Text>
                        </View>
                    </TouchableOpacity>

                    {/* Separator */}
                    <View style={styles.separator}>
                        <Text style={styles.separatorText}>CONVERSACIONES</Text>
                    </View>

                    {conversations.length === 0 ? (
                        <View style={styles.empty}>
                            <Text style={styles.emptyIcon}>💬</Text>
                            <Text style={styles.emptyTitle}>Sin conversaciones aún</Text>
                            <Text style={styles.emptyText}>Toca ✏️ arriba para buscar a alguien</Text>
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
    container: { flex: 1, backgroundColor: '#f9fafb' },

    // Header
    header: {
        backgroundColor: '#1e3a5f',
        flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
        paddingHorizontal: 20,
        paddingTop: Platform.OS === 'ios' ? 56 : 20,
        paddingBottom: 16,
    },
    title: { fontSize: 26, fontWeight: '800', color: 'white', letterSpacing: -0.5 },
    newBtn: { padding: 8 },
    newBtnText: { fontSize: 22 },

    // Pinned self row
    selfRow: {
        flexDirection: 'row', alignItems: 'center',
        paddingHorizontal: 16, paddingVertical: 14,
        backgroundColor: 'white',
        borderBottomWidth: 1, borderBottomColor: '#f0f0f0',
    },
    selfAvatar: { backgroundColor: '#eff6ff', width: 52, height: 52, borderRadius: 26, alignItems: 'center', justifyContent: 'center', marginRight: 14 },

    // Section separator
    separator: {
        paddingHorizontal: 16, paddingVertical: 8,
        backgroundColor: '#f3f4f6',
    },
    separatorText: { fontSize: 11, fontWeight: '600', color: '#9ca3af', letterSpacing: 0.8 },

    // Conversation rows
    row: {
        flexDirection: 'row', alignItems: 'center',
        paddingHorizontal: 16, paddingVertical: 12,
        backgroundColor: 'white',
        borderBottomWidth: 1, borderBottomColor: '#f3f4f6',
    },
    avatar: { width: 52, height: 52, borderRadius: 26, alignItems: 'center', justifyContent: 'center', marginRight: 14 },
    avatarText: { color: 'white', fontWeight: '700', fontSize: 18 },
    info: { flex: 1 },
    topRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 3 },
    bottomRow: { flexDirection: 'row', alignItems: 'center' },
    name: { fontSize: 16, fontWeight: '600', color: '#111', flex: 1 },
    time: { fontSize: 12, color: '#9ca3af', marginLeft: 8 },
    preview: { fontSize: 14, color: '#6b7280', flex: 1 },
    myTick: { fontSize: 13, color: '#0a84ff' },

    // Empty state
    empty: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 40, paddingBottom: 80 },
    emptyIcon: { fontSize: 60, marginBottom: 12 },
    emptyTitle: { fontSize: 18, fontWeight: '700', color: '#374151', marginBottom: 8 },
    emptyText: { fontSize: 14, color: '#6b7280', textAlign: 'center' },
});
