import React, { useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import {
    AuthCard,
    AuthField,
    AuthMessage,
    AuthPrimaryButton,
    AuthScaffold,
    PrivacyNote,
} from '../components/auth/AuthKit';
import { useUpdateProfile } from '../api/queries';
import { useAuth } from '../context/AuthContext';
import { createRequestGate } from '../utils/authRegistration';
import { getDisplayNameValidationError, normalizeDisplayName } from '../utils/profile';
import { supabase } from '../lib/supabase';
import { authColors } from '../theme/authTheme';

export default function CompleteProfileScreen() {
    const { user, refreshProfile } = useAuth();
    const { mutateAsync: updateProfile } = useUpdateProfile();
    const [fullName, setFullName] = useState('');
    const [saving, setSaving] = useState(false);
    const [message, setMessage] = useState<string | null>(null);
    const requestGate = useRef(createRequestGate());

    const handleContinue = async () => {
        if (!requestGate.current.tryStart()) return;
        const normalizedName = normalizeDisplayName(fullName);
        const validationError = getDisplayNameValidationError(normalizedName);

        if (validationError) {
            requestGate.current.finish();
            setMessage(validationError);
            return;
        }

        setMessage(null);
        setSaving(true);
        try {
            await updateProfile({ full_name: normalizedName });
            const refreshed = await refreshProfile();
            if (!refreshed?.full_name) {
                throw new Error('Profile refresh did not return a display name');
            }
        } catch (error: any) {
            console.warn('[Onboarding] profile completion failed', {
                name: error?.name || 'UnknownError',
                status: typeof error?.status === 'number' ? error.status : null,
            });
            setMessage('Tu nombre no se guardó. Inténtalo nuevamente.');
        } finally {
            requestGate.current.finish();
            setSaving(false);
        }
    };

    return (
        <AuthScaffold condensedBrand>
            <View style={styles.intro}>
                <Text style={styles.eyebrow}>ÚLTIMO PASO</Text>
                <Text style={styles.title}>¿Cómo debemos llamarte?</Text>
                <Text style={styles.description}>
                    Tu nombre permitirá reconocerte en conversaciones y compromisos.
                </Text>
            </View>

            <AuthCard>
                <View style={styles.profileIcon}>
                    <Ionicons name="person-outline" size={29} color={authColors.primary} />
                </View>
                {!!user?.email && (
                    <View style={styles.accountPill}>
                        <Ionicons name="checkmark-circle" size={16} color={authColors.success} />
                        <Text style={styles.email} numberOfLines={1}>{user.email}</Text>
                    </View>
                )}

                <Text style={styles.label}>Nombre visible</Text>
                <AuthField
                    icon="person-outline"
                    placeholder="Escribe tu nombre"
                    value={fullName}
                    onChangeText={(value) => {
                        setFullName(value);
                        if (message) setMessage(null);
                    }}
                    autoCapitalize="words"
                    autoCorrect={false}
                    autoComplete="name"
                    textContentType="name"
                    maxLength={100}
                    editable={!saving}
                    autoFocus
                    returnKeyType="done"
                    onSubmitEditing={handleContinue}
                    accessibilityLabel="Nombre visible"
                />

                {!!message && <AuthMessage tone="error">{message}</AuthMessage>}

                <AuthPrimaryButton
                    label="Continuar a Ping"
                    onPress={handleContinue}
                    loading={saving}
                    disabled={saving}
                />

                <Text style={styles.optional}>
                    La foto y el teléfono son opcionales y podrás agregarlos después.
                </Text>

                <Pressable
                    accessibilityRole="button"
                    onPress={() => supabase.auth.signOut()}
                    disabled={saving}
                    style={({ pressed }) => [styles.signOut, pressed && styles.pressed]}
                >
                    <Ionicons name="swap-horizontal-outline" size={17} color={authColors.inkSoft} />
                    <Text style={styles.signOutText}>Usar otra cuenta</Text>
                </Pressable>

                <PrivacyNote />
            </AuthCard>
        </AuthScaffold>
    );
}

const styles = StyleSheet.create({
    intro: { alignItems: 'center', paddingHorizontal: 12, marginBottom: 18 },
    eyebrow: { color: authColors.primary, fontSize: 11, fontWeight: '900', letterSpacing: 1.6 },
    title: {
        color: authColors.ink,
        fontSize: 28,
        lineHeight: 34,
        fontWeight: '900',
        textAlign: 'center',
        marginTop: 6,
    },
    description: {
        color: authColors.inkSoft,
        fontSize: 15,
        lineHeight: 21,
        textAlign: 'center',
        maxWidth: 350,
        marginTop: 7,
    },
    profileIcon: {
        width: 60,
        height: 60,
        borderRadius: 30,
        alignSelf: 'center',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: '#edf0ff',
        marginBottom: 12,
    },
    accountPill: {
        flexDirection: 'row',
        alignItems: 'center',
        alignSelf: 'center',
        gap: 6,
        maxWidth: '100%',
        backgroundColor: authColors.successSurface,
        paddingHorizontal: 12,
        paddingVertical: 7,
        borderRadius: 999,
        marginBottom: 18,
    },
    email: { color: authColors.success, fontSize: 12, fontWeight: '700', flexShrink: 1 },
    label: { color: authColors.ink, fontSize: 13, fontWeight: '800', marginBottom: 8, marginLeft: 2 },
    optional: { color: authColors.inkSoft, fontSize: 12, lineHeight: 17, textAlign: 'center', marginTop: 15 },
    signOut: {
        flexDirection: 'row',
        gap: 6,
        alignItems: 'center',
        justifyContent: 'center',
        paddingVertical: 15,
        marginBottom: -9,
    },
    signOutText: { color: authColors.inkSoft, fontSize: 13, fontWeight: '700' },
    pressed: { opacity: 0.7 },
});
