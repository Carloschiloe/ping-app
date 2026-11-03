import React from 'react';
import { Platform, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { BlurView } from 'expo-blur';
import { colors } from './tokens';

type GlassProps = {
    children?: React.ReactNode;
    style?: StyleProp<ViewStyle>;
    intensity?: number;
};

// Frosted glass: real blur on iOS; on Android, where blur is weaker, a
// near-solid graphite keeps it legible. A thin light edge on top gives the
// glass its depth.
export function Glass({ children, style, intensity = 40 }: GlassProps) {
    return (
        <View style={[styles.shell, style]}>
            {Platform.OS === 'ios'
                ? <BlurView tint="dark" intensity={intensity} style={StyleSheet.absoluteFill} />
                : <View style={[StyleSheet.absoluteFill, { backgroundColor: colors.glassSolid }]} />}
            <View pointerEvents="none" style={[StyleSheet.absoluteFill, styles.tint]} />
            <View pointerEvents="none" style={styles.highlight} />
            {children}
        </View>
    );
}

const styles = StyleSheet.create({
    shell: {
        overflow: 'hidden',
        borderWidth: StyleSheet.hairlineWidth,
        borderColor: colors.glassBorder,
    },
    tint: { backgroundColor: colors.glass },
    highlight: {
        position: 'absolute',
        top: 0,
        left: 12,
        right: 12,
        height: StyleSheet.hairlineWidth,
        backgroundColor: colors.glassHighlight,
    },
});
