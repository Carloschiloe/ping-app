import React, { useEffect, useId } from 'react';
import { View } from 'react-native';
import Animated, {
    SharedValue,
    useAnimatedStyle,
    useFrameCallback,
    useSharedValue,
    withTiming,
} from 'react-native-reanimated';
import Svg, { Circle, Defs, LinearGradient, RadialGradient, Stop } from 'react-native-svg';
import { colors } from './tokens';

export type PingOrbState = 'idle' | 'listening' | 'thinking';

// How fast Ping's aura turns in each state (time units per second).
const SPEED: Record<PingOrbState, number> = { idle: 1.3, listening: 2.4, thinking: 3.8 };

// Lights that drift inside the core, some clockwise and some against it.
const BLOBS = [colors.accentBright, colors.accentDeep, colors.silver, '#5B9BFF', '#785AFF'];

// Thin arcs around the core: radius (× core), turn speed, share of the circle, color.
const ARCS: { k: number; speed: number; len: number; color: string; opacity: number }[] = [
    { k: 1.1, speed: 1.9, len: 0.72, color: '#F0F5FF', opacity: 0.95 },
    { k: 1.24, speed: -2.7, len: 0.44, color: colors.accentBright, opacity: 0.9 },
    { k: 1.38, speed: 3.6, len: 0.28, color: colors.silver, opacity: 0.7 },
];

// Ping's presence: a glass core of drifting light with orbiting arcs.
export function PingOrb({ size = 34, state = 'idle', paused = false }: { size?: number; state?: PingOrbState; paused?: boolean }) {
    const id = useId().replace(/[^a-zA-Z0-9]/g, '');
    const t = useSharedValue(0);
    const speed = useSharedValue(SPEED[state]);

    useEffect(() => {
        speed.value = withTiming(SPEED[state], { duration: 400 });
    }, [speed, state]);

    const frames = useFrameCallback((frame) => {
        t.value += ((frame.timeSincePreviousFrame ?? 16) / 1000) * speed.value;
    }, !paused);
    // A screen kept underneath another one stops animating its aura.
    useEffect(() => {
        frames.setActive(!paused);
    }, [frames, paused]);

    const c = size / 2;
    const R = size * 0.28;
    const stroke = Math.max(1.3, size * 0.016);

    return (
        <View style={{ width: size, height: size }}>
            <View style={{ position: 'absolute', left: c - R, top: c - R, width: R * 2, height: R * 2, borderRadius: R, overflow: 'hidden' }}>
                <Svg width={R * 2} height={R * 2} style={{ position: 'absolute' }}>
                    <Defs>
                        <RadialGradient id={`${id}bg`} cx="50%" cy="50%" r="50%">
                            <Stop offset="0" stopColor="#10204A" />
                            <Stop offset="1" stopColor="#05070F" />
                        </RadialGradient>
                    </Defs>
                    <Circle cx={R} cy={R} r={R} fill={`url(#${id}bg)`} />
                </Svg>
                {BLOBS.map((color, i) => (
                    <Blob key={i} index={i} color={color} t={t} R={R} id={id} />
                ))}
                <Svg width={R * 2} height={R * 2} style={{ position: 'absolute' }}>
                    <Defs>
                        <LinearGradient id={`${id}sh`} x1="0" y1="0" x2="0.6" y2="0.6">
                            <Stop offset="0" stopColor="#FFFFFF" stopOpacity={0.28} />
                            <Stop offset="1" stopColor="#FFFFFF" stopOpacity={0} />
                        </LinearGradient>
                    </Defs>
                    <Circle cx={R} cy={R} r={R} fill={`url(#${id}sh)`} />
                    <Circle cx={R} cy={R} r={R - 0.75} fill="none" stroke="rgba(230,236,245,0.5)" strokeWidth={1.5} />
                </Svg>
            </View>
            {ARCS.map((arc, i) => (
                <Arc key={i} arc={arc} t={t} size={size} R={R} stroke={stroke - i * size * 0.002} />
            ))}
        </View>
    );
}

function Blob({ index, color, t, R, id }: { index: number; color: string; t: SharedValue<number>; R: number; id: string }) {
    const s = R * 0.75;
    const style = useAnimatedStyle(() => {
        const dir = index % 2 ? -1 : 1;
        const a = t.value * (1.1 + index * 0.37) * dir + index * 1.26;
        const r = R * 0.38;
        return {
            transform: [
                { translateX: Math.cos(a) * r },
                { translateY: Math.sin(a * 1.4) * r },
                { scale: 1 + 0.1 * Math.sin(t.value * 3 + index) },
            ],
        };
    });
    return (
        <Animated.View style={[{ position: 'absolute', left: R - s, top: R - s, width: s * 2, height: s * 2 }, style]}>
            <Svg width={s * 2} height={s * 2}>
                <Defs>
                    <RadialGradient id={`${id}b${index}`} cx="50%" cy="50%" r="50%">
                        <Stop offset="0" stopColor={color} stopOpacity={0.7} />
                        <Stop offset="1" stopColor={color} stopOpacity={0} />
                    </RadialGradient>
                </Defs>
                <Circle cx={s} cy={s} r={s} fill={`url(#${id}b${index})`} />
            </Svg>
        </Animated.View>
    );
}

function Arc({ arc, t, size, R, stroke }: { arc: (typeof ARCS)[number]; t: SharedValue<number>; size: number; R: number; stroke: number }) {
    const c = size / 2;
    const rr = R * arc.k;
    const circumference = 2 * Math.PI * rr;
    const dash = `${circumference * arc.len} ${circumference}`;
    const style = useAnimatedStyle(() => ({ transform: [{ rotate: `${t.value * arc.speed}rad` }] }));
    return (
        <Animated.View pointerEvents="none" style={[{ position: 'absolute', width: size, height: size }, style]}>
            <Svg width={size} height={size}>
                <Circle cx={c} cy={c} r={rr} fill="none" stroke={colors.accentBright} strokeOpacity={0.22} strokeWidth={stroke * 3} strokeDasharray={dash} strokeLinecap="round" />
                <Circle cx={c} cy={c} r={rr} fill="none" stroke={arc.color} strokeOpacity={arc.opacity} strokeWidth={stroke} strokeDasharray={dash} strokeLinecap="round" />
                <Circle cx={c + rr} cy={c} r={stroke * 1.1} fill="#FFFFFF" />
            </Svg>
        </Animated.View>
    );
}
