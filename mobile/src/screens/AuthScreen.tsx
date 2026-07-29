import React, { useEffect, useRef, useState } from 'react';
import { Alert, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import Constants from 'expo-constants';
import * as Linking from 'expo-linking';
import { supabase } from '../lib/supabase';
import {
    createRequestGate,
    DEFAULT_SIGNUP_COOLDOWN_SECONDS,
    getSafeAuthErrorDetails,
    getSignupCooldownMessage,
    parseSignupRetryAfterSeconds,
} from '../utils/authRegistration';

export default function AuthScreen() {
    const buildLabel = Constants.expoConfig?.extra?.buildLabel as string | undefined;
    const authCallbackUrl = Linking.createURL('auth/callback');
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [loading, setLoading] = useState(false);
    const [isLogin, setIsLogin] = useState(true);
    const [signupCooldown, setSignupCooldown] = useState(0);
    const [signupSubmitted, setSignupSubmitted] = useState(false);
    const [signupEmail, setSignupEmail] = useState('');
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
                options: {
                    emailRedirectTo: authCallbackUrl,
                },
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
                setSignupEmail(normalizedEmail);
                setSignupSubmitted(true);
                setSignupCooldown(DEFAULT_SIGNUP_COOLDOWN_SECONDS);
                setPassword('');
                if (!data.session) {
                    Alert.alert(
                        'Cuenta creada',
                        `Enviamos un correo de verificación a ${normalizedEmail}. Abre el enlace para activar tu cuenta.`
                    );
                }
            }
        } finally {
            requestGate.current.finish();
            setLoading(false);
        }
    }

    async function handleResendVerification() {
        if (!signupSubmitted || signupCooldown > 0) return;
        if (!requestGate.current.tryStart()) return;

        setLoading(true);
        try {
            const normalizedEmail = signupEmail || email.trim().toLowerCase();
            const { error } = await supabase.auth.resend({
                type: 'signup',
                email: normalizedEmail,
                options: {
                    emailRedirectTo: authCallbackUrl,
                },
            });

            if (error) {
                const retryAfter = parseSignupRetryAfterSeconds(error);
                console.warn('[Auth] verification resend failed', getSafeAuthErrorDetails(error));
                if (retryAfter) {
                    setSignupCooldown(retryAfter);
                    Alert.alert(
                        'Espera antes de reenviar',
                        `Podrás solicitar otro correo en ${retryAfter} segundos.`
                    );
                } else {
                    Alert.alert(
                        'No se pudo reenviar',
                        'Espera un momento y vuelve a intentarlo.'
                    );
                }
                return;
            }

            setSignupCooldown(DEFAULT_SIGNUP_COOLDOWN_SECONDS);
            Alert.alert(
                'Correo reenviado',
                'Revisa tu bandeja de entrada y spam. Después de verificar, inicia sesión.'
            );
        } finally {
            requestGate.current.finish();
            setLoading(false);
        }
    }

    const signupBlocked = !isLogin && !signupSubmitted && signupCooldown > 0;
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

                {!isLogin && signupSubmitted ? (
                    <>
                        <View style={styles.successCard}>
                            <Text style={styles.successIcon}>✓</Text>
                            <Text style={styles.successTitle}>Cuenta creada</Text>
                            <Text style={styles.successText}>
                                Enviamos un correo de verificación a:
                            </Text>
                            <Text style={styles.successEmail}>{signupEmail}</Text>
                            <Text style={styles.successStep}>1. Abre el correo de Ping.</Text>
                            <Text style={styles.successStep}>2. Pulsa “Verificar mi cuenta”.</Text>
                            <Text style={styles.successStep}>3. Vuelve a Ping y completa tu nombre.</Text>
                            <Text style={styles.successHint}>
                                Revisa también spam o correo no deseado. No vuelvas a registrarte.
                            </Text>
                        </View>

                        {signupCooldown > 0 && (
                            <Text style={styles.cooldown}>
                                {getSignupCooldownMessage(true, signupCooldown)}
                            </Text>
                        )}

                        <TouchableOpacity
                            style={styles.button}
                            onPress={() => {
                                setIsLogin(true);
                                setSignupSubmitted(false);
                                setEmail(signupEmail);
                            }}
                            disabled={loading}
                        >
                            <Text style={styles.buttonText}>Ya verifiqué mi correo · Iniciar sesión</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                            style={[styles.resendButton, (loading || signupCooldown > 0) && styles.buttonDisabled]}
                            onPress={handleResendVerification}
                            disabled={loading || signupCooldown > 0}
                        >
                            <Text style={styles.resendText}>
                                {signupCooldown > 0
                                    ? `Reenviar correo en ${signupCooldown} s`
                                    : 'Reenviar correo de verificación'}
                            </Text>
                        </TouchableOpacity>
                    </>
                ) : (
                    <>
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

                        {!isLogin && signupCooldown > 0 && (
                            <Text style={styles.cooldown}>
                                {getSignupCooldownMessage(false, signupCooldown)}
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
                    </>
                )}
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
    successCard: { backgroundColor: '#ecfdf5', borderColor: '#86efac', borderWidth: 1, padding: 18, borderRadius: 14, marginBottom: 14 },
    successIcon: { color: '#15803d', fontSize: 30, fontWeight: '800', textAlign: 'center', marginBottom: 4 },
    successTitle: { color: '#166534', fontSize: 22, fontWeight: '800', textAlign: 'center', marginBottom: 10 },
    successText: { color: '#374151', textAlign: 'center', lineHeight: 20 },
    successEmail: { color: '#1d4ed8', textAlign: 'center', fontWeight: '700', marginTop: 4, marginBottom: 14 },
    successStep: { color: '#1f2937', lineHeight: 22 },
    successHint: { color: '#6b7280', lineHeight: 19, marginTop: 12, fontSize: 13 },
    cooldown: { color: '#92400e', textAlign: 'center', marginBottom: 8, lineHeight: 18 },
    resendButton: { padding: 14, alignItems: 'center', marginTop: 8 },
    resendText: { color: '#2563eb', fontWeight: '700' },
    switchButton: { marginTop: 24, alignItems: 'center' },
    switchText: { color: '#3b82f6', textAlign: 'center', fontSize: 15 },
});
