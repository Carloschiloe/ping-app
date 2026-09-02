import React, { useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, Linking, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSharedContent } from '../api/queries';
import type { SharedContentScreenProps } from '../navigation/types';
import type { SharedContentItem } from '../types/sharedContent';
import { useSharedContentUrl } from '../hooks/useSharedContentUrl';
import { useAppTheme } from '../theme/ThemeContext';
import { documentIconName, formatSharedDuration, formatSharedFileSize } from '../utils/sharedContent';
import AudioPlayer from '../components/AudioPlayer';

const CONTENT_TITLES = { audio: 'Audios', document: 'Documentos', link: 'Enlaces' } as const;

function Meta({ item }: { item: SharedContentItem }) {
    const { theme } = useAppTheme();
    return <Text style={{ color: theme.colors.text.secondary, fontSize: 12, marginTop: 4 }}>{item.sender.name} Â· {new Date(item.createdAt).toLocaleString()}</Text>;
}

function GoToMessage({ onPress }: { onPress: () => void }) {
    const { theme } = useAppTheme();
    return <TouchableOpacity onPress={onPress} style={styles.messageLink}><Ionicons name="chatbubble-outline" size={15} color={theme.colors.accent} /><Text style={{ color: theme.colors.accent, fontWeight: '700', fontSize: 12 }}>Ir al mensaje</Text></TouchableOpacity>;
}

function AudioRow({ item, onMessage }: { item: SharedContentItem; onMessage: () => void }) {
    const { theme } = useAppTheme();
    const { url, state, refresh } = useSharedContentUrl(item);
    return (
        <View style={[styles.card, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border }]}>
            <Text style={[styles.title, { color: theme.colors.text.primary }]}>{item.sender.name}</Text>
            {state === 'loading' && <ActivityIndicator style={styles.audioLoading} />}
            {state === 'available' && url && <AudioPlayer url={url} style={[styles.audioPlayer, { backgroundColor: theme.colors.surfaceMuted }]} />}
            {state === 'unavailable' && <TouchableOpacity onPress={refresh}><Text style={{ color: theme.colors.danger }}>Audio no disponible Â· Reintentar</Text></TouchableOpacity>}
            <Text style={{ color: theme.colors.text.secondary, fontSize: 12 }}>{formatSharedDuration(item.file?.durationMs)} Â· {new Date(item.createdAt).toLocaleString()}</Text>
            <GoToMessage onPress={onMessage} />
        </View>
    );
}

function DocumentRow({ item, onMessage }: { item: SharedContentItem; onMessage: () => void }) {
    const { theme } = useAppTheme();
    const [shouldResolve, setShouldResolve] = useState(false);
    const { url, state, refresh } = useSharedContentUrl(item, shouldResolve);
    useEffect(() => {
        if (!shouldResolve || state !== 'available' || !url) return;
        void Linking.openURL(url);
        setShouldResolve(false);
    }, [shouldResolve, state, url]);
    const open = async () => {
        if (state === 'unavailable') refresh();
        setShouldResolve(true);
    };
    return (
        <View style={[styles.card, styles.row, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border }]}>
            <View style={[styles.icon, { backgroundColor: theme.colors.accentSoft }]}><Ionicons name={documentIconName(item)} size={26} color={theme.colors.accent} /></View>
            <View style={styles.grow}>
                <Text style={[styles.title, { color: theme.colors.text.primary }]} numberOfLines={2}>{item.file?.name || 'Documento'}</Text>
                <Text style={{ color: theme.colors.text.secondary, fontSize: 12 }}>{formatSharedFileSize(item.file?.sizeBytes)}</Text>
                <Meta item={item} />
                <View style={styles.inlineActions}>
                    <TouchableOpacity onPress={open}><Text style={{ color: theme.colors.accent, fontWeight: '700' }}>{state === 'loading' ? 'Abriendoâ€¦' : 'Abrir'}</Text></TouchableOpacity>
                    {state === 'unavailable' && <Text style={{ color: theme.colors.danger, fontSize: 12 }}>No disponible</Text>}
                    <GoToMessage onPress={onMessage} />
                </View>
            </View>
        </View>
    );
}

function LinkRow({ item, onMessage }: { item: SharedContentItem; onMessage: () => void }) {
    const { theme } = useAppTheme();
    return (
        <View style={[styles.card, styles.row, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border }]}>
            <View style={[styles.icon, { backgroundColor: theme.colors.accentSoft }]}><Ionicons name="link-outline" size={26} color={theme.colors.accent} /></View>
            <View style={styles.grow}>
                <Text style={[styles.title, { color: theme.colors.text.primary }]}>{item.link?.domain}</Text>
                <TouchableOpacity onPress={() => item.link && Linking.openURL(item.link.url)}><Text style={{ color: theme.colors.accent }} numberOfLines={2}>{item.link?.url}</Text></TouchableOpacity>
                <Meta item={item} />
                <GoToMessage onPress={onMessage} />
            </View>
        </View>
    );
}

export default function SharedContentScreen({ route, navigation }: SharedContentScreenProps) {
    const { theme } = useAppTheme();
    const { category } = route.params;
    const query = useSharedContent(route.params.conversationId, category);
    const items = query.data?.pages.flatMap((page) => page.items) || [];

    useEffect(() => navigation.setOptions({ title: CONTENT_TITLES[category] }), [category, navigation]);
    const goToMessage = (item: SharedContentItem) => navigation.navigate('Chat', {
        conversationId: route.params.conversationId,
        otherUser: route.params.otherUser,
        isSelf: route.params.isSelf,
        isGroup: route.params.isGroup,
        groupMetadata: route.params.groupMetadata,
        scrollToMessageId: item.messageId,
    });

    if (query.isLoading) return <View style={[styles.center, { backgroundColor: theme.colors.background }]}><ActivityIndicator /></View>;
    if (query.isError) return <View style={[styles.center, { backgroundColor: theme.colors.background }]}><Text style={{ color: theme.colors.text.secondary }}>No se pudo cargar el contenido.</Text><TouchableOpacity onPress={() => query.refetch()}><Text style={{ color: theme.colors.accent, marginTop: 10 }}>Reintentar</Text></TouchableOpacity></View>;

    return (
        <FlatList
            style={{ backgroundColor: theme.colors.background }}
            contentContainerStyle={[styles.list, items.length === 0 && styles.emptyList]}
            data={items}
            keyExtractor={(item) => item.id}
            renderItem={({ item }) => category === 'audio'
                ? <AudioRow item={item} onMessage={() => goToMessage(item)} />
                : category === 'document'
                    ? <DocumentRow item={item} onMessage={() => goToMessage(item)} />
                    : <LinkRow item={item} onMessage={() => goToMessage(item)} />}
            ListEmptyComponent={<Text style={{ color: theme.colors.text.secondary }}>No hay {CONTENT_TITLES[category].toLowerCase()} compartidos.</Text>}
            onEndReached={() => { if (query.hasNextPage && !query.isFetchingNextPage) void query.fetchNextPage(); }}
            ListFooterComponent={query.isFetchingNextPage ? <ActivityIndicator /> : null}
        />
    );
}

const styles = StyleSheet.create({
    center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
    list: { padding: 14, gap: 10 },
    emptyList: { flexGrow: 1, alignItems: 'center', justifyContent: 'center' },
    card: { borderWidth: 1, borderRadius: 14, padding: 14 },
    row: { flexDirection: 'row', gap: 12 },
    grow: { flex: 1 },
    title: { fontSize: 15, fontWeight: '700' },
    icon: { width: 46, height: 46, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
    messageLink: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 10, alignSelf: 'flex-start' },
    inlineActions: { flexDirection: 'row', alignItems: 'center', gap: 16, flexWrap: 'wrap' },
    audioPlayer: { marginVertical: 8, paddingHorizontal: 10, borderRadius: 10 },
    audioLoading: { marginVertical: 16 },
});
