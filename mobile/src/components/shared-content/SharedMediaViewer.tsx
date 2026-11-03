import React, { useEffect, useRef, useState } from 'react';
import {
    ActivityIndicator,
    Animated,
    FlatList,
    Modal,
    StyleSheet,
    Text,
    TouchableOpacity,
    useWindowDimensions,
    View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { PinchGestureHandler, State } from 'react-native-gesture-handler';
import { useVideoPlayer, VideoView } from 'expo-video';
import type { SharedContentItem } from '../../types/sharedContent';
import { useSharedContentUrl } from '../../hooks/useSharedContentUrl';
import { LinearGradient } from 'expo-linear-gradient';
import { colors, gradients, radius, space } from '../../design/tokens';
import { fonts } from '../../design/typography';
import { SharedContentActionSheet } from './SharedContentActionSheet';

function VisualPage({
    item,
    active,
    width,
    url,
    state,
    refresh,
}: {
    item: SharedContentItem;
    active: boolean;
    width: number;
    url: string | null;
    state: 'idle' | 'loading' | 'available' | 'unavailable';
    refresh: () => void;
}) {
    const scale = useRef(new Animated.Value(1)).current;
    const onPinch = Animated.event([{ nativeEvent: { scale } }], { useNativeDriver: true });
    const isVideo = item.type === 'video';
    const player = useVideoPlayer(isVideo ? (url ?? null) : null);

    useEffect(() => {
        if (!isVideo || !url) return;
        player.replace(url);
    }, [isVideo, url, player]);

    useEffect(() => {
        if (!isVideo) return;
        if (active) player.play();
        else player.pause();
    }, [isVideo, active, player]);

    if (state === 'loading' || !active) {
        return <View style={[styles.page, { width }]}>{active && <ActivityIndicator color={colors.onAccent} />}</View>;
    }
    if (!url) {
        return (
            <View style={[styles.page, { width }]}>
                <Ionicons name="cloud-offline-outline" size={48} color={colors.textFaint} />
                <Text style={styles.unavailable}>Contenido no disponible</Text>
                <TouchableOpacity onPress={refresh}><Text style={styles.retry}>Reintentar</Text></TouchableOpacity>
            </View>
        );
    }
    if (isVideo) {
        return <View style={[styles.page, { width }]}><VideoView player={player} style={styles.media} nativeControls contentFit="contain" /></View>;
    }
    return (
        <PinchGestureHandler
            onGestureEvent={onPinch}
            onHandlerStateChange={({ nativeEvent }) => {
                if (nativeEvent.oldState === State.ACTIVE) Animated.spring(scale, { toValue: 1, useNativeDriver: true }).start();
            }}
        >
            <Animated.View style={[styles.page, { width, transform: [{ scale }] }]}>
                <Animated.Image source={{ uri: url }} style={styles.media} resizeMode="contain" />
            </Animated.View>
        </PinchGestureHandler>
    );
}

export function SharedMediaViewer({
    visible,
    items,
    initialIndex,
    onClose,
    onGoToMessage,
    canDelete,
    onForward,
    onDelete,
}: {
    visible: boolean;
    items: SharedContentItem[];
    initialIndex: number;
    onClose: () => void;
    onGoToMessage: (item: SharedContentItem) => void;
    canDelete: (item: SharedContentItem) => boolean;
    onForward: (item: SharedContentItem) => void;
    onDelete: (item: SharedContentItem) => void;
}) {
    const { width } = useWindowDimensions();
    const insets = useSafeAreaInsets();
    const listRef = useRef<FlatList<SharedContentItem>>(null);
    const [activeIndex, setActiveIndex] = useState(initialIndex);
    const [actionsVisible, setActionsVisible] = useState(false);

    useEffect(() => {
        if (!visible) return;
        setActiveIndex(initialIndex);
        setActionsVisible(false);
        requestAnimationFrame(() => listRef.current?.scrollToIndex({ index: initialIndex, animated: false }));
    }, [initialIndex, visible]);

    const activeItem = items[activeIndex];
    const activeUrlState = useSharedContentUrl(activeItem || null, visible);
    const move = (offset: number) => {
        const next = Math.max(0, Math.min(items.length - 1, activeIndex + offset));
        setActiveIndex(next);
        listRef.current?.scrollToIndex({ index: next, animated: true });
    };

    return (
        <Modal visible={visible} animationType="fade" onRequestClose={onClose}>
            <View style={[styles.container, { paddingTop: Math.max(insets.top, 20), paddingBottom: Math.max(insets.bottom, 20) }]}>
                <View style={styles.header}>
                    <TouchableOpacity onPress={onClose} accessibilityLabel="Cerrar visor" style={styles.roundButton} hitSlop={{ top: 15, bottom: 15, left: 15, right: 15 }}>
                        <Ionicons name="close" size={26} color={colors.text} />
                    </TouchableOpacity>
                    <View style={styles.headerText}>
                        <Text style={styles.sender} numberOfLines={1}>{activeItem?.sender.name}</Text>
                        <Text style={styles.date}>{activeItem ? new Date(activeItem.createdAt).toLocaleString() : ''}</Text>
                    </View>
                    <Text style={styles.position}>{items.length ? `${activeIndex + 1}/${items.length}` : ''}</Text>
                    {activeItem && <TouchableOpacity onPress={() => setActionsVisible(true)} accessibilityLabel="Acciones del archivo" style={styles.roundButton}>
                        <Ionicons name="ellipsis-horizontal" size={22} color={colors.text} />
                    </TouchableOpacity>}
                </View>
                <FlatList
                    ref={listRef}
                    data={items}
                    horizontal
                    pagingEnabled
                    keyExtractor={(item) => item.id}
                    getItemLayout={(_, index) => ({ length: width, offset: width * index, index })}
                    renderItem={({ item, index }) => (
                        <VisualPage
                            item={item}
                            active={index === activeIndex}
                            width={width}
                            url={index === activeIndex ? activeUrlState.url : null}
                            state={index === activeIndex ? activeUrlState.state : 'idle'}
                            refresh={activeUrlState.refresh}
                        />
                    )}
                    onMomentumScrollEnd={(event) => setActiveIndex(Math.round(event.nativeEvent.contentOffset.x / width))}
                    showsHorizontalScrollIndicator={false}
                />
                <View style={styles.toolbar}>
                    <TouchableOpacity disabled={activeIndex === 0} onPress={() => move(-1)} style={[styles.navButton, activeIndex === 0 && styles.navButtonOff]}><Ionicons name="chevron-back" size={26} color={colors.text} /></TouchableOpacity>
                    {activeItem && <TouchableOpacity style={styles.messageButton} onPress={() => onGoToMessage(activeItem)} activeOpacity={0.85}><LinearGradient colors={gradients.accent} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} /><Ionicons name="chatbubble-outline" size={17} color={colors.onAccent} /><Text style={styles.messageButtonText}>Ir al mensaje</Text></TouchableOpacity>}
                    <TouchableOpacity disabled={activeIndex >= items.length - 1} onPress={() => move(1)} style={[styles.navButton, activeIndex >= items.length - 1 && styles.navButtonOff]}><Ionicons name="chevron-forward" size={26} color={colors.text} /></TouchableOpacity>
                </View>
                <SharedContentActionSheet
                    visible={actionsVisible}
                    inline
                    item={activeItem || null}
                    signedUrl={activeUrlState.url}
                    canDelete={activeItem ? canDelete(activeItem) : false}
                    onClose={() => setActionsVisible(false)}
                    onForward={() => {
                        setActionsVisible(false);
                        if (activeItem) onForward(activeItem);
                    }}
                    onDelete={() => {
                        setActionsVisible(false);
                        if (activeItem) onDelete(activeItem);
                    }}
                />
            </View>
        </Modal>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.ink },
    header: { minHeight: 62, flexDirection: 'row', alignItems: 'center', paddingHorizontal: space.lg, gap: space.md, paddingBottom: space.sm, zIndex: 10 },
    roundButton: {
        width: 40,
        height: 40,
        borderRadius: 20,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: colors.glassRaised,
        borderWidth: StyleSheet.hairlineWidth,
        borderColor: colors.glassBorder,
    },
    headerText: { flex: 1 },
    sender: { fontFamily: fonts.semibold, fontSize: 15, color: colors.text },
    date: { fontFamily: fonts.regular, fontSize: 12, color: colors.textFaint, marginTop: 2 },
    position: { fontFamily: fonts.medium, fontSize: 13, color: colors.textSoft },
    page: { flex: 1, alignItems: 'center', justifyContent: 'center' },
    media: { width: '100%', height: '100%' },
    unavailable: { fontFamily: fonts.medium, fontSize: 14, color: colors.textFaint, marginTop: space.md, marginBottom: space.sm },
    retry: { fontFamily: fonts.semibold, fontSize: 14, color: colors.accentBright },
    toolbar: { height: 76, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: space.xl },
    navButton: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.glassRaised },
    navButtonOff: { opacity: 0.35 },
    messageButton: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: space.sm,
        paddingHorizontal: 18,
        paddingVertical: 11,
        borderRadius: radius.full,
        overflow: 'hidden',
    },
    messageButtonText: { fontFamily: fonts.semibold, fontSize: 14, color: colors.onAccent },
});
