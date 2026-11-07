import React, { useEffect } from 'react';
import { StyleSheet } from 'react-native';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withRepeat, withTiming } from 'react-native-reanimated';
import Svg, { Defs, LinearGradient, Path, Rect, Stop } from 'react-native-svg';

// Brushed-silver waves: broad satin bands that catch the light in the middle
// and fall into shadow at their edges. Drawn once, scaled to fill the screen.
const BANDS = [
    { d: 'M-80,70 C60,-10 230,210 480,90 L480,300 C250,410 80,190 -80,290 Z', light: '#6A7282' },
    { d: 'M-80,330 C110,240 270,480 480,360 L480,520 C270,640 110,420 -80,540 Z', light: '#5A6272' },
    { d: 'M-80,600 C130,510 290,730 480,620 L480,780 C290,900 130,690 -80,800 Z', light: '#4E5665' },
];

// With `moving`, each band sways slowly on its own, out of step with the others.
const SWAY = [
    { duration: 9000, x: 34, y: 16 },
    { duration: 12000, x: -40, y: 20 },
    { duration: 15000, x: 30, y: -18 },
];

export function Silk({ moving = false }: { moving?: boolean }) {
    if (moving) return <MovingSilk />;
    return (
        <Svg pointerEvents="none" style={StyleSheet.absoluteFill} viewBox="0 0 400 860" preserveAspectRatio="xMidYMid slice">
            <Defs>
                <LinearGradient id="silk-base" x1="0" y1="0" x2="0.6" y2="1">
                    <Stop offset="0" stopColor="#2A2D34" />
                    <Stop offset="0.5" stopColor="#14161A" />
                    <Stop offset="1" stopColor="#08090B" />
                </LinearGradient>
                {BANDS.map((band, i) => (
                    <LinearGradient key={i} id={`silk-band-${i}`} x1="0" y1="0" x2="0.15" y2="1">
                        <Stop offset="0" stopColor="#101115" />
                        <Stop offset="0.42" stopColor={band.light} />
                        <Stop offset="0.5" stopColor="#A3ABB8" />
                        <Stop offset="0.6" stopColor={band.light} />
                        <Stop offset="1" stopColor="#0C0D10" />
                    </LinearGradient>
                ))}
                <LinearGradient id="silk-blue" x1="0" y1="0" x2="1" y2="1">
                    <Stop offset="0" stopColor="#3B82F6" stopOpacity={0} />
                    <Stop offset="0.5" stopColor="#3B82F6" stopOpacity={0.22} />
                    <Stop offset="1" stopColor="#3B82F6" stopOpacity={0} />
                </LinearGradient>
            </Defs>
            <Rect x="0" y="0" width="400" height="860" fill="url(#silk-base)" />
            {BANDS.map((band, i) => (
                <Path key={i} d={band.d} fill={`url(#silk-band-${i})`} opacity={0.7 - i * 0.1} />
            ))}
            <Rect x="0" y="0" width="400" height="860" fill="url(#silk-blue)" />
        </Svg>
    );
}

function SilkDefs() {
    return (
        <Defs>
            <LinearGradient id="silk-base" x1="0" y1="0" x2="0.6" y2="1">
                <Stop offset="0" stopColor="#2A2D34" />
                <Stop offset="0.5" stopColor="#14161A" />
                <Stop offset="1" stopColor="#08090B" />
            </LinearGradient>
            {BANDS.map((band, i) => (
                <LinearGradient key={i} id={`silk-band-${i}`} x1="0" y1="0" x2="0.15" y2="1">
                    <Stop offset="0" stopColor="#101115" />
                    <Stop offset="0.42" stopColor={band.light} />
                    <Stop offset="0.5" stopColor="#A3ABB8" />
                    <Stop offset="0.6" stopColor={band.light} />
                    <Stop offset="1" stopColor="#0C0D10" />
                </LinearGradient>
            ))}
            <LinearGradient id="silk-blue" x1="0" y1="0" x2="1" y2="1">
                <Stop offset="0" stopColor="#3B82F6" stopOpacity={0} />
                <Stop offset="0.5" stopColor="#3B82F6" stopOpacity={0.22} />
                <Stop offset="1" stopColor="#3B82F6" stopOpacity={0} />
            </LinearGradient>
        </Defs>
    );
}

function MovingSilk() {
    return (
        <>
            <Svg pointerEvents="none" style={StyleSheet.absoluteFill} viewBox="0 0 400 860" preserveAspectRatio="xMidYMid slice">
                <SilkDefs />
                <Rect x="0" y="0" width="400" height="860" fill="url(#silk-base)" />
            </Svg>
            {BANDS.map((band, i) => (
                <SwayingBand key={i} index={i} d={band.d} />
            ))}
            <Svg pointerEvents="none" style={StyleSheet.absoluteFill} viewBox="0 0 400 860" preserveAspectRatio="xMidYMid slice">
                <SilkDefs />
                <Rect x="0" y="0" width="400" height="860" fill="url(#silk-blue)" />
            </Svg>
        </>
    );
}

function SwayingBand({ index, d }: { index: number; d: string }) {
    const sway = SWAY[index];
    const p = useSharedValue(0);
    useEffect(() => {
        p.value = withRepeat(withTiming(1, { duration: sway.duration, easing: Easing.inOut(Easing.sin) }), -1, true);
    }, [p, sway.duration]);
    const style = useAnimatedStyle(() => ({
        transform: [
            { translateX: (p.value - 0.5) * sway.x },
            { translateY: (p.value - 0.5) * sway.y },
            { scaleY: 1 + 0.06 * p.value },
        ],
    }));
    return (
        <Animated.View pointerEvents="none" style={[styles.band, style]}>
            <Svg style={StyleSheet.absoluteFill} viewBox="0 0 400 860" preserveAspectRatio="xMidYMid slice">
                <SilkDefs />
                <Path d={d} fill={`url(#silk-band-${index})`} opacity={0.7 - index * 0.1} />
            </Svg>
        </Animated.View>
    );
}

const styles = StyleSheet.create({
    // A little larger than the screen, so a band never shows its edge as it sways.
    band: { position: 'absolute', top: -30, bottom: -30, left: -40, right: -40 },
});
