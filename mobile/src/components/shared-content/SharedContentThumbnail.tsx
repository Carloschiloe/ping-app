import React from 'react';
import { ActivityIndicator, Image, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { SharedContentItem } from '../../types/sharedContent';
import { useSharedContentUrl } from '../../hooks/useSharedContentUrl';
import { useAppTheme } from '../../theme/ThemeContext';

export function SharedContentThumbnail({ item, size = 58 }: { item: SharedContentItem; size?: number }) {
    const { theme } = useAppTheme();
    const { url, state } = useSharedContentUrl(item, item.type === 'image');
    const style = { width: size, height: size, borderRadius: theme.borderRadius.sm };

    if (item.type === 'video') {
        return (
            <View style={[styles.placeholder, style, { backgroundColor: theme.colors.surfaceMuted }]}>
                <Ionicons name="videocam" size={24} color={theme.colors.text.secondary} />
                <View style={[styles.play, { backgroundColor: theme.colors.overlay }]}>
                    <Ionicons name="play" size={14} color={theme.colors.white} />
                </View>
            </View>
        );
    }
    if (state === 'loading') {
        return <View style={[styles.placeholder, style, { backgroundColor: theme.colors.surfaceMuted }]}><ActivityIndicator /></View>;
    }
    if (!url) {
        return <View style={[styles.placeholder, style, { backgroundColor: theme.colors.surfaceMuted }]}><Ionicons name="image-outline" size={24} color={theme.colors.text.muted} /></View>;
    }
    return <Image source={{ uri: url }} style={style} resizeMode="cover" />;
}

const styles = StyleSheet.create({
    placeholder: { alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
    play: { position: 'absolute', width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
});
