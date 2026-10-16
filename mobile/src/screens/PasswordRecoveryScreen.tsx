import React, { useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Constants from 'expo-constants';
import { Ionicons } from '@expo/vector-icons';
import {
    AuthCard,
    AuthField,
    AuthMessage,
    AuthPrimaryButton,
    AuthScaffold,
} from '../components/auth/AuthKit';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../lib/supabase';
import { authColors } from '../theme/authTheme';
import { createRequestGate, getSafeAuthErrorDetails } from '../utils/authRegistration';
import { getAuthErrorMessage, getPasswordUpdateValidationError } from '../utils/authForm';

type FormMessage = {
    tone: 'error' | 'success' | 'info';
    text: string;
};

export default function PasswordRecoveryScreen() {
    const buildLabel = Constants.expoConfig?.extra?.buildLabel as string | undefined;
    const { clearPasswordRecovery } = useAuth();
    const [password, setPassword] = useState('');
    const [confirmation, setConfirmation] = useState('');
    const [loading, setLoading] = useState(false);
    const [completed, setCompleted] = useState(false);
    const [message, setMessage] = useState<FormMessage | null>(null);
    const requestGate = useRef(createRequestGate());

    async function handleSubmit() {
        if (!requestGate.current.tryStart()) return;
        setMessage(null);
        setLoading(true);
        try {
            const validationError = getPasswordUpdateValidationError(password, confirmation);
            if (validationError) {
                setMessage({ tone: 'error', text: validationError });
                return;
            }

            const { error } = await supabase.auth.updateUser({ password });
            if (error) {
                console.warn('[Auth] password recovery update failed', getSafeAuthErrorDetails(error));
                setMessage({ tone: 'error', text: getAuthErrorMessage(error, 'recovery') });
                return;
            }

            setCompleted(true);
            setPassword('');
            setConfirmation('');
            setMessage({
                tone: 'success',
                text: 'Tu contraseña fue actualizada. Ya puedes continuar en Ping.',
            });
        } finally {
            requestGate.current.finish();
            setLoading(false);
        }
    }

    return (
        <AuthScaffold buildLabel={buildLabel}>
            <View style={styles.intro}>
                <View style={styles.iconCircle}>
                    <Ionicons name="key-outline" size={30} color={authColors.primary} />
                </View>
                <Text style={styles.title}>Crea una nueva contraseña</Text>
                <Text style={styles.description}>
                    El enlace es válido sólo para recuperar tu cuenta. Elige una contraseña que puedas recordar.
                </Text>
            </View>

            <AuthCard>
                <AuthField
                    icon="lock-closed-outline"
                    placeholder="Nueva contraseña"
                    value={password}
                    onChangeText={(value) => {
                        setPassword(value);
                        if (message?.tone === 'error') setMessage(null);
                    }}
                    secure
                    autoCapitalize="none"
                    autoCorrect={false}
                    autoComplete="new-password"
                    textContentType="newPassword"
                    returnKeyType="next"
                    editable={!loading && !completed}
                    accessibilityLabel="Nueva contraseña"
                />
                <AuthField
                    icon="shield-checkmark-outline"
                    placeholder="Repite la contraseña"
                    value={confirmation}
                    onChangeText={(value) => {
                        setConfirmation(value);
                        if (message?.tone === 'error') setMessage(null);
                    }}
                    secure
                    autoCapitalize="none"
                    autoCorrect={false}
                    autoComplete="new-password"
                    textContentType="newPassword"
                    returnKeyType="done"
                    onSubmitEditing={handleSubmit}
                    editable={!loading && !completed}
                    accessibilityLabel="Repite la contraseña"
                />

                {!!message && <AuthMessage tone={message.tone}>{message.text}</AuthMessage>}

                <AuthPrimaryButton
                    label={completed ? 'Continuar a Ping' : 'Guardar nueva contraseña'}
                    icon={completed ? 'arrow-forward' : 'checkmark'}
                    onPress={completed ? clearPasswordRecovery : handleSubmit}
                    loading={loading}
                    disabled={loading}
                />

                {!completed && (
                    <Text style={styles.hint}>Usa al menos 6 caracteres.</Text>
                )}
                {completed && (
                    <Pressable
                        accessibilityRole="button"
                        onPress={clearPasswordRecovery}
                        style={({ pressed }) => [styles.secondaryLink, pressed && styles.pressed]}
                    >
                        <Text style={styles.secondaryLinkText}>Continuar ahora</Text>
                    </Pressable>
                )}
            </AuthCard>
        </AuthScaffold>
    );
}

const styles = StyleSheet.create({
    intro: { alignItems: 'center', marginBottom: 18, paddingHorizontal: 18 },
    iconCircle: {
        alignItems: 'center',
        backgroundColor: '#eef0ff',
        borderRadius: 32,
        height: 64,
        justifyContent: 'center',
        marginBottom: 14,
        width: 64,
    },
    title: { color: authColors.ink, fontSize: 27, fontWeight: '900', textAlign: 'center' },
    description: {
        color: authColors.inkSoft,
        fontSize: 15,
        lineHeight: 22,
        marginTop: 8,
        textAlign: 'center',
    },
    hint: { color: authColors.inkSoft, fontSize: 13, marginTop: 14, textAlign: 'center' },
    secondaryLink: { alignItems: 'center', marginTop: 16, padding: 8 },
    secondaryLinkText: { color: authColors.primary, fontSize: 14, fontWeight: '800' },
    pressed: { opacity: 0.7 },
});
