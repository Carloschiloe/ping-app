import React, { useState } from 'react';
import { ActivityIndicator, Alert, FlatList, StyleSheet, Text, TouchableOpacity, View, useWindowDimensions } from 'react-native';
import { useQueryClient } from '@tanstack/react-query';
import { Ionicons } from '@expo/vector-icons';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { LinearGradient } from 'expo-linear-gradient';
import { useConversations, useDeleteMessage, useSharedContent } from '../api/queries';
import type { SharedVisualContentScreenProps } from '../navigation/types';
import type { SharedContentItem, SharedVisualKind } from '../types/sharedContent';
import { SharedContentThumbnail } from '../components/shared-content/SharedContentThumbnail';
import { SharedMediaViewer } from '../components/shared-content/SharedMediaViewer';
import { EMPTY_SHARED_CONTENT_SUMMARY, visualFilters } from '../utils/sharedContent';
import { useAuth } from '../context/AuthContext';
import { apiClient } from '../api/client';
import { ForwardMessagesModal } from '../components/ForwardMessagesModal';
import * as Haptics from 'expo-haptics';
import { createClientMessageId } from '../utils/synchronization';
import { colors, gradients, radius, space } from '../design/tokens';
import { fonts, type } from '../design/typography';
import { ScreenHeader } from '../design/ScreenHeader';
import { confirmAction } from '../design/ConfirmDialog';

export default function SharedVisualContentScreen({ route, navigation }: SharedVisualContentScreenProps) {
    const { width } = useWindowDimensions();
    const [kind, setKind] = useState<SharedVisualKind | undefined>();
    const [viewerIndex, setViewerIndex] = useState<number | null>(null);
    const [forwardItem, setForwardItem] = useState<SharedContentItem | null>(null);
    const [isForwarding, setIsForwarding] = useState(false);
    const { user } = useAuth();
    const { data: conversationsData } = useConversations();
    const queryClient = useQueryClient();
    const query = useSharedContent(route.params.conversationId, 'visual', kind);
    const { mutateAsync: deleteMessage } = useDeleteMessage(route.params.conversationId);
    const items = query.data?.pages.flatMap((page) => page.items) || [];
    const summary = query.data?.pages[0]?.summary || EMPTY_SHARED_CONTENT_SUMMARY;
    const filters = visualFilters(summary);
    const tileSize = Math.floor((width - 8) / 3);

    const goToMessage = (item: SharedContentItem) => {
        setViewerIndex(null);
        navigation.navigate('Chat', {
            conversationId: route.params.conversationId,
            otherUser: route.params.otherUser,
            isSelf: route.params.isSelf,
            isGroup: route.params.isGroup,
            groupMetadata: route.params.groupMetadata,
            scrollToMessageId: item.messageId,
        });
    };

    const canDelete = (item: SharedContentItem) => Boolean(user?.id && item.sender.id === user.id);

    const confirmDelete = async (item: SharedContentItem) => {
        if (!canDelete(item)) return;
        const ok = await confirmAction({
            title: 'Eliminar archivo',
            message: 'Se eliminará también del chat para todos. Esta acción no se puede deshacer.',
        });
        if (!ok) return;
        void deleteMessage(item.messageId).then(() => {
            setViewerIndex(null);
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        }).catch(() => Alert.alert('No se pudo eliminar', 'Inténtalo nuevamente.'));
    };

    const forwardToConversation = async (targetConversationId: string) => {
        if (!forwardItem || isForwarding) return;
        setIsForwarding(true);
        try {
            await apiClient.post(`/conversations/${route.params.conversationId}/messages/${forwardItem.messageId}/forward`, {
                targetConversationId,
                clientMessageId: createClientMessageId(),
            });
            queryClient.invalidateQueries({ queryKey: ['conversations'] });
            queryClient.invalidateQueries({ queryKey: ['conversation-messages', targetConversationId] });
            setForwardItem(null);
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
            Alert.alert('Reenviado', 'Archivo reenviado.');
        } catch {
            Alert.alert('No se pudo reenviar', 'Comprueba tu conexión e inténtalo nuevamente.');
        } finally {
            setIsForwarding(false);
        }
    };

    const header = <ScreenHeader title="Fotos y videos" onBack={() => navigation.goBack()} />;

    if (query.isLoading) {
        return <View style={styles.container}>{header}<View style={styles.center}><ActivityIndicator color={colors.accentBright} /></View></View>;
    }
    if (query.isError) {
        return (
            <View style={styles.container}>
                {header}
                <View style={styles.center}>
                    <Text style={styles.emptyText}>No se pudieron cargar fotos y videos.</Text>
                    <TouchableOpacity onPress={() => query.refetch()}><Text style={styles.retry}>Reintentar</Text></TouchableOpacity>
                </View>
            </View>
        );
    }

    return (
        <GestureHandlerRootView style={styles.container}>
            {header}
            {filters.length > 0 && (
                <View style={styles.filters}>
                    {filters.map((filter) => {
                        const active = (filter === 'all' && !kind) || filter === kind;
                        return (
                            <TouchableOpacity
                                key={filter}
                                onPress={() => setKind(filter === 'all' ? undefined : filter)}
                                style={[styles.filter, !active && styles.filterIdle]}
                                accessibilityState={{ selected: active }}
                            >
                                {active && <LinearGradient colors={gradients.accent} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />}
                                <Text style={[styles.filterText, active && styles.filterTextActive]}>
                                    {filter === 'all' ? 'Todos' : filter === 'image' ? 'Fotos' : 'Videos'}
                                </Text>
                            </TouchableOpacity>
                        );
                    })}
                </View>
            )}
            <FlatList
                data={items}
                numColumns={3}
                keyExtractor={(item) => item.id}
                renderItem={({ item, index }) => (
                    <TouchableOpacity onPress={() => setViewerIndex(index)} style={[styles.tile, { width: tileSize, height: tileSize }]}>
                        <SharedContentThumbnail item={item} size={tileSize} />
                        {item.type === 'video' && <View style={styles.videoBadge}><Ionicons name="play" size={14} color={colors.onAccent} /></View>}
                    </TouchableOpacity>
                )}
                contentContainerStyle={items.length === 0 ? styles.empty : styles.grid}
                ListEmptyComponent={<Text style={styles.emptyText}>No hay fotos ni videos compartidos.</Text>}
                onEndReached={() => { if (query.hasNextPage && !query.isFetchingNextPage) void query.fetchNextPage(); }}
                ListFooterComponent={query.isFetchingNextPage ? <ActivityIndicator style={styles.footer} color={colors.accentBright} /> : null}
            />
            <SharedMediaViewer
                visible={viewerIndex !== null}
                items={items}
                initialIndex={viewerIndex || 0}
                onClose={() => setViewerIndex(null)}
                onGoToMessage={goToMessage}
                canDelete={canDelete}
                onForward={(item) => {
                    setViewerIndex(null);
                    setForwardItem(item);
                }}
                onDelete={confirmDelete}
            />
            <ForwardMessagesModal
                visible={Boolean(forwardItem)}
                conversations={conversationsData?.conversations || []}
                currentConversationId={route.params.conversationId}
                selectedCount={1}
                isForwarding={isForwarding}
                onClose={() => setForwardItem(null)}
                onSelectConversation={forwardToConversation}
            />
        </GestureHandlerRootView>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: 'transparent' },
    center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
    emptyText: { ...type.subhead, textAlign: 'center' },
    retry: { fontFamily: fonts.semibold, fontSize: 14, color: colors.accentBright, marginTop: 10 },
    filters: { flexDirection: 'row', paddingHorizontal: space.xl, paddingVertical: space.md, gap: space.sm },
    filter: { paddingHorizontal: 15, height: 32, borderRadius: radius.full, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
    filterIdle: { backgroundColor: colors.glassDim, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.glassBorder },
    filterText: { fontFamily: fonts.semibold, fontSize: 13, color: colors.textSoft },
    filterTextActive: { color: colors.onAccent },
    grid: { paddingTop: 2 },
    tile: { margin: 1, overflow: 'hidden', backgroundColor: colors.glassRaised },
    videoBadge: {
        position: 'absolute',
        right: 7,
        bottom: 7,
        width: 26,
        height: 26,
        borderRadius: 13,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: colors.scrim,
    },
    empty: { flexGrow: 1, alignItems: 'center', justifyContent: 'center' },
    footer: { marginVertical: space.lg },
});
