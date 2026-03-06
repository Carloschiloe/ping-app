import { registerRootComponent } from 'expo';
import React, { useEffect, useState, useRef } from 'react';
import { AppNavigator } from './src/navigation';
import { AuthProvider } from './src/context/AuthContext';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { View, Text, StyleSheet, AppState, AppStateStatus } from 'react-native';
import { usePushNotifications } from './src/hooks/usePushNotifications';
import AsyncStorage from '@react-native-async-storage/async-storage';
import LockScreen from './src/components/LockScreen';

const queryClient = new QueryClient();
const API_URL = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:3000/api';

const BackendBanner = () => {
    const [connected, setConnected] = useState<boolean | null>(null);

    useEffect(() => {
        const checkHealth = async () => {
            try {
                const res = await fetch(`${API_URL}/health`);
                setConnected(res.ok);
            } catch {
                setConnected(false);
            }
        };
        checkHealth();
    }, []);

    if (connected === null || connected === true) return null;

    return (
        <View style={styles.banner}>
            <Text style={styles.bannerTitle}>Backend no conectado</Text>
            <Text style={styles.bannerText}>Revisa EXPO_PUBLIC_API_URL en el .env</Text>
        </View>
    );
};

export default function App() {
    return (
        <SafeAreaProvider>
            <QueryClientProvider client={queryClient}>
                <AuthProvider>
                    <AppContent />
                </AuthProvider>
            </QueryClientProvider>
        </SafeAreaProvider>
    );
}

const AppContent = () => {
    usePushNotifications();
    const [isLocked, setIsLocked] = useState(false);
    const appState = useRef(AppState.currentState);

    useEffect(() => {
        const checkBiometricPreference = async (nextAppState: AppStateStatus) => {
            if (appState.current.match(/inactive|background/) && nextAppState === 'active') {
                const biometricEnabled = await AsyncStorage.getItem('ping_biometric_lock');
                if (biometricEnabled === 'true') {
                    setIsLocked(true);
                }
            }
            appState.current = nextAppState;
        };

        // Check on initial load
        AsyncStorage.getItem('ping_biometric_lock').then(val => {
            if (val === 'true') setIsLocked(true);
        });

        const subscription = AppState.addEventListener('change', checkBiometricPreference);
        return () => subscription.remove();
    }, []);

    return (
        <>
            <BackendBanner />
            <AppNavigator />
            <StatusBar style="auto" />
            {isLocked && <LockScreen onUnlock={() => setIsLocked(false)} />}
        </>
    );
};

const styles = StyleSheet.create({
    banner: {
        backgroundColor: '#ef4444',
        paddingTop: 48,
        paddingBottom: 16,
        paddingHorizontal: 16,
        alignItems: 'center',
    },
    bannerTitle: {
        color: 'white',
        fontWeight: 'bold',
        textAlign: 'center',
    },
    bannerText: {
        color: 'white',
        fontSize: 12,
        textAlign: 'center',
        marginTop: 4,
    },
});

registerRootComponent(App);
