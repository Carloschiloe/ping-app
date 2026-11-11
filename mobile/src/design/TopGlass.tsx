import React from 'react';
import { StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Reanimated, { Extrapolation, interpolate, useAnimatedScrollHandler, useAnimatedStyle, useSharedValue } from 'react-native-reanimated';
import { Glass } from './Glass';

// A frosted strip under the phone's clock and battery. It fades in as the
// screen scrolls, so the content never runs under the status bar.
export function useTopGlass() {
    const insets = useSafeAreaInsets();
    const scrollY = useSharedValue(0);
    const onScroll = useAnimatedScrollHandler((event) => { scrollY.value = event.contentOffset.y; });
    const fade = useAnimatedStyle(() => ({ opacity: interpolate(scrollY.value, [0, 24], [0, 1], Extrapolation.CLAMP) }));
    const glass = (
        <Reanimated.View pointerEvents="none" style={[styles.bar, { height: Math.max(insets.top, 16) + 8 }, fade]}>
            <Glass style={[StyleSheet.absoluteFill, styles.glass]} intensity={55} />
        </Reanimated.View>
    );
    return { onScroll, glass };
}

const styles = StyleSheet.create({
    bar: { position: 'absolute', top: 0, left: 0, right: 0, zIndex: 10 },
    glass: { borderWidth: 0, borderRadius: 0, borderBottomWidth: StyleSheet.hairlineWidth },
});
