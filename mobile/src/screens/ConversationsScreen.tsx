import React from 'react';
import {
    View, Text, FlatList, TouchableOpacity, StyleSheet,
    ActivityIndicator, StatusBar, Platform, Image
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
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
        const isGroup = item.isGroup;
        const otherUser = item.otherUser;
        const groupMeta = item.groupMetadata;
        const lastMsg = item.lastMessage;

        const isSystem = lastMsg?.meta?.isSystem;
        const isByMe = lastMsg && (lastMsg.sender_id === user?.id || lastMsg.user_id === user?.id);
        const unreadCount = item.unreadCount || 0;
        const isUnread = unreadCount > 0;

        // Compute Name and Initials based on whether it is a Group or 1-on-1
        let displayName = 'Chat';
        let initials = '?';
        let colorStr = 'chat';
        let avatarUrl: string | null = null;

        if (isGroup && groupMeta) {
            displayName = groupMeta.name;
            colorStr = groupMeta.name;
            avatarUrl = groupMeta.avatar_url;
            const words = groupMeta.name.split(' ').filter((w: string) => w.length > 0);
            if (words.length >= 2) initials = (words[0][0] + words[1][0]).toUpperCase();
            else initials = groupMeta.name.substring(0, 2).toUpperCase();
        } else if (otherUser) {
            // Priority: full_name > email split
            displayName = otherUser.full_name || otherUser.email?.split('@')[0] || 'Usuario';
            colorStr = otherUser.email || 'user';
            avatarUrl = otherUser.avatar_url;

            if (otherUser.full_name) {
                const parts = otherUser.full_name.trim().split(/\s+/).filter((p: string) => p.length > 0);
                if (parts.length >= 2) initials = (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
                else if (parts.length === 1) initials = parts[0].substring(0, 2).toUpperCase();
            } else {
                initials = avatarInitials(otherUser.email);
            }
        }

        const color = avatarColor(colorStr);
        const preview = lastMsg
            ? (isSystem ? `🤖 ${lastMsg.text}` : lastMsg.text)
            : 'Sin mensajes aún';

        return (
            <TouchableOpacity
                style={styles.row}
                activeOpacity={0.7}
                onPress={() => navigation.navigate('Chat', { conversationId: item.id, otherUser, isGroup, groupMetadata: groupMeta })}
            >
                {/* Avatar */}
                <View style={[styles.avatar, !avatarUrl && { backgroundColor: color }]}>
                    {avatarUrl ? (
                        <Image source={{ uri: avatarUrl }} style={styles.avatarImage} />
                    ) : (
                        <Text style={styles.avatarText}>{initials}</Text>
                    )}
                </View>

                {/* Info */}
                <View style={styles.info}>
                    <View style={styles.topRow}>
                        <Text style={[styles.name, isUnread && { fontWeight: '800' }]} numberOfLines={1}>
                            {displayName}
                        </Text>
                        {lastMsg && (
                            <Text style={[styles.time, isUnread && { color: '#0a84ff', fontWeight: '700' }]}>{formatTime(lastMsg.created_at)}</Text>
                        )}
                    </View>
                    <View style={styles.bottomRow}>
                        {isByMe && (
                            <Text style={[styles.myTick, lastMsg.status === 'read' ? { color: '#34b7f1' } : { color: '#9ca3af' }]}>
                                {lastMsg.status === 'sent' || !lastMsg.status ? '✓ ' : '✓✓ '}
                            </Text>
                        )}
                        <Text style={[styles.preview, isUnread && { color: '#111', fontWeight: '600' }]} numberOfLines={1}>{preview}</Text>
                        {isUnread && (
                            <View style={styles.unreadBadge}>
                                <Text style={styles.unreadText}>{unreadCount > 99 ? '99+' : unreadCount}</Text>
                            </View>
                        )}
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
                <View style={styles.headerActions}>
                    <TouchableOpacity style={styles.actionBtn} onPress={() => navigation.navigate('NewGroup')}>
                        <Ionicons name="people" size={24} color="white" />
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.actionBtn} onPress={() => navigation.navigate('NewChat')}>
                        <Ionicons name="create-outline" size={26} color="white" />
                    </TouchableOpacity>
                </View>
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

                    {/* AI: Preguntar a Ping */}
                    <TouchableOpacity
                        style={styles.aiRowEntry}
                        activeOpacity={0.7}
                        onPress={() => navigation.navigate('PingAI')}
                    >
                        <View style={styles.aiAvatar}>
                            <Text style={{ fontSize: 22 }}>🤖</Text>
                        </View>
                        <View style={styles.info}>
                            <Text style={[styles.name, { color: '#2563eb' }]}>Preguntar a Ping</Text>
                            <Text style={styles.preview}>IA que recuerda tus compromisos</Text>
                        </View>
                        <Ionicons name="chevron-forward" size={20} color="#bfceeb" />
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
    headerActions: { flexDirection: 'row', alignItems: 'center', gap: 16 },
    actionBtn: { padding: 4 },

    // Pinned self row
    selfRow: {
        flexDirection: 'row', alignItems: 'center',
        paddingHorizontal: 16, paddingVertical: 14,
        backgroundColor: 'white',
        borderBottomWidth: 1, borderBottomColor: '#f0f0f0',
    },
    selfAvatar: { backgroundColor: '#eff6ff', width: 52, height: 52, borderRadius: 26, alignItems: 'center', justifyContent: 'center', marginRight: 14 },

    // AI Row entry
    aiRowEntry: {
        flexDirection: 'row', alignItems: 'center',
        paddingHorizontal: 16, paddingVertical: 14,
        backgroundColor: '#f0f7ff',
        borderBottomWidth: 1, borderBottomColor: '#dbeafe',
    },
    aiAvatar: { backgroundColor: 'white', width: 52, height: 52, borderRadius: 26, alignItems: 'center', justifyContent: 'center', marginRight: 14, elevation: 2, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.1, shadowRadius: 2 },

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
    avatar: { width: 52, height: 52, borderRadius: 26, alignItems: 'center', justifyContent: 'center', marginRight: 14, overflow: 'hidden' },
    avatarImage: { width: '100%', height: '100%' },
    avatarText: { color: 'white', fontWeight: '700', fontSize: 18 },
    info: { flex: 1 },
    topRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 3 },
    bottomRow: { flexDirection: 'row', alignItems: 'center' },
    name: { fontSize: 16, fontWeight: '600', color: '#111', flex: 1 },
    time: { fontSize: 12, color: '#9ca3af', marginLeft: 8 },
    preview: { fontSize: 14, color: '#6b7280', flex: 1, paddingRight: 8 },
    myTick: { fontSize: 13, color: '#0a84ff', letterSpacing: -1 },
    unreadBadge: { backgroundColor: '#0a84ff', borderRadius: 10, paddingHorizontal: 6, paddingVertical: 2, minWidth: 20, alignItems: 'center', justifyContent: 'center' },
    unreadText: { color: 'white', fontSize: 11, fontWeight: '800' },

    // Empty state
    empty: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 40, paddingBottom: 80 },
    emptyIcon: { fontSize: 60, marginBottom: 12 },
    emptyTitle: { fontSize: 18, fontWeight: '700', color: '#374151', marginBottom: 8 },
    emptyText: { fontSize: 14, color: '#6b7280', textAlign: 'center' },
});
