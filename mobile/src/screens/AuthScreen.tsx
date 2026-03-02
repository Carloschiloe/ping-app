import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, Alert, StyleSheet, ScrollView } from 'react-native';
import { supabase } from '../lib/supabase';

function normalizePhone(raw: string): string {
    // Remove everything except digits and leading +
    let cleaned = raw.replace(/[^\d+]/g, '');
    // Ensure starts with + for international format
    if (!cleaned.startsWith('+')) {
        // Default to Chile +56 if no country code — users can type their own
        cleaned = '+56' + cleaned.replace(/^0/, '');
    }
    return cleaned;
}

export default function AuthScreen() {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [phone, setPhone] = useState('');
    const [loading, setLoading] = useState(false);
    const [isLogin, setIsLogin] = useState(true);

    async function handleAuth() {
        setLoading(true);
        try {
            if (isLogin) {
                const { error } = await supabase.auth.signInWithPassword({ email, password });
                if (error) Alert.alert('Error', error.message);
            } else {
                if (!phone.trim()) {
                    Alert.alert('Número requerido', 'Ingresa tu número de teléfono para que tus contactos puedan encontrarte en Ping.');
                    setLoading(false);
                    return;
                }
                const { data, error } = await supabase.auth.signUp({ email, password });
                if (error) {
                    Alert.alert('Error', error.message);
                } else if (data.user) {
                    // Save phone to profile
                    const normalizedPhone = normalizePhone(phone);
                    await supabase
                        .from('profiles')
                        .update({ phone: normalizedPhone })
                        .eq('id', data.user.id);
                }
            }
        } finally {
            setLoading(false);
        }
    }

    return (
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
            <View style={styles.container}>
                <Text style={styles.logo}>📌</Text>
                <Text style={styles.title}>PING</Text>
                <Text style={styles.subtitle}>Chat that remembers</Text>

                <TextInput
                    style={styles.input}
                    placeholder="Email"
                    value={email}
                    onChangeText={setEmail}
                    autoCapitalize="none"
                    keyboardType="email-address"
                />
                <TextInput
                    style={styles.input}
                    placeholder="Contraseña"
                    value={password}
                    onChangeText={setPassword}
                    secureTextEntry
                />

                {!isLogin && (
                    <View>
                        <TextInput
                            style={styles.input}
                            placeholder="Teléfono (ej: +56912345678)"
                            value={phone}
                            onChangeText={setPhone}
                            keyboardType="phone-pad"
                        />
                        <Text style={styles.phoneHint}>
                            Tu número permite que tus contactos te encuentren en Ping.
                        </Text>
                    </View>
                )}

                <TouchableOpacity style={styles.button} onPress={handleAuth} disabled={loading}>
                    <Text style={styles.buttonText}>
                        {loading ? 'Cargando...' : (isLogin ? 'Iniciar Sesión' : 'Registrarse')}
                    </Text>
                </TouchableOpacity>

                <TouchableOpacity style={styles.switchButton} onPress={() => setIsLogin(!isLogin)}>
                    <Text style={styles.switchText}>
                        {isLogin ? '¿No tienes cuenta? Regístrate' : '¿Ya tienes cuenta? Inicia Sesión'}
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
    subtitle: { textAlign: 'center', color: '#6b7280', marginBottom: 40, fontSize: 16 },
    input: { borderWidth: 1.5, borderColor: '#e5e7eb', padding: 16, borderRadius: 12, marginBottom: 12, fontSize: 15, backgroundColor: '#fafafa' },
    phoneHint: { fontSize: 12, color: '#9ca3af', marginBottom: 12, marginTop: -6, paddingHorizontal: 4 },
    button: { backgroundColor: '#3b82f6', padding: 18, borderRadius: 14, alignItems: 'center', marginTop: 8 },
    buttonText: { color: 'white', fontWeight: '700', fontSize: 16 },
    switchButton: { marginTop: 24, alignItems: 'center' },
    switchText: { color: '#3b82f6', textAlign: 'center', fontSize: 15 },
});
