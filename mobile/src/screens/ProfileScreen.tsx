import React, { useState, useEffect } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, Alert, ScrollView, Image, ActivityIndicator } from 'react-native';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';
import { Ionicons } from '@expo/vector-icons';
import { useUpdateProfile } from '../api/queries';
import * as ImagePicker from 'expo-image-picker';
import { uploadToSupabase } from '../lib/upload';

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
    const [isEditing, setIsEditing] = useState(false);
    const { mutateAsync: updateProfile } = useUpdateProfile();

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
            const publicUrl = await uploadToSupabase(uri, 'chat-media', 'image/jpeg');

            if (!publicUrl) throw new Error('No se pudo subir la imagen.');

            setAvatarUrl(publicUrl);

            // We await the profile update here
            await updateProfile({
                avatar_url: publicUrl,
            });

            Alert.alert('✅ Foto actualizada', 'Tu foto de perfil se ha guardado correctamente.');
        } catch (e: any) {
            console.error('[Profile] Upload error:', e);
            Alert.alert('Error', e.message || 'No se pudo subir la imagen');
        } finally {
            setSaving(false);
        }
    };

    const handleSaveProfile = async () => {
        if (!user) return;
        setSaving(true);
        try {
            await updateProfile({
                full_name: fullName || undefined,
                avatar_url: avatarUrl || undefined,
            });
            setIsEditing(false);
            Alert.alert('✅ Perfil actualizado', 'Tus cambios han sido guardados.');
        } catch (e: any) {
            Alert.alert('Error', e.message || 'No se pudo actualizar el perfil');
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
            setIsEditing(false);
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
                <View style={styles.sectionHeader}>
                    <Text style={styles.label}>Información Personal</Text>
                    {!isEditing && (
                        <TouchableOpacity onPress={() => setIsEditing(true)}>
                            <Text style={styles.editLink}>Editar</Text>
                        </TouchableOpacity>
                    )}
                </View>

                <Text style={styles.fieldLabel}>Nombre completo</Text>
                {isEditing ? (
                    <TextInput
                        style={styles.input}
                        placeholder="Tu nombre real"
                        value={fullName}
                        onChangeText={setFullName}
                    />
                ) : (
                    <Text style={styles.valueText}>{fullName || 'No establecido'}</Text>
                )}

                <Text style={[styles.fieldLabel, { marginTop: 16 }]}>Número de teléfono</Text>
                {isEditing ? (
                    <TextInput
                        style={styles.input}
                        placeholder="+56912345678"
                        value={phone}
                        onChangeText={setPhone}
                        keyboardType="phone-pad"
                    />
                ) : (
                    <Text style={styles.valueText}>{phone || 'No establecido'}</Text>
                )}

                {isEditing && (
                    <View style={styles.editActions}>
                        <TouchableOpacity
                            style={[styles.saveBtn, { flex: 1, marginRight: 8 }]}
                            onPress={handleSaveProfile}
                            disabled={saving}
                        >
                            <Text style={styles.saveBtnText}>{saving ? 'Guardando...' : 'Guardar'}</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                            style={[styles.cancelBtn, { flex: 1 }]}
                            onPress={() => setIsEditing(false)}
                        >
                            <Text style={styles.cancelBtnText}>Cancelar</Text>
                        </TouchableOpacity>
                    </View>
                )}
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
    sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
    label: { fontSize: 18, fontWeight: '700', color: '#111' },
    editLink: { color: '#3b82f6', fontWeight: '600', fontSize: 15 },
    fieldLabel: { fontSize: 13, fontWeight: '600', color: '#6b7280', marginBottom: 4 },
    valueText: { fontSize: 16, color: '#111', marginBottom: 4 },
    hint: { fontSize: 13, color: '#9ca3af', marginBottom: 12 },
    input: { borderWidth: 1.5, borderColor: '#e5e7eb', padding: 14, borderRadius: 12, fontSize: 15, backgroundColor: '#fafafa', marginBottom: 4 },
    saveBtn: { backgroundColor: '#3b82f6', padding: 14, borderRadius: 12, alignItems: 'center' },
    saveBtnText: { color: 'white', fontWeight: '700', fontSize: 15 },
    cancelBtn: { backgroundColor: '#f3f4f6', padding: 14, borderRadius: 12, alignItems: 'center' },
    cancelBtnText: { color: '#4b5563', fontWeight: '700', fontSize: 15 },
    editActions: { flexDirection: 'row', marginTop: 20 },
    logoutBtn: { backgroundColor: 'white', borderRadius: 16, padding: 18, alignItems: 'center', borderWidth: 1.5, borderColor: '#fee2e2' },
    logoutText: { color: '#ef4444', fontWeight: '700', fontSize: 16 },
});
