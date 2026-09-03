import React from 'react';
import {
    View, Text, FlatList, TouchableOpacity, StyleSheet,
    ActivityIndicator, StatusBar, Platform, ScrollView, TextInput, Animated,
    Modal, Image, ActionSheetIOS, Alert
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useConversations, useGetOrCreateSelfConversation, useMarkConversationAsRead, useMarkConversationAsUnread, useToggleArchive, useCreateConversation } from '../api/queries';
import { useAuth } from '../context/AuthContext';
import { LinearGradient } from 'expo-linear-gradient';
import { supabase } from '../lib/supabase';
import { Swipeable, GestureHandlerRootView } from 'react-native-gesture-handler';
import * as Haptics from 'expo-haptics';
import { useQuery } from '@tanstack/react-query';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useDebouncedValue } from '../hooks/useDebouncedValue';
import type { ConversationsListScreenProps } from '../navigation/types';
import { useAppTheme } from '../theme/ThemeContext';
import { apiClient } from '../api/client';
import { ConversationRow } from '../components/ConversationRow';
import { GlobalSearchSection } from '../components/GlobalSearchSection';
import { deriveIsSelf } from '../utils/conversationCompat';

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
    const { theme } = useAppTheme();
    const styles = React.useMemo(() => createStyles(theme), [theme]);
    const insets = useSafeAreaInsets();
    const { data, isLoading } = useConversations();
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
            <TouchableOpacity
                style={[styles.leftAction, { width: SWIPE_ACTION_WIDTH, backgroundColor: unread ? theme.colors.info : '#64748b' }]}
                onPress={() => {
                    swipeableRefs.current[item.id]?.close();
                    if (unread) markAsRead(item.id, { onError: handleUnreadMutationError });
                    else markAsUnread(item.id, { onError: handleUnreadMutationError });
                }}
                accessibilityRole="button"
                accessibilityLabel={unread ? 'Marcar como leído' : 'Marcar como no leído'}
            >
                <Animated.View style={{ alignItems: 'center', transform: [{ translateX: trans }] }}>
                    <Ionicons name={unread ? 'mail-open-outline' : 'mail-unread-outline'} size={24} color="white" />
                    <Text style={styles.swipeActionLabel}>{unread ? 'Leído' : 'No leído'}</Text>
                </Animated.View>
            </TouchableOpacity>
        );
    }, [markAsRead, markAsUnread, handleUnreadMutationError, styles, theme]);

    const renderRightActions = React.useCallback((progress: Animated.AnimatedInterpolation<number>, dragX: Animated.AnimatedInterpolation<number>, item: any) => {
        const trans = dragX.interpolate({
            inputRange: [-100, -50, 0],
            outputRange: [0, 0, 20],
        });
        const isArchived = item.archived;
        return (
            <TouchableOpacity
                style={[styles.rightAction, { width: SWIPE_ACTION_WIDTH, backgroundColor: isArchived ? theme.colors.success : '#64748b' }]}
                onPress={() => {
                    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                    swipeableRefs.current[item.id]?.close();
                    toggleArchive(item.id);
                }}
                accessibilityRole="button"
                accessibilityLabel={isArchived ? 'Desarchivar conversación' : 'Archivar conversación'}
            >
                <Animated.View style={{ alignItems: 'center', transform: [{ translateX: trans }] }}>
                    <Ionicons name={isArchived ? "archive" : "archive-outline"} size={24} color="white" />
                    <Text style={styles.swipeActionLabel}>{isArchived ? 'Desarchivar' : 'Archivar'}</Text>
                </Animated.View>
            </TouchableOpacity>
        );
    }, [toggleArchive, styles, theme]);

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

    const renderItem = React.useCallback(({ item }: { item: any }) => {
        return (
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
                styles={styles}
                theme={theme}
                pinned={deriveIsSelf(item)}
                onAvatarPress={setProfileViewerUrl}
                onPress={() => navigation.navigate('Chat', { conversationId: item.id, otherUser: item.otherUser, isGroup: item.isGroup, isSelf: item.isSelf, groupMetadata: item.groupMetadata, mode: item.mode || 'chat' })}
            />
        </Swipeable>
        );
    }, [typingUsers, user?.id, navigation, styles, renderLeftActions, renderRightActions, theme]);

    const handleOpenCreateSheet = React.useCallback(() => {
        // "Para mí" is a first-class pinned row now, not a hidden option here —
        // this sheet only ever offers Nuevo chat / Nuevo grupo.
        const items: { label: string; onPress: () => void }[] = [
            { label: 'Nuevo chat', onPress: () => navigation.navigate('NewChat') },
            { label: 'Nuevo grupo', onPress: () => navigation.navigate('NewGroup') },
        ];

        if (Platform.OS === 'ios') {
            ActionSheetIOS.showActionSheetWithOptions(
                { options: ['Cancelar', ...items.map(i => i.label)], cancelButtonIndex: 0 },
                (index) => {
                    if (index === 0) return;
                    items[index - 1]?.onPress();
                }
            );
        } else {
            Alert.alert('Nueva conversación', undefined, [
                ...items.map(i => ({ text: i.label, onPress: i.onPress })),
                { text: 'Cancelar', style: 'cancel' as const },
            ]);
        }
    }, [navigation]);

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

    const contentPaddingTop = Math.max(insets.top, 16) + 12;
    const listPaddingBottom = Math.max(insets.bottom, 20) + 80;

    const emptyStateCopy = EMPTY_STATE_COPY[filter];

    return (
        <GestureHandlerRootView style={{ flex: 1 }}>
            <View style={styles.container}>
                <StatusBar barStyle="light-content" translucent backgroundColor="transparent" />
                <View style={[styles.headerSection, { paddingTop: contentPaddingTop }]}>
                    <LinearGradient colors={theme.colors.headerGradient as any} style={StyleSheet.absoluteFill} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} />
                    <View style={styles.headerTop}>
                        <Text style={styles.title}>Ping</Text>
                        <View style={styles.headerActions}>
                            <TouchableOpacity
                                style={styles.headerIconBtn}
                                onPress={handleOpenCreateSheet}
                                accessibilityRole="button"
                                accessibilityLabel="Crear nuevo chat o grupo"
                            >
                                <Ionicons name="add" size={24} color="white" />
                            </TouchableOpacity>
                            <TouchableOpacity
                                style={styles.headerIconBtn}
                                onPress={() => navigation.navigate('PingAI')}
                                accessibilityRole="button"
                                accessibilityLabel="Abrir Ping AI"
                            >
                                <Ionicons name="sparkles" size={22} color="white" />
                            </TouchableOpacity>
                        </View>
                    </View>
                    <View style={styles.searchBar}>
                        <Ionicons name="search" size={18} color="#94a3b8" />
                        <TextInput
                            style={styles.searchInput}
                            placeholder="Buscar conversaciones"
                            placeholderTextColor="#64748b"
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
                                <Ionicons name="close-circle" size={18} color="#94a3b8" />
                            </TouchableOpacity>
                        )}
                    </View>
                </View>

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
                        contentContainerStyle={[styles.listContent, { paddingBottom: listPaddingBottom }]}
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
                    <FlatList
                        data={restConversations}
                        keyExtractor={item => item.id}
                        renderItem={renderItem}
                        initialNumToRender={10}
                        maxToRenderPerBatch={10}
                        windowSize={8}
                        removeClippedSubviews={Platform.OS === 'android'}
                        showsVerticalScrollIndicator={false}
                        contentContainerStyle={[styles.listContent, { paddingBottom: listPaddingBottom }]}
                        ListHeaderComponent={() => (
                            <View style={styles.listHeader}>
                                <View style={styles.sectionHintRow}>
                                    <Text style={styles.sectionHintText}>{filteredConversations.length} hilos visibles</Text>
                                </View>
                                <ScrollView
                                    horizontal
                                    showsHorizontalScrollIndicator={false}
                                    style={styles.filterBarContainer}
                                    contentContainerStyle={styles.filterBar}
                                >
                                    <FilterChip styles={styles} label="Todos" active={filter === 'all'} onPress={() => setFilter('all')} />
                                    <FilterChip styles={styles} label="No leídos" active={filter === 'unread'} onPress={() => setFilter('unread')} />
                                    <FilterChip styles={styles} label="Grupos" active={filter === 'groups'} onPress={() => setFilter('groups')} />
                                    {archivedCount > 0 && (
                                        <FilterChip styles={styles} label={`Archivados ${archivedCount}`} active={filter === 'archived'} onPress={() => setFilter('archived')} />
                                    )}
                                </ScrollView>
                                {pinnedSelf && (
                                    <View style={styles.pinnedWrap}>
                                        {(pinnedSelf as any).isPlaceholder ? (
                                            <ConversationRow
                                                item={pinnedSelf}
                                                userId={user?.id}
                                                typingUsers={typingUsers}
                                                formatTime={formatTime}
                                                isOnline={isOnline}
                                                styles={styles}
                                                theme={theme}
                                                pinned
                                                previewOverride={SELF_CHAT_PLACEHOLDER_SUBTITLE}
                                                onPress={handleOpenSelfChat}
                                            />
                                        ) : (
                                            renderItem({ item: pinnedSelf })
                                        )}
                                    </View>
                                )}
                            </View>
                        )}
                        ListEmptyComponent={() => (
                            <View style={styles.empty}>
                                <Ionicons name={filter === 'archived' ? 'archive-outline' : 'chatbubbles-outline'} size={80} color={theme.colors.separator} />
                                <Text style={styles.emptyTitle}>{emptyStateCopy}</Text>
                                {filter === 'all' && (
                                    <View style={styles.emptyActions}>
                                        <TouchableOpacity
                                            style={styles.emptyPrimaryBtn}
                                            onPress={() => navigation.navigate('NewChat')}
                                            accessibilityRole="button"
                                            accessibilityLabel="Nuevo chat"
                                        >
                                            <Text style={styles.emptyPrimaryText}>Nuevo chat</Text>
                                        </TouchableOpacity>
                                        <TouchableOpacity
                                            style={styles.emptySecondaryBtn}
                                            onPress={() => navigation.navigate('NewGroup')}
                                            accessibilityRole="button"
                                            accessibilityLabel="Nuevo grupo"
                                        >
                                            <Text style={styles.emptySecondaryText}>Nuevo grupo</Text>
                                        </TouchableOpacity>
                                    </View>
                                )}
                                {filter === 'archived' && (
                                    <TouchableOpacity
                                        style={styles.emptySecondaryBtn}
                                        onPress={() => setFilter('all')}
                                        accessibilityRole="button"
                                        accessibilityLabel="Volver a Todos"
                                    >
                                        <Text style={styles.emptySecondaryText}>Volver a Todos</Text>
                                    </TouchableOpacity>
                                )}
                            </View>
                        )}
                    />
                )}
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
                        <View style={styles.profileViewerClose}>
                            <Ionicons name="close-circle" size={38} color="white" />
                        </View>
                    </TouchableOpacity>
                </Modal>
            </View>
        </GestureHandlerRootView>
    );
}

function FilterChip({ styles, label, active, onPress }: any) {
    return (
        <TouchableOpacity
            style={[styles.filterChip, active && styles.filterChipActive]}
            onPress={onPress}
            activeOpacity={0.8}
            accessibilityRole="button"
            accessibilityLabel={label}
            accessibilityState={{ selected: active }}
        >
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
    profileViewerBackdrop: {
        flex: 1,
        backgroundColor: 'rgba(0,0,0,0.92)',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 20,
    },
    profileViewerImage: {
        width: '100%',
        height: '82%',
    },
    profileViewerClose: {
        position: 'absolute',
        top: Platform.OS === 'ios' ? 54 : 24,
        right: 20,
    },
    loadingContainer: { flex: 1, paddingTop: 20 },
    skeletonRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 24, paddingVertical: 16 },
    skeletonAvatar: { width: 56, height: 56, borderRadius: 28, backgroundColor: theme.colors.surfaceMuted, marginRight: 16 },
    skeletonInfo: { flex: 1 },
    skeletonLine: { height: 12, borderRadius: 6, backgroundColor: theme.colors.surfaceMuted },
    headerSection: { paddingHorizontal: 20, paddingBottom: 14, zIndex: 10 },
    headerTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
    headerActions: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    title: { fontSize: 22, fontWeight: '800', color: theme.colors.white, letterSpacing: -0.3 },
    headerIconBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: theme.colors.headerCard, alignItems: 'center', justifyContent: 'center' },
    searchBar: { flexDirection: 'row', alignItems: 'center', backgroundColor: theme.colors.headerCard, borderRadius: 16, paddingHorizontal: 14, height: 44, borderWidth: 1, borderColor: 'rgba(255,255,255,0.12)' },
    searchInput: { flex: 1, marginLeft: 10, color: theme.colors.white, fontSize: 15, fontWeight: '500' },
    listHeader: { backgroundColor: theme.colors.screen, paddingTop: 12 },
    sectionHintRow: { flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 20, marginBottom: 10 },
    sectionHintText: { fontSize: 11, color: theme.colors.text.muted, fontWeight: '700', letterSpacing: 0.3 },
    filterBarContainer: { marginBottom: 4 },
    filterBar: { flexDirection: 'row', paddingHorizontal: 20, gap: 6 },
    filterChip: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 16, backgroundColor: theme.colors.surfaceMuted, borderWidth: 1, borderColor: theme.colors.separator },
    filterChipActive: { backgroundColor: theme.colors.primary, borderColor: theme.colors.primary },
    filterChipText: { fontSize: 12, fontWeight: '700', color: theme.colors.text.secondary },
    filterChipActiveText: { color: theme.colors.white },
    pinnedWrap: { backgroundColor: theme.colors.surfaceMuted, marginTop: 8 },
    listContent: { paddingBottom: 100 },
    row: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 20,
        paddingVertical: 10,
        backgroundColor: theme.colors.surface,
        borderBottomWidth: StyleSheet.hairlineWidth,
        borderBottomColor: theme.colors.separator,
    },
    rowUnread: {},
    avatarContainer: { position: 'relative' },
    avatar: { width: 56, height: 56, borderRadius: 28, alignItems: 'center', justifyContent: 'center', marginRight: 16, overflow: 'hidden' },
    avatarOperationWrap: {
        width: 58,
        height: 58,
        borderRadius: 29,
        marginRight: 14,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: theme.isDark ? '#22d3ee' : theme.colors.info,
        shadowColor: theme.isDark ? '#22d3ee' : theme.colors.info,
        shadowOpacity: 0.45,
        shadowRadius: 9,
        shadowOffset: { width: 0, height: 0 },
        elevation: 3,
    },
    avatarOperationInner: {
        width: 54,
        height: 54,
        borderRadius: 27,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: theme.colors.screen,
    },
    avatarSm: { width: 50, height: 50, borderRadius: 25, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
    avatarImageSm: { width: '100%', height: '100%' },
    avatarTextSm: { color: theme.colors.white, fontWeight: '900', fontSize: 20 },
    avatarImage: { width: '100%', height: '100%' },
    avatarText: { color: theme.colors.white, fontWeight: '900', fontSize: 24 },
    unreadIndicator: { position: 'absolute', top: -1, right: 14, width: 14, height: 14, borderRadius: 7, backgroundColor: theme.colors.unread, borderWidth: 2, borderColor: theme.colors.surface },
    onlineDot: { position: 'absolute', bottom: -1, right: 14, width: 15, height: 15, borderRadius: 7.5, backgroundColor: theme.colors.online, borderWidth: 2, borderColor: theme.colors.surface, zIndex: 10 },
    info: { flex: 1 },
    topRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 },
    nameRow: { flexDirection: 'row', alignItems: 'center', flex: 1, marginRight: 8 },
    pinnedIcon: { fontSize: 12, marginRight: 4 },
    name: { fontSize: 17, fontWeight: '600', color: theme.colors.text.secondary, flexShrink: 1 },
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
    emptyTitle: { fontSize: 20, fontWeight: '800', color: theme.colors.text.muted, marginTop: 12, textAlign: 'center', paddingHorizontal: 32 },
    emptyText: { fontSize: 15, color: theme.colors.text.muted, marginTop: 4 },
    emptyActions: { flexDirection: 'row', gap: 10, marginTop: 14 },
    emptyPrimaryBtn: { paddingHorizontal: 16, paddingVertical: 10, borderRadius: 12, backgroundColor: theme.colors.primary },
    emptyPrimaryText: { color: theme.colors.white, fontWeight: '700', fontSize: 13 },
    emptySecondaryBtn: { paddingHorizontal: 16, paddingVertical: 10, borderRadius: 12, backgroundColor: theme.colors.surfaceMuted, borderWidth: 1, borderColor: theme.colors.separator, marginTop: 14 },
    emptySecondaryText: { color: theme.colors.text.secondary, fontWeight: '700', fontSize: 13 },
    leftAction: { justifyContent: 'center', alignItems: 'center', height: '100%' },
    rightAction: { justifyContent: 'center', alignItems: 'center', height: '100%' },
    swipeActionLabel: { color: theme.colors.white, fontSize: 11, fontWeight: '700', marginTop: 2 },
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
