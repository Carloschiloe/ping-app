import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, Linking, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useQueryClient } from '@tanstack/react-query';
import { Ionicons } from '@expo/vector-icons';
import { useConversations, useDeleteMessage, useSharedContent } from '../api/queries';
import type { SharedContentScreenProps } from '../navigation/types';
import type { SharedContentItem } from '../types/sharedContent';
import { useSharedContentUrl } from '../hooks/useSharedContentUrl';
import { documentIconName, formatSharedDuration, formatSharedDateTime, formatSharedFileSize } from '../utils/sharedContent';
import AudioPlayer from '../components/AudioPlayer';
import { SharedContentActionSheet } from '../components/shared-content/SharedContentActionSheet';
import { ForwardMessagesModal } from '../components/ForwardMessagesModal';
import { useAuth } from '../context/AuthContext';
import { apiClient } from '../api/client';
import * as Haptics from 'expo-haptics';
import { createClientMessageId } from '../utils/synchronization';
import { colors, radius, space } from '../design/tokens';
import { fonts, type } from '../design/typography';
import { Glass } from '../design/Glass';
import { ScreenHeader } from '../design/ScreenHeader';
import { confirmAction } from '../design/ConfirmDialog';

const CONTENT_TITLES = { audio: 'Audios', document: 'Documentos', link: 'Enlaces' } as const;

function Meta({ item }: { item: SharedContentItem }) {
    return <Text style={styles.meta}>{item.sender.name} · {formatSharedDateTime(item.createdAt)}</Text>;
}

function GoToMessage({ onPress }: { onPress: () => void }) {
    return (
        <TouchableOpacity onPress={onPress} style={styles.messageLink}>
            <Ionicons name="chatbubble-outline" size={14} color={colors.accentBright} />
            <Text style={styles.linkText}>Ir al mensaje</Text>
        </TouchableOpacity>
    );
}

function ActionsButton({ onPress }: { onPress: () => void }) {
    return (
        <TouchableOpacity onPress={onPress} accessibilityLabel="Acciones del archivo" style={styles.actionsButton} hitSlop={8}>
            <Ionicons name="ellipsis-horizontal" size={20} color={colors.textSoft} />
        </TouchableOpacity>
    );
}

// Every item sits on its own full-width glass band.
function Band({ first, last, children }: { first: boolean; last: boolean; children: React.ReactNode }) {
    return (
        <View style={[first && styles.bandFirst, last && styles.bandLast]}>
            <Glass style={[StyleSheet.absoluteFill, styles.bandGlass]} intensity={22} tint={colors.glassTintLight} />
            {children}
            {!last && <View pointerEvents="none" style={styles.bandSeparator} />}
        </View>
    );
}

function AudioRow({ item, onMessage, onActions }: { item: SharedContentItem; onMessage: () => void; onActions: () => void }) {
    const { url, state, refresh } = useSharedContentUrl(item);
    return (
        <View style={styles.item}>
            <View style={styles.rowHeader}>
                <Text style={[styles.title, styles.grow]}>{item.sender.name}</Text>
                <ActionsButton onPress={onActions} />
            </View>
            {state === 'loading' && <ActivityIndicator style={styles.audioLoading} color={colors.accentBright} />}
            {state === 'available' && url && <AudioPlayer url={url} durationMs={item.file?.durationMs} style={styles.audioPlayer} />}
            {state === 'unavailable' && <TouchableOpacity onPress={refresh}><Text style={styles.unavailable}>Audio no disponible · Reintentar</Text></TouchableOpacity>}
            <Text style={styles.detail}>
                {[formatSharedDateTime(item.createdAt), formatSharedDuration(item.file?.durationMs)].filter(Boolean).join(' · ')}
            </Text>
            <GoToMessage onPress={onMessage} />
        </View>
    );
}

function DocumentRow({ item, onMessage, onActions }: { item: SharedContentItem; onMessage: () => void; onActions: () => void }) {
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
        <View style={[styles.item, styles.row]}>
            <View style={styles.icon}><Ionicons name={documentIconName(item)} size={22} color={colors.accentBright} /></View>
            <View style={styles.grow}>
                <View style={styles.rowHeader}>
                    <Text style={[styles.title, styles.grow]} numberOfLines={2}>{item.file?.name || 'Documento'}</Text>
                    <ActionsButton onPress={onActions} />
                </View>
                <Text style={styles.detail}>{formatSharedFileSize(item.file?.sizeBytes)}</Text>
                <Meta item={item} />
                <View style={styles.inlineActions}>
                    <TouchableOpacity onPress={open} style={styles.openButton}>
                        <Text style={styles.openText}>{state === 'loading' ? 'Abriendo…' : 'Abrir'}</Text>
                    </TouchableOpacity>
                    {state === 'unavailable' && <Text style={styles.unavailable}>No disponible</Text>}
                    <GoToMessage onPress={onMessage} />
                </View>
            </View>
        </View>
    );
}

function LinkRow({ item, onMessage, onActions }: { item: SharedContentItem; onMessage: () => void; onActions: () => void }) {
    return (
        <View style={[styles.item, styles.row]}>
            <View style={styles.icon}><Ionicons name="link-outline" size={22} color={colors.accentBright} /></View>
            <View style={styles.grow}>
                <View style={styles.rowHeader}>
                    <Text style={[styles.title, styles.grow]}>{item.link?.domain}</Text>
                    <ActionsButton onPress={onActions} />
                </View>
                <TouchableOpacity onPress={() => item.link && Linking.openURL(item.link.url)}>
                    <Text style={styles.url} numberOfLines={2}>{item.link?.url}</Text>
                </TouchableOpacity>
                <Meta item={item} />
                <GoToMessage onPress={onMessage} />
            </View>
        </View>
    );
}

export default function SharedContentScreen({ route, navigation }: SharedContentScreenProps) {
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

    const goToMessage = (item: SharedContentItem) => navigation.navigate('Chat', {
        conversationId: route.params.conversationId,
        otherUser: route.params.otherUser,
        isSelf: route.params.isSelf,
        isGroup: route.params.isGroup,
        groupMetadata: route.params.groupMetadata,
        scrollToMessageId: item.messageId,
    });

    const canDelete = (item: SharedContentItem) => Boolean(user?.id && item.sender.id === user.id);

    const confirmDelete = async (item: SharedContentItem) => {
        if (!canDelete(item)) return;
        const ok = await confirmAction({
            title: 'Eliminar archivo',
            message: 'Se eliminará también del chat para todos. Esta acción no se puede deshacer.',
        });
        if (!ok) return;
        void deleteMessage(item.messageId).then(() => {
            setActionItem(null);
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

    const header = <ScreenHeader title={CONTENT_TITLES[category]} onBack={() => navigation.goBack()} />;

    if (query.isLoading) {
        return <View style={styles.container}>{header}<View style={styles.center}><ActivityIndicator color={colors.accentBright} /></View></View>;
    }
    if (query.isError) {
        return (
            <View style={styles.container}>
                {header}
                <View style={styles.center}>
                    <Text style={styles.emptyText}>No se pudo cargar el contenido.</Text>
                    <TouchableOpacity onPress={() => query.refetch()}><Text style={styles.retry}>Reintentar</Text></TouchableOpacity>
                </View>
            </View>
        );
    }

    return (
        <View style={styles.container}>
            {header}
            <FlatList
                contentContainerStyle={[styles.list, items.length === 0 && styles.emptyList]}
                data={items}
                keyExtractor={(item) => item.id}
                renderItem={({ item, index }) => (
                    <Band first={index === 0} last={index === items.length - 1}>
                        {category === 'audio'
                            ? <AudioRow item={item} onMessage={() => goToMessage(item)} onActions={() => setActionItem(item)} />
                            : category === 'document'
                                ? <DocumentRow item={item} onMessage={() => goToMessage(item)} onActions={() => setActionItem(item)} />
                                : <LinkRow item={item} onMessage={() => goToMessage(item)} onActions={() => setActionItem(item)} />}
                    </Band>
                )}
                ListEmptyComponent={<Text style={styles.emptyText}>No hay {CONTENT_TITLES[category].toLowerCase()} compartidos.</Text>}
                onEndReached={() => { if (query.hasNextPage && !query.isFetchingNextPage) void query.fetchNextPage(); }}
                ListFooterComponent={query.isFetchingNextPage ? <ActivityIndicator style={styles.footer} color={colors.accentBright} /> : null}
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
        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: 'transparent' },
    center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
    list: { paddingTop: space.lg, paddingBottom: space.xxl },
    emptyList: { flexGrow: 1, alignItems: 'center', justifyContent: 'center' },
    emptyText: { ...type.subhead, textAlign: 'center' },
    retry: { fontFamily: fonts.semibold, fontSize: 14, color: colors.accentBright, marginTop: 10 },
    footer: { marginVertical: space.lg },
    bandGlass: { borderWidth: 0 },
    bandFirst: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.glassBorder },
    bandLast: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.glassBorder },
    bandSeparator: { position: 'absolute', left: space.xl, right: 0, bottom: 0, height: StyleSheet.hairlineWidth, backgroundColor: colors.separator },
    item: { paddingHorizontal: space.xl, paddingVertical: space.lg },
    row: { flexDirection: 'row', gap: space.md },
    grow: { flex: 1 },
    title: { fontFamily: fonts.semibold, fontSize: 15, color: colors.text },
    detail: { ...type.caption, color: colors.textFaint },
    meta: { ...type.caption, color: colors.textFaint, marginTop: 4 },
    url: { fontFamily: fonts.regular, fontSize: 13, color: colors.accentBright, marginTop: 2 },
    unavailable: { ...type.caption, color: colors.danger },
    rowHeader: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
    actionsButton: { padding: 4, marginTop: -4 },
    icon: { width: 44, height: 44, borderRadius: radius.sm, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.accentTint },
    messageLink: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 10, alignSelf: 'flex-start' },
    linkText: { fontFamily: fonts.semibold, fontSize: 12, color: colors.accentBright },
    inlineActions: { flexDirection: 'row', alignItems: 'center', gap: space.lg, flexWrap: 'wrap' },
    openButton: {
        marginTop: 10,
        paddingHorizontal: 14,
        paddingVertical: 6,
        borderRadius: radius.full,
        backgroundColor: colors.accentTint,
    },
    openText: { fontFamily: fonts.semibold, fontSize: 13, color: colors.accentBright },
    audioPlayer: { marginVertical: space.sm, paddingHorizontal: 10, borderRadius: radius.sm, backgroundColor: colors.glassRaised },
    audioLoading: { marginVertical: space.lg },
});
