import React, { useState } from 'react';
import { ActivityIndicator, Alert, FlatList, StyleSheet, Text, TouchableOpacity, View, useWindowDimensions } from 'react-native';
import { useQueryClient } from '@tanstack/react-query';
import { Ionicons } from '@expo/vector-icons';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { useConversations, useDeleteMessage, useSharedContent } from '../api/queries';
import type { SharedVisualContentScreenProps } from '../navigation/types';
import type { SharedContentItem, SharedVisualKind } from '../types/sharedContent';
import { SharedContentThumbnail } from '../components/shared-content/SharedContentThumbnail';
import { SharedMediaViewer } from '../components/shared-content/SharedMediaViewer';
import { useAppTheme } from '../theme/ThemeContext';
import { EMPTY_SHARED_CONTENT_SUMMARY, visualFilters } from '../utils/sharedContent';
import { useAuth } from '../context/AuthContext';
import { apiClient } from '../api/client';
import { ForwardMessagesModal } from '../components/ForwardMessagesModal';
import * as Haptics from 'expo-haptics';
import { createClientMessageId } from '../utils/synchronization';

export default function SharedVisualContentScreen({ route, navigation }: SharedVisualContentScreenProps) {
    const { theme } = useAppTheme();
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

    const confirmDelete = (item: SharedContentItem) => {
        if (!canDelete(item)) return;
        Alert.alert(
            'Eliminar archivo',
            'Se eliminará también del chat para todos. Esta acción no se puede deshacer.',
            [
                { text: 'Cancelar', style: 'cancel' },
                {
                    text: 'Eliminar',
                    style: 'destructive',
                    onPress: () => {
                        void deleteMessage(item.messageId).then(() => {
                            setViewerIndex(null);
                            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                        }).catch(() => Alert.alert('No se pudo eliminar', 'Inténtalo nuevamente.'));
                    },
                },
            ],
        );
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

    if (query.isLoading) return <View style={[styles.center, { backgroundColor: theme.colors.background }]}><ActivityIndicator /></View>;
    if (query.isError) return <View style={[styles.center, { backgroundColor: theme.colors.background }]}><Text style={{ color: theme.colors.text.secondary }}>No se pudieron cargar fotos y videos.</Text><TouchableOpacity onPress={() => query.refetch()}><Text style={{ color: theme.colors.accent, marginTop: 10 }}>Reintentar</Text></TouchableOpacity></View>;

    return (
        <GestureHandlerRootView style={[styles.container, { backgroundColor: theme.colors.background }]}>
            {filters.length > 0 && (
                <View style={[styles.filters, { backgroundColor: theme.colors.surface }]}>
                    {filters.map((filter) => {
                        const active = (filter === 'all' && !kind) || filter === kind;
                        return <TouchableOpacity key={filter} onPress={() => setKind(filter === 'all' ? undefined : filter)} style={[styles.filter, active && { backgroundColor: theme.colors.accentSoft }]}><Text style={{ color: active ? theme.colors.accent : theme.colors.text.secondary, fontWeight: '700' }}>{filter === 'all' ? 'Todos' : filter === 'image' ? 'Fotos' : 'Videos'}</Text></TouchableOpacity>;
                    })}
                </View>
            )}
            <FlatList
                data={items}
                numColumns={3}
                keyExtractor={(item) => item.id}
                renderItem={({ item, index }) => (
                    <TouchableOpacity onPress={() => setViewerIndex(index)} style={[styles.tile, { width: tileSize, height: tileSize, backgroundColor: theme.colors.surfaceMuted }]}>
                        <SharedContentThumbnail item={item} size={tileSize} />
                        {item.type === 'video' && <View style={[styles.videoBadge, { backgroundColor: theme.colors.overlay }]}><Ionicons name="play" size={14} color={theme.colors.white} /></View>}
                    </TouchableOpacity>
                )}
                contentContainerStyle={items.length === 0 ? styles.empty : undefined}
                ListEmptyComponent={<Text style={{ color: theme.colors.text.secondary }}>No hay fotos ni videos compartidos.</Text>}
                onEndReached={() => { if (query.hasNextPage && !query.isFetchingNextPage) void query.fetchNextPage(); }}
                ListFooterComponent={query.isFetchingNextPage ? <ActivityIndicator /> : null}
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
    container: { flex: 1 },
    center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
    filters: { flexDirection: 'row', padding: 8, gap: 8 },
    filter: { paddingHorizontal: 15, paddingVertical: 8, borderRadius: 999 },
    tile: { margin: 1, overflow: 'hidden' },
    videoBadge: { position: 'absolute', right: 7, bottom: 7, width: 26, height: 26, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
    empty: { flexGrow: 1, alignItems: 'center', justifyContent: 'center' },
});
