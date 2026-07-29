import React, { useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Constants from 'expo-constants';
import * as Linking from 'expo-linking';
import { Ionicons } from '@expo/vector-icons';
import {
    AuthCard,
    AuthField,
    AuthMessage,
    AuthPrimaryButton,
    AuthScaffold,
    AuthSegmentedControl,
    PrivacyNote,
} from '../components/auth/AuthKit';
import { supabase } from '../lib/supabase';
import { authColors } from '../theme/authTheme';
import {
    createRequestGate,
    DEFAULT_SIGNUP_COOLDOWN_SECONDS,
    getSafeAuthErrorDetails,
    getSignupCooldownMessage,
    parseSignupRetryAfterSeconds,
} from '../utils/authRegistration';
import {
    AuthMode,
    getAuthCredentialsValidationError,
    getAuthErrorMessage,
    normalizeAuthEmail,
} from '../utils/authForm';

type FormMessage = {
    tone: 'error' | 'warning' | 'success' | 'info';
    text: string;
};

export default function AuthScreen() {
    const buildLabel = Constants.expoConfig?.extra?.buildLabel as string | undefined;
    const authCallbackUrl = Linking.createURL('auth/callback');
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [loading, setLoading] = useState(false);
    const [mode, setMode] = useState<AuthMode>('login');
    const [signupCooldown, setSignupCooldown] = useState(0);
    const [signupSubmitted, setSignupSubmitted] = useState(false);
    const [signupEmail, setSignupEmail] = useState('');
    const [formMessage, setFormMessage] = useState<FormMessage | null>(null);
    const requestGate = useRef(createRequestGate());

    useEffect(() => {
        if (signupCooldown <= 0) return;
        const timer = setTimeout(() => {
            setSignupCooldown((remaining) => Math.max(0, remaining - 1));
        }, 1000);
        return () => clearTimeout(timer);
    }, [signupCooldown]);

    const changeMode = (nextMode: AuthMode) => {
        if (loading || nextMode === mode) return;
        setMode(nextMode);
        setSignupSubmitted(false);
        setFormMessage(null);
        setPassword('');
    };

    async function handleAuth() {
        const isLogin = mode === 'login';
        if (!isLogin && signupCooldown > 0) return;
        if (!requestGate.current.tryStart()) return;

        setFormMessage(null);
        setLoading(true);
        try {
            const normalizedEmail = normalizeAuthEmail(email);
            const validationError = getAuthCredentialsValidationError(email, password, mode);
            if (validationError) {
                setFormMessage({ tone: 'error', text: validationError });
                return;
            }

            if (isLogin) {
                const { error } = await supabase.auth.signInWithPassword({
                    email: normalizedEmail,
                    password,
                });
                if (error) {
                    console.warn('[Auth] sign-in failed', getSafeAuthErrorDetails(error));
                    setFormMessage({ tone: 'error', text: getAuthErrorMessage(error, 'login') });
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
                    setFormMessage({
                        tone: 'warning',
                        text: `Por seguridad, podrás solicitar el registro nuevamente en ${retryAfter} segundos.`,
                    });
                } else {
                    setFormMessage({ tone: 'error', text: getAuthErrorMessage(error, 'signup') });
                }
                return;
            }

            if (data.user) {
                setSignupEmail(normalizedEmail);
                setSignupSubmitted(true);
                setSignupCooldown(DEFAULT_SIGNUP_COOLDOWN_SECONDS);
                setPassword('');
                setFormMessage(null);
            }
        } finally {
            requestGate.current.finish();
            setLoading(false);
        }
    }

    async function handleResendVerification() {
        if (!signupSubmitted || signupCooldown > 0) return;
        if (!requestGate.current.tryStart()) return;

        setFormMessage(null);
        setLoading(true);
        try {
            const { error } = await supabase.auth.resend({
                type: 'signup',
                email: signupEmail,
                options: {
                    emailRedirectTo: authCallbackUrl,
                },
            });

            if (error) {
                const retryAfter = parseSignupRetryAfterSeconds(error);
                console.warn('[Auth] verification resend failed', getSafeAuthErrorDetails(error));
                if (retryAfter) {
                    setSignupCooldown(retryAfter);
                    setFormMessage({
                        tone: 'warning',
                        text: `Podrás solicitar otro correo en ${retryAfter} segundos.`,
                    });
                } else {
                    setFormMessage({
                        tone: 'error',
                        text: 'No pudimos reenviar el correo. Espera un momento e inténtalo nuevamente.',
                    });
                }
                return;
            }

            setSignupCooldown(DEFAULT_SIGNUP_COOLDOWN_SECONDS);
            setFormMessage({
                tone: 'success',
                text: 'Correo reenviado. Revisa tu bandeja de entrada y spam.',
            });
        } finally {
            requestGate.current.finish();
            setLoading(false);
        }
    }

    const signupBlocked = mode === 'signup' && signupCooldown > 0;
    const buttonDisabled = loading || signupBlocked;

    return (
        <AuthScaffold buildLabel={buildLabel}>
            <View style={styles.intro}>
                <Text style={styles.title}>
                    {mode === 'login' ? 'Qué bueno verte' : 'Bienvenido'}
                </Text>
                <Text style={styles.description}>
                    {mode === 'login'
                        ? 'Retoma tus conversaciones y asuntos importantes.'
                        : 'Organiza tus conversaciones y compromisos en un solo lugar.'}
                </Text>
                <View style={styles.valueRow}>
                    <ValuePill icon="chatbubble-ellipses-outline" label="Conversaciones" />
                    <ValuePill icon="checkmark-circle-outline" label="Compromisos" />
                    <ValuePill icon="radio-outline" label="Memoria" />
                </View>
            </View>

            <AuthCard>
                <AuthSegmentedControl value={mode} onChange={changeMode} disabled={loading} />

                {mode === 'signup' && signupSubmitted ? (
                    <VerificationState
                        email={signupEmail}
                        cooldown={signupCooldown}
                        loading={loading}
                        message={formMessage}
                        onContinue={() => {
                            setMode('login');
                            setSignupSubmitted(false);
                            setEmail(signupEmail);
                            setFormMessage({
                                tone: 'info',
                                text: 'Ingresa con la contraseña que elegiste al crear tu cuenta.',
                            });
                        }}
                        onResend={handleResendVerification}
                    />
                ) : (
                    <>
                        <AuthField
                            icon="mail-outline"
                            placeholder="Correo electrónico"
                            value={email}
                            onChangeText={(value) => {
                                setEmail(value);
                                if (formMessage?.tone === 'error') setFormMessage(null);
                            }}
                            autoCapitalize="none"
                            autoCorrect={false}
                            autoComplete="email"
                            textContentType="emailAddress"
                            keyboardType="email-address"
                            returnKeyType="next"
                            editable={!loading}
                            accessibilityLabel="Correo electrónico"
                        />
                        <AuthField
                            icon="lock-closed-outline"
                            placeholder="Contraseña"
                            value={password}
                            onChangeText={(value) => {
                                setPassword(value);
                                if (formMessage?.tone === 'error') setFormMessage(null);
                            }}
                            secure
                            autoCapitalize="none"
                            autoCorrect={false}
                            autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                            textContentType={mode === 'login' ? 'password' : 'newPassword'}
                            returnKeyType="done"
                            onSubmitEditing={handleAuth}
                            editable={!loading}
                            accessibilityLabel="Contraseña"
                        />

                        {!!formMessage && (
                            <AuthMessage tone={formMessage.tone}>{formMessage.text}</AuthMessage>
                        )}

                        {mode === 'signup' && signupCooldown > 0 && !formMessage && (
                            <AuthMessage tone="warning">
                                {getSignupCooldownMessage(false, signupCooldown)}
                            </AuthMessage>
                        )}

                        <AuthPrimaryButton
                            label={mode === 'login'
                                ? 'Iniciar sesión'
                                : signupBlocked
                                    ? `Espera ${signupCooldown} s`
                                    : 'Crear cuenta'}
                            onPress={handleAuth}
                            loading={loading}
                            disabled={buttonDisabled}
                        />

                        <Pressable
                            accessibilityRole="button"
                            disabled={loading}
                            onPress={() => changeMode(mode === 'login' ? 'signup' : 'login')}
                            style={({ pressed }) => [styles.switchLink, pressed && styles.pressed]}
                        >
                            <Text style={styles.switchText}>
                                {mode === 'login' ? '¿Aún no tienes cuenta? ' : '¿Ya tienes cuenta? '}
                                <Text style={styles.switchTextStrong}>
                                    {mode === 'login' ? 'Créala ahora' : 'Inicia sesión'}
                                </Text>
                            </Text>
                        </Pressable>
                    </>
                )}

                <PrivacyNote />
            </AuthCard>
        </AuthScaffold>
    );
}

function ValuePill({
    icon,
    label,
}: {
    icon: keyof typeof Ionicons.glyphMap;
    label: string;
}) {
    return (
        <View style={styles.valuePill}>
            <Ionicons name={icon} size={15} color={authColors.primary} />
            <Text style={styles.valueLabel}>{label}</Text>
        </View>
    );
}

function VerificationState({
    email,
    cooldown,
    loading,
    message,
    onContinue,
    onResend,
}: {
    email: string;
    cooldown: number;
    loading: boolean;
    message: FormMessage | null;
    onContinue: () => void;
    onResend: () => void;
}) {
    return (
        <>
            <View style={styles.verification}>
                <View style={styles.verificationIcon}>
                    <Ionicons name="mail-unread-outline" size={30} color={authColors.primary} />
                </View>
                <Text style={styles.verificationTitle}>Cuenta creada</Text>
                <Text style={styles.verificationText}>Enviamos un correo de verificación a</Text>
                <Text style={styles.verificationEmail}>{email}</Text>
                <View style={styles.steps}>
                    <Text style={styles.step}>1. Abre el correo de Ping.</Text>
                    <Text style={styles.step}>2. Pulsa “Verificar mi cuenta”.</Text>
                    <Text style={styles.step}>3. Vuelve a Ping y completa tu nombre.</Text>
                </View>
                <Text style={styles.hint}>
                    Revisa también spam. No vuelvas a crear la cuenta.
                </Text>
            </View>

            {!!message && <AuthMessage tone={message.tone}>{message.text}</AuthMessage>}
            {cooldown > 0 && !message && (
                <AuthMessage tone="warning">
                    {getSignupCooldownMessage(true, cooldown)}
                </AuthMessage>
            )}

            <AuthPrimaryButton
                label="Ya verifiqué · Iniciar sesión"
                onPress={onContinue}
                disabled={loading}
                icon="log-in-outline"
            />
            <Pressable
                accessibilityRole="button"
                disabled={loading || cooldown > 0}
                onPress={onResend}
                style={({ pressed }) => [
                    styles.resend,
                    (loading || cooldown > 0) && styles.resendDisabled,
                    pressed && styles.pressed,
                ]}
            >
                <Text style={styles.resendText}>
                    {cooldown > 0
                        ? `Reenviar correo en ${cooldown} s`
                        : 'Reenviar correo de verificación'}
                </Text>
            </Pressable>
        </>
    );
}

const styles = StyleSheet.create({
    intro: { alignItems: 'center', marginBottom: 18, paddingHorizontal: 12 },
    title: { color: authColors.ink, fontSize: 30, lineHeight: 36, fontWeight: '900', textAlign: 'center' },
    description: {
        color: authColors.inkSoft,
        fontSize: 15,
        lineHeight: 21,
        textAlign: 'center',
        maxWidth: 350,
        marginTop: 6,
    },
    valueRow: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        justifyContent: 'center',
        gap: 7,
        marginTop: 13,
    },
    valuePill: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 5,
        backgroundColor: 'rgba(255,255,255,0.75)',
        borderColor: 'rgba(124,137,207,0.24)',
        borderWidth: 1,
        borderRadius: 999,
        paddingHorizontal: 10,
        paddingVertical: 6,
    },
    valueLabel: { color: authColors.inkSoft, fontSize: 11, fontWeight: '700' },
    switchLink: { alignItems: 'center', paddingVertical: 16, marginBottom: -5 },
    switchText: { color: authColors.inkSoft, fontSize: 14 },
    switchTextStrong: { color: authColors.primary, fontWeight: '800' },
    verification: { alignItems: 'center', marginBottom: 14 },
    verificationIcon: {
        width: 58,
        height: 58,
        borderRadius: 29,
        backgroundColor: '#edf0ff',
        alignItems: 'center',
        justifyContent: 'center',
        marginBottom: 10,
    },
    verificationTitle: { color: authColors.ink, fontSize: 24, fontWeight: '900' },
    verificationText: { color: authColors.inkSoft, fontSize: 14, marginTop: 6 },
    verificationEmail: { color: authColors.primary, fontWeight: '800', marginTop: 4, marginBottom: 14 },
    steps: {
        width: '100%',
        backgroundColor: authColors.surfaceMuted,
        borderRadius: 14,
        paddingHorizontal: 15,
        paddingVertical: 11,
    },
    step: { color: authColors.ink, lineHeight: 22, fontSize: 13 },
    hint: { color: authColors.inkSoft, fontSize: 12, textAlign: 'center', marginTop: 10 },
    resend: { alignItems: 'center', paddingVertical: 14 },
    resendDisabled: { opacity: 0.5 },
    resendText: { color: authColors.primary, fontWeight: '800', fontSize: 13 },
    pressed: { opacity: 0.72 },
});
