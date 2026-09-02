import React, { useState } from 'react';
import { ActivityIndicator, FlatList, StyleSheet, Text, TouchableOpacity, View, useWindowDimensions } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { useSharedContent } from '../api/queries';
import type { SharedVisualContentScreenProps } from '../navigation/types';
import type { SharedContentItem, SharedVisualKind } from '../types/sharedContent';
import { SharedContentThumbnail } from '../components/shared-content/SharedContentThumbnail';
import { SharedMediaViewer } from '../components/shared-content/SharedMediaViewer';
import { useAppTheme } from '../theme/ThemeContext';
import { EMPTY_SHARED_CONTENT_SUMMARY, visualFilters } from '../utils/sharedContent';

export default function SharedVisualContentScreen({ route, navigation }: SharedVisualContentScreenProps) {
    const { theme } = useAppTheme();
    const { width } = useWindowDimensions();
    const [kind, setKind] = useState<SharedVisualKind | undefined>();
    const [viewerIndex, setViewerIndex] = useState<number | null>(null);
    const query = useSharedContent(route.params.conversationId, 'visual', kind);
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
