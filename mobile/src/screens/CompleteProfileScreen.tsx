import React, { useRef, useState } from 'react';
import {
    ActivityIndicator,
    Alert,
    KeyboardAvoidingView,
    Platform,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View,
} from 'react-native';
import { useUpdateProfile } from '../api/queries';
import { useAuth } from '../context/AuthContext';
import { createRequestGate } from '../utils/authRegistration';
import { getDisplayNameValidationError, normalizeDisplayName } from '../utils/profile';
import { supabase } from '../lib/supabase';

export default function CompleteProfileScreen() {
    const { user, refreshProfile } = useAuth();
    const { mutateAsync: updateProfile } = useUpdateProfile();
    const [fullName, setFullName] = useState('');
    const [saving, setSaving] = useState(false);
    const requestGate = useRef(createRequestGate());

    const handleContinue = async () => {
        if (!requestGate.current.tryStart()) return;
        const normalizedName = normalizeDisplayName(fullName);
        const validationError = getDisplayNameValidationError(normalizedName);

        if (validationError) {
            requestGate.current.finish();
            Alert.alert('Revisa tu nombre', validationError);
            return;
        }

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
            Alert.alert('No se pudo guardar', 'Tu nombre no se guardó. Inténtalo nuevamente.');
        } finally {
            requestGate.current.finish();
            setSaving(false);
        }
    };

    return (
        <KeyboardAvoidingView
            style={styles.container}
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
            <View style={styles.card}>
                <Text style={styles.logo}>📌</Text>
                <Text style={styles.title}>¿Cómo debemos llamarte?</Text>
                <Text style={styles.description}>
                    Tu nombre identifica tus mensajes y compromisos. La foto y el teléfono son opcionales y podrás agregarlos después.
                </Text>
                {!!user?.email && <Text style={styles.email}>{user.email}</Text>}
                <TextInput
                    style={styles.input}
                    placeholder="Tu nombre"
                    value={fullName}
                    onChangeText={setFullName}
                    autoCapitalize="words"
                    autoCorrect={false}
                    maxLength={100}
                    editable={!saving}
                    autoFocus
                    returnKeyType="done"
                    onSubmitEditing={handleContinue}
                />
                <TouchableOpacity
                    style={[styles.button, saving && styles.buttonDisabled]}
                    onPress={handleContinue}
                    disabled={saving}
                >
                    {saving
                        ? <ActivityIndicator color="white" />
                        : <Text style={styles.buttonText}>Continuar a Ping</Text>}
                </TouchableOpacity>
                <TouchableOpacity onPress={() => supabase.auth.signOut()} disabled={saving}>
                    <Text style={styles.signOut}>Usar otra cuenta</Text>
                </TouchableOpacity>
            </View>
        </KeyboardAvoidingView>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, justifyContent: 'center', backgroundColor: '#f8fafc', padding: 24 },
    card: { backgroundColor: 'white', padding: 24, borderRadius: 20 },
    logo: { fontSize: 44, textAlign: 'center', marginBottom: 12 },
    title: { fontSize: 24, lineHeight: 30, fontWeight: '800', color: '#0f172a', textAlign: 'center' },
    description: { color: '#475569', lineHeight: 21, textAlign: 'center', marginTop: 12, marginBottom: 16 },
    email: { color: '#64748b', textAlign: 'center', marginBottom: 18 },
    input: { borderWidth: 1.5, borderColor: '#cbd5e1', borderRadius: 12, padding: 15, fontSize: 17, color: '#0f172a' },
    button: { marginTop: 16, backgroundColor: '#2563eb', borderRadius: 12, padding: 16, alignItems: 'center' },
    buttonDisabled: { opacity: 0.55 },
    buttonText: { color: 'white', fontWeight: '700', fontSize: 16 },
    signOut: { color: '#64748b', textAlign: 'center', marginTop: 20 },
});
