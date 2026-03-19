import React from 'react';
import {
    View, Text, FlatList, TouchableOpacity, StyleSheet,
    ActivityIndicator, StatusBar, Platform, ScrollView, TextInput, Animated
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useConversations, useGetOrCreateSelfConversation, useMarkConversationAsRead, useToggleArchive, useCreateConversation } from '../api/queries';
import { useAuth } from '../context/AuthContext';
import { LinearGradient } from 'expo-linear-gradient';
import { supabase } from '../lib/supabase';
import { Swipeable, GestureHandlerRootView } from 'react-native-gesture-handler';
import * as Haptics from 'expo-haptics';
import { useQuery } from '@tanstack/react-query';
import { useDebouncedValue } from '../hooks/useDebouncedValue';
import type { ConversationsListScreenProps } from '../navigation/types';
import { useAppTheme } from '../theme/ThemeContext';
import { apiClient } from '../api/client';
import { ConversationRow } from '../components/ConversationRow';
import { GlobalSearchSection } from '../components/GlobalSearchSection';

function formatTime(iso: string) {
    const d = new Date(iso);
    const now = new Date();
    const isToday = d.toDateString() === now.toDateString();
    if (isToday) return d.toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' });
    return d.toLocaleDateString('es-CL', { day: '2-digit', month: '2-digit' });
}

export default function ConversationsScreen({ navigation }: ConversationsListScreenProps) {
    const { theme } = useAppTheme();
    const styles = React.useMemo(() => createStyles(theme), [theme]);
    const { data, isLoading } = useConversations();
    const { user } = useAuth();
    const [searchQuery, setSearchQuery] = React.useState('');
    const [filter, setFilter] = React.useState<'all' | 'unread' | 'groups' | 'private' | 'archived'>('all');
    const [typingUsers, setTypingUsers] = React.useState<Record<string, { name: string, isRecording: boolean }[]>>({});
    const [showQuickActions, setShowQuickActions] = React.useState(false);
    const debouncedSearchQuery = useDebouncedValue(searchQuery, 220);

    const scrollY = React.useRef(new Animated.Value(0)).current;

    const rawConversations = React.useMemo(() => data?.conversations || [], [data?.conversations]);
    const { mutate: openSelf, isPending: selfPending } = useGetOrCreateSelfConversation();
    const { mutate: markAsRead } = useMarkConversationAsRead('');
    const { mutate: toggleArchive } = useToggleArchive();
    const { mutateAsync: createConversation } = useCreateConversation();

    const { data: searchData, isLoading: isSearchingGlobal } = useQuery({
        queryKey: ['global-search', debouncedSearchQuery],
        queryFn: async () => {
            if (!debouncedSearchQuery || debouncedSearchQuery.length <= 1) return null;
            return apiClient.get(`/search?q=${encodeURIComponent(debouncedSearchQuery)}`);
        },
        enabled: debouncedSearchQuery.length > 1,
    });

    const isGlobalSearchActive = debouncedSearchQuery.length > 1;

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
    }, [rawConversations, user]);

    const filteredConversations = React.useMemo(() => {
        return rawConversations.filter((c: any) => {
            const name = (c.isGroup ? c.groupMetadata?.name : (c.otherUser?.full_name || c.otherUser?.email)) || '';
            const nameMatch = name.toLowerCase().includes(debouncedSearchQuery.toLowerCase());
            if (!nameMatch) return false;

            // Respect archive filter
            if (filter === 'archived') return c.archived;
            if (c.archived) return false; // Hide archived from other filters

            if (filter === 'unread') return (c.unreadCount || 0) > 0;
            if (filter === 'groups') return c.isGroup;
            if (filter === 'private') return !c.isGroup;
            return true;
        });
    }, [rawConversations, debouncedSearchQuery, filter]);

    const headerHeight = scrollY.interpolate({
        inputRange: [0, 100],
        outputRange: [Platform.OS === 'ios' ? 140 : 110, Platform.OS === 'ios' ? 92 : 70],
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

    const renderLeftActions = React.useCallback((progress: Animated.AnimatedInterpolation<number>, dragX: Animated.AnimatedInterpolation<number>, item: any) => {
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
    }, [markAsRead, styles]);

    const renderRightActions = React.useCallback((progress: Animated.AnimatedInterpolation<number>, dragX: Animated.AnimatedInterpolation<number>, item: any) => {
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
    }, [toggleArchive, styles]);

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

    const handleGlobalResultPress = React.useCallback(async (item: any, type: string) => {
        if (type === 'person') {
            const res = await createConversation(item.id);
            navigation.navigate('Chat', { conversationId: res.conversationId, otherUser: item, isGroup: false, mode: 'chat' });
            return;
        }
        if (type === 'group') {
            navigation.navigate('Chat', { conversationId: item.id, otherUser: null, isGroup: true, groupMetadata: item, mode: item.mode || 'chat' });
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
            isSelf: !conversationId || conv?.isSelf,
            mode: conv?.mode || 'chat'
        });
    }, [createConversation, navigation, rawConversations]);

    const renderGlobalSection = React.useCallback(({ item: section }: { item: any }) => (
        <GlobalSearchSection
            section={section}
            searchQuery={searchQuery}
            styles={styles}
            onPress={handleGlobalResultPress}
        />
    ), [handleGlobalResultPress, searchQuery, styles]);

    const renderItem = React.useCallback(({ item }: { item: any }) => (
        <Swipeable
            renderLeftActions={(progress, dragX) => renderLeftActions(progress, dragX, item)}
            renderRightActions={(progress, dragX) => renderRightActions(progress, dragX, item)}
            friction={2}
            leftThreshold={40}
            rightThreshold={40}
        >
            <ConversationRow
                item={item}
                userId={user?.id}
                typingUsers={typingUsers}
                formatTime={formatTime}
                isOnline={isOnline}
                styles={styles}
                theme={theme}
                onPress={() => navigation.navigate('Chat', { conversationId: item.id, otherUser: item.otherUser, isGroup: item.isGroup, groupMetadata: item.groupMetadata, mode: item.mode || 'chat' })}
            />
        </Swipeable>
    ), [typingUsers, user?.id, navigation, styles, renderLeftActions, renderRightActions, theme]);

    return (
        <GestureHandlerRootView style={{ flex: 1 }}>
            <View style={styles.container}>
                <StatusBar barStyle="light-content" translucent backgroundColor="transparent" />
                <Animated.View style={[styles.headerSection, { height: headerHeight }]}> 
                        <LinearGradient colors={theme.colors.headerGradient as any} style={StyleSheet.absoluteFill} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} />
                    <View style={styles.headerTop}>
                        <View>
                            <Text style={styles.title}>Ping</Text>
                            <Text style={styles.headerSubtitle}>Tus conversaciones y tareas en un solo lugar</Text>
                        </View>
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
                        {[1, 2, 3, 4, 5, 6].map(i => <ConversationSkeleton key={i} styles={styles} />)}
                    </View>
                ) : isGlobalSearchActive ? (
                    <FlatList
                        data={globalSections}
                        keyExtractor={item => item.title}
                        renderItem={renderGlobalSection}
                        initialNumToRender={6}
                        maxToRenderPerBatch={8}
                        windowSize={8}
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
                        initialNumToRender={10}
                        maxToRenderPerBatch={10}
                        windowSize={8}
                        removeClippedSubviews={Platform.OS === 'android'}
                        onScroll={Animated.event([{ nativeEvent: { contentOffset: { y: scrollY } } }], { useNativeDriver: false })}
                        scrollEventThrottle={16}
                        showsVerticalScrollIndicator={false}
                        contentContainerStyle={styles.listContent}
                        ListHeaderComponent={() => (
                                <View style={styles.listHeader}>
                                    <View style={styles.sectionHintRow}>
                                        <Text style={styles.sectionHintText}>{filteredConversations.length} hilos visibles</Text>
                                        {filter !== 'all' ? <Text style={styles.sectionHintText}>Filtro: {filter}</Text> : null}
                                    </View>
                                    <TouchableOpacity style={styles.quickActionsToggle} onPress={() => setShowQuickActions(prev => !prev)} activeOpacity={0.7}>
                                        <View style={styles.quickActionsToggleLeft}>
                                            <Ionicons name="flash" size={16} color={theme.colors.secondary} />
                                            <Text style={styles.quickActionsToggleText}>Acciones rápidas</Text>
                                        </View>
                                        <Ionicons name={showQuickActions ? 'chevron-up' : 'chevron-down'} size={18} color={theme.colors.text.muted} />
                                    </TouchableOpacity>
                                    {showQuickActions && (
                                        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.quickActionsContent}>
                                            <QuickAction styles={styles} label="Notas" emoji="📌" bg={theme.isDark ? '#12354a' : '#e0f2fe'} onPress={() => openSelf(undefined, { onSuccess: ({ conversationId }) => navigation.navigate('Chat', { conversationId, otherUser: null, isSelf: true }) })} disabled={selfPending} />
                                            <QuickAction styles={styles} label="AI" emoji="🤖" bg={theme.isDark ? '#173320' : '#f0fdf4'} onPress={() => navigation.navigate('PingAI')} />
                                            <QuickAction styles={styles} label="Grupo" icon="people" color="#ef4444" bg={theme.isDark ? '#3a1f24' : '#fef2f2'} onPress={() => navigation.navigate('NewGroup')} />
                                            <QuickAction styles={styles} label="Chat" icon="chatbubble-ellipses" color="#8b5cf6" bg={theme.isDark ? '#27213d' : '#faf5ff'} onPress={() => navigation.navigate('NewChat')} />
                                        </ScrollView>
                                    )}
                                    <ScrollView
                                        horizontal
                                        showsHorizontalScrollIndicator={false}
                                    style={styles.filterBarContainer}
                                    contentContainerStyle={styles.filterBar}
                                >
                                    <FilterChip styles={styles} label="Todos" active={filter === 'all'} onPress={() => setFilter('all')} />
                                    <FilterChip styles={styles} label="Sin Leer" active={filter === 'unread'} onPress={() => setFilter('unread')} />
                                    <FilterChip styles={styles} label="Grupos" active={filter === 'groups'} onPress={() => setFilter('groups')} />
                                    <FilterChip styles={styles} label="Privados" active={filter === 'private'} onPress={() => setFilter('private')} />
                                    <FilterChip styles={styles} label="Archivados" active={filter === 'archived'} onPress={() => setFilter('archived')} />
                                </ScrollView>
                            </View>
                        )}
                        ListEmptyComponent={() => (
                            <View style={styles.empty}>
                                <Ionicons name="chatbubbles-outline" size={80} color={theme.colors.separator} />
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

function QuickAction({ styles, label, emoji, icon, color, bg, onPress, disabled }: any) {
    return (
        <TouchableOpacity style={styles.qaCard} onPress={onPress} disabled={disabled} activeOpacity={0.7}>
            <View style={[styles.qaIconWrap, { backgroundColor: bg }]}>{emoji ? <Text style={{ fontSize: 24 }}>{emoji}</Text> : <Ionicons name={icon} size={24} color={color} />}</View>
            <Text style={styles.qaLabel}>{label}</Text>
        </TouchableOpacity>
    );
}

function FilterChip({ styles, label, active, onPress }: any) {
    return (
        <TouchableOpacity style={[styles.filterChip, active && styles.filterChipActive]} onPress={onPress} activeOpacity={0.8}>
            <Text style={[styles.filterChipText, active && styles.filterChipActiveText]}>{label}</Text>
        </TouchableOpacity>
    );
}

function ConversationSkeleton({ styles }: any) {
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

const createStyles = (theme: any) => StyleSheet.create({
    container: { flex: 1, backgroundColor: theme.colors.screen },
    loadingContainer: { flex: 1, paddingTop: 20 },
    skeletonRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 24, paddingVertical: 16 },
    skeletonAvatar: { width: 56, height: 56, borderRadius: 28, backgroundColor: theme.colors.surfaceMuted, marginRight: 16 },
    skeletonInfo: { flex: 1 },
    skeletonLine: { height: 12, borderRadius: 6, backgroundColor: theme.colors.surfaceMuted },
    headerSection: { paddingHorizontal: 20, justifyContent: 'flex-end', paddingBottom: 12, zIndex: 10 },
    headerTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
    title: { fontSize: 28, fontWeight: '800', color: theme.colors.white, letterSpacing: -1 },
    headerSubtitle: { marginTop: 2, fontSize: 12, color: 'rgba(255,255,255,0.65)', fontWeight: '500' },
    headerIconBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: theme.colors.headerCard, alignItems: 'center', justifyContent: 'center' },
    searchContainer: { width: '100%' },
    searchBar: { flexDirection: 'row', alignItems: 'center', backgroundColor: theme.colors.headerCard, borderRadius: 16, paddingHorizontal: 14, height: 46, borderWidth: 1, borderColor: 'rgba(255,255,255,0.12)' },
    searchInput: { flex: 1, marginLeft: 10, color: theme.colors.white, fontSize: 15, fontWeight: '500' },
    listHeader: { backgroundColor: theme.colors.screen, borderTopLeftRadius: 24, borderTopRightRadius: 24, marginTop: -12 },
    quickActionsToggle: { marginHorizontal: 20, marginBottom: 8, paddingVertical: 10, paddingHorizontal: 12, borderRadius: 14, backgroundColor: theme.colors.surfaceMuted, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    quickActionsToggleLeft: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    quickActionsToggleText: { fontSize: 13, fontWeight: '700', color: theme.colors.text.secondary },
    quickActionsContent: { paddingHorizontal: 20, paddingVertical: 12, gap: 16 },
    qaCard: { alignItems: 'center', width: 64 },
    qaIconWrap: { width: 56, height: 56, borderRadius: 18, alignItems: 'center', justifyContent: 'center', marginBottom: 8, shadowColor: '#000', shadowOffset: { width: 0, height: 6 }, shadowOpacity: theme.isDark ? 0.12 : 0.04, shadowRadius: 10, elevation: 3 },
    qaLabel: { fontSize: 12, fontWeight: '700', color: theme.colors.text.primary },
    sectionHintRow: { flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 24, marginBottom: 14 },
    sectionHintText: { fontSize: 12, color: theme.colors.text.muted, fontWeight: '700' },
    filterBarContainer: { marginBottom: 12 },
    filterBar: { flexDirection: 'row', paddingHorizontal: 20, gap: 6 },
    filterChip: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 16, backgroundColor: theme.colors.surfaceMuted, borderWidth: 1, borderColor: theme.colors.separator },
    filterChipActive: { backgroundColor: theme.colors.primary, borderColor: theme.colors.primary },
    filterChipText: { fontSize: 12, fontWeight: '700', color: theme.colors.text.secondary },
    filterChipActiveText: { color: theme.colors.white },
    listContent: { paddingBottom: 100 },
    row: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 16,
        paddingVertical: 14,
        backgroundColor: theme.colors.surface,
        marginHorizontal: 16,
        marginBottom: 8,
        borderRadius: 18,
        borderWidth: 1,
        borderColor: theme.colors.separator,
    },
    rowUnread: { borderColor: theme.colors.accentSoft },
    avatarContainer: { position: 'relative' },
    avatar: { width: 56, height: 56, borderRadius: 28, alignItems: 'center', justifyContent: 'center', marginRight: 16, overflow: 'hidden' },
    avatarImage: { width: '100%', height: '100%' },
    avatarText: { color: theme.colors.white, fontWeight: '900', fontSize: 24 },
    unreadIndicator: { position: 'absolute', top: -1, right: 14, width: 14, height: 14, borderRadius: 7, backgroundColor: theme.colors.unread, borderWidth: 2, borderColor: theme.colors.surface },
    onlineDot: { position: 'absolute', bottom: -1, right: 14, width: 15, height: 15, borderRadius: 7.5, backgroundColor: theme.colors.online, borderWidth: 2, borderColor: theme.colors.surface, zIndex: 10 },
    info: { flex: 1 },
    topRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 },
    name: { fontSize: 17, fontWeight: '600', color: theme.colors.text.secondary },
    nameUnread: { color: theme.colors.text.primary, fontWeight: '800' },
    time: { fontSize: 12, color: theme.colors.text.muted, fontWeight: '500' },
    timeUnread: { color: theme.colors.unread, fontWeight: '700' },
    bottomRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    previewWrap: { flexDirection: 'row', alignItems: 'center', flex: 1, marginRight: 12 },
    preview: { fontSize: 14, color: theme.colors.text.muted },
    previewUnread: { color: theme.colors.text.secondary, fontWeight: '700' },
    previewTyping: { color: theme.colors.accent, fontWeight: '700' },
    unreadBadge: { borderRadius: 10, paddingHorizontal: 8, paddingVertical: 4, minWidth: 24, alignItems: 'center', justifyContent: 'center' },
    unreadText: { color: theme.colors.white, fontSize: 11, fontWeight: '800' },
    empty: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingTop: 100 },
    emptyTitle: { fontSize: 20, fontWeight: '800', color: theme.colors.text.muted, marginTop: 12 },
    emptyText: { fontSize: 15, color: theme.colors.text.muted, marginTop: 4 },
    leftAction: { flex: 1, backgroundColor: theme.colors.info, justifyContent: 'center', alignItems: 'flex-start', paddingLeft: 20 },
    rightAction: { flex: 1, backgroundColor: theme.colors.text.secondary, justifyContent: 'center', alignItems: 'flex-end', paddingRight: 20 },
    // Search 2.0 Fusion Styles
    searchHeaderLabel: { paddingHorizontal: 24, paddingVertical: 12, backgroundColor: theme.colors.surfaceMuted },
    searchHeaderLabelText: { fontSize: 11, fontWeight: '900', color: theme.colors.text.muted, letterSpacing: 1 },
    sectionContainer: { marginTop: 16 },
    sectionTitle: { fontSize: 13, fontWeight: '800', color: theme.colors.text.secondary, textTransform: 'uppercase', letterSpacing: 1, marginHorizontal: 24, marginBottom: 12 },
    resultCard: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 24, paddingVertical: 12, backgroundColor: theme.colors.surface },
    resultIcon: { marginRight: 16 },
    resultIconInner: { width: 36, height: 36, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
    resultAvatar: { width: 36, height: 36, borderRadius: 18 },
    resultInfo: { flex: 1, marginRight: 12 },
    resultText: { fontSize: 16, fontWeight: '600', color: theme.colors.text.primary },
    resultTextHighlight: { backgroundColor: theme.colors.highlight, color: theme.colors.highlightText, fontWeight: '800' },
    resultSubtext: { fontSize: 12, color: theme.colors.text.muted, marginTop: 2 },
});
