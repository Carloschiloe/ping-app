import React from 'react';
import {
    View, Text, FlatList, TouchableOpacity, StyleSheet,
    ActivityIndicator, StatusBar, Platform, Image, ScrollView, TextInput, Animated, Alert
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useConversations, useGetOrCreateSelfConversation, useMarkConversationAsRead, useToggleArchive, useCreateConversation } from '../api/queries';
import { useAuth } from '../context/AuthContext';
import { LinearGradient } from 'expo-linear-gradient';
import { supabase } from '../lib/supabase';
import { Swipeable, GestureHandlerRootView } from 'react-native-gesture-handler';
import * as Haptics from 'expo-haptics';
import { useQuery } from '@tanstack/react-query';

const API_URL = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:3000/api';

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

const COLORS = ['#6366f1', '#10b981', '#f59e0b', '#ec4899', '#8b5cf6', '#06b6d4'];
function avatarColor(str: string) {
    let hash = 0;
    for (let i = 0; i < str.length; i++) hash = str.charCodeAt(i) + ((hash << 5) - hash);
    return COLORS[Math.abs(hash) % COLORS.length];
}

const HighlightText = ({ text, highlight, style, numberOfLines }: any) => {
    if (!highlight.trim()) {
        return <Text style={style} numberOfLines={numberOfLines}>{text}</Text>;
    }
    const regex = new RegExp(`(${highlight})`, 'gi');
    const parts = text.split(regex);
    return (
        <Text style={style} numberOfLines={numberOfLines}>
            {parts.map((part: string, i: number) =>
                regex.test(part) ? (
                    <Text key={i} style={{ backgroundColor: '#fef08a', color: '#854d0e', fontWeight: '800' }}>{part}</Text>
                ) : (
                    <Text key={i}>{part}</Text>
                )
            )}
        </Text>
    );
};

export default function ConversationsScreen({ navigation }: any) {
    const { data, isLoading } = useConversations();
    const { user } = useAuth();
    const [searchQuery, setSearchQuery] = React.useState('');
    const [filter, setFilter] = React.useState<'all' | 'unread' | 'groups' | 'private' | 'archived'>('all');
    const [typingUsers, setTypingUsers] = React.useState<Record<string, { name: string, isRecording: boolean }[]>>({});

    const scrollY = React.useRef(new Animated.Value(0)).current;

    const rawConversations = data?.conversations || [];
    const { mutate: openSelf, isPending: selfPending } = useGetOrCreateSelfConversation();
    const { mutate: markAsRead } = useMarkConversationAsRead('');
    const { mutate: toggleArchive } = useToggleArchive();
    const { mutateAsync: createConversation } = useCreateConversation();

    const { data: searchData, isLoading: isSearchingGlobal } = useQuery({
        queryKey: ['global-search', searchQuery],
        queryFn: async () => {
            if (!searchQuery || searchQuery.length <= 1) return null;
            const { data: { session } } = await supabase.auth.getSession();
            const res = await fetch(`${API_URL}/search?q=${encodeURIComponent(searchQuery)}`, {
                headers: { 'Authorization': `Bearer ${session?.access_token}` }
            });
            if (!res.ok) throw new Error('Global search failed');
            return res.json();
        },
        enabled: searchQuery.length > 1,
    });

    const isGlobalSearchActive = searchQuery.length > 1;

    React.useEffect(() => {
        if (!rawConversations.length || !user) return;
        const channels = rawConversations.map((conv: any) => {
            const channel = supabase.channel(`presence-${conv.id}`, {
                config: { presence: { key: user.id } },
            });
            channel
                .on('presence', { event: 'sync' }, () => {
                    const state = channel.presenceState();
                    const active: { name: string, isRecording: boolean }[] = [];
                    Object.keys(state).forEach((key) => {
                        if (key !== user.id) {
                            const sessions: any[] = state[key];
                            const isTyping = sessions.some(s => s.typing === true);
                            const isRec = sessions.some(s => s.recording === true);
                            if (isTyping || isRec) {
                                const pData = sessions[0];
                                active.push({ name: pData.name || pData.email || 'Alguien', isRecording: isRec });
                            }
                        }
                    });
                    setTypingUsers(prev => ({ ...prev, [conv.id]: active }));
                })
                .subscribe();
            return channel;
        });
        return () => {
            channels.forEach((ch: any) => supabase.removeChannel(ch));
        };
    }, [rawConversations.length, user?.id]);

    const filteredConversations = React.useMemo(() => {
        return rawConversations.filter((c: any) => {
            const name = (c.isGroup ? c.groupMetadata?.name : (c.otherUser?.full_name || c.otherUser?.email)) || '';
            const nameMatch = name.toLowerCase().includes(searchQuery.toLowerCase());
            if (!nameMatch) return false;

            // Respect archive filter
            if (filter === 'archived') return c.archived;
            if (c.archived) return false; // Hide archived from other filters

            if (filter === 'unread') return (c.unreadCount || 0) > 0;
            if (filter === 'groups') return c.isGroup;
            if (filter === 'private') return !c.isGroup;
            return true;
        });
    }, [rawConversations, searchQuery, filter]);

    const headerHeight = scrollY.interpolate({
        inputRange: [0, 100],
        outputRange: [Platform.OS === 'ios' ? 180 : 140, Platform.OS === 'ios' ? 120 : 80],
        extrapolate: 'clamp',
    });

    const searchScale = scrollY.interpolate({
        inputRange: [0, 50],
        outputRange: [1, 0.95],
        extrapolate: 'clamp',
    });

    const isOnline = (lastSeen?: string) => {
        if (!lastSeen) return false;
        const last = new Date(lastSeen).getTime();
        const now = new Date().getTime();
        // Online if updated in last 5 min
        return (now - last) < 1000 * 60 * 5;
    };

    const renderLeftActions = (progress: Animated.AnimatedInterpolation<number>, dragX: Animated.AnimatedInterpolation<number>, item: any) => {
        const isUnread = (item.unreadCount || 0) > 0;
        const trans = dragX.interpolate({
            inputRange: [0, 50, 100],
            outputRange: [-20, 0, 0],
        });
        return (
            <TouchableOpacity
                style={[styles.leftAction, { backgroundColor: isUnread ? '#3b82f6' : '#64748b' }]}
                onPress={() => { if (isUnread) markAsRead(item.id); }}
            >
                <Animated.View style={{ transform: [{ translateX: trans }] }}>
                    <Ionicons name={isUnread ? "mail-open-outline" : "mail-outline"} size={28} color="white" />
                </Animated.View>
            </TouchableOpacity>
        );
    };

    const renderRightActions = (progress: Animated.AnimatedInterpolation<number>, dragX: Animated.AnimatedInterpolation<number>, item: any) => {
        const trans = dragX.interpolate({
            inputRange: [-100, -50, 0],
            outputRange: [0, 0, 20],
        });
        const isArchived = item.archived;
        return (
            <TouchableOpacity
                style={[styles.rightAction, { backgroundColor: isArchived ? '#10b981' : '#64748b' }]}
                onPress={() => {
                    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                    toggleArchive(item.id);
                }}
            >
                <Animated.View style={{ transform: [{ translateX: trans }] }}>
                    <Ionicons name={isArchived ? "archive" : "archive-outline"} size={28} color="white" />
                </Animated.View>
            </TouchableOpacity>
        );
    };

    const globalSections = React.useMemo(() => {
        if (!searchData) return [];
        const result = [];
        const peopleAndGroups = [
            ...(searchData.conversations || []).map((c: any) => ({ ...c, type: 'group' })),
            ...(searchData.profiles || []).map((p: any) => ({ ...p, type: 'person' }))
        ];
        if (peopleAndGroups.length > 0) result.push({ title: 'Contactos y Grupos', data: peopleAndGroups, type: 'people' });
        if ((searchData.commitments || []).length > 0) result.push({ title: 'Tareas', data: searchData.commitments, type: 'tasks' });
        if ((searchData.messages || []).length > 0) result.push({ title: 'Mensajes', data: searchData.messages, type: 'messages' });
        return result;
    }, [searchData]);

    const handleGlobalResultPress = async (item: any, type: string) => {
        if (type === 'person') {
            const res = await createConversation(item.id);
            navigation.navigate('Chat', { conversationId: res.id, otherUser: item, isGroup: false });
            return;
        }
        if (type === 'group') {
            navigation.navigate('Chat', { conversationId: item.id, otherUser: null, isGroup: true, groupMetadata: item });
            return;
        }
        const isCommitment = type === 'tasks';
        const conversationId = isCommitment ? (item.conversation_id || item.message?.conversation_id) : item.conversation_id;
        const conv = rawConversations.find((c: any) => c.id === conversationId);
        navigation.navigate('Chat', {
            conversationId,
            scrollToMessageId: isCommitment ? item.message_id : item.id,
            isGroup: conv?.isGroup,
            otherUser: conv?.otherUser,
            groupMetadata: conv?.groupMetadata,
            isSelf: !conversationId || conv?.isSelf
        });
    };

    const renderGlobalSection = ({ item: section }: { item: any }) => (
        <View style={styles.sectionContainer}>
            <Text style={styles.sectionTitle}>{section.title}</Text>
            {section.data.map((item: any) => (
                <TouchableOpacity
                    key={item.id}
                    style={styles.resultCard}
                    onPress={() => handleGlobalResultPress(item, item.type || section.type)}
                >
                    <View style={styles.resultIcon}>
                        {item.avatar_url ? (
                            <Image source={{ uri: item.avatar_url }} style={styles.resultAvatar} />
                        ) : (
                            <View style={[styles.resultIconInner, { backgroundColor: item.type === 'person' ? '#3b82f6' : (item.type === 'group' ? '#10b981' : '#f59e0b') }]}>
                                <Ionicons
                                    name={item.type === 'person' ? 'person' : (item.type === 'group' ? 'people' : (section.type === 'tasks' ? 'calendar' : 'chatbubble'))}
                                    size={14}
                                    color="white"
                                />
                            </View>
                        )}
                    </View>
                    <View style={styles.resultInfo}>
                        <HighlightText
                            text={item.full_name || item.name || item.title || item.text}
                            highlight={searchQuery}
                            style={styles.resultText}
                            numberOfLines={1}
                        />
                        <Text style={styles.resultSubtext}>
                            {item.type === 'person' ? item.email : (item.type === 'group' ? 'Grupo' : (section.type === 'tasks' ? 'Tarea' : `De ${item.sender?.full_name || 'Enviado'}`))}
                        </Text>
                    </View>
                    <Ionicons name="chevron-forward" size={14} color="#cbd5e1" />
                </TouchableOpacity>
            ))}
        </View>
    );

    const renderItem = ({ item }: { item: any }) => {
        const isGroup = item.isGroup;
        const otherUser = item.otherUser;
        const groupMeta = item.groupMetadata;
        const lastMsg = item.lastMessage;
        const isSystem = lastMsg?.meta?.isSystem;
        const isByMe = lastMsg && lastMsg.sender_id === user?.id;
        const unreadCount = item.unreadCount || 0;
        const isUnread = unreadCount > 0;
        const typers = typingUsers[item.id] || [];
        const isTyping = typers.length > 0;

        let displayName = 'Chat';
        let initials = '?';
        let colorStr = 'chat';
        let avatarUrl: string | null = null;
        let online = false;

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
            online = isOnline(otherUser.last_seen);
            if (otherUser.full_name) {
                const parts = otherUser.full_name.trim().split(/\s+/).filter((p: string) => p.length > 0);
                if (parts.length >= 2) initials = (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
                else if (parts.length === 1) initials = parts[0].substring(0, 2).toUpperCase();
            } else { initials = avatarInitials(otherUser.email); }
        }

        const color = avatarColor(colorStr);
        const preview = isTyping
            ? (typers[0].isRecording ? '🎤 Grabando audio...' : '✍️ Escribiendo...')
            : (lastMsg ? (isSystem ? `🤖 ${lastMsg.text}` : lastMsg.text) : 'Sin mensajes aún');

        return (
            <Swipeable
                renderLeftActions={(progress, dragX) => renderLeftActions(progress, dragX, item)}
                renderRightActions={(progress, dragX) => renderRightActions(progress, dragX, item)}
                friction={2}
                leftThreshold={40}
                rightThreshold={40}
            >
                <TouchableOpacity
                    style={styles.row}
                    activeOpacity={0.6}
                    onPress={() => navigation.navigate('Chat', { conversationId: item.id, otherUser, isGroup, groupMetadata: groupMeta })}
                >
                    <View style={styles.avatarContainer}>
                        <View style={[styles.avatar, !avatarUrl && { backgroundColor: color }]}>
                            {avatarUrl ? <Image source={{ uri: avatarUrl }} style={styles.avatarImage} /> : <Text style={styles.avatarText}>{initials}</Text>}
                        </View>
                        {online && <View style={styles.onlineDot} />}
                        {isUnread && !online && <View style={styles.unreadIndicator} />}
                        {isUnread && online && <View style={[styles.unreadIndicator, { right: 28 }]} />}
                    </View>
                    <View style={styles.info}>
                        <View style={styles.topRow}>
                            <Text style={[styles.name, isUnread && styles.nameUnread]} numberOfLines={1}>{displayName}</Text>
                            {lastMsg && <Text style={[styles.time, isUnread && styles.timeUnread]}>{formatTime(lastMsg.created_at)}</Text>}
                        </View>
                        <View style={styles.bottomRow}>
                            <View style={styles.previewWrap}>
                                {!isTyping && isByMe && lastMsg && (
                                    <Ionicons name={lastMsg.status === 'read' ? 'checkmark-done' : 'checkmark'} size={16} color={lastMsg.status === 'read' ? '#3b82f6' : '#94a3b8'} style={{ marginRight: 4 }} />
                                )}
                                <Text style={[styles.preview, isUnread && styles.previewUnread, isTyping && { color: '#6366f1', fontWeight: '700' }]} numberOfLines={1}>{preview}</Text>
                            </View>
                            {isUnread && (
                                <LinearGradient colors={['#6366f1', '#8b5cf6']} style={styles.unreadBadge} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}>
                                    <Text style={styles.unreadText}>{unreadCount > 99 ? '99+' : unreadCount}</Text>
                                </LinearGradient>
                            )}
                        </View>
                    </View>
                </TouchableOpacity>
                <View style={styles.separator} />
            </Swipeable>
        );
    };

    return (
        <GestureHandlerRootView style={{ flex: 1 }}>
            <View style={styles.container}>
                <StatusBar barStyle="light-content" translucent backgroundColor="transparent" />
                <Animated.View style={[styles.headerSection, { height: headerHeight }]}>
                    <LinearGradient colors={['#0f172a', '#1e3a8a']} style={StyleSheet.absoluteFill} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} />
                    <View style={styles.headerTop}>
                        <Text style={styles.title}>Ping</Text>
                        <TouchableOpacity style={styles.headerIconBtn} onPress={() => navigation.navigate('PingAI')}>
                            <Ionicons name="sparkles" size={24} color="white" />
                        </TouchableOpacity>
                    </View>
                    <Animated.View style={[styles.searchContainer, { transform: [{ scale: searchScale }] }]}>
                        <View style={styles.searchBar}>
                            <Ionicons name="search" size={18} color="#94a3b8" />
                            <TextInput style={styles.searchInput} placeholder="Buscar en tus hilos..." placeholderTextColor="#64748b" value={searchQuery} onChangeText={setSearchQuery} />
                            {searchQuery.length > 0 && (
                                <TouchableOpacity onPress={() => setSearchQuery('')}>
                                    <Ionicons name="close-circle" size={18} color="#94a3b8" />
                                </TouchableOpacity>
                            )}
                        </View>
                    </Animated.View>
                </Animated.View>

                {isLoading ? (
                    <View style={styles.loadingContainer}>
                        {[1, 2, 3, 4, 5, 6].map(i => <ConversationSkeleton key={i} />)}
                    </View>
                ) : isGlobalSearchActive ? (
                    <FlatList
                        data={globalSections}
                        keyExtractor={item => item.title}
                        renderItem={renderGlobalSection}
                        contentContainerStyle={styles.listContent}
                        ListHeaderComponent={() => (
                            <View style={styles.searchHeaderLabel}>
                                <Text style={styles.searchHeaderLabelText}>BÚSQUEDA GLOBAL</Text>
                            </View>
                        )}
                        ListEmptyComponent={() => (
                            <View style={styles.empty}>
                                {isSearchingGlobal ? <ActivityIndicator color="#64748b" /> : (
                                    <>
                                        <Ionicons name="search-outline" size={60} color="#f1f5f9" />
                                        <Text style={styles.emptyTitle}>Sin resultados en Ping</Text>
                                    </>
                                )}
                            </View>
                        )}
                    />
                ) : (
                    <Animated.FlatList
                        data={filteredConversations}
                        keyExtractor={item => item.id}
                        renderItem={renderItem}
                        onScroll={Animated.event([{ nativeEvent: { contentOffset: { y: scrollY } } }], { useNativeDriver: false })}
                        scrollEventThrottle={16}
                        showsVerticalScrollIndicator={false}
                        contentContainerStyle={styles.listContent}
                        ListHeaderComponent={() => (
                            <View style={styles.listHeader}>
                                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.quickActionsContent}>
                                    <QuickAction label="Notas" emoji="📌" bg="#e0f2fe" onPress={() => openSelf(undefined, { onSuccess: ({ conversationId }) => navigation.navigate('Chat', { conversationId, otherUser: null, isSelf: true }) })} disabled={selfPending} />
                                    <QuickAction label="AI" emoji="🤖" bg="#f0fdf4" onPress={() => navigation.navigate('PingAI')} />
                                    <QuickAction label="Grupo" icon="people" color="#ef4444" bg="#fef2f2" onPress={() => navigation.navigate('NewGroup')} />
                                    <QuickAction label="Chat" icon="chatbubble-ellipses" color="#8b5cf6" bg="#faf5ff" onPress={() => navigation.navigate('NewChat')} />
                                </ScrollView>
                                <ScrollView
                                    horizontal
                                    showsHorizontalScrollIndicator={false}
                                    style={styles.filterBarContainer}
                                    contentContainerStyle={styles.filterBar}
                                >
                                    <FilterChip label="Todos" active={filter === 'all'} onPress={() => setFilter('all')} />
                                    <FilterChip label="Sin Leer" active={filter === 'unread'} onPress={() => setFilter('unread')} />
                                    <FilterChip label="Grupos" active={filter === 'groups'} onPress={() => setFilter('groups')} />
                                    <FilterChip label="Privados" active={filter === 'private'} onPress={() => setFilter('private')} />
                                    <FilterChip label="Archivados" active={filter === 'archived'} onPress={() => setFilter('archived')} />
                                </ScrollView>
                            </View>
                        )}
                        ListEmptyComponent={() => (
                            <View style={styles.empty}>
                                <Ionicons name="chatbubbles-outline" size={80} color="#f1f5f9" />
                                <Text style={styles.emptyTitle}>Nada por aquí</Text>
                                <Text style={styles.emptyText}>Inicia un hilo o cambia el filtro</Text>
                            </View>
                        )}
                    />
                )}
            </View>
        </GestureHandlerRootView>
    );
}

function QuickAction({ label, emoji, icon, color, bg, onPress, disabled }: any) {
    return (
        <TouchableOpacity style={styles.qaCard} onPress={onPress} disabled={disabled} activeOpacity={0.7}>
            <View style={[styles.qaIconWrap, { backgroundColor: bg }]}>{emoji ? <Text style={{ fontSize: 24 }}>{emoji}</Text> : <Ionicons name={icon} size={24} color={color} />}</View>
            <Text style={styles.qaLabel}>{label}</Text>
        </TouchableOpacity>
    );
}

function FilterChip({ label, active, onPress }: any) {
    return (
        <TouchableOpacity style={[styles.filterChip, active && styles.filterChipActive]} onPress={onPress} activeOpacity={0.8}>
            <Text style={[styles.filterChipText, active && styles.filterChipActiveText]}>{label}</Text>
        </TouchableOpacity>
    );
}

function ConversationSkeleton() {
    return (
        <View style={styles.skeletonRow}>
            <View style={styles.skeletonAvatar} />
            <View style={styles.skeletonInfo}>
                <View style={[styles.skeletonLine, { width: '40%', marginBottom: 12 }]} />
                <View style={[styles.skeletonLine, { width: '80%' }]} />
            </View>
        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#ffffff' },
    loadingContainer: { flex: 1, paddingTop: 20 },
    skeletonRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 24, paddingVertical: 14 },
    skeletonAvatar: { width: 56, height: 56, borderRadius: 28, backgroundColor: '#f1f5f9', marginRight: 16 },
    skeletonInfo: { flex: 1 },
    skeletonLine: { height: 12, borderRadius: 6, backgroundColor: '#f1f5f9' },
    headerSection: { paddingHorizontal: 24, justifyContent: 'flex-end', paddingBottom: 20, zIndex: 10 },
    headerTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
    title: { fontSize: 34, fontWeight: '900', color: 'white', letterSpacing: -2 },
    headerIconBtn: { width: 44, height: 44, borderRadius: 22, backgroundColor: 'rgba(255,255,255,0.12)', alignItems: 'center', justifyContent: 'center' },
    searchContainer: { width: '100%' },
    searchBar: { flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(255,255,255,0.08)', borderRadius: 16, paddingHorizontal: 16, height: 50, borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)' },
    searchInput: { flex: 1, marginLeft: 12, color: 'white', fontSize: 16, fontWeight: '500' },
    listHeader: { backgroundColor: '#ffffff', borderTopLeftRadius: 32, borderTopRightRadius: 32, marginTop: -20 },
    quickActionsContent: { paddingHorizontal: 24, paddingVertical: 24, gap: 20 },
    qaCard: { alignItems: 'center', width: 70 },
    qaIconWrap: { width: 64, height: 64, borderRadius: 22, alignItems: 'center', justifyContent: 'center', marginBottom: 10, shadowColor: '#000', shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.05, shadowRadius: 12, elevation: 4 },
    qaLabel: { fontSize: 13, fontWeight: '700', color: '#1e293b' },
    filterBarContainer: { marginBottom: 20 },
    filterBar: { flexDirection: 'row', paddingHorizontal: 24, gap: 8 },
    filterChip: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 20, backgroundColor: '#f8fafc', borderWidth: 1, borderColor: '#f1f5f9' },
    filterChipActive: { backgroundColor: '#0f172a', borderColor: '#0f172a' },
    filterChipText: { fontSize: 13, fontWeight: '700', color: '#64748b' },
    filterChipActiveText: { color: 'white' },
    listContent: { paddingBottom: 100 },
    row: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 24, paddingVertical: 14, backgroundColor: 'white' },
    avatarContainer: { position: 'relative' },
    avatar: { width: 56, height: 56, borderRadius: 28, alignItems: 'center', justifyContent: 'center', marginRight: 16, overflow: 'hidden' },
    avatarImage: { width: '100%', height: '100%' },
    avatarText: { color: 'white', fontWeight: '900', fontSize: 24 },
    unreadIndicator: { position: 'absolute', top: -1, right: 14, width: 14, height: 14, borderRadius: 7, backgroundColor: '#4f46e5', borderWidth: 2, borderColor: 'white' },
    onlineDot: { position: 'absolute', bottom: -1, right: 14, width: 15, height: 15, borderRadius: 7.5, backgroundColor: '#10b981', borderWidth: 2, borderColor: 'white', zIndex: 10 },
    info: { flex: 1 },
    topRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 },
    name: { fontSize: 17, fontWeight: '600', color: '#64748b' },
    nameUnread: { color: '#0f172a', fontWeight: '800' },
    time: { fontSize: 12, color: '#94a3b8', fontWeight: '500' },
    timeUnread: { color: '#4f46e5', fontWeight: '700' },
    bottomRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    previewWrap: { flexDirection: 'row', alignItems: 'center', flex: 1, marginRight: 12 },
    preview: { fontSize: 14, color: '#94a3b8' },
    previewUnread: { color: '#334155', fontWeight: '600' },
    unreadBadge: { borderRadius: 10, paddingHorizontal: 8, paddingVertical: 4, minWidth: 24, alignItems: 'center', justifyContent: 'center' },
    unreadText: { color: 'white', fontSize: 11, fontWeight: '900' },
    empty: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingTop: 100 },
    emptyTitle: { fontSize: 20, fontWeight: '800', color: '#cbd5e1', marginTop: 12 },
    emptyText: { fontSize: 15, color: '#94a3b8', marginTop: 4 },
    leftAction: { flex: 1, backgroundColor: '#3b82f6', justifyContent: 'center', alignItems: 'flex-start', paddingLeft: 20 },
    rightAction: { flex: 1, backgroundColor: '#64748b', justifyContent: 'center', alignItems: 'flex-end', paddingRight: 20 },
    separator: { height: 1, backgroundColor: '#f1f5f9', marginLeft: 96, marginRight: 24 },
    // Search 2.0 Fusion Styles
    searchHeaderLabel: { paddingHorizontal: 24, paddingVertical: 12, backgroundColor: '#f8fafc' },
    searchHeaderLabelText: { fontSize: 11, fontWeight: '900', color: '#94a3b8', letterSpacing: 1 },
    sectionContainer: { marginTop: 16 },
    sectionTitle: { fontSize: 13, fontWeight: '800', color: '#64748b', textTransform: 'uppercase', letterSpacing: 1, marginHorizontal: 24, marginBottom: 12 },
    resultCard: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 24, paddingVertical: 12, backgroundColor: 'white' },
    resultIcon: { marginRight: 16 },
    resultIconInner: { width: 36, height: 36, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
    resultAvatar: { width: 36, height: 36, borderRadius: 18 },
    resultInfo: { flex: 1, marginRight: 12 },
    resultText: { fontSize: 16, fontWeight: '600', color: '#1e293b' },
    resultSubtext: { fontSize: 12, color: '#94a3b8', marginTop: 2 },
});
