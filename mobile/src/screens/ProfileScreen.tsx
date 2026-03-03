import React, { useState, useEffect } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, Alert, ScrollView, Image, ActivityIndicator } from 'react-native';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';
import { Ionicons } from '@expo/vector-icons';
import { useUpdateProfile } from '../api/queries';
import * as ImagePicker from 'expo-image-picker';

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
    const [fullName, setFullName] = useState('');
    const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
    const [saving, setSaving] = useState(false);
    const { mutate: updateProfile } = useUpdateProfile();

    useEffect(() => {
        if (!user) return;
        supabase
            .from('profiles')
            .select('phone, full_name, avatar_url')
            .eq('id', user.id)
            .single()
            .then(({ data }) => {
                if (data?.phone) setPhone(data.phone);
                if (data?.full_name) setFullName(data.full_name);
                if (data?.avatar_url) setAvatarUrl(data.avatar_url);
            });
    }, [user]);

    const handlePickImage = async () => {
        const result = await ImagePicker.launchImageLibraryAsync({
            mediaTypes: ['images'],
            allowsEditing: true,
            aspect: [1, 1],
            quality: 0.5,
        });

        if (!result.canceled && result.assets[0].uri) {
            uploadAvatar(result.assets[0].uri);
        }
    };

    const uploadAvatar = async (uri: string) => {
        setSaving(true);
        try {
            const fileName = `${user!.id}/${Date.now()}.jpg`;
            const formData = new FormData();
            formData.append('file', {
                uri,
                name: fileName,
                type: 'image/jpeg',
            } as any);

            const { data, error } = await supabase.storage
                .from('chat-media')
                .upload(fileName, formData);

            if (error) throw error;

            const { data: { publicUrl } } = supabase.storage
                .from('chat-media')
                .getPublicUrl(fileName);

            setAvatarUrl(publicUrl);
            await handleSaveProfile(null, publicUrl);
        } catch (e: any) {
            Alert.alert('Error al subir imagen', e.message);
        } finally {
            setSaving(false);
        }
    };

    const handleSaveProfile = async (nameOverride?: string | null, avatarOverride?: string | null) => {
        setSaving(true);
        try {
            updateProfile({
                full_name: nameOverride !== undefined ? (nameOverride || undefined) : fullName,
                avatar_url: avatarOverride !== undefined ? (avatarOverride || undefined) : (avatarUrl || undefined),
            }, {
                onSuccess: () => {
                    Alert.alert('✅ Perfil actualizado', 'Tus cambios han sido guardados.');
                },
                onError: (err: any) => {
                    Alert.alert('Error', err.message);
                }
            });
        } finally {
            setSaving(false);
        }
    };

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

            {/* Avatar Section */}
            <View style={styles.avatarWrap}>
                <TouchableOpacity onPress={handlePickImage} style={styles.avatarContainer}>
                    {avatarUrl ? (
                        <Image source={{ uri: avatarUrl }} style={styles.avatarImage} />
                    ) : (
                        <View style={styles.avatarPlaceholder}>
                            <Text style={styles.avatarText}>
                                {fullName?.[0]?.toUpperCase() || user?.email?.[0]?.toUpperCase() || '?'}
                            </Text>
                        </View>
                    )}
                    <View style={styles.cameraBadge}>
                        <Ionicons name="camera" size={16} color="white" />
                    </View>
                </TouchableOpacity>
                <Text style={styles.email}>{user?.email}</Text>
            </View>

            {/* Profile Info */}
            <View style={styles.section}>
                <Text style={styles.label}>Nombre completo</Text>
                <TextInput
                    style={styles.input}
                    placeholder="Tu nombre real"
                    value={fullName}
                    onChangeText={setFullName}
                />
                <TouchableOpacity style={styles.saveBtn} onPress={() => handleSaveProfile()} disabled={saving}>
                    <Text style={styles.saveBtnText}>{saving ? 'Guardando...' : 'Guardar nombre'}</Text>
                </TouchableOpacity>
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
    avatarContainer: { width: 100, height: 100, borderRadius: 50, marginBottom: 12, position: 'relative' },
    avatarImage: { width: 100, height: 100, borderRadius: 50 },
    avatarPlaceholder: { width: 100, height: 100, borderRadius: 50, backgroundColor: '#3b82f6', alignItems: 'center', justifyContent: 'center' },
    avatarText: { color: 'white', fontSize: 36, fontWeight: '700' },
    cameraBadge: { position: 'absolute', bottom: 0, right: 0, backgroundColor: '#1e3a5f', width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center', borderWidth: 3, borderColor: '#f9fafb' },
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
