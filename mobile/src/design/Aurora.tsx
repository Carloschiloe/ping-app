import React, { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, {
    Easing,
    useAnimatedStyle,
    useSharedValue,
    withRepeat,
    withTiming,
} from 'react-native-reanimated';
import Svg, { Defs, RadialGradient, Stop, Circle } from 'react-native-svg';
import { colors } from './tokens';

type Blob = { color: string; size: number; x: number; y: number; dx: number; dy: number; duration: number; opacity: number };

const BLOBS: Blob[] = [
    { color: colors.auroraWarm, size: 420, x: -140, y: -160, dx: 60, dy: 40, duration: 14000, opacity: 0.9 },
    { color: colors.auroraCool, size: 380, x: 160, y: -60, dx: -70, dy: 50, duration: 17000, opacity: 1 },
    { color: colors.auroraEmber, size: 320, x: 40, y: 120, dx: 50, dy: -40, duration: 12000, opacity: 0.7 },
];

function AuroraBlob({ blob, index }: { blob: Blob; index: number }) {
    const t = useSharedValue(0);
    useEffect(() => {
        t.value = withRepeat(withTiming(1, { duration: blob.duration, easing: Easing.inOut(Easing.sin) }), -1, true);
    }, [blob.duration, t]);

    const style = useAnimatedStyle(() => ({
        transform: [
            { translateX: blob.x + blob.dx * t.value },
            { translateY: blob.y + blob.dy * t.value },
            { scale: 1 + 0.12 * t.value },
        ],
    }));

    const id = `aurora-${index}`;
    return (
        <Animated.View style={[styles.blob, { width: blob.size, height: blob.size, opacity: blob.opacity }, style]}>
            <Svg width={blob.size} height={blob.size}>
                <Defs>
                    <RadialGradient id={id} cx="50%" cy="50%" r="50%">
                        <Stop offset="0" stopColor={blob.color} stopOpacity={1} />
                        <Stop offset="1" stopColor={blob.color} stopOpacity={0} />
                    </RadialGradient>
                </Defs>
                <Circle cx={blob.size / 2} cy={blob.size / 2} r={blob.size / 2} fill={`url(#${id})`} />
            </Svg>
        </Animated.View>
    );
}

// Slow, soft light behind the content. It lives in the top part of a
// screen, where the glass header lets it shine through.
export function Aurora({ height = 420 }: { height?: number }) {
    return (
        <View pointerEvents="none" style={[styles.wrap, { height }]}>
            {BLOBS.map((blob, i) => <AuroraBlob key={i} blob={blob} index={i} />)}
        </View>
    );
}

const styles = StyleSheet.create({
    wrap: { position: 'absolute', top: 0, left: 0, right: 0, overflow: 'hidden' },
    blob: { position: 'absolute', top: 0, left: 0 },
});
