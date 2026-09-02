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
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { PinchGestureHandler, State } from 'react-native-gesture-handler';
import { ResizeMode, Video } from 'expo-av';
import type { SharedContentItem } from '../../types/sharedContent';
import { useSharedContentUrl } from '../../hooks/useSharedContentUrl';
import { useAppTheme } from '../../theme/ThemeContext';

function VisualPage({ item, active, width }: { item: SharedContentItem; active: boolean; width: number }) {
    const { theme } = useAppTheme();
    const { url, state, refresh } = useSharedContentUrl(item, active);
    const scale = useRef(new Animated.Value(1)).current;
    const onPinch = Animated.event([{ nativeEvent: { scale } }], { useNativeDriver: true });

    if (state === 'loading' || !active) {
        return <View style={[styles.page, { width }]}>{active && <ActivityIndicator color={theme.colors.white} />}</View>;
    }
    if (!url) {
        return (
            <View style={[styles.page, { width }]}>
                <Ionicons name="cloud-offline-outline" size={48} color={theme.colors.text.muted} />
                <Text style={[styles.unavailable, { color: theme.colors.text.muted }]}>Contenido no disponible</Text>
                <TouchableOpacity onPress={refresh}><Text style={{ color: theme.colors.accent }}>Reintentar</Text></TouchableOpacity>
            </View>
        );
    }
    if (item.type === 'video') {
        return <View style={[styles.page, { width }]}><Video source={{ uri: url }} style={styles.media} useNativeControls resizeMode={ResizeMode.CONTAIN} shouldPlay={active} /></View>;
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
}: {
    visible: boolean;
    items: SharedContentItem[];
    initialIndex: number;
    onClose: () => void;
    onGoToMessage: (item: SharedContentItem) => void;
}) {
    const { theme } = useAppTheme();
    const { width } = useWindowDimensions();
    const listRef = useRef<FlatList<SharedContentItem>>(null);
    const [activeIndex, setActiveIndex] = useState(initialIndex);

    useEffect(() => {
        if (!visible) return;
        setActiveIndex(initialIndex);
        requestAnimationFrame(() => listRef.current?.scrollToIndex({ index: initialIndex, animated: false }));
    }, [initialIndex, visible]);

    const activeItem = items[activeIndex];
    const move = (offset: number) => {
        const next = Math.max(0, Math.min(items.length - 1, activeIndex + offset));
        setActiveIndex(next);
        listRef.current?.scrollToIndex({ index: next, animated: true });
    };

    return (
        <Modal visible={visible} animationType="fade" onRequestClose={onClose}>
            <SafeAreaView style={[styles.container, { backgroundColor: theme.colors.black }]}>
                <View style={styles.header}>
                    <TouchableOpacity onPress={onClose} accessibilityLabel="Cerrar visor"><Ionicons name="close" size={30} color={theme.colors.white} /></TouchableOpacity>
                    <View style={styles.headerText}>
                        <Text style={[styles.sender, { color: theme.colors.white }]} numberOfLines={1}>{activeItem?.sender.name}</Text>
                        <Text style={[styles.date, { color: theme.colors.text.muted }]}>{activeItem ? new Date(activeItem.createdAt).toLocaleString() : ''}</Text>
                    </View>
                    <Text style={[styles.position, { color: theme.colors.white }]}>{items.length ? `${activeIndex + 1}/${items.length}` : ''}</Text>
                </View>
                <FlatList
                    ref={listRef}
                    data={items}
                    horizontal
                    pagingEnabled
                    keyExtractor={(item) => item.id}
                    getItemLayout={(_, index) => ({ length: width, offset: width * index, index })}
                    renderItem={({ item, index }) => <VisualPage item={item} active={index === activeIndex} width={width} />}
                    onMomentumScrollEnd={(event) => setActiveIndex(Math.round(event.nativeEvent.contentOffset.x / width))}
                    showsHorizontalScrollIndicator={false}
                />
                <View style={styles.toolbar}>
                    <TouchableOpacity disabled={activeIndex === 0} onPress={() => move(-1)} style={{ opacity: activeIndex === 0 ? 0.35 : 1 }}><Ionicons name="chevron-back" size={30} color={theme.colors.white} /></TouchableOpacity>
                    {activeItem && <TouchableOpacity style={[styles.messageButton, { backgroundColor: theme.colors.accent }]} onPress={() => onGoToMessage(activeItem)}><Ionicons name="chatbubble-outline" size={18} color={theme.colors.white} /><Text style={[styles.messageButtonText, { color: theme.colors.white }]}>Ir al mensaje</Text></TouchableOpacity>}
                    <TouchableOpacity disabled={activeIndex >= items.length - 1} onPress={() => move(1)} style={{ opacity: activeIndex >= items.length - 1 ? 0.35 : 1 }}><Ionicons name="chevron-forward" size={30} color={theme.colors.white} /></TouchableOpacity>
                </View>
            </SafeAreaView>
        </Modal>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1 },
    header: { minHeight: 62, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, gap: 12 },
    headerText: { flex: 1 },
    sender: { fontWeight: '700', fontSize: 15 },
    date: { fontSize: 12, marginTop: 2 },
    position: { fontSize: 13 },
    page: { flex: 1, alignItems: 'center', justifyContent: 'center' },
    media: { width: '100%', height: '100%' },
    unavailable: { marginTop: 12, marginBottom: 8 },
    toolbar: { height: 76, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 24 },
    messageButton: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 18, paddingVertical: 11, borderRadius: 22 },
    messageButtonText: { fontWeight: '700' },
});
