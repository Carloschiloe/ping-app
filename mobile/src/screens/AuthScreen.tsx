import React, { useEffect, useRef, useState } from 'react';
import { Alert, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import Constants from 'expo-constants';
import { supabase } from '../lib/supabase';
import {
    createRequestGate,
    DEFAULT_SIGNUP_COOLDOWN_SECONDS,
    getSafeAuthErrorDetails,
    parseSignupRetryAfterSeconds,
} from '../utils/authRegistration';

export default function AuthScreen() {
    const buildLabel = Constants.expoConfig?.extra?.buildLabel as string | undefined;
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [loading, setLoading] = useState(false);
    const [isLogin, setIsLogin] = useState(true);
    const [signupCooldown, setSignupCooldown] = useState(0);
    const [signupSubmitted, setSignupSubmitted] = useState(false);
    const requestGate = useRef(createRequestGate());

    useEffect(() => {
        if (signupCooldown <= 0) return;
        const timer = setTimeout(() => {
            setSignupCooldown((remaining) => Math.max(0, remaining - 1));
        }, 1000);
        return () => clearTimeout(timer);
    }, [signupCooldown]);

    async function handleAuth() {
        if (!isLogin && signupCooldown > 0) return;
        if (!requestGate.current.tryStart()) return;

        setLoading(true);
        try {
            const normalizedEmail = email.trim().toLowerCase();
            if (!normalizedEmail || !password) {
                Alert.alert('Datos incompletos', 'Ingresa tu correo y contraseña.');
                return;
            }

            if (isLogin) {
                const { error } = await supabase.auth.signInWithPassword({
                    email: normalizedEmail,
                    password,
                });
                if (error) {
                    console.warn('[Auth] sign-in failed', getSafeAuthErrorDetails(error));
                    Alert.alert('No se pudo iniciar sesión', 'Revisa tus datos e inténtalo nuevamente.');
                }
                return;
            }

            const { data, error } = await supabase.auth.signUp({
                email: normalizedEmail,
                password,
            });
            if (error) {
                const retryAfter = parseSignupRetryAfterSeconds(error);
                console.warn('[Auth] sign-up failed', getSafeAuthErrorDetails(error));
                if (retryAfter) {
                    setSignupCooldown(retryAfter);
                    Alert.alert(
                        'Espera antes de reintentar',
                        `Por seguridad, podrás solicitar el registro nuevamente en ${retryAfter} segundos.`
                    );
                } else {
                    Alert.alert('No se pudo completar el registro', 'Revisa los datos e inténtalo nuevamente.');
                }
                return;
            }

            if (data.user) {
                setSignupSubmitted(true);
                setSignupCooldown(DEFAULT_SIGNUP_COOLDOWN_SECONDS);
                if (!data.session) {
                    Alert.alert(
                        'Verifica tu correo',
                        'Te enviamos un enlace de confirmación. Después de verificarlo, vuelve a Ping para completar tu nombre.'
                    );
                }
            }
        } finally {
            requestGate.current.finish();
            setLoading(false);
        }
    }

    const signupBlocked = !isLogin && signupCooldown > 0;
    const buttonDisabled = loading || signupBlocked;
    const buttonLabel = loading
        ? 'Procesando...'
        : isLogin
            ? 'Iniciar sesión'
            : signupBlocked
                ? `Espera ${signupCooldown} s`
                : signupSubmitted
                    ? 'Solicitar nuevamente'
                    : 'Registrarse';

    return (
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
            <View style={styles.container}>
                <Text style={styles.logo}>📌</Text>
                <Text style={styles.title}>PING</Text>
                <Text style={styles.subtitle}>Chat that remembers</Text>
                {!!buildLabel && <Text style={styles.buildLabel}>{buildLabel}</Text>}

                <TextInput
                    style={styles.input}
                    placeholder="Correo"
                    value={email}
                    onChangeText={setEmail}
                    autoCapitalize="none"
                    keyboardType="email-address"
                    editable={!loading}
                />
                <TextInput
                    style={styles.input}
                    placeholder="Contraseña"
                    value={password}
                    onChangeText={setPassword}
                    secureTextEntry
                    editable={!loading}
                />

                {!isLogin && signupSubmitted && (
                    <Text style={styles.notice}>
                        Revisa tu correo para verificar la cuenta. Tu nombre se solicitará al volver a Ping.
                    </Text>
                )}

                {!isLogin && signupCooldown > 0 && (
                    <Text style={styles.cooldown}>
                        Por seguridad, podrás volver a intentarlo en {signupCooldown} segundos.
                    </Text>
                )}

                <TouchableOpacity
                    style={[styles.button, buttonDisabled && styles.buttonDisabled]}
                    onPress={handleAuth}
                    disabled={buttonDisabled}
                >
                    <Text style={styles.buttonText}>{buttonLabel}</Text>
                </TouchableOpacity>

                <TouchableOpacity
                    style={styles.switchButton}
                    onPress={() => {
                        if (loading) return;
                        setIsLogin((current) => !current);
                        setSignupSubmitted(false);
                    }}
                    disabled={loading}
                >
                    <Text style={styles.switchText}>
                        {isLogin ? '¿No tienes cuenta? Regístrate' : '¿Ya tienes cuenta? Inicia sesión'}
                    </Text>
                </TouchableOpacity>
            </View>
        </ScrollView>
    );
}

const styles = StyleSheet.create({
    scroll: { flexGrow: 1 },
    container: { flex: 1, justifyContent: 'center', padding: 24, backgroundColor: 'white' },
    logo: { textAlign: 'center', fontSize: 52, marginBottom: 8 },
    title: { fontSize: 34, fontWeight: '800', textAlign: 'center', color: '#3b82f6', marginBottom: 4 },
    subtitle: { textAlign: 'center', color: '#6b7280', marginBottom: 10, fontSize: 16 },
    buildLabel: { textAlign: 'center', color: '#92400e', backgroundColor: '#fef3c7', paddingVertical: 6, paddingHorizontal: 10, borderRadius: 8, alignSelf: 'center', marginBottom: 24, fontSize: 12, fontWeight: '700' },
    input: { borderWidth: 1.5, borderColor: '#e5e7eb', padding: 16, borderRadius: 12, marginBottom: 12, fontSize: 15, backgroundColor: '#fafafa' },
    button: { backgroundColor: '#3b82f6', padding: 18, borderRadius: 14, alignItems: 'center', marginTop: 8 },
    buttonDisabled: { opacity: 0.55 },
    buttonText: { color: 'white', fontWeight: '700', fontSize: 16 },
    notice: { color: '#166534', backgroundColor: '#dcfce7', padding: 12, borderRadius: 10, marginBottom: 12, lineHeight: 18 },
    cooldown: { color: '#92400e', textAlign: 'center', marginBottom: 8, lineHeight: 18 },
    switchButton: { marginTop: 24, alignItems: 'center' },
    switchText: { color: '#3b82f6', textAlign: 'center', fontSize: 15 },
});
