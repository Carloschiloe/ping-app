import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Dimensions } from 'react-native';
import * as LocalAuthentication from 'expo-local-authentication';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';

interface LockScreenProps {
    onUnlock: () => void;
}

export default function LockScreen({ onUnlock }: LockScreenProps) {
    const [authActive, setAuthActive] = useState(false);

    useEffect(() => {
        handleAuth();
    }, []);

    const handleAuth = async () => {
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
    };

    return (
        <View style={styles.container}>
            <View style={styles.iconContainer}>
                <Ionicons name="lock-closed" size={64} color="#0a84ff" />
            </View>
            <Text style={styles.title}>Ping está bloqueado</Text>
            <Text style={styles.subtitle}>Usa FaceID o tu huella dactilar para acceder a tus chats y recordatorios.</Text>

            <TouchableOpacity style={styles.button} onPress={handleAuth} activeOpacity={0.8}>
                <Ionicons name="scan" size={24} color="white" />
                <Text style={styles.buttonText}>Desbloquear Ahora</Text>
            </TouchableOpacity>
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        ...StyleSheet.absoluteFillObject,
        backgroundColor: '#f9fafb',
        justifyContent: 'center',
        alignItems: 'center',
        padding: 24,
        zIndex: 9999, // Ensure it's always on top
    },
    iconContainer: {
        width: 120,
        height: 120,
        borderRadius: 60,
        backgroundColor: '#e0f2fe',
        justifyContent: 'center',
        alignItems: 'center',
        marginBottom: 32,
    },
    title: {
        fontSize: 24,
        fontWeight: '700',
        color: '#111827',
        marginBottom: 12,
    },
    subtitle: {
        fontSize: 16,
        color: '#4b5563',
        textAlign: 'center',
        lineHeight: 24,
        marginBottom: 48,
    },
    button: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#0a84ff',
        paddingVertical: 16,
        paddingHorizontal: 32,
        borderRadius: 30,
        gap: 12,
        shadowColor: '#0a84ff',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.3,
        shadowRadius: 8,
        elevation: 4,
    },
    buttonText: {
        color: 'white',
        fontSize: 18,
        fontWeight: '600',
    }
});
