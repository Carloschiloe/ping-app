import React, { useEffect } from 'react';
import Animated, {
    Easing,
    useAnimatedStyle,
    useSharedValue,
    withRepeat,
    withTiming,
} from 'react-native-reanimated';
import Svg, { Defs, RadialGradient, Stop, Circle } from 'react-native-svg';
import { colors } from './tokens';

// Ping's presence: a small gold orb that breathes slowly.
export function PingOrb({ size = 34 }: { size?: number }) {
    const t = useSharedValue(0);
    useEffect(() => {
        t.value = withRepeat(withTiming(1, { duration: 2600, easing: Easing.inOut(Easing.sin) }), -1, true);
    }, [t]);

    const glow = useAnimatedStyle(() => ({ opacity: 0.35 + 0.4 * t.value, transform: [{ scale: 1 + 0.25 * t.value }] }));
    const core = useAnimatedStyle(() => ({ transform: [{ scale: 0.96 + 0.06 * t.value }] }));
    const halo = size * 1.8;

    return (
        <Animated.View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
            <Animated.View style={[{ position: 'absolute', width: halo, height: halo }, glow]}>
                <Svg width={halo} height={halo}>
                    <Defs>
                        <RadialGradient id="orb-halo" cx="50%" cy="50%" r="50%">
                            <Stop offset="0" stopColor={colors.gold} stopOpacity={0.55} />
                            <Stop offset="1" stopColor={colors.gold} stopOpacity={0} />
                        </RadialGradient>
                    </Defs>
                    <Circle cx={halo / 2} cy={halo / 2} r={halo / 2} fill="url(#orb-halo)" />
                </Svg>
            </Animated.View>
            <Animated.View style={core}>
                <Svg width={size} height={size}>
                    <Defs>
                        <RadialGradient id="orb-core" cx="35%" cy="30%" r="75%">
                            <Stop offset="0" stopColor="#FFF6DD" />
                            <Stop offset="0.35" stopColor={colors.goldBright} />
                            <Stop offset="0.75" stopColor={colors.goldDeep} />
                            <Stop offset="1" stopColor="#5C4318" />
                        </RadialGradient>
                    </Defs>
                    <Circle cx={size / 2} cy={size / 2} r={size / 2} fill="url(#orb-core)" />
                </Svg>
            </Animated.View>
        </Animated.View>
    );
}
