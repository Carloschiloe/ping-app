import React from 'react';
import {
    View, Text, FlatList, TouchableOpacity, StyleSheet,
    ActivityIndicator, StatusBar, Platform, Image, ScrollView, TextInput
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
    const [searchQuery, setSearchQuery] = React.useState('');
    const [filter, setFilter] = React.useState<'all' | 'unread' | 'groups' | 'private'>('all');

    const rawConversations = data?.conversations || [];
    const { mutate: openSelf, isPending: selfPending } = useGetOrCreateSelfConversation();

    const filteredConversations = React.useMemo(() => {
        return rawConversations.filter((c: any) => {
            const name = (c.isGroup ? c.groupMetadata?.name : (c.otherUser?.full_name || c.otherUser?.email)) || '';
            const nameMatch = name.toLowerCase().includes(searchQuery.toLowerCase());

            if (!nameMatch) return false;

            if (filter === 'unread') return (c.unreadCount || 0) > 0;
            if (filter === 'groups') return c.isGroup;
            if (filter === 'private') return !c.isGroup;
            return true;
        });
    }, [rawConversations, searchQuery, filter]);

    const renderItem = ({ item }: { item: any }) => {
        const isGroup = item.isGroup;
        const otherUser = item.otherUser;
        const groupMeta = item.groupMetadata;
        const lastMsg = item.lastMessage;

        const isSystem = lastMsg?.meta?.isSystem;
        const isByMe = lastMsg && (lastMsg.sender_id === user?.id || lastMsg.user_id === user?.id);
        const unreadCount = item.unreadCount || 0;
        const isUnread = unreadCount > 0;

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
                <View style={[styles.avatar, !avatarUrl && { backgroundColor: color }]}>
                    {avatarUrl ? (
                        <Image source={{ uri: avatarUrl }} style={styles.avatarImage} />
                    ) : (
                        <Text style={styles.avatarText}>{initials}</Text>
                    )}
                </View>

                <View style={styles.info}>
                    <View style={styles.topRow}>
                        <Text style={[styles.name, isUnread && { fontWeight: '800' }]} numberOfLines={1}>
                            {displayName}
                        </Text>
                        {lastMsg && (
                            <Text style={[styles.time, isUnread && { color: '#6366f1', fontWeight: '700' }]}>{formatTime(lastMsg.created_at)}</Text>
                        )}
                    </View>
                    <View style={styles.bottomRow}>
                        <View style={styles.previewWrap}>
                            {isByMe && lastMsg && (
                                <Ionicons
                                    name={lastMsg.status === 'sent' || !lastMsg.status ? 'checkmark' : 'checkmark-done'}
                                    size={15}
                                    color={lastMsg.status === 'read' ? '#34b7f1' : '#94a3b8'}
                                    style={{ marginRight: 4 }}
                                />
                            )}
                            <Text style={[styles.preview, isUnread && { color: '#1e293b', fontWeight: '600' }]} numberOfLines={1}>
                                {preview}
                            </Text>
                        </View>
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

            {/* Header Section */}
            <View style={styles.headerSection}>
                <View style={styles.headerTop}>
                    <Text style={styles.title}>Ping</Text>
                    <TouchableOpacity style={styles.headerIconBtn} onPress={() => navigation.navigate('NewChat')}>
                        <Ionicons name="add" size={28} color="white" />
                    </TouchableOpacity>
                </View>

                <View style={styles.searchBar}>
                    <Ionicons name="search" size={18} color="#cbd5e1" />
                    <TextInput
                        style={styles.searchInput}
                        placeholder="Buscar chats..."
                        placeholderTextColor="#94a3b8"
                        value={searchQuery}
                        onChangeText={setSearchQuery}
                    />
                    {searchQuery.length > 0 && (
                        <TouchableOpacity onPress={() => setSearchQuery('')}>
                            <Ionicons name="close-circle" size={18} color="#cbd5e1" />
                        </TouchableOpacity>
                    )}
                </View>
            </View>

            {isLoading ? (
                <ActivityIndicator size="large" color="#6366f1" style={{ marginTop: 40 }} />
            ) : (
                <FlatList
                    data={filteredConversations}
                    keyExtractor={item => item.id}
                    renderItem={renderItem}
                    showsVerticalScrollIndicator={false}
                    contentContainerStyle={styles.listContent}
                    ListHeaderComponent={() => (
                        <>
                            {/* Quick Actions Scroll */}
                            <ScrollView
                                horizontal
                                showsHorizontalScrollIndicator={false}
                                style={styles.quickActionsScroll}
                                contentContainerStyle={styles.quickActionsContent}
                            >
                                <TouchableOpacity
                                    style={styles.qaCard}
                                    onPress={() => openSelf(undefined, {
                                        onSuccess: ({ conversationId }) =>
                                            navigation.navigate('Chat', { conversationId, otherUser: null, isSelf: true }),
                                    })}
                                    disabled={selfPending}
                                >
                                    <View style={[styles.qaIconWrap, { backgroundColor: '#eff6ff' }]}>
                                        <Text style={{ fontSize: 20 }}>📌</Text>
                                    </View>
                                    <Text style={styles.qaLabel}>Notas</Text>
                                </TouchableOpacity>

                                <TouchableOpacity
                                    style={styles.qaCard}
                                    onPress={() => navigation.navigate('PingAI')}
                                >
                                    <View style={[styles.qaIconWrap, { backgroundColor: '#f0fdf4' }]}>
                                        <Text style={{ fontSize: 20 }}>🤖</Text>
                                    </View>
                                    <Text style={styles.qaLabel}>Ping AI</Text>
                                </TouchableOpacity>

                                <TouchableOpacity
                                    style={styles.qaCard}
                                    onPress={() => navigation.navigate('NewGroup')}
                                >
                                    <View style={[styles.qaIconWrap, { backgroundColor: '#fef2f2' }]}>
                                        <Ionicons name="people" size={22} color="#ef4444" />
                                    </View>
                                    <Text style={styles.qaLabel}>+ Grupo</Text>
                                </TouchableOpacity>

                                <TouchableOpacity
                                    style={styles.qaCard}
                                    onPress={() => navigation.navigate('NewChat')}
                                >
                                    <View style={[styles.qaIconWrap, { backgroundColor: '#faf5ff' }]}>
                                        <Ionicons name="chatbubble-ellipses" size={22} color="#a855f7" />
                                    </View>
                                    <Text style={styles.qaLabel}>+ Chat</Text>
                                </TouchableOpacity>
                            </ScrollView>

                            {/* Filters */}
                            <View style={styles.filterBar}>
                                <TouchableOpacity
                                    style={[styles.filterChip, filter === 'all' && styles.filterChipActive]}
                                    onPress={() => setFilter('all')}
                                >
                                    <Text style={[styles.filterChipText, filter === 'all' && styles.filterChipActiveText]}>Todos</Text>
                                </TouchableOpacity>
                                <TouchableOpacity
                                    style={[styles.filterChip, filter === 'unread' && styles.filterChipActive]}
                                    onPress={() => setFilter('unread')}
                                >
                                    <Text style={[styles.filterChipText, filter === 'unread' && styles.filterChipActiveText]}>Sin Leer</Text>
                                </TouchableOpacity>
                                <TouchableOpacity
                                    style={[styles.filterChip, filter === 'groups' && styles.filterChipActive]}
                                    onPress={() => setFilter('groups')}
                                >
                                    <Text style={[styles.filterChipText, filter === 'groups' && styles.filterChipActiveText]}>Grupos</Text>
                                </TouchableOpacity>
                                <TouchableOpacity
                                    style={[styles.filterChip, filter === 'private' && styles.filterChipActive]}
                                    onPress={() => setFilter('private')}
                                >
                                    <Text style={[styles.filterChipText, filter === 'private' && styles.filterChipActiveText]}>Privados</Text>
                                </TouchableOpacity>
                            </View>
                        </>
                    )}
                    ListEmptyComponent={() => (
                        <View style={styles.empty}>
                            <Ionicons name="chatbubbles-outline" size={64} color="#e2e8f0" />
                            <Text style={styles.emptyTitle}>
                                {searchQuery.length > 0 ? 'Sin resultados' : 'Vacío'}
                            </Text>
                            <Text style={styles.emptyText}>
                                {searchQuery.length > 0 ? 'Prueba otra búsqueda' : 'Toca el botón + superior'}
                            </Text>
                        </View>
                    )}
                />
            )}
        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#ffffff' },

    headerSection: {
        backgroundColor: '#1e3a5f',
        paddingHorizontal: 20,
        paddingTop: Platform.OS === 'ios' ? 60 : 20,
        paddingBottom: 20,
        borderBottomLeftRadius: 30,
        borderBottomRightRadius: 30,
    },
    headerTop: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 20,
    },
    title: { fontSize: 32, fontWeight: '900', color: 'white', letterSpacing: -1.5 },
    headerIconBtn: {
        width: 44,
        height: 44,
        borderRadius: 22,
        backgroundColor: 'rgba(255,255,255,0.15)',
        alignItems: 'center',
        justifyContent: 'center',
    },
    searchBar: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: 'rgba(255,255,255,0.2)',
        borderRadius: 15,
        paddingHorizontal: 15,
        height: 48,
    },
    searchInput: {
        flex: 1,
        marginLeft: 10,
        color: 'white',
        fontSize: 16,
        fontWeight: '600',
    },

    quickActionsScroll: {
        backgroundColor: '#f8fafc',
    },
    quickActionsContent: {
        paddingHorizontal: 20,
        paddingVertical: 20,
        gap: 15,
    },
    qaCard: {
        alignItems: 'center',
        width: 75,
    },
    qaIconWrap: {
        width: 60,
        height: 60,
        borderRadius: 20,
        backgroundColor: 'white',
        alignItems: 'center',
        justifyContent: 'center',
        marginBottom: 8,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.08,
        shadowRadius: 8,
        elevation: 3,
    },
    qaLabel: {
        fontSize: 12,
        fontWeight: '700',
        color: '#64748b',
    },

    filterBar: {
        flexDirection: 'row',
        paddingHorizontal: 20,
        paddingBottom: 15,
        backgroundColor: '#f8fafc',
        gap: 10,
    },
    filterChip: {
        paddingHorizontal: 18,
        paddingVertical: 10,
        borderRadius: 20,
        backgroundColor: '#edf2f7',
        borderWidth: 1,
        borderColor: '#e2e8f0',
    },
    filterChipActive: {
        backgroundColor: '#1e3a5f',
        borderColor: '#1e3a5f',
    },
    filterChipText: {
        fontSize: 13,
        fontWeight: '700',
        color: '#64748b',
    },
    filterChipActiveText: {
        color: 'white',
    },

    listContent: {
        backgroundColor: 'white',
    },
    row: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 20,
        paddingVertical: 16,
        borderBottomWidth: 1,
        borderBottomColor: '#f1f5f9',
    },
    avatar: {
        width: 60,
        height: 60,
        borderRadius: 24,
        alignItems: 'center',
        justifyContent: 'center',
        marginRight: 15,
        overflow: 'hidden',
    },
    avatarImage: { width: '100%', height: '100%' },
    avatarText: { color: 'white', fontWeight: '900', fontSize: 22 },
    info: { flex: 1 },
    topRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 4,
    },
    name: { fontSize: 18, fontWeight: '700', color: '#0f172a', flex: 1 },
    time: { fontSize: 13, color: '#94a3b8', fontWeight: '600' },
    bottomRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
    },
    previewWrap: {
        flexDirection: 'row',
        alignItems: 'center',
        flex: 1,
        marginRight: 10,
    },
    preview: { fontSize: 15, color: '#64748b', flex: 1 },
    unreadBadge: {
        backgroundColor: '#6366f1',
        borderRadius: 12,
        paddingHorizontal: 8,
        paddingVertical: 4,
        minWidth: 24,
        alignItems: 'center',
        justifyContent: 'center',
    },
    unreadText: { color: 'white', fontSize: 11, fontWeight: '900' },

    empty: {
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        paddingTop: 80,
    },
    emptyTitle: { fontSize: 20, fontWeight: '800', color: '#334155', marginTop: 20 },
    emptyText: { fontSize: 15, color: '#94a3b8', textAlign: 'center', marginTop: 8 },
});
