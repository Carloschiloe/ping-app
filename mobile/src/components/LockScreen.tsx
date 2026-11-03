import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import * as LocalAuthentication from 'expo-local-authentication';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { LinearGradient } from 'expo-linear-gradient';
import { GlassBackdrop } from '../design/Glass';
import { PingOrb } from '../design/PingOrb';
import { colors, gradients, radius, space } from '../design/tokens';
import { fonts, type } from '../design/typography';

interface LockScreenProps {
    onUnlock: () => void;
}

export default function LockScreen({ onUnlock }: LockScreenProps) {
    const [authActive, setAuthActive] = useState(false);

    const handleAuth = React.useCallback(async () => {
        if (authActive) return;
        setAuthActive(true);

        const hasHardware = await LocalAuthentication.hasHardwareAsync();
        const isEnrolled = await LocalAuthentication.isEnrolledAsync();

        if (!hasHardware || !isEnrolled) {
            // Fallback: If no biometrics available, unlock automatically or require PIN (not implemented)
            onUnlock();
            return;
        }

        const result = await LocalAuthentication.authenticateAsync({
            promptMessage: 'Desbloquea Ping',
            cancelLabel: 'Cancelar',
            disableDeviceFallback: false,
        });

        setAuthActive(false);

        if (result.success) {
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
            onUnlock();
        } else {
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
        }
    }, [authActive, onUnlock]);

    useEffect(() => {
        handleAuth();
    }, [handleAuth]);

    return (
        <View style={styles.container}>
            <GlassBackdrop>
                <View style={styles.content}>
                    <View style={styles.orb}>
                        <PingOrb size={84} />
                        <View style={styles.lockBadge}>
                            <Ionicons name="lock-closed" size={16} color={colors.text} />
                        </View>
                    </View>
                    <Text style={styles.title}>Ping está bloqueado</Text>
                    <Text style={styles.subtitle}>Usa FaceID o tu huella dactilar para acceder a tus chats y recordatorios.</Text>

                    <TouchableOpacity style={styles.button} onPress={handleAuth} activeOpacity={0.85}>
                        <LinearGradient colors={gradients.accent} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />
                        <Ionicons name="finger-print" size={22} color={colors.onAccent} />
                        <Text style={styles.buttonText}>Desbloquear</Text>
                    </TouchableOpacity>
                </View>
            </GlassBackdrop>
        </View>
    );
}

const styles = StyleSheet.create({
    // Above everything, so nothing of the app shows until it unlocks.
    container: { ...StyleSheet.absoluteFill, zIndex: 9999 },
    content: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: space.xxl },
    orb: { marginBottom: space.xxl },
    lockBadge: {
        position: 'absolute',
        right: -6,
        bottom: -6,
        width: 34,
        height: 34,
        borderRadius: 17,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: colors.glassRaised,
        borderWidth: StyleSheet.hairlineWidth,
        borderColor: colors.glassBorder,
    },
    title: { ...type.title, marginBottom: space.md },
    subtitle: { ...type.subhead, textAlign: 'center', lineHeight: 22, marginBottom: 44 },
    button: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        height: 54,
        paddingHorizontal: space.xxl,
        borderRadius: radius.full,
        gap: space.sm,
        overflow: 'hidden',
    },
    buttonText: { fontFamily: fonts.semibold, color: colors.onAccent, fontSize: 17 },
});
