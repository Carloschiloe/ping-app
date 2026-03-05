import React, { useState, useEffect } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, Alert, ScrollView, Image, ActivityIndicator, Switch, Linking } from 'react-native';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';
import { Ionicons } from '@expo/vector-icons';
import { useUpdateProfile, useCalendarAccounts, useUpdateCalendarAccount, useDisconnectCalendarAccount } from '../api/queries';
import * as ImagePicker from 'expo-image-picker';
import { uploadToSupabase } from '../lib/upload';
import * as Calendar from 'expo-calendar';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { apiClient, API_URL } from '../api/client';
import { useIsFocused } from '@react-navigation/native';

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

    const [calendars, setCalendars] = useState<Calendar.Calendar[]>([]);
    const [hiddenCalendars, setHiddenCalendars] = useState<string[]>([]);
    const [loadingCals, setLoadingCals] = useState(false);
    const isFocused = useIsFocused();

    // Cloud Accounts Queries
    const { data: cloudAccounts = [], refetch: refetchAccounts } = useCalendarAccounts();
    const { mutate: updateAccount } = useUpdateCalendarAccount();
    const { mutate: disconnectAccount } = useDisconnectCalendarAccount();

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

        checkCalendars();
        loadHiddenCalendars();
        refetchAccounts();
    }, [user, isFocused]);

    const handleConnectCloud = async (provider: 'google' | 'outlook') => {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) return;
        const url = `${API_URL}/calendar/auth/${provider}?token=${session.access_token}`;
        Linking.openURL(url);
    };

    const handleDisconnectCloud = async (id: string, email: string) => {
        Alert.alert('Desconectar cuenta', `¿Estás seguro de quitar ${email}?`, [
            { text: 'Cancelar', style: 'cancel' },
            {
                text: 'Desconectar',
                style: 'destructive',
                onPress: async () => {
                    disconnectAccount(id);
                }
            }
        ]);
    };

    const handleToggleAutoSync = (id: string, current: boolean) => {
        updateAccount({ id, is_auto_sync_enabled: !current });
    };

    const loadHiddenCalendars = async () => {
        const stored = await AsyncStorage.getItem('ping_hidden_calendars');
        if (stored) setHiddenCalendars(JSON.parse(stored));
    };

    const toggleCalendarVisibility = async (id: string) => {
        const updated = hiddenCalendars.includes(id)
            ? hiddenCalendars.filter(cid => cid !== id)
            : [...hiddenCalendars, id];

        setHiddenCalendars(updated);
        await AsyncStorage.setItem('ping_hidden_calendars', JSON.stringify(updated));
    };

    const checkCalendars = async () => {
        const { status } = await Calendar.getCalendarPermissionsAsync();
        if (status === 'granted') {
            setLoadingCals(true);
            try {
                const all = await Calendar.getCalendarsAsync(Calendar.EntityTypes.EVENT);
                setCalendars(all.filter(c => c.allowsModifications));
            } catch (e) {
                console.error(e);
            } finally {
                setLoadingCals(false);
            }
        }
    };

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

            {/* Calendars Section */}
            <View style={styles.section}>
                <View style={styles.sectionHeader}>
                    <Text style={styles.label}>Calendarios Disponibles</Text>
                    <Ionicons name="calendar-outline" size={20} color="#6b7280" />
                </View>
                <Text style={styles.hint}>
                    Conecta tus cuentas directamente para que Ping guarde compromisos automáticamente sin depender de los ajustes del teléfono.
                </Text>

                {cloudAccounts.length > 0 && (
                    <View style={styles.cloudAccountsList}>
                        {cloudAccounts.map((acc: any) => (
                            <View key={acc.id} style={styles.cloudAccCard}>
                                <View style={styles.cloudAccRow}>
                                    <Ionicons
                                        name={acc.provider === 'google' ? "logo-google" : "logo-microsoft"}
                                        size={20}
                                        color={acc.provider === 'google' ? "#ea4335" : "#00a4ef"}
                                    />
                                    <View style={{ flex: 1, marginLeft: 10 }}>
                                        <Text style={styles.cloudAccEmail}>{acc.email}</Text>
                                        <Text style={styles.cloudAccMeta}>Sincronización Cloud</Text>
                                    </View>
                                    <TouchableOpacity onPress={() => handleDisconnectCloud(acc.id, acc.email)}>
                                        <Ionicons name="trash-outline" size={18} color="#ef4444" />
                                    </TouchableOpacity>
                                </View>

                                <View style={styles.autoSyncRow}>
                                    <View style={{ flex: 1 }}>
                                        <Text style={styles.autoSyncTitle}>Sincronización Automática</Text>
                                        <Text style={styles.autoSyncDesc}>
                                            Agenda, completa o elimina eventos en tu nube automáticamente.
                                        </Text>
                                    </View>
                                    <Switch
                                        value={!!acc.is_auto_sync_enabled}
                                        onValueChange={() => handleToggleAutoSync(acc.id, !!acc.is_auto_sync_enabled)}
                                        trackColor={{ false: '#d1d5db', true: '#8b5cf6' }}
                                        thumbColor="#ffffff"
                                    />
                                </View>
                            </View>
                        ))}
                    </View>
                )}

                <View style={styles.cloudActions}>
                    {!cloudAccounts.find((a: any) => a.provider === 'google') && (
                        <TouchableOpacity
                            style={[styles.connectCloudBtn, { backgroundColor: '#ffffff', borderWidth: 1, borderColor: '#e5e7eb' }]}
                            onPress={() => handleConnectCloud('google')}
                        >
                            <Ionicons name="logo-google" size={20} color="#4285F4" />
                            <Text style={[styles.connectCloudBtnText, { color: '#444' }]}>Conectar Google Calendar</Text>
                        </TouchableOpacity>
                    )}

                    {!cloudAccounts.find((a: any) => a.provider === 'outlook') && (
                        <TouchableOpacity
                            style={[styles.connectCloudBtn, { backgroundColor: '#0078d4' }]}
                            onPress={() => handleConnectCloud('outlook')}
                        >
                            <Ionicons name="logo-microsoft" size={20} color="white" />
                            <Text style={styles.connectCloudBtnText}>Conectar Outlook (365)</Text>
                        </TouchableOpacity>
                    )}
                </View>

                <View style={[styles.divider, { marginVertical: 20 }]} />

                <View style={styles.sectionHeader}>
                    <Text style={styles.subLabel}>Calendarios del Sistema (Local)</Text>
                    <TouchableOpacity onPress={checkCalendars}>
                        <Ionicons name="refresh" size={18} color="#3b82f6" />
                    </TouchableOpacity>
                </View>

                {loadingCals ? (
                    <ActivityIndicator size="small" color="#3b82f6" />
                ) : calendars.length > 0 ? (
                    calendars.map((cal: any) => {
                        const isVisible = !hiddenCalendars.includes(cal.id);
                        return (
                            <TouchableOpacity
                                key={cal.id}
                                style={[styles.calRow, !isVisible && { opacity: 0.5 }]}
                                onPress={() => toggleCalendarVisibility(cal.id)}
                            >
                                <View style={[styles.calDot, { backgroundColor: cal.color }]} />
                                <View style={{ flex: 1 }}>
                                    <Text style={[styles.calTitle, !isVisible && { textDecorationLine: 'line-through' }]}>
                                        {cal.title}
                                    </Text>
                                    <Text style={styles.calSource}>{cal.source.name}</Text>
                                </View>
                                <Ionicons
                                    name={isVisible ? "eye" : "eye-off"}
                                    size={18}
                                    color={isVisible ? "#10b981" : "#9ca3af"}
                                />
                            </TouchableOpacity>
                        );
                    })
                ) : (
                    <TouchableOpacity style={styles.permissionBtn} onPress={checkCalendars}>
                        <Text style={styles.permissionBtnText}>Habilitar Calendarios</Text>
                    </TouchableOpacity>
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
    calRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 12, paddingVertical: 4 },
    calDot: { width: 10, height: 10, borderRadius: 5, marginRight: 10 },
    calTitle: { fontSize: 15, fontWeight: '600', color: '#111' },
    calSource: { fontSize: 12, color: '#6b7280' },
    permissionBtn: { backgroundColor: '#f3f4f6', padding: 12, borderRadius: 12, alignItems: 'center' },
    permissionBtnText: { color: '#3b82f6', fontWeight: '700' },
    connectMainBtnText: { color: 'white', fontWeight: '700', fontSize: 14 },
    cloudAccountsList: { marginBottom: 20 },
    cloudAccCard: { backgroundColor: '#f9fafb', borderRadius: 12, padding: 12, marginBottom: 12, borderWidth: 1, borderColor: '#f3f4f6' },
    cloudAccRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 12 },
    cloudAccEmail: { fontSize: 14, fontWeight: '600', color: '#111' },
    cloudAccMeta: { fontSize: 11, color: '#6b7280' },
    autoSyncRow: { flexDirection: 'row', alignItems: 'center', paddingTop: 12, borderTopWidth: 1, borderTopColor: '#f3f4f6' },
    autoSyncTitle: { fontSize: 13, fontWeight: '600', color: '#111' },
    autoSyncDesc: { fontSize: 11, color: '#9ca3af' },
    cloudActions: { gap: 10 },
    connectCloudBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', padding: 14, borderRadius: 12, gap: 10 },
    connectCloudBtnText: { color: 'white', fontWeight: '700', fontSize: 14 },
    divider: { height: 1, backgroundColor: '#f3f4f6' },
    subLabel: { fontSize: 14, fontWeight: '600', color: '#6b7280' },
});
