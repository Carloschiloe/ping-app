import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, Linking, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useQueryClient } from '@tanstack/react-query';
import { Ionicons } from '@expo/vector-icons';
import { useConversations, useDeleteMessage, useSharedContent } from '../api/queries';
import type { SharedContentScreenProps } from '../navigation/types';
import type { SharedContentItem } from '../types/sharedContent';
import { useSharedContentUrl } from '../hooks/useSharedContentUrl';
import { useAppTheme } from '../theme/ThemeContext';
import { documentIconName, formatSharedDuration, formatSharedDateTime, formatSharedFileSize } from '../utils/sharedContent';
import AudioPlayer from '../components/AudioPlayer';
import { SharedContentActionSheet } from '../components/shared-content/SharedContentActionSheet';
import { ForwardMessagesModal } from '../components/ForwardMessagesModal';
import { useAuth } from '../context/AuthContext';
import { apiClient } from '../api/client';
import * as Haptics from 'expo-haptics';
import { createClientMessageId } from '../utils/synchronization';

const CONTENT_TITLES = { audio: 'Audios', document: 'Documentos', link: 'Enlaces' } as const;

function Meta({ item }: { item: SharedContentItem }) {
    const { theme } = useAppTheme();
    return <Text style={{ color: theme.colors.text.secondary, fontSize: 12, marginTop: 4 }}>{item.sender.name} · {formatSharedDateTime(item.createdAt)}</Text>;
}

function GoToMessage({ onPress }: { onPress: () => void }) {
    const { theme } = useAppTheme();
    return <TouchableOpacity onPress={onPress} style={styles.messageLink}><Ionicons name="chatbubble-outline" size={15} color={theme.colors.accent} /><Text style={{ color: theme.colors.accent, fontWeight: '700', fontSize: 12 }}>Ir al mensaje</Text></TouchableOpacity>;
}

function ActionsButton({ onPress }: { onPress: () => void }) {
    const { theme } = useAppTheme();
    return <TouchableOpacity onPress={onPress} accessibilityLabel="Acciones del archivo" style={styles.actionsButton}>
        <Ionicons name="ellipsis-horizontal" size={22} color={theme.colors.text.secondary} />
    </TouchableOpacity>;
}

function AudioRow({ item, onMessage, onActions }: { item: SharedContentItem; onMessage: () => void; onActions: () => void }) {
    const { theme } = useAppTheme();
    const { url, state, refresh } = useSharedContentUrl(item);
    return (
        <View style={[styles.card, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border }]}>
            <View style={styles.rowHeader}>
                <Text style={[styles.title, { color: theme.colors.text.primary, flex: 1 }]}>{item.sender.name}</Text>
                <ActionsButton onPress={onActions} />
            </View>
            {state === 'loading' && <ActivityIndicator style={styles.audioLoading} />}
            {state === 'available' && url && <AudioPlayer url={url} durationMs={item.file?.durationMs} style={[styles.audioPlayer, { backgroundColor: theme.colors.surfaceMuted }]} />}
            {state === 'unavailable' && <TouchableOpacity onPress={refresh}><Text style={{ color: theme.colors.danger }}>Audio no disponible · Reintentar</Text></TouchableOpacity>}
            <Text style={{ color: theme.colors.text.secondary, fontSize: 12 }}>
                {[formatSharedDateTime(item.createdAt), formatSharedDuration(item.file?.durationMs)].filter(Boolean).join(' · ')}
            </Text>
            <GoToMessage onPress={onMessage} />
        </View>
    );
}

function DocumentRow({ item, onMessage, onActions }: { item: SharedContentItem; onMessage: () => void; onActions: () => void }) {
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
                <View style={styles.rowHeader}>
                    <Text style={[styles.title, { color: theme.colors.text.primary, flex: 1 }]} numberOfLines={2}>{item.file?.name || 'Documento'}</Text>
                    <ActionsButton onPress={onActions} />
                </View>
                <Text style={{ color: theme.colors.text.secondary, fontSize: 12 }}>{formatSharedFileSize(item.file?.sizeBytes)}</Text>
                <Meta item={item} />
                <View style={styles.inlineActions}>
                    <TouchableOpacity onPress={open}><Text style={{ color: theme.colors.accent, fontWeight: '700' }}>{state === 'loading' ? 'Abriendo…' : 'Abrir'}</Text></TouchableOpacity>
                    {state === 'unavailable' && <Text style={{ color: theme.colors.danger, fontSize: 12 }}>No disponible</Text>}
                    <GoToMessage onPress={onMessage} />
                </View>
            </View>
        </View>
    );
}

function LinkRow({ item, onMessage, onActions }: { item: SharedContentItem; onMessage: () => void; onActions: () => void }) {
    const { theme } = useAppTheme();
    return (
        <View style={[styles.card, styles.row, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border }]}>
            <View style={[styles.icon, { backgroundColor: theme.colors.accentSoft }]}><Ionicons name="link-outline" size={26} color={theme.colors.accent} /></View>
            <View style={styles.grow}>
                <View style={styles.rowHeader}>
                    <Text style={[styles.title, { color: theme.colors.text.primary, flex: 1 }]}>{item.link?.domain}</Text>
                    <ActionsButton onPress={onActions} />
                </View>
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
    const [actionItem, setActionItem] = useState<SharedContentItem | null>(null);
    const [forwardItem, setForwardItem] = useState<SharedContentItem | null>(null);
    const [isForwarding, setIsForwarding] = useState(false);
    const { user } = useAuth();
    const { data: conversationsData } = useConversations();
    const queryClient = useQueryClient();
    const { mutateAsync: deleteMessage } = useDeleteMessage(route.params.conversationId);

    useEffect(() => navigation.setOptions({ title: CONTENT_TITLES[category] }), [category, navigation]);
    const goToMessage = (item: SharedContentItem) => navigation.navigate('Chat', {
        conversationId: route.params.conversationId,
        otherUser: route.params.otherUser,
        isSelf: route.params.isSelf,
        isGroup: route.params.isGroup,
        groupMetadata: route.params.groupMetadata,
        scrollToMessageId: item.messageId,
    });

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
                            setActionItem(null);
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
    if (query.isError) return <View style={[styles.center, { backgroundColor: theme.colors.background }]}><Text style={{ color: theme.colors.text.secondary }}>No se pudo cargar el contenido.</Text><TouchableOpacity onPress={() => query.refetch()}><Text style={{ color: theme.colors.accent, marginTop: 10 }}>Reintentar</Text></TouchableOpacity></View>;

    return (
        <>
            <FlatList
                style={{ backgroundColor: theme.colors.background }}
                contentContainerStyle={[styles.list, items.length === 0 && styles.emptyList]}
                data={items}
                keyExtractor={(item) => item.id}
                renderItem={({ item }) => category === 'audio'
                    ? <AudioRow item={item} onMessage={() => goToMessage(item)} onActions={() => setActionItem(item)} />
                    : category === 'document'
                        ? <DocumentRow item={item} onMessage={() => goToMessage(item)} onActions={() => setActionItem(item)} />
                        : <LinkRow item={item} onMessage={() => goToMessage(item)} onActions={() => setActionItem(item)} />}
                ListEmptyComponent={<Text style={{ color: theme.colors.text.secondary }}>No hay {CONTENT_TITLES[category].toLowerCase()} compartidos.</Text>}
                onEndReached={() => { if (query.hasNextPage && !query.isFetchingNextPage) void query.fetchNextPage(); }}
                ListFooterComponent={query.isFetchingNextPage ? <ActivityIndicator /> : null}
            />
            <SharedContentActionSheet
                visible={Boolean(actionItem)}
                item={actionItem}
                canDelete={actionItem ? canDelete(actionItem) : false}
                onClose={() => setActionItem(null)}
                onForward={() => {
                    if (!actionItem) return;
                    setForwardItem(actionItem);
                    setActionItem(null);
                }}
                onDelete={() => actionItem && confirmDelete(actionItem)}
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
        </>
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
    rowHeader: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    actionsButton: { padding: 4, marginTop: -4 },
    icon: { width: 46, height: 46, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
    messageLink: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 10, alignSelf: 'flex-start' },
    inlineActions: { flexDirection: 'row', alignItems: 'center', gap: 16, flexWrap: 'wrap' },
    audioPlayer: { marginVertical: 8, paddingHorizontal: 10, borderRadius: 10 },
    audioLoading: { marginVertical: 16 },
});
