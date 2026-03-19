import React, { useState, useEffect, useMemo } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, Alert, ScrollView, Image, ActivityIndicator, Switch, Linking } from 'react-native';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';
import { Ionicons } from '@expo/vector-icons';
import { useUpdateProfile, useCalendarAccounts, useUpdateCalendarAccount, useDisconnectCalendarAccount } from '../api/queries';
import * as ImagePicker from 'expo-image-picker';
import { uploadToSupabase } from '../lib/upload';
import * as Calendar from 'expo-calendar';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { API_URL } from '../api/client';
import { useIsFocused } from '@react-navigation/native';
import * as LocalAuthentication from 'expo-local-authentication';
import { useAppTheme } from '../theme/ThemeContext';

export default function ProfileScreen() {
    const { theme } = useAppTheme();
    const styles = useMemo(() => createStyles(theme), [theme]);
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

    // Privacy States
    const [hasBiometricHw, setHasBiometricHw] = useState(false);
    const [biometricEnabled, setBiometricEnabled] = useState(false);
    const [readReceiptsEnabled, setReadReceiptsEnabled] = useState(true);
    const [lastSeenEnabled, setLastSeenEnabled] = useState(true);

    // Phase 28: Focus Mode State  
    const [focusActive, setFocusActive] = useState(false);
    const [focusRemainingLabel, setFocusRemainingLabel] = useState('');

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

        // Check Biometrics
        LocalAuthentication.hasHardwareAsync().then(hasHw => setHasBiometricHw(hasHw));
        AsyncStorage.getItem('ping_biometric_lock').then(val => {
            if (val === 'true') setBiometricEnabled(true);
        });

        // Load Privacy Prefs from profiles
        if (user?.id) {
            supabase.from('profiles').select('privacy_read_receipts, privacy_last_seen').eq('id', user.id).single().then(({ data }) => {
                if (data) {
                    setReadReceiptsEnabled(data.privacy_read_receipts ?? true);
                    setLastSeenEnabled(data.privacy_last_seen ?? true);
                }
            });
        }

        // Load Focus Mode state
        AsyncStorage.getItem('ping_focus_until').then(val => {
            if (val) {
                const until = new Date(val);
                const remaining = until.getTime() - Date.now();
                if (remaining > 0) {
                    setFocusActive(true);
                    const mins = Math.ceil(remaining / 60000);
                    setFocusRemainingLabel(mins >= 60 ? `${Math.floor(mins / 60)}h ${mins % 60}min` : `${mins}min`);
                } else {
                    AsyncStorage.removeItem('ping_focus_until');
                }
            }
        });
    }, [user, isFocused, refetchAccounts]);

    const handleToggleBiometric = async (value: boolean) => {
        if (value) {
            // Verify identity before enabling
            const result = await LocalAuthentication.authenticateAsync({
                promptMessage: 'Autentícate para habilitar el Bloqueo',
                cancelLabel: 'Cancelar',
                disableDeviceFallback: false,
            });
            if (!result.success) return; // Discard toggle if user cancels
        }

        setBiometricEnabled(value);
        await AsyncStorage.setItem('ping_biometric_lock', value ? 'true' : 'false');
    };

    const handleToggleReadReceipts = async (value: boolean) => {
        setReadReceiptsEnabled(value);
        await supabase.from('profiles').update({ privacy_read_receipts: value }).eq('id', user!.id);
    };

    const handleToggleLastSeen = async (value: boolean) => {
        setLastSeenEnabled(value);
        await supabase.from('profiles').update({ privacy_last_seen: value }).eq('id', user!.id);
    };

    const handleActivateFocus = async (minutes: number) => {
        const until = new Date(Date.now() + minutes * 60000);
        await AsyncStorage.setItem('ping_focus_until', until.toISOString());
        setFocusActive(true);
        const label = minutes >= 60 ? `${Math.floor(minutes / 60)}h ${minutes % 60}min` : `${minutes}min`;
        setFocusRemainingLabel(label);
    };

    const handleCancelFocus = async () => {
        await AsyncStorage.removeItem('ping_focus_until');
        setFocusActive(false);
        setFocusRemainingLabel('');
    };;

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
                    <Ionicons name="calendar-outline" size={20} color={theme.colors.text.muted} />
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
                                        <Ionicons name="trash-outline" size={18} color={theme.colors.danger} />
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
                                        trackColor={{ false: theme.colors.separator, true: theme.colors.accent }}
                                        thumbColor={theme.colors.white}
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
                        <Ionicons name="refresh" size={18} color={theme.colors.accent} />
                    </TouchableOpacity>
                </View>

                {loadingCals ? (
                    <ActivityIndicator size="small" color={theme.colors.accent} />
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
                                    color={isVisible ? theme.colors.success : theme.colors.text.muted}
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

            {/* Privacy Section */}
            <View style={styles.section}>
                <View style={styles.sectionHeader}>
                    <Text style={styles.label}>Privacidad y Seguridad</Text>
                    <Ionicons name="shield-checkmark-outline" size={20} color={theme.colors.text.muted} />
                </View>

                {hasBiometricHw ? (
                    <View style={styles.settingsRow}>
                        <View style={{ flex: 1, paddingRight: 12 }}>
                            <Text style={styles.settingsTitle}>Bloqueo de Aplicación</Text>
                            <Text style={styles.settingsDesc}>Requerir FaceID / Huella Dactilar para abrir Ping o retornar desde el fondo.</Text>
                        </View>
                        <Switch
                            value={biometricEnabled}
                            onValueChange={handleToggleBiometric}
                            trackColor={{ false: theme.colors.separator, true: theme.colors.accent }}
                            thumbColor={theme.colors.white}
                        />
                    </View>
                ) : (
                    <Text style={styles.hint}>Tu dispositivo no soporta autenticación biométrica.</Text>
                )}

                <View style={[styles.divider, { marginVertical: 16 }]} />

                <View style={styles.settingsRow}>
                    <View style={{ flex: 1, paddingRight: 12 }}>
                        <Text style={styles.settingsTitle}>Confirmaciones de Lectura</Text>
                        <Text style={styles.settingsDesc}>Cuando está activo, los demás verán palomitas azules al leer tus mensajes.</Text>
                    </View>
                    <Switch
                        value={readReceiptsEnabled}
                        onValueChange={handleToggleReadReceipts}
                        trackColor={{ false: theme.colors.separator, true: theme.colors.accent }}
                        thumbColor={theme.colors.white}
                    />
                </View>

                <View style={[styles.divider, { marginVertical: 16 }]} />

                <View style={styles.settingsRow}>
                    <View style={{ flex: 1, paddingRight: 12 }}>
                        <Text style={styles.settingsTitle}>Última Vez en Línea</Text>
                        <Text style={styles.settingsDesc}>Cuando está activo, los demás pueden ver cuándo fue tu última conexión.</Text>
                    </View>
                    <Switch
                        value={lastSeenEnabled}
                        onValueChange={handleToggleLastSeen}
                        trackColor={{ false: theme.colors.separator, true: theme.colors.success }}
                        thumbColor={theme.colors.white}
                    />
                </View>
            </View>

            {/* Phase 28: Focus Mode Section */}
            <View style={styles.section}>
                <View style={styles.sectionHeader}>
                    <Text style={styles.label}>🎯 Modo Foco</Text>
                    <Ionicons name="timer-outline" size={20} color={theme.colors.text.muted} />
                </View>

                {focusActive ? (
                    <View>
                        <View style={styles.focusActiveBadge}>
                            <Ionicons name="timer" size={18} color={theme.colors.warning} />
                            <Text style={styles.focusActiveText}>Activo — {focusRemainingLabel} restante(s)</Text>
                        </View>
                        <Text style={styles.hint}>Las notificaciones no críticas están silenciadas.</Text>
                        <TouchableOpacity style={styles.cancelFocusBtn} onPress={handleCancelFocus}>
                            <Text style={styles.cancelFocusBtnText}>Cancelar Modo Foco</Text>
                        </TouchableOpacity>
                    </View>
                ) : (
                    <View>
                        <Text style={styles.hint}>Silencia notificaciones no críticas durante un tiempo determinado.</Text>
                        <View style={styles.focusOptions}>
                            {[15, 30, 60, 120].map(mins => (
                                <TouchableOpacity
                                    key={mins}
                                    style={styles.focusChip}
                                    onPress={() => handleActivateFocus(mins)}
                                >
                                    <Text style={styles.focusChipText}>
                                        {mins < 60 ? `${mins}min` : `${mins / 60}h`}
                                    </Text>
                                </TouchableOpacity>
                            ))}
                        </View>
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

const createStyles = (theme: any) => StyleSheet.create({
    container: { flex: 1, backgroundColor: theme.colors.background },
    content: { padding: 20, paddingTop: 40 },
    heading: { fontSize: 24, fontWeight: '800', marginBottom: 20, color: theme.colors.text.primary },
    avatarWrap: { alignItems: 'center', marginBottom: 32 },
    avatarContainer: { width: 92, height: 92, borderRadius: 46, marginBottom: 12, position: 'relative' },
    avatarImage: { width: 92, height: 92, borderRadius: 46 },
    avatarPlaceholder: { width: 92, height: 92, borderRadius: 46, backgroundColor: theme.colors.accent, alignItems: 'center', justifyContent: 'center' },
    avatarText: { color: 'white', fontSize: 32, fontWeight: '700' },
    cameraBadge: { position: 'absolute', bottom: 0, right: 0, backgroundColor: theme.colors.primary, width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center', borderWidth: 3, borderColor: theme.colors.background },
    email: { fontSize: 16, color: theme.colors.text.secondary },
    section: { backgroundColor: theme.colors.surface, borderRadius: 16, padding: 18, marginBottom: 16, borderWidth: 1, borderColor: theme.colors.separator },
    sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
    label: { fontSize: 18, fontWeight: '700', color: theme.colors.text.primary },
    editLink: { color: theme.colors.accent, fontWeight: '600', fontSize: 15 },
    fieldLabel: { fontSize: 13, fontWeight: '600', color: theme.colors.text.muted, marginBottom: 4 },
    valueText: { fontSize: 16, color: theme.colors.text.primary, marginBottom: 4 },
    hint: { fontSize: 13, color: theme.colors.text.muted, marginBottom: 12 },
    input: { borderWidth: 1.5, borderColor: theme.colors.separator, padding: 14, borderRadius: 12, fontSize: 15, backgroundColor: theme.colors.surfaceMuted, marginBottom: 4, color: theme.colors.text.primary },
    saveBtn: { backgroundColor: theme.colors.primary, padding: 14, borderRadius: 12, alignItems: 'center' },
    saveBtnText: { color: 'white', fontWeight: '700', fontSize: 15 },
    cancelBtn: { backgroundColor: theme.colors.surfaceMuted, padding: 14, borderRadius: 12, alignItems: 'center' },
    cancelBtnText: { color: theme.colors.text.secondary, fontWeight: '700', fontSize: 15 },
    editActions: { flexDirection: 'row', marginTop: 20 },
    logoutBtn: { backgroundColor: theme.colors.surface, borderRadius: 16, padding: 16, alignItems: 'center', borderWidth: 1, borderColor: '#fee2e2' },
    logoutText: { color: theme.colors.danger, fontWeight: '700', fontSize: 16 },
    calRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 12, paddingVertical: 4 },
    calDot: { width: 10, height: 10, borderRadius: 5, marginRight: 10 },
    calTitle: { fontSize: 15, fontWeight: '600', color: theme.colors.text.primary },
    calSource: { fontSize: 12, color: theme.colors.text.secondary },
    permissionBtn: { backgroundColor: theme.colors.surfaceMuted, padding: 12, borderRadius: 12, alignItems: 'center' },
    permissionBtnText: { color: theme.colors.accent, fontWeight: '700' },
    connectMainBtnText: { color: 'white', fontWeight: '700', fontSize: 14 },
    cloudAccountsList: { marginBottom: 20 },
    cloudAccCard: { backgroundColor: theme.colors.surfaceMuted, borderRadius: 12, padding: 12, marginBottom: 12, borderWidth: 1, borderColor: theme.colors.separator },
    cloudAccRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 12 },
    cloudAccEmail: { fontSize: 14, fontWeight: '600', color: theme.colors.text.primary },
    cloudAccMeta: { fontSize: 11, color: theme.colors.text.secondary },
    autoSyncRow: { flexDirection: 'row', alignItems: 'center', paddingTop: 12, borderTopWidth: 1, borderTopColor: theme.colors.separator },
    autoSyncTitle: { fontSize: 13, fontWeight: '600', color: theme.colors.text.primary },
    autoSyncDesc: { fontSize: 11, color: theme.colors.text.muted },
    cloudActions: { gap: 10 },
    connectCloudBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', padding: 14, borderRadius: 12, gap: 10 },
    connectCloudBtnText: { color: 'white', fontWeight: '700', fontSize: 14 },
    divider: { height: 1, backgroundColor: theme.colors.separator },
    subLabel: { fontSize: 14, fontWeight: '600', color: theme.colors.text.secondary },
    settingsRow: { flexDirection: 'row', alignItems: 'center', marginVertical: 8 },
    settingsTitle: { fontSize: 15, fontWeight: '600', color: theme.colors.text.primary, marginBottom: 2 },
    settingsDesc: { fontSize: 12, color: theme.colors.text.secondary },
    focusActiveBadge: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: theme.colors.highlight, borderRadius: 10, padding: 10, marginBottom: 8 },
    focusActiveText: { color: theme.colors.highlightText, fontWeight: '600', fontSize: 14 },
    cancelFocusBtn: { backgroundColor: '#fee2e2', padding: 12, borderRadius: 12, alignItems: 'center', marginTop: 8 },
    cancelFocusBtnText: { color: theme.colors.danger, fontWeight: '700', fontSize: 14 },
    focusOptions: { flexDirection: 'row', gap: 10, flexWrap: 'wrap', marginTop: 8 },
    focusChip: { backgroundColor: theme.colors.surfaceMuted, borderRadius: 20, paddingHorizontal: 18, paddingVertical: 10, borderWidth: 1, borderColor: theme.colors.separator },
    focusChipText: { fontWeight: '700', color: theme.colors.text.secondary, fontSize: 14 },
});
