import { registerRootComponent } from 'expo';
import React, { useCallback, useEffect, useState, useRef } from 'react';
import { AppNavigator } from './src/navigation';
import { AuthProvider } from './src/context/AuthContext';
import { QueryClient, QueryClientProvider, focusManager, useQueryClient } from '@tanstack/react-query';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { View, Text, StyleSheet, AppState, AppStateStatus, TouchableOpacity } from 'react-native';
import { usePushNotifications } from './src/hooks/usePushNotifications';
import AsyncStorage from '@react-native-async-storage/async-storage';
import LockScreen from './src/components/LockScreen';
import { ThemeProvider, useAppTheme } from './src/theme/ThemeContext';

const queryClient = new QueryClient();
const API_URL = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:3000/api';

const BackendBanner = () => {
    const [status, setStatus] = useState<'checking' | 'waking' | 'connected' | 'offline'>('checking');
    const checkingRef = useRef(false);
    const failuresRef = useRef(0);

    const checkHealth = useCallback(async () => {
        if (checkingRef.current) return;
        checkingRef.current = true;
        const controller = new AbortController();
        const wakingTimer = setTimeout(() => {
            setStatus(current => current === 'connected' ? current : 'waking');
        }, 4_000);
        const timeout = setTimeout(() => controller.abort(), 65_000);

        try {
            const res = await fetch(`${API_URL}/health`, {
                signal: controller.signal,
                headers: { Accept: 'application/json' },
            });
            if (!res.ok) throw new Error(`Health check returned ${res.status}`);
            failuresRef.current = 0;
            setStatus('connected');
        } catch (error: any) {
            failuresRef.current += 1;
            setStatus(failuresRef.current >= 3 ? 'offline' : 'waking');
            console.warn('[Backend health] Check failed', {
                name: error?.name || 'NetworkError',
                attempts: failuresRef.current,
            });
        } finally {
            clearTimeout(wakingTimer);
            clearTimeout(timeout);
            checkingRef.current = false;
        }
    }, []);

    useEffect(() => {
        checkHealth();
        const timer = setInterval(checkHealth, 15_000);
        const subscription = AppState.addEventListener('change', nextState => {
            if (nextState === 'active') checkHealth();
        });
        return () => {
            clearInterval(timer);
            subscription.remove();
        };
    }, [checkHealth]);

    if (status === 'checking' || status === 'connected') return null;
    const isOffline = status === 'offline';

    return (
        <TouchableOpacity
            style={[styles.banner, isOffline ? styles.bannerOffline : styles.bannerWaking]}
            onPress={checkHealth}
            activeOpacity={0.85}
            accessibilityRole="button"
            accessibilityLabel="Reintentar conexión con Ping"
        >
            <Text style={styles.bannerTitle}>
                {isOffline ? 'Sin conexión con Ping' : 'Conectando con Ping…'}
            </Text>
            <Text style={styles.bannerText}>
                {isOffline
                    ? 'Reintentamos automáticamente. Toca aquí para intentar ahora.'
                    : 'El servidor de pruebas puede tardar unos segundos en despertar.'}
            </Text>
        </TouchableOpacity>
    );
};

export default function App() {
    return (
        <SafeAreaProvider>
            <QueryClientProvider client={queryClient}>
                <ThemeProvider>
                    <AuthProvider>
                        <AppContent />
                    </AuthProvider>
                </ThemeProvider>
            </QueryClientProvider>
        </SafeAreaProvider>
    );
}

const AppContent = () => {
    usePushNotifications();
    const appQueryClient = useQueryClient();
    const { isDark, theme } = useAppTheme();
    const [isLocked, setIsLocked] = useState(false);
    const appState = useRef(AppState.currentState);

    const handleUnlock = () => {
        setIsLocked(false);
    };

    useEffect(() => {
        const checkBiometricPreference = async (nextAppState: AppStateStatus) => {
            // Only trigger LockScreen when returning from true 'background' (user left the app).
            // Do NOT trigger on 'inactive', because OS-level modals like the FaceID/Fingerprint prompt 
            // put the app in 'inactive' state, which would cause an infinite loop!
            if (appState.current === 'background' && nextAppState === 'active') {
                const biometricEnabled = await AsyncStorage.getItem('ping_biometric_lock');
                if (biometricEnabled === 'true') {
                    setIsLocked(true);
                }
            }
            focusManager.setFocused(nextAppState === 'active');
            if (nextAppState === 'active') {
                await Promise.all([
                    appQueryClient.invalidateQueries({ queryKey: ['conversations'] }),
                    appQueryClient.invalidateQueries({ queryKey: ['conversation-messages'] }),
                ]);
            }
            appState.current = nextAppState;
        };

        // Check on initial load
        AsyncStorage.getItem('ping_biometric_lock').then(val => {
            if (val === 'true') setIsLocked(true);
        });

        const subscription = AppState.addEventListener('change', checkBiometricPreference);
        return () => subscription.remove();
    }, [appQueryClient]);

    return (
        <>
            <BackendBanner />
            <AppNavigator />
            <StatusBar style={isDark ? 'light' : 'dark'} backgroundColor={theme.colors.background} />
            {isLocked && <LockScreen onUnlock={handleUnlock} />}
        </>
    );
};

const styles = StyleSheet.create({
    banner: {
        paddingTop: 48,
        paddingBottom: 16,
        paddingHorizontal: 16,
        alignItems: 'center',
    },
    bannerWaking: {
        backgroundColor: '#3346e8',
    },
    bannerOffline: {
        backgroundColor: '#dc2626',
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
