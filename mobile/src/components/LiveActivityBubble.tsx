import React, { useEffect, useMemo } from 'react';
import { View, Text, Animated, Easing, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, radius, space } from '../design/tokens';
import { fonts } from '../design/typography';

// What the other side is doing right now, drawn like an incoming message:
// three bouncing dots while they type, a beating mic and moving sound bars
// while they record a voice note.

function useLoop(make: () => Animated.CompositeAnimation, deps: unknown[]) {
    useEffect(() => {
        const animation = make();
        animation.start();
        return () => animation.stop();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, deps);
}

function TypingDots() {
    const dots = useMemo(() => [0, 1, 2].map(() => new Animated.Value(0)), []);
    useLoop(() => Animated.loop(
        Animated.stagger(150, dots.map((dot) => Animated.sequence([
            Animated.timing(dot, { toValue: 1, duration: 280, easing: Easing.out(Easing.quad), useNativeDriver: true }),
            Animated.timing(dot, { toValue: 0, duration: 280, easing: Easing.in(Easing.quad), useNativeDriver: true }),
            Animated.delay(300),
        ])))
    ), [dots]);

    return (
        <View style={styles.dots}>
            {dots.map((dot, i) => (
                <Animated.View
                    key={i}
                    style={[styles.dot, {
                        opacity: dot.interpolate({ inputRange: [0, 1], outputRange: [0.35, 1] }),
                        transform: [{ translateY: dot.interpolate({ inputRange: [0, 1], outputRange: [0, -5] }) }],
                    }]}
                />
            ))}
        </View>
    );
}

const BAR_PEAKS = [0.55, 1, 0.7, 0.9, 0.5];

function RecordingMic({ elapsed }: { elapsed: string }) {
    const pulse = useMemo(() => new Animated.Value(0), []);
    const bars = useMemo(() => BAR_PEAKS.map(() => new Animated.Value(0)), []);
    useLoop(() => Animated.loop(Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 650, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0, duration: 650, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
    ])), [pulse]);
    useLoop(() => Animated.parallel(bars.map((bar, i) => Animated.loop(Animated.sequence([
        Animated.delay(i * 90),
        Animated.timing(bar, { toValue: 1, duration: 260 + i * 40, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
        Animated.timing(bar, { toValue: 0, duration: 260 + i * 40, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
    ])))), [bars]);

    return (
        <View style={styles.recording}>
            <View style={styles.micWrap}>
                <Animated.View
                    style={[styles.micHalo, {
                        opacity: pulse.interpolate({ inputRange: [0, 1], outputRange: [0.45, 0] }),
                        transform: [{ scale: pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 1.7] }) }],
                    }]}
                />
                <View style={styles.mic}>
                    <Ionicons name="mic" size={15} color={colors.onAccent} />
                </View>
            </View>
            <View style={styles.bars}>
                {bars.map((bar, i) => (
                    <Animated.View
                        key={i}
                        style={[styles.bar, {
                            transform: [{ scaleY: bar.interpolate({ inputRange: [0, 1], outputRange: [0.3, BAR_PEAKS[i]] }) }],
                        }]}
                    />
                ))}
            </View>
            <Text style={styles.elapsed}>{elapsed}</Text>
        </View>
    );
}

interface LiveActivityBubbleProps {
    names: string[];
    recording: boolean;
    elapsed: string;
    showNames: boolean;
}

export function LiveActivityBubble({ names, recording, elapsed, showNames }: LiveActivityBubbleProps) {
    const label = `${names.join(', ')} ${names.length > 1 ? 'están' : 'está'} ${recording ? 'grabando un audio' : 'escribiendo'}`;
    return (
        <View style={styles.wrap} accessibilityLiveRegion="polite" accessibilityLabel={label}>
            {showNames && <Text style={styles.name} numberOfLines={1}>{names.join(', ')}</Text>}
            <View style={styles.bubble}>
                {recording ? <RecordingMic elapsed={elapsed} /> : <TypingDots />}
            </View>
        </View>
    );
}

const styles = StyleSheet.create({
    wrap: { alignSelf: 'flex-start', paddingHorizontal: space.md, paddingVertical: 4 },
    name: { fontFamily: fonts.semibold, fontSize: 11, color: colors.textFaint, marginLeft: 6, marginBottom: 3 },
    bubble: {
        minHeight: 38,
        justifyContent: 'center',
        paddingHorizontal: 14,
        paddingVertical: 9,
        borderRadius: radius.lg,
        borderBottomLeftRadius: 6,
        backgroundColor: colors.bubbleThem,
        borderWidth: StyleSheet.hairlineWidth,
        borderColor: colors.separator,
    },
    dots: { flexDirection: 'row', alignItems: 'center', gap: 5, height: 18 },
    dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.textSoft },
    recording: { flexDirection: 'row', alignItems: 'center', gap: 10 },
    micWrap: { width: 26, height: 26, alignItems: 'center', justifyContent: 'center' },
    micHalo: { position: 'absolute', width: 26, height: 26, borderRadius: 13, backgroundColor: colors.danger },
    mic: { width: 26, height: 26, borderRadius: 13, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.danger },
    bars: { flexDirection: 'row', alignItems: 'center', gap: 3, height: 20 },
    bar: { width: 3, height: 20, borderRadius: 2, backgroundColor: colors.accentBright },
    elapsed: { fontFamily: fonts.medium, fontSize: 13, color: colors.textSoft, fontVariant: ['tabular-nums'] },
});
