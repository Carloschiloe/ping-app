import React, { createContext, useContext, useRef } from 'react';
import { Platform, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { BlurTargetView, BlurView } from 'expo-blur';
import { Silk } from './Silk';
import { colors } from './tokens';

// On Android a blur needs to know which view it blurs. The silk background
// is that view; every Glass under it reads it from here.
const BlurTargetContext = createContext<React.RefObject<View | null> | null>(null);

export function GlassBackdrop({ children }: { children: React.ReactNode }) {
    const target = useRef<View | null>(null);
    return (
        <View style={styles.root}>
            <BlurTargetView ref={target} style={StyleSheet.absoluteFill}>
                <Silk />
            </BlurTargetView>
            <BlurTargetContext.Provider value={target}>{children}</BlurTargetContext.Provider>
        </View>
    );
}

type GlassProps = {
    children?: React.ReactNode;
    style?: StyleProp<ViewStyle>;
    intensity?: number;
};

// Frosted glass with a thin bright edge.
export function Glass({ children, style, intensity = 45 }: GlassProps) {
    const target = useContext(BlurTargetContext);
    const canBlur = Platform.OS === 'ios' || !!target;
    return (
        <View style={[styles.shell, style]}>
            {canBlur ? (
                <BlurView
                    tint="dark"
                    intensity={intensity}
                    blurTarget={target ?? undefined}
                    blurMethod="dimezisBlurViewSdk31Plus"
                    style={StyleSheet.absoluteFill}
                />
            ) : null}
            <View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: canBlur ? colors.glassTint : colors.glassFallback }]} />
            {children}
        </View>
    );
}

const styles = StyleSheet.create({
    root: { flex: 1, backgroundColor: colors.ink },
    shell: {
        overflow: 'hidden',
        borderWidth: StyleSheet.hairlineWidth,
        borderColor: colors.glassBorder,
    },
});
