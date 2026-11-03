import React from 'react';
import {
    View, Text, TouchableOpacity, StyleSheet,
    ActivityIndicator, StatusBar, Platform, ScrollView, TextInput, Animated,
    Modal, Image, Alert, Pressable
} from 'react-native';
import Reanimated, { Extrapolation, FadeInDown, interpolate, useAnimatedScrollHandler, useAnimatedStyle, useSharedValue } from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useConversations, useGetOrCreateSelfConversation, useMarkConversationAsRead, useMarkConversationAsUnread, useToggleArchive, useCreateConversation } from '../api/queries';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../lib/supabase';
import { Swipeable, GestureHandlerRootView } from 'react-native-gesture-handler';
import * as Haptics from 'expo-haptics';
import { useQuery } from '@tanstack/react-query';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useDebouncedValue } from '../hooks/useDebouncedValue';
import type { ConversationsListScreenProps } from '../navigation/types';
import { apiClient } from '../api/client';
import { ConversationRow } from '../components/ConversationRow';
import { GlobalSearchSection } from '../components/GlobalSearchSection';
import { NewConversationSheet } from '../components/NewConversationSheet';
import { deriveIsSelf } from '../utils/conversationCompat';
import { publicPingSurface } from '../api/agentSurfaceAdapter';
import { Glass } from '../design/Glass';
import { PingOrb } from '../design/PingOrb';
import { TAB_BAR_CLEARANCE } from '../design/FloatingTabBar';
import { colors, gradients, radius, space } from '../design/tokens';
import { fonts, type } from '../design/typography';

// Fixed reveal width for swipe actions — the row must stay mostly visible
// while dragging (a lateral button, not a full-width wipe). On a typical
// ~390-428px wide phone this leaves ~74-77% of the row on screen.
const SWIPE_ACTION_WIDTH = 100;

// isUnread combines the real, server-computed unreadCount with the private
// per-user "manuallyUnread" preference (conversation_participants.marked_unread_at)
// — either one is enough to treat the conversation as unread for filtering,
// visual weight, and which swipe-right action to offer. The numeric badge
// stays keyed to unreadCount alone (see ConversationRow) so a manually-flagged,
// fully-read conversation never shows a fabricated count.
function isConversationUnread(c: { unreadCount?: number; manuallyUnread?: boolean }) {
    return (c.unreadCount || 0) > 0 || !!c.manuallyUnread;
}

function formatTime(iso: string) {
    const d = new Date(iso);
    const now = new Date();
    const isToday = d.toDateString() === now.toDateString();
    if (isToday) return d.toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' });
    return d.toLocaleDateString('es-CL', { day: '2-digit', month: '2-digit' });
}

const EMPTY_STATE_COPY: Record<'all' | 'unread' | 'groups' | 'private' | 'archived', string> = {
    all: 'No tienes conversaciones todavía.',
    unread: 'No tienes conversaciones sin leer.',
    groups: 'No tienes grupos todavía.',
    private: 'No tienes conversaciones todavía.',
    archived: 'No tienes conversaciones archivadas.',
};

const SELF_CHAT_PLACEHOLDER_SUBTITLE = 'Notas, audios y recordatorios personales';
// Only the first screenful of rows plays the entrance animation.
const ANIMATED_ROWS = 12;
const LIST_PRESENCE_CHANNEL_LIMIT = 5;

// "Para mí" has no real conversation row yet for a brand-new user. This
// synthetic item lets the pinned row render through the same ConversationRow
// component with a neutral subtitle; it's never inserted into the real list
// and no network call happens until the user actually taps it.
const SELF_CHAT_PLACEHOLDER = {
    id: '__self_chat_placeholder__',
    isSelf: true,
    isGroup: false,
    otherUser: null,
    groupMetadata: null,
    lastMessage: null,
    unreadCount: 0,
    archived: false,
    isPlaceholder: true,
} as const;

export default function ConversationsScreen({ navigation }: ConversationsListScreenProps) {
    const insets = useSafeAreaInsets();
    const { data, isLoading, isError, refetch } = useConversations();
    const { user } = useAuth();
    const [searchQuery, setSearchQuery] = React.useState('');
    const [filter, setFilter] = React.useState<'all' | 'unread' | 'groups' | 'private' | 'archived'>('all');
    const [typingUsers, setTypingUsers] = React.useState<Record<string, { name: string, isRecording: boolean }[]>>({});
    const [profileViewerUrl, setProfileViewerUrl] = React.useState<string | null>(null);
    const debouncedSearchQuery = useDebouncedValue(searchQuery, 220);

    const rawConversations = React.useMemo(() => data?.conversations || [], [data?.conversations]);
    const { mutate: openSelf } = useGetOrCreateSelfConversation();
    const { mutate: markAsRead } = useMarkConversationAsRead('');
    const { mutate: markAsUnread } = useMarkConversationAsUnread();
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
        // Typing previews are useful for the first visible conversations, but
        // a presence channel for every historical conversation multiplies
        // WebSocket/battery usage while the list is idle.
        const channels = rawConversations.slice(0, LIST_PRESENCE_CHANNEL_LIMIT).map((conv: any) => {
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

            if (filter === 'unread') return isConversationUnread(c);
            if (filter === 'groups') return c.isGroup;
            if (filter === 'private') return !c.isGroup;
            return true;
        });
    }, [rawConversations, debouncedSearchQuery, filter]);

    const archivedCount = React.useMemo(
        () => rawConversations.filter((c: any) => c.archived).length,
        [rawConversations]
    );

    // "Para mí" is always pinned to the top of the default view, client-side —
    // whether or not the conversation exists yet. It never appears twice, and
    // archived self-chats fall out of `filteredConversations` already, so
    // they're excluded here for free.
    const { pinnedSelf, restConversations } = React.useMemo(() => {
        if (filter !== 'all') return { pinnedSelf: null as any, restConversations: filteredConversations };
        const selfIndex = filteredConversations.findIndex((c: any) => deriveIsSelf(c));
        if (selfIndex === -1) return { pinnedSelf: SELF_CHAT_PLACEHOLDER as any, restConversations: filteredConversations };
        const self = filteredConversations[selfIndex];
        const rest = filteredConversations.filter((_: any, i: number) => i !== selfIndex);
        return { pinnedSelf: self, restConversations: rest };
    }, [filteredConversations, filter]);

    const isOnline = (lastSeen?: string) => {
        if (!lastSeen) return false;
        const last = new Date(lastSeen).getTime();
        const now = new Date().getTime();
        // Online if updated in last 5 min
        return (now - last) < 1000 * 60 * 5;
    };

    // One Swipeable ref per row so an action can close its own row before the
    // underlying mutation lands — the row snaps back closed immediately, and
    // only disappears from the list once the query actually invalidates
    // (real confirmation), instead of vanishing mid-drag.
    const swipeableRefs = React.useRef<Record<string, Swipeable | null>>({});

    // Neither useMarkConversationAsRead nor useMarkConversationAsUnread had an
    // onError handler, so a failed tap (e.g. the backend route not existing
    // yet) previously failed completely silently — the row just... didn't
    // change, with no signal to the user at all. This is a real, pre-existing
    // gap (not a workaround for the backend issue, which is now fixed and
    // certified); it stays useful for genuine future failures (network blips).
    const handleUnreadMutationError = React.useCallback(() => {
        Alert.alert('Error', 'No se pudo actualizar la conversación.');
    }, []);

    // Swipe right (renderLeftActions): always has an action now — contextual
    // on the conversation's current unread state. Unread -> "Leído" (mark
    // read, canonical flow); already read -> "No leído" (manual marker,
    // canonical RPC, never touches message_receipts). Never a dead gesture.
    const renderLeftActions = React.useCallback((progress: Animated.AnimatedInterpolation<number>, dragX: Animated.AnimatedInterpolation<number>, item: any) => {
        const unread = isConversationUnread(item);
        const trans = dragX.interpolate({
            inputRange: [0, 50, 100],
            outputRange: [-20, 0, 0],
        });
        return (
            <Animated.View style={[styles.swipeAction, { width: SWIPE_ACTION_WIDTH, opacity: dragX.interpolate({ inputRange: [0, 24], outputRange: [0, 1], extrapolate: 'clamp' }) }]}>
            <TouchableOpacity
                style={styles.swipeActionButton}
                onPress={() => {
                    swipeableRefs.current[item.id]?.close();
                    if (unread) markAsRead(item.id, { onError: handleUnreadMutationError });
                    else markAsUnread(item.id, { onError: handleUnreadMutationError });
                }}
                accessibilityRole="button"
                accessibilityLabel={unread ? 'Marcar como leído' : 'Marcar como no leído'}
            >
                <Animated.View style={{ alignItems: 'center', transform: [{ translateX: trans }] }}>
                    <Ionicons name={unread ? 'mail-open-outline' : 'mail-unread-outline'} size={22} color={colors.accentBright} />
                    <Text style={styles.swipeActionLabel}>{unread ? 'Leído' : 'No leído'}</Text>
                </Animated.View>
            </TouchableOpacity>
            </Animated.View>
        );
    }, [markAsRead, markAsUnread, handleUnreadMutationError]);

    const renderRightActions = React.useCallback((progress: Animated.AnimatedInterpolation<number>, dragX: Animated.AnimatedInterpolation<number>, item: any) => {
        const trans = dragX.interpolate({
            inputRange: [-100, -50, 0],
            outputRange: [0, 0, 20],
        });
        const isArchived = item.archived;
        return (
            <Animated.View style={[styles.swipeAction, { width: SWIPE_ACTION_WIDTH, opacity: dragX.interpolate({ inputRange: [-24, 0], outputRange: [1, 0], extrapolate: 'clamp' }) }]}>
            <TouchableOpacity
                style={styles.swipeActionButton}
                onPress={() => {
                    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                    swipeableRefs.current[item.id]?.close();
                    toggleArchive(item.id);
                }}
                accessibilityRole="button"
                accessibilityLabel={isArchived ? 'Desarchivar conversación' : 'Archivar conversación'}
            >
                <Animated.View style={{ alignItems: 'center', transform: [{ translateX: trans }] }}>
                    <Ionicons name={isArchived ? "archive" : "archive-outline"} size={22} color={colors.accentBright} />
                    <Text style={styles.swipeActionLabel}>{isArchived ? 'Desarchivar' : 'Archivar'}</Text>
                </Animated.View>
            </TouchableOpacity>
            </Animated.View>
        );
    }, [toggleArchive]);

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
    ), [handleGlobalResultPress, searchQuery]);

    const renderItem = React.useCallback(({ item, index }: { item: any; index?: number }) => {
        const entering = index !== undefined && index < ANIMATED_ROWS
            ? FadeInDown.delay(index * 40).duration(420)
            : undefined;
        const isPinned = index === undefined;
        const first = isPinned || (index === 0 && !pinnedSelf);
        const last = isPinned ? restConversations.length === 0 : index === restConversations.length - 1;
        return (
        <RowCard entering={entering} first={first} last={last}>
            <Swipeable
                ref={(ref) => { swipeableRefs.current[item.id] = ref; }}
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
                    pinned={deriveIsSelf(item)}
                    onAvatarPress={setProfileViewerUrl}
                    onPress={() => navigation.navigate('Chat', { conversationId: item.id, otherUser: item.otherUser, isGroup: item.isGroup, isSelf: item.isSelf, groupMetadata: item.groupMetadata, mode: item.mode || 'chat' })}
                />
            </Swipeable>
        </RowCard>
        );
    }, [typingUsers, user?.id, navigation, renderLeftActions, renderRightActions, restConversations.length, pinnedSelf]);

    // "Para mí" is a first-class pinned row now, not a hidden option here —
    // this sheet only ever offers Nuevo chat / Nuevo grupo.
    const [createSheetVisible, setCreateSheetVisible] = React.useState(false);
    const handleOpenCreateSheet = React.useCallback(() => setCreateSheetVisible(true), []);

    // Case B of "Para mí": the self conversation doesn't exist yet. Tapping the
    // pinned placeholder runs the exact same canonical flow the old quick
    // action used (`POST /conversations/self`, idempotent), then navigates
    // straight into it. `useGetOrCreateSelfConversation`'s onSuccess already
    // invalidates ['conversations'], so the next render replaces the
    // placeholder with the real row — no duplicate, no manual refetch needed.
    const handleOpenSelfChat = React.useCallback(() => {
        openSelf(undefined, {
            onSuccess: ({ conversationId }: any) => {
                navigation.navigate('Chat', {
                    conversationId,
                    otherUser: null,
                    isGroup: false,
                    isSelf: true,
                    groupMetadata: null,
                    mode: 'chat',
                });
            },
        });
    }, [openSelf, navigation]);

    const contentPaddingTop = Math.max(insets.top, 16) + 8;
    // The header floats over the list: as the list scrolls, the big title
    // shrinks and a frosted bar fades in behind it.
    const [headerHeight, setHeaderHeight] = React.useState(0);
    const scrollY = useSharedValue(0);
    const onScroll = useAnimatedScrollHandler((event) => { scrollY.value = event.contentOffset.y; });
    const barStyle = useAnimatedStyle(() => ({ opacity: interpolate(scrollY.value, [0, 36], [0, 1], Extrapolation.CLAMP) }));
    const overlineStyle = useAnimatedStyle(() => ({ opacity: interpolate(scrollY.value, [0, 28], [1, 0], Extrapolation.CLAMP) }));
    const titleStyle = useAnimatedStyle(() => ({
        transform: [{ scale: interpolate(scrollY.value, [0, 90], [1, 0.74], Extrapolation.CLAMP) }],
    }));
    const listPaddingBottom = Math.max(insets.bottom, 12) + TAB_BAR_CLEARANCE;
    const todayLabel = new Date().toLocaleDateString('es-CL', { weekday: 'long', day: 'numeric', month: 'long' }).toUpperCase();

    const emptyStateCopy = EMPTY_STATE_COPY[filter];

    return (
        <GestureHandlerRootView style={{ flex: 1 }}>
            <View style={styles.container}>
                <StatusBar barStyle="light-content" translucent backgroundColor="transparent" />
                <View style={[styles.header, { paddingTop: contentPaddingTop }]} onLayout={(e) => setHeaderHeight(e.nativeEvent.layout.height)}>
                    <Reanimated.View pointerEvents="none" style={[StyleSheet.absoluteFill, barStyle]}>
                        <Glass style={[StyleSheet.absoluteFill, styles.headerGlass]} intensity={55} />
                    </Reanimated.View>
                    <View style={styles.headerTop}>
                        <View>
                            <Reanimated.Text style={[type.overline, overlineStyle]}>{todayLabel}</Reanimated.Text>
                            <Reanimated.Text style={[type.display, styles.title, titleStyle]}>Chats</Reanimated.Text>
                        </View>
                        <View style={styles.headerActions}>
                            <Pressable
                                onPress={() => { Haptics.selectionAsync(); handleOpenCreateSheet(); }}
                                accessibilityRole="button"
                                accessibilityLabel="Crear nuevo chat o grupo"
                            >
                                <Glass style={styles.iconButton}>
                                    <Ionicons name="add" size={22} color={colors.text} />
                                </Glass>
                            </Pressable>
                            <Pressable
                                style={styles.orbButton}
                                onPress={() => navigation.navigate('PingAI', { surface: publicPingSurface() })}
                                accessibilityRole="button"
                                accessibilityLabel="Abrir Ping"
                            >
                                <PingOrb size={44} />
                            </Pressable>
                        </View>
                    </View>
                    <Glass style={styles.searchBar}>
                        <Ionicons name="search" size={17} color={colors.textFaint} />
                        <TextInput
                            style={styles.searchInput}
                            placeholder="Buscar"
                            placeholderTextColor={colors.textFaint}
                            selectionColor={colors.accent}
                            value={searchQuery}
                            onChangeText={setSearchQuery}
                            accessibilityLabel="Buscar conversaciones"
                        />
                        {searchQuery.length > 0 && (
                            <TouchableOpacity
                                onPress={() => setSearchQuery('')}
                                accessibilityRole="button"
                                accessibilityLabel="Limpiar búsqueda"
                            >
                                <Ionicons name="close-circle" size={18} color={colors.textFaint} />
                            </TouchableOpacity>
                        )}
                    </Glass>
                </View>

                {isLoading ? (
                    <View style={[styles.loadingContainer, { paddingTop: headerHeight + space.md }]}>
                        {[1, 2, 3, 4, 5, 6].map(i => <ConversationSkeleton key={i} />)}
                    </View>
                ) : isError && !data ? (
                    <View style={[styles.empty, { paddingTop: headerHeight + 60 }]}>
                        <Ionicons name="cloud-offline-outline" size={52} color={colors.textFaint} />
                        <Text style={styles.emptyTitle}>No se pudieron cargar tus conversaciones</Text>
                        <Text style={styles.emptySubtitle}>Conservamos tus datos locales y reintentamos al recuperar la conexión.</Text>
                        <View style={styles.emptyActions}>
                            <AccentButton label="Reintentar" onPress={() => void refetch()} />
                        </View>
                    </View>
                ) : isGlobalSearchActive ? (
                    <Reanimated.FlatList
                        data={globalSections}
                        onScroll={onScroll}
                        scrollEventThrottle={16}
                        keyExtractor={item => item.title}
                        renderItem={renderGlobalSection}
                        initialNumToRender={6}
                        maxToRenderPerBatch={8}
                        windowSize={8}
                        keyboardShouldPersistTaps="handled"
                        contentContainerStyle={{ paddingTop: headerHeight, paddingBottom: listPaddingBottom }}
                        ListEmptyComponent={() => (
                            <View style={styles.empty}>
                                {isSearchingGlobal ? <ActivityIndicator color={colors.accent} /> : (
                                    <>
                                        <Ionicons name="search-outline" size={52} color={colors.textFaint} />
                                        <Text style={styles.emptyTitle}>Sin resultados</Text>
                                    </>
                                )}
                            </View>
                        )}
                    />
                ) : (
                    <Reanimated.FlatList
                        data={restConversations}
                        onScroll={onScroll}
                        scrollEventThrottle={16}
                        keyExtractor={item => item.id}
                        renderItem={renderItem}
                        initialNumToRender={10}
                        maxToRenderPerBatch={10}
                        windowSize={8}
                        removeClippedSubviews={Platform.OS === 'android'}
                        showsVerticalScrollIndicator={false}
                        contentContainerStyle={{ paddingTop: headerHeight, paddingBottom: listPaddingBottom }}
                        ListHeaderComponent={() => (
                            <View>
                                <ScrollView
                                    horizontal
                                    showsHorizontalScrollIndicator={false}
                                    contentContainerStyle={styles.filterBar}
                                >
                                    <FilterChip label="Todos" active={filter === 'all'} onPress={() => setFilter('all')} />
                                    <FilterChip label="No leídos" active={filter === 'unread'} onPress={() => setFilter('unread')} />
                                    <FilterChip label="Grupos" active={filter === 'groups'} onPress={() => setFilter('groups')} />
                                    {archivedCount > 0 && (
                                        <FilterChip label={`Archivados ${archivedCount}`} active={filter === 'archived'} onPress={() => setFilter('archived')} />
                                    )}
                                </ScrollView>
                                {pinnedSelf && (
                                    (pinnedSelf as any).isPlaceholder ? (
                                        <RowCard first last={restConversations.length === 0}>
                                        <ConversationRow
                                            item={pinnedSelf}
                                            userId={user?.id}
                                            typingUsers={typingUsers}
                                            formatTime={formatTime}
                                            isOnline={isOnline}
                                            pinned
                                            previewOverride={SELF_CHAT_PLACEHOLDER_SUBTITLE}
                                            onPress={handleOpenSelfChat}
                                        />
                                        </RowCard>
                                    ) : (
                                        renderItem({ item: pinnedSelf })
                                    )
                                )}
                            </View>
                        )}
                        ListEmptyComponent={() => (
                            <View style={styles.empty}>
                                <Ionicons name={filter === 'archived' ? 'archive-outline' : 'chatbubbles-outline'} size={56} color={colors.textFaint} />
                                <Text style={styles.emptyTitle}>{emptyStateCopy}</Text>
                                {filter === 'all' && (
                                    <View style={styles.emptyActions}>
                                        <AccentButton label="Nuevo chat" onPress={() => navigation.navigate('NewChat')} />
                                        <GhostButton label="Nuevo grupo" onPress={() => navigation.navigate('NewGroup')} />
                                    </View>
                                )}
                                {filter === 'archived' && (
                                    <View style={styles.emptyActions}>
                                        <GhostButton label="Volver a Todos" onPress={() => setFilter('all')} />
                                    </View>
                                )}
                            </View>
                        )}
                    />
                )}
                <NewConversationSheet
                    visible={createSheetVisible}
                    onClose={() => setCreateSheetVisible(false)}
                    onNewChat={() => navigation.navigate('NewChat')}
                    onNewGroup={() => navigation.navigate('NewGroup')}
                />
                <Modal
                    visible={!!profileViewerUrl}
                    transparent
                    animationType="fade"
                    onRequestClose={() => setProfileViewerUrl(null)}
                >
                    <TouchableOpacity
                        style={styles.profileViewerBackdrop}
                        activeOpacity={1}
                        onPress={() => setProfileViewerUrl(null)}
                        accessibilityRole="button"
                        accessibilityLabel="Cerrar foto de perfil"
                    >
                        <Image
                            source={{ uri: profileViewerUrl || '' }}
                            style={styles.profileViewerImage}
                            resizeMode="contain"
                        />
                        <View style={[styles.profileViewerClose, { top: insets.top + 12 }]}>
                            <Ionicons name="close-circle" size={38} color={colors.text} />
                        </View>
                    </TouchableOpacity>
                </Modal>
            </View>
        </GestureHandlerRootView>
    );
}

// One slice of the frosted card that holds the conversation list. Slices
// stack edge to edge, so the first and last round the card's corners.
function RowCard({ first, last, entering, children }: { first: boolean; last: boolean; entering?: any; children: React.ReactNode }) {
    return (
        <Reanimated.View entering={entering} style={[first && styles.bandFirst, last && styles.bandLast]}>
            <Glass style={[StyleSheet.absoluteFill, styles.bandGlass]} intensity={22} tint={colors.glassTintLight} />
            {children}
            {!last && <View pointerEvents="none" style={styles.bandSeparator} />}
        </Reanimated.View>
    );
}

function FilterChip({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
    return (
        <Pressable
            onPress={() => { Haptics.selectionAsync(); onPress(); }}
            accessibilityRole="button"
            accessibilityLabel={label}
            accessibilityState={{ selected: active }}
        >
            {active ? (
                <LinearGradient colors={gradients.accent} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={[styles.chip, styles.chipActive]}>
                    <Text style={[styles.chipText, styles.chipTextActive]}>{label}</Text>
                </LinearGradient>
            ) : (
                <View style={[styles.chip, styles.chipIdle]}>
                    <Text style={styles.chipText}>{label}</Text>
                </View>
            )}
        </Pressable>
    );
}

function AccentButton({ label, onPress }: { label: string; onPress: () => void }) {
    return (
        <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={label}>
            <LinearGradient colors={gradients.accent} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.button}>
                <Text style={styles.buttonAccentText}>{label}</Text>
            </LinearGradient>
        </Pressable>
    );
}

function GhostButton({ label, onPress }: { label: string; onPress: () => void }) {
    return (
        <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={label} style={[styles.button, styles.buttonGhost]}>
            <Text style={styles.buttonGhostText}>{label}</Text>
        </Pressable>
    );
}

function ConversationSkeleton() {
    return (
        <View style={styles.skeletonRow}>
            <View style={styles.skeletonAvatar} />
            <View style={styles.skeletonInfo}>
                <View style={[styles.skeletonLine, { width: '40%', marginBottom: 10 }]} />
                <View style={[styles.skeletonLine, { width: '75%' }]} />
            </View>
        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1 },
    bandGlass: { borderWidth: 0 },
    bandFirst: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.glassBorder },
    bandLast: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.glassBorder },
    bandSeparator: { position: 'absolute', left: 86, right: 0, bottom: 0, height: StyleSheet.hairlineWidth, backgroundColor: colors.separator },
    header: { position: 'absolute', top: 0, left: 0, right: 0, zIndex: 10, paddingHorizontal: space.xl, paddingBottom: space.md },
    headerGlass: { borderWidth: 0, borderBottomWidth: StyleSheet.hairlineWidth },
    headerTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: space.lg },
    title: { marginTop: 2, transformOrigin: 'left bottom' },
    headerActions: { flexDirection: 'row', alignItems: 'center', gap: space.md, paddingBottom: 4 },
    iconButton: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
    orbButton: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
    searchBar: { flexDirection: 'row', alignItems: 'center', borderRadius: radius.md, paddingHorizontal: 14, height: 46, gap: 10 },
    searchInput: { flex: 1, fontFamily: fonts.medium, fontSize: 15, color: colors.text },
    filterBar: { flexDirection: 'row', paddingHorizontal: space.xl, paddingTop: space.xs, paddingBottom: space.md, gap: space.sm },
    chip: { paddingHorizontal: 13, height: 30, borderRadius: radius.full, alignItems: 'center', justifyContent: 'center' },
    chipIdle: { backgroundColor: colors.glassDim, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.glassBorder },
    chipActive: { shadowColor: colors.accent, shadowOpacity: 0.6, shadowRadius: 10, shadowOffset: { width: 0, height: 2 }, elevation: 6 },
    chipText: { fontFamily: fonts.semibold, fontSize: 13, color: colors.textSoft },
    chipTextActive: { fontFamily: fonts.bold, color: colors.onAccent },
    swipeAction: { height: '100%', backgroundColor: colors.glassRaised },
    swipeActionButton: { flex: 1, justifyContent: 'center', alignItems: 'center' },
    swipeActionLabel: { fontFamily: fonts.semibold, color: colors.textSoft, fontSize: 11, marginTop: 4 },
    loadingContainer: { flex: 1, paddingTop: space.md },
    skeletonRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: space.xl, paddingVertical: space.md },
    skeletonAvatar: { width: 52, height: 52, borderRadius: 18, backgroundColor: colors.glassRaised, marginRight: 14 },
    skeletonInfo: { flex: 1 },
    skeletonLine: { height: 11, borderRadius: 6, backgroundColor: colors.glassRaised },
    empty: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingTop: 90, paddingHorizontal: space.xxl },
    emptyTitle: { ...type.title, color: colors.textSoft, marginTop: space.md, textAlign: 'center' },
    emptySubtitle: { ...type.subhead, color: colors.textFaint, marginTop: space.sm, textAlign: 'center' },
    emptyActions: { flexDirection: 'row', gap: 10, marginTop: space.lg },
    button: { height: 42, paddingHorizontal: 18, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center' },
    buttonAccentText: { fontFamily: fonts.bold, fontSize: 14, color: colors.onAccent },
    buttonGhost: { backgroundColor: colors.glassDim, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.glassBorder },
    buttonGhostText: { fontFamily: fonts.semibold, fontSize: 14, color: colors.text },
    profileViewerBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.94)', alignItems: 'center', justifyContent: 'center', padding: space.xl },
    profileViewerImage: { width: '100%', height: '82%' },
    profileViewerClose: { position: 'absolute', right: space.xl },
    // Global search results, rendered by GlobalSearchSection.
    sectionContainer: { marginTop: space.lg },
    sectionTitle: { ...type.overline, marginHorizontal: space.xl, marginBottom: space.sm },
    resultCard: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: space.xl, paddingVertical: space.md },
    resultIcon: { marginRight: 14 },
    resultIconInner: { width: 38, height: 38, borderRadius: 13, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.accentTint },
    resultAvatar: { width: 38, height: 38, borderRadius: 13 },
    resultInfo: { flex: 1, marginRight: space.md },
    resultText: { fontFamily: fonts.semibold, fontSize: 15, color: colors.text },
    resultTextHighlight: { fontFamily: fonts.extrabold, color: colors.accentBright },
    resultSubtext: { fontFamily: fonts.regular, fontSize: 12, color: colors.textFaint, marginTop: 2 },
});
