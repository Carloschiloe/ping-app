import React, { useEffect, useMemo } from 'react';
import { Animated, Easing, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { colors } from '../design/tokens';

// A drawn map behind the pin, in Ping's own colors. It needs no map
// provider, so it never breaks or asks for a key; tapping the card still
// opens the real map. The streets shift with the coordinates, so two
// places don't look the same.

const STREETS = [
    { top: 0.22, angle: -8, width: 5 },
    { top: 0.58, angle: 6, width: 3 },
    { top: 0.86, angle: -3, width: 2 },
];
const AVENUES = [
    { left: 0.18, angle: 12, width: 3 },
    { left: 0.66, angle: -10, width: 5 },
];

function shift(value: number, salt: number) {
    const fraction = Math.abs(value * 1000 * salt) % 1;
    return (fraction - 0.5) * 0.16;
}

export function LocationArt({ latitude, longitude, pinSize = 32 }: { latitude: number; longitude: number; pinSize?: number }) {
    const pulse = useMemo(() => new Animated.Value(0), []);
    useEffect(() => {
        const loop = Animated.loop(Animated.sequence([
            Animated.timing(pulse, { toValue: 1, duration: 1400, easing: Easing.out(Easing.quad), useNativeDriver: true }),
            Animated.delay(400),
        ]));
        loop.start();
        return () => loop.stop();
    }, [pulse]);

    return (
        <View style={StyleSheet.absoluteFill} pointerEvents="none">
            <LinearGradient colors={[colors.glassRaised, colors.accentTint]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />
            {STREETS.map((street, i) => (
                <View
                    key={`s${i}`}
                    style={[styles.street, {
                        top: `${(street.top + shift(latitude, i + 3)) * 100}%`,
                        height: street.width,
                        transform: [{ rotate: `${street.angle}deg` }],
                    }]}
                />
            ))}
            {AVENUES.map((avenue, i) => (
                <View
                    key={`a${i}`}
                    style={[styles.avenue, {
                        left: `${(avenue.left + shift(longitude, i + 7)) * 100}%`,
                        width: avenue.width,
                        transform: [{ rotate: `${avenue.angle}deg` }],
                    }]}
                />
            ))}
            <View style={styles.center}>
                <Animated.View
                    style={[styles.halo, {
                        width: pinSize * 1.6,
                        height: pinSize * 1.6,
                        borderRadius: pinSize * 0.8,
                        opacity: pulse.interpolate({ inputRange: [0, 1], outputRange: [0.5, 0] }),
                        transform: [{ scale: pulse.interpolate({ inputRange: [0, 1], outputRange: [0.4, 1.6] }) }],
                    }]}
                />
                <Ionicons name="location-sharp" size={pinSize} color={colors.danger} style={{ marginTop: -pinSize * 0.9 }} />
            </View>
        </View>
    );
}

const styles = StyleSheet.create({
    street: { position: 'absolute', left: '-10%', right: '-10%', borderRadius: 3, backgroundColor: colors.glassBorder },
    avenue: { position: 'absolute', top: '-20%', bottom: '-20%', borderRadius: 3, backgroundColor: colors.glassBorder },
    center: { ...StyleSheet.absoluteFill, alignItems: 'center', justifyContent: 'center' },
    halo: { position: 'absolute', backgroundColor: colors.danger },
});
