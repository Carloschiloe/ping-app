import React from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { CachedImage } from '../../design/CachedImage';
import { Ionicons } from '@expo/vector-icons';
import type { SharedContentItem } from '../../types/sharedContent';
import { useSharedContentUrl } from '../../hooks/useSharedContentUrl';
import { colors, radius } from '../../design/tokens';

export function SharedContentThumbnail({ item, size = 58 }: { item: SharedContentItem; size?: number }) {
    const { url, state } = useSharedContentUrl(item, item.type === 'image');
    const style = { width: size, height: size, borderRadius: radius.sm };

    if (item.type === 'video') {
        return (
            <View style={[styles.placeholder, style]}>
                <Ionicons name="videocam" size={24} color={colors.textSoft} />
                <View style={styles.play}>
                    <Ionicons name="play" size={14} color={colors.onAccent} />
                </View>
            </View>
        );
    }
    if (state === 'loading') {
        return <View style={[styles.placeholder, style]}><ActivityIndicator color={colors.textFaint} /></View>;
    }
    if (!url) {
        return <View style={[styles.placeholder, style]}><Ionicons name="image-outline" size={24} color={colors.textFaint} /></View>;
    }
    return <CachedImage uri={url} style={style} />;
}

const styles = StyleSheet.create({
    placeholder: { alignItems: 'center', justifyContent: 'center', overflow: 'hidden', backgroundColor: colors.glassRaised },
    play: { position: 'absolute', width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.scrim },
});
