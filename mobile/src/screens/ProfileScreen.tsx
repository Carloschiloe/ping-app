import React, { useState, useEffect } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, Alert, ScrollView } from 'react-native';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';

function normalizePhone(raw: string): string {
    let cleaned = raw.replace(/[^\d+]/g, '');
    if (!cleaned.startsWith('+')) {
        cleaned = '+56' + cleaned.replace(/^0/, '');
    }
    return cleaned;
}

export default function ProfileScreen() {
    const { user } = useAuth();
    const [phone, setPhone] = useState('');
    const [saving, setSaving] = useState(false);

    useEffect(() => {
        if (!user) return;
        supabase
            .from('profiles')
            .select('phone')
            .eq('id', user.id)
            .single()
            .then(({ data }) => {
                if (data?.phone) setPhone(data.phone);
            });
    }, [user]);

    const handleSavePhone = async () => {
        if (!phone.trim()) return;
        setSaving(true);
        try {
            const normalized = normalizePhone(phone);
            const { error } = await supabase
                .from('profiles')
                .update({ phone: normalized })
                .eq('id', user!.id);
            if (error) throw error;
            setPhone(normalized);
            Alert.alert('✅ Guardado', 'Tu número fue actualizado.');
        } catch (e: any) {
            Alert.alert('Error', e.message);
        } finally {
            setSaving(false);
        }
    };

    const handleLogout = () => {
        Alert.alert('Cerrar sesión', '¿Estás seguro?', [
            { text: 'Cancelar', style: 'cancel' },
            { text: 'Salir', style: 'destructive', onPress: () => supabase.auth.signOut() },
        ]);
    };

    return (
        <ScrollView style={styles.container} contentContainerStyle={styles.content}>
            <Text style={styles.heading}>Perfil</Text>

            {/* Avatar */}
            <View style={styles.avatarWrap}>
                <View style={styles.avatar}>
                    <Text style={styles.avatarText}>
                        {user?.email?.substring(0, 2).toUpperCase() || '??'}
                    </Text>
                </View>
                <Text style={styles.email}>{user?.email}</Text>
            </View>

            {/* Phone */}
            <View style={styles.section}>
                <Text style={styles.label}>Número de teléfono</Text>
                <Text style={styles.hint}>Tus contactos te encontrarán por este número.</Text>
                <TextInput
                    style={styles.input}
                    placeholder="+56912345678"
                    value={phone}
                    onChangeText={setPhone}
                    keyboardType="phone-pad"
                />
                <TouchableOpacity style={styles.saveBtn} onPress={handleSavePhone} disabled={saving}>
                    <Text style={styles.saveBtnText}>{saving ? 'Guardando...' : 'Guardar número'}</Text>
                </TouchableOpacity>
            </View>

            {/* Logout */}
            <TouchableOpacity style={styles.logoutBtn} onPress={handleLogout}>
                <Text style={styles.logoutText}>Cerrar sesión</Text>
            </TouchableOpacity>
        </ScrollView>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#f9fafb' },
    content: { padding: 24, paddingTop: 64 },
    heading: { fontSize: 28, fontWeight: '700', marginBottom: 28, color: '#111' },
    avatarWrap: { alignItems: 'center', marginBottom: 32 },
    avatar: { width: 80, height: 80, borderRadius: 40, backgroundColor: '#3b82f6', alignItems: 'center', justifyContent: 'center', marginBottom: 12 },
    avatarText: { color: 'white', fontSize: 28, fontWeight: '700' },
    email: { fontSize: 16, color: '#6b7280' },
    section: { backgroundColor: 'white', borderRadius: 16, padding: 20, marginBottom: 20, shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 4, elevation: 2 },
    label: { fontSize: 15, fontWeight: '600', color: '#111', marginBottom: 4 },
    hint: { fontSize: 13, color: '#9ca3af', marginBottom: 12 },
    input: { borderWidth: 1.5, borderColor: '#e5e7eb', padding: 14, borderRadius: 12, fontSize: 15, backgroundColor: '#fafafa', marginBottom: 12 },
    saveBtn: { backgroundColor: '#3b82f6', padding: 14, borderRadius: 12, alignItems: 'center' },
    saveBtnText: { color: 'white', fontWeight: '700', fontSize: 15 },
    logoutBtn: { backgroundColor: 'white', borderRadius: 16, padding: 18, alignItems: 'center', borderWidth: 1.5, borderColor: '#fee2e2' },
    logoutText: { color: '#ef4444', fontWeight: '700', fontSize: 16 },
});
