import React, { useState, useEffect, useMemo } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Alert, ScrollView, Image, Switch } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';
import { Ionicons } from '@expo/vector-icons';
import { useUpdateProfile, useCalendarAccounts } from '../api/queries';
import { resolvePrivateFileUrl } from '../lib/privateFiles';
import * as Calendar from 'expo-calendar';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useIsFocused } from '@react-navigation/native';
import * as LocalAuthentication from 'expo-local-authentication';
import Constants from 'expo-constants';
import { useAppTheme } from '../theme/ThemeContext';

import { EditProfileSheet } from '../components/perfil/EditProfileSheet';
import { CalendarsSheet } from '../components/perfil/CalendarsSheet';
import { FocusModeSheet } from '../components/perfil/FocusModeSheet';

export default function ProfileScreen() {
    const { theme } = useAppTheme();
    const styles = useMemo(() => createStyles(theme), [theme]);
    const insets = useSafeAreaInsets();
    const { user, refreshProfile } = useAuth();
    const [phone, setPhone] = useState('');
    const [fullName, setFullName] = useState('');
    const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
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

    // Focus Mode State (kept from original implementation)
    const [focusActive, setFocusActive] = useState(false);
    const [focusRemainingLabel, setFocusRemainingLabel] = useState('');

    // Sheets State
    const [editProfileVisible, setEditProfileVisible] = useState(false);
    const [calendarsVisible, setCalendarsVisible] = useState(false);
    const [focusModeVisible, setFocusModeVisible] = useState(false);

    // Cloud Accounts
    const { data: cloudAccounts = [], refetch: refetchAccounts } = useCalendarAccounts();

    useEffect(() => {
        if (!user) return;
        supabase
            .from('profiles')
            .select('phone, full_name, avatar_url, avatar_bucket, avatar_object_path')
            .eq('id', user.id)
            .single()
            .then(({ data }) => {
                if (data?.phone) setPhone(data.phone);
                if (data?.full_name) setFullName(data.full_name);
                if (data?.avatar_bucket && data?.avatar_object_path) {
                    resolvePrivateFileUrl('profile', user.id)
                        .then(({ signedUrl }) => setAvatarUrl(signedUrl))
                        .catch(() => setAvatarUrl(null));
                } else if (data?.avatar_url) {
                    setAvatarUrl(data.avatar_url);
                } else {
                    setAvatarUrl(null);
                }
            });

        checkCalendars();
        loadHiddenCalendars();
        refetchAccounts();

        LocalAuthentication.hasHardwareAsync().then(hasHw => setHasBiometricHw(hasHw));
        AsyncStorage.getItem('ping_biometric_lock').then(val => {
            if (val === 'true') setBiometricEnabled(true);
        });

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
                    setFocusActive(false);
                    setFocusRemainingLabel('');
                }
            } else {
                setFocusActive(false);
                setFocusRemainingLabel('');
            }
        });
    }, [user, isFocused, refetchAccounts]);

    const handleToggleBiometric = async (value: boolean) => {
        if (value) {
            const result = await LocalAuthentication.authenticateAsync({
                promptMessage: 'Autentícate para habilitar el Bloqueo',
                cancelLabel: 'Cancelar',
                disableDeviceFallback: false,
            });
            if (!result.success) return;
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
        const label = minutes >= 60 ? `${Math.floor(minutes / 60)}h ${minutes % 60 > 0 ? `${minutes % 60}min` : ''}` : `${minutes}min`;
        setFocusRemainingLabel(label.trim());
    };

    const handleCancelFocus = async () => {
        await AsyncStorage.removeItem('ping_focus_until');
        setFocusActive(false);
        setFocusRemainingLabel('');
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

    const handleLogout = () => {
        Alert.alert('Cerrar sesión', '¿Estás seguro?', [
            { text: 'Cancelar', style: 'cancel' },
            { text: 'Salir', style: 'destructive', onPress: () => supabase.auth.signOut() },
        ]);
    };

    const handleSaveProfile = async (newFullName: string, newPhone: string) => {
        if (!user) return;
        await updateProfile({ full_name: newFullName, phone: newPhone });
        setFullName(newFullName);
        setPhone(newPhone);
        await refreshProfile();
    };

    const handleSaveAvatar = async (signedUrl: string) => {
        setAvatarUrl(signedUrl);
        await refreshProfile();
    };

    const cloudStatus = cloudAccounts.length > 0
        ? `${cloudAccounts.length} cuenta${cloudAccounts.length > 1 ? 's' : ''}`
        : 'Sin cuentas conectadas';

    const localCalsCount = calendars.length > 0 ? calendars.length - hiddenCalendars.length : 0;
    const calsStatus = localCalsCount > 0 ? ` + ${localCalsCount} cal${localCalsCount > 1 ? 's' : ''}` : '';
    const integrationsSub = `${cloudStatus}${calsStatus}`;

    const focusStatusLabel = focusActive
        ? (focusRemainingLabel ? focusRemainingLabel : 'Activo')
        : 'Desactivado';

    const initialLetter = fullName?.[0]?.toUpperCase() || user?.email?.[0]?.toUpperCase() || '?';
    const appVersion = Constants.expoConfig?.version || '1.0.0';

    // Top padding: use safe area top so content never hides under status bar / Dynamic Island
    const contentPaddingTop = Math.max(insets.top, 16) + 12;

    return (
        <ScrollView
            style={styles.container}
            contentContainerStyle={[
                styles.content,
                {
                    paddingTop: contentPaddingTop,
                    paddingBottom: Math.max(insets.bottom, 20) + 20,
                },
            ]}
        >
            {/* HEADER / IDENTITY */}
            <View style={styles.headerBlock}>
                <View style={styles.headerLeft}>
                    <View style={[styles.avatarWrapper, { backgroundColor: theme.colors.accent }]}>
                        {avatarUrl ? (
                            <Image source={{ uri: avatarUrl }} style={styles.avatarImage} />
                        ) : (
                            <Text style={styles.avatarText}>{initialLetter}</Text>
                        )}
                    </View>
                    <View style={styles.headerInfo}>
                        <Text
                            style={[styles.headerName, { color: theme.colors.text.primary }]}
                            numberOfLines={1}
                            ellipsizeMode="tail"
                        >
                            {fullName || 'Sin nombre'}
                        </Text>
                        <Text
                            style={[styles.headerEmail, { color: theme.colors.text.secondary }]}
                            numberOfLines={1}
                            ellipsizeMode="tail"
                        >
                            {user?.email}
                        </Text>
                    </View>
                </View>
                <TouchableOpacity
                    style={[styles.editBtn, { backgroundColor: theme.colors.surfaceMuted }]}
                    onPress={() => setEditProfileVisible(true)}
                    accessibilityLabel="Editar perfil"
                >
                    <Text style={[styles.editBtnText, { color: theme.colors.text.primary }]}>Editar</Text>
                </TouchableOpacity>
            </View>

            {/* INTEGRATIONS */}
            <Text style={[styles.sectionTitle, { color: theme.colors.text.muted }]}>INTEGRACIONES Y CALENDARIO</Text>
            <View style={[styles.card, { backgroundColor: theme.colors.surface, borderColor: theme.colors.separator }]}>
                <TouchableOpacity style={styles.row} onPress={() => setCalendarsVisible(true)} accessibilityLabel="Cuentas y calendarios">
                    <View style={[styles.iconBox, { backgroundColor: theme.colors.surfaceMuted }]}>
                        <Ionicons name="calendar-outline" size={20} color={theme.colors.accent} />
                    </View>
                    <View style={styles.rowBody}>
                        <Text style={[styles.rowTitle, { color: theme.colors.text.primary }]}>Cuentas y calendarios</Text>
                        <Text style={[styles.rowSubtitle, { color: theme.colors.text.secondary }]}>{integrationsSub}</Text>
                    </View>
                    <Ionicons name="chevron-forward" size={18} color={theme.colors.text.muted} />
                </TouchableOpacity>
            </View>

            {/* PRIVACY & SECURITY */}
            <Text style={[styles.sectionTitle, { color: theme.colors.text.muted, marginTop: 24 }]}>PRIVACIDAD Y SEGURIDAD</Text>
            <View style={[styles.card, { backgroundColor: theme.colors.surface, borderColor: theme.colors.separator }]}>
                {hasBiometricHw && (
                    <View style={[styles.row, { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: theme.colors.separator }]}>
                        <View style={[styles.iconBox, { backgroundColor: theme.colors.surfaceMuted }]}>
                            <Ionicons name="finger-print-outline" size={20} color={theme.colors.text.primary} />
                        </View>
                        <View style={styles.rowBody}>
                            <Text style={[styles.rowTitle, { color: theme.colors.text.primary }]}>Bloqueo de Aplicación</Text>
                        </View>
                        <Switch
                            value={biometricEnabled}
                            onValueChange={handleToggleBiometric}
                            trackColor={{ false: theme.colors.separator, true: theme.colors.accent }}
                            thumbColor={theme.colors.white}
                        />
                    </View>
                )}

                <View style={[styles.row, { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: theme.colors.separator }]}>
                    <View style={[styles.iconBox, { backgroundColor: theme.colors.surfaceMuted }]}>
                        <Ionicons name="checkmark-done-outline" size={20} color={theme.colors.text.primary} />
                    </View>
                    <View style={styles.rowBody}>
                        <Text style={[styles.rowTitle, { color: theme.colors.text.primary }]}>Confirmaciones de Lectura</Text>
                    </View>
                    <Switch
                        value={readReceiptsEnabled}
                        onValueChange={handleToggleReadReceipts}
                        trackColor={{ false: theme.colors.separator, true: theme.colors.accent }}
                        thumbColor={theme.colors.white}
                    />
                </View>

                <View style={styles.row}>
                    <View style={[styles.iconBox, { backgroundColor: theme.colors.surfaceMuted }]}>
                        <Ionicons name="time-outline" size={20} color={theme.colors.text.primary} />
                    </View>
                    <View style={styles.rowBody}>
                        <Text style={[styles.rowTitle, { color: theme.colors.text.primary }]}>Última Vez en Línea</Text>
                    </View>
                    <Switch
                        value={lastSeenEnabled}
                        onValueChange={handleToggleLastSeen}
                        trackColor={{ false: theme.colors.separator, true: theme.colors.success }}
                        thumbColor={theme.colors.white}
                    />
                </View>
            </View>

            {/* PREFERENCES */}
            <Text style={[styles.sectionTitle, { color: theme.colors.text.muted, marginTop: 24 }]}>PREFERENCIAS</Text>
            <View style={[styles.card, { backgroundColor: theme.colors.surface, borderColor: theme.colors.separator }]}>
                <TouchableOpacity
                    style={styles.row}
                    onPress={() => setFocusModeVisible(true)}
                    accessibilityLabel="Modo foco"
                >
                    <View style={[styles.iconBox, { backgroundColor: theme.colors.surfaceMuted }]}>
                        <Ionicons name="moon-outline" size={20} color={focusActive ? theme.colors.accent : theme.colors.text.primary} />
                    </View>
                    <View style={styles.rowBody}>
                        <Text style={[styles.rowTitle, { color: theme.colors.text.primary }]}>Modo foco</Text>
                    </View>
                    <Text style={[
                        styles.rowStatus,
                        { color: focusActive ? theme.colors.accent : theme.colors.text.muted },
                    ]}>
                        {focusStatusLabel}
                    </Text>
                    <Ionicons name="chevron-forward" size={18} color={theme.colors.text.muted} style={{ marginLeft: 4 }} />
                </TouchableOpacity>
            </View>

            {/* LOGOUT */}
            <View style={{ marginTop: 36 }}>
                <TouchableOpacity
                    style={[styles.logoutBtn, { backgroundColor: theme.colors.surface, borderColor: theme.colors.danger }]}
                    onPress={handleLogout}
                    accessibilityLabel="Cerrar sesión"
                >
                    <Text style={[styles.logoutText, { color: theme.colors.danger }]}>Cerrar sesión</Text>
                </TouchableOpacity>
                <Text style={[styles.versionText, { color: theme.colors.text.muted }]}>Ping v{appVersion}</Text>
            </View>

            {/* SHEETS */}
            <EditProfileSheet
                visible={editProfileVisible}
                onClose={() => setEditProfileVisible(false)}
                user={user}
                initialFullName={fullName}
                initialPhone={phone}
                initialAvatarUrl={avatarUrl}
                onSaveProfile={handleSaveProfile}
                onSaveAvatar={handleSaveAvatar}
            />

            <CalendarsSheet
                visible={calendarsVisible}
                onClose={() => setCalendarsVisible(false)}
                cloudAccounts={cloudAccounts}
                calendars={calendars}
                hiddenCalendars={hiddenCalendars}
                loadingCals={loadingCals}
                onRefreshCalendars={checkCalendars}
                onToggleCalendarVisibility={toggleCalendarVisibility}
            />

            <FocusModeSheet
                visible={focusModeVisible}
                onClose={() => setFocusModeVisible(false)}
                focusActive={focusActive}
                focusRemainingLabel={focusRemainingLabel}
                onActivateFocus={handleActivateFocus}
                onCancelFocus={handleCancelFocus}
            />
        </ScrollView>
    );
}

const createStyles = (theme: any) => StyleSheet.create({
    container: { flex: 1, backgroundColor: theme.colors.background },
    content: { paddingHorizontal: 16 },

    headerBlock: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: 32,
    },
    headerLeft: {
        flexDirection: 'row',
        alignItems: 'center',
        flex: 1,
        minWidth: 0, // needed for flex truncation
    },
    avatarWrapper: {
        width: 58,
        height: 58,
        borderRadius: 29,
        alignItems: 'center',
        justifyContent: 'center',
        marginRight: 14,
        flexShrink: 0,
        overflow: 'hidden',
    },
    avatarImage: {
        width: 58,
        height: 58,
        borderRadius: 29,
    },
    avatarText: {
        color: 'white',
        fontSize: 22,
        fontWeight: '700',
    },
    headerInfo: {
        flex: 1,
        minWidth: 0,
        paddingRight: 8,
    },
    headerName: {
        fontSize: 17,
        fontWeight: '700',
        marginBottom: 2,
    },
    headerEmail: {
        fontSize: 13,
    },
    editBtn: {
        paddingHorizontal: 12,
        paddingVertical: 7,
        borderRadius: 16,
        flexShrink: 0,
    },
    editBtnText: {
        fontSize: 13,
        fontWeight: '600',
    },

    sectionTitle: {
        fontSize: 12,
        fontWeight: '700',
        marginBottom: 8,
        marginLeft: 12,
        textTransform: 'uppercase',
        letterSpacing: 0.5,
    },
    card: {
        borderRadius: 14,
        borderWidth: StyleSheet.hairlineWidth,
        overflow: 'hidden',
    },
    row: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 16,
        paddingVertical: 13,
    },
    iconBox: {
        width: 32,
        height: 32,
        borderRadius: 8,
        alignItems: 'center',
        justifyContent: 'center',
        marginRight: 12,
    },
    rowBody: {
        flex: 1,
    },
    rowTitle: {
        fontSize: 15,
        fontWeight: '500',
    },
    rowSubtitle: {
        fontSize: 13,
        marginTop: 2,
    },
    rowStatus: {
        fontSize: 13,
        fontWeight: '500',
    },

    logoutBtn: {
        paddingVertical: 11,
        borderRadius: 12,
        alignItems: 'center',
        borderWidth: 1,
        marginBottom: 16,
    },
    logoutText: {
        fontSize: 15,
        fontWeight: '600',
    },
    versionText: {
        textAlign: 'center',
        fontSize: 12,
    },
});
