import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Alert, ScrollView, Switch } from 'react-native';
import { CachedImage } from '../design/CachedImage';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';
import { Ionicons } from '@expo/vector-icons';
import { useUpdateProfile, useCalendarAccounts } from '../api/queries';
import { resolvePrivateFileUrl } from '../lib/privateFiles';
// SDK 57: la API funcional clásica (getCalendarsAsync/EntityTypes/Calendar
// type) se movió al subpath /legacy -- el import raíz ahora expone la
// "Next API" basada en clases. Sin cambio de comportamiento, sólo de ruta.
import * as Calendar from 'expo-calendar/legacy';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useIsFocused } from '@react-navigation/native';
import * as LocalAuthentication from 'expo-local-authentication';
import Constants from 'expo-constants';
import { LinearGradient } from 'expo-linear-gradient';
import Reanimated, { FadeInDown } from 'react-native-reanimated';

import { EditProfileSheet } from '../components/perfil/EditProfileSheet';
import { CalendarsSheet } from '../components/perfil/CalendarsSheet';
import { FocusModeSheet } from '../components/perfil/FocusModeSheet';
import { MemorySheet } from '../components/perfil/MemorySheet';
import { FeedbackSheet } from '../components/perfil/FeedbackSheet';
import { BlockedPeopleSheet } from '../components/perfil/BlockedPeopleSheet';
import { DeleteAccountSheet } from '../components/perfil/DeleteAccountSheet';
import { openLegal } from '../utils/legalLinks';
import { exportMyData } from '../utils/exportMyData';
import { TAB_BAR_CLEARANCE } from '../design/FloatingTabBar';
import { colors, gradients, radius, space } from '../design/tokens';
import { fonts, type } from '../design/typography';
import { Glass } from '../design/Glass';

export default function ProfileScreen() {
    const insets = useSafeAreaInsets();
    const { user, refreshProfile } = useAuth();
    const [phone, setPhone] = useState('');
    const [fullName, setFullName] = useState('');
    const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
    const [coverUrl, setCoverUrl] = useState<string | null>(null);
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

    // Notices Ping sends on its own
    const [dailySummaryEnabled, setDailySummaryEnabled] = useState(true);
    const [summaryHour, setSummaryHour] = useState(8);
    const [overdueNoticesEnabled, setOverdueNoticesEnabled] = useState(true);
    const [privacyOpen, setPrivacyOpen] = useState(false);
    const [feedbackVisible, setFeedbackVisible] = useState(false);
    const [blockedVisible, setBlockedVisible] = useState(false);
    const [deleteAccountVisible, setDeleteAccountVisible] = useState(false);
    const [exportingData, setExportingData] = useState(false);

    const handleExportData = async () => {
        if (exportingData) return;
        setExportingData(true);
        try {
            await exportMyData();
        } catch {
            Alert.alert('No se pudo preparar', 'Inténtalo de nuevo en un momento.');
        } finally {
            setExportingData(false);
        }
    };
    const [noticesOpen, setNoticesOpen] = useState(false);

    // Focus Mode State (kept from original implementation)
    const [focusActive, setFocusActive] = useState(false);
    const [focusRemainingLabel, setFocusRemainingLabel] = useState('');

    // Sheets State
    const [editProfileVisible, setEditProfileVisible] = useState(false);
    const [calendarsVisible, setCalendarsVisible] = useState(false);
    const [focusModeVisible, setFocusModeVisible] = useState(false);
    const [memoryVisible, setMemoryVisible] = useState(false);

    // Cloud Accounts
    const { data: cloudAccounts = [], refetch: refetchAccounts } = useCalendarAccounts();

    const loadHiddenCalendars = useCallback(async () => {
        const stored = await AsyncStorage.getItem('ping_hidden_calendars');
        if (stored) setHiddenCalendars(JSON.parse(stored));
    }, []);

    const checkCalendars = useCallback(async () => {
        const { status } = await Calendar.getCalendarPermissionsAsync();
        if (status !== 'granted') return;
        setLoadingCals(true);
        try {
            const all = await Calendar.getCalendarsAsync(Calendar.EntityTypes.EVENT);
            setCalendars(all.filter(c => c.allowsModifications));
        } catch (e) {
            console.error(e);
        } finally {
            setLoadingCals(false);
        }
    }, []);

    useEffect(() => {
        if (!user) return;
        supabase
            .from('profiles')
            .select('phone, full_name, avatar_url, avatar_bucket, avatar_object_path, cover_object_path')
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
                if (data?.cover_object_path) {
                    resolvePrivateFileUrl('profile_cover', user.id)
                        .then(({ signedUrl }) => setCoverUrl(signedUrl))
                        .catch(() => setCoverUrl(null));
                }
            });

        const initialCalendarLoad = setTimeout(() => {
            void checkCalendars();
            void loadHiddenCalendars();
            void refetchAccounts();
        }, 0);

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
            supabase.from('profiles').select('assistant_daily_summary, assistant_summary_hour, assistant_overdue_notices').eq('id', user.id).single().then(({ data }) => {
                if (data) {
                    setDailySummaryEnabled(data.assistant_daily_summary ?? true);
                    setSummaryHour(data.assistant_summary_hour ?? 8);
                    setOverdueNoticesEnabled(data.assistant_overdue_notices ?? true);
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

        return () => clearTimeout(initialCalendarLoad);
    }, [user, isFocused, refetchAccounts, checkCalendars, loadHiddenCalendars]);

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

    const handleToggleDailySummary = async (value: boolean) => {
        setDailySummaryEnabled(value);
        await supabase.from('profiles').update({ assistant_daily_summary: value }).eq('id', user!.id);
    };

    const handleSelectSummaryHour = async (hour: number) => {
        setSummaryHour(hour);
        await supabase.from('profiles').update({ assistant_summary_hour: hour }).eq('id', user!.id);
    };

    const handleToggleOverdueNotices = async (value: boolean) => {
        setOverdueNoticesEnabled(value);
        await supabase.from('profiles').update({ assistant_overdue_notices: value }).eq('id', user!.id);
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

    const toggleCalendarVisibility = async (id: string) => {
        const updated = hiddenCalendars.includes(id)
            ? hiddenCalendars.filter(cid => cid !== id)
            : [...hiddenCalendars, id];
        setHiddenCalendars(updated);
        await AsyncStorage.setItem('ping_hidden_calendars', JSON.stringify(updated));
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
            contentContainerStyle={{
                paddingTop: contentPaddingTop,
                paddingBottom: Math.max(insets.bottom, 12) + TAB_BAR_CLEARANCE,
            }}
        >
            <View style={styles.header}>
                <Text style={type.overline}>TU CUENTA</Text>
                <Text style={styles.headerTitle}>Perfil</Text>
            </View>

            {/* IDENTITY */}
            <Reanimated.View entering={FadeInDown.duration(380)} style={styles.heroWrap}>
                <Glass style={styles.hero} intensity={30} tint={colors.glassTintLight}>
                    {/* The cover sits behind, dimmed toward the bottom so the name stays readable. */}
                    {!!coverUrl && (
                        <>
                            <CachedImage uri={coverUrl} style={styles.cover} />
                            <LinearGradient
                                pointerEvents="none"
                                colors={gradients.coverShade}
                                style={styles.cover}
                            />
                        </>
                    )}
                    <View style={styles.avatarRing}>
                        <LinearGradient colors={gradients.accent} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.avatar}>
                            {avatarUrl ? (
                                <CachedImage uri={avatarUrl} style={styles.avatarImage} />
                            ) : (
                                <Text style={styles.avatarText}>{initialLetter}</Text>
                            )}
                        </LinearGradient>
                    </View>
                    <Text style={styles.heroName} numberOfLines={1} ellipsizeMode="tail">
                        {fullName || 'Sin nombre'}
                    </Text>
                    <Text style={styles.heroEmail} numberOfLines={1} ellipsizeMode="tail">
                        {user?.email}
                    </Text>
                    {!!phone && <Text style={styles.heroPhone}>{phone}</Text>}
                    <TouchableOpacity
                        style={styles.editBtn}
                        onPress={() => setEditProfileVisible(true)}
                        accessibilityLabel="Editar perfil"
                        activeOpacity={0.85}
                    >
                        <LinearGradient colors={gradients.accent} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />
                        <Ionicons name="create-outline" size={16} color={colors.onAccent} />
                        <Text style={styles.editBtnText}>Editar perfil</Text>
                    </TouchableOpacity>
                </Glass>
            </Reanimated.View>

            {/* SETTINGS: one grouped card, like a phone's settings menu. */}
            {/* Privacidad and Avisos start closed with a one-line summary. */}
            <Section order={1}>
                <Row icon="calendar-outline" title="Cuentas y calendarios" subtitle={integrationsSub} onPress={() => setCalendarsVisible(true)} />
                <Row
                    divider
                    icon="shield-checkmark-outline"
                    title="Privacidad"
                    subtitle={privacySummary(hasBiometricHw && biometricEnabled, readReceiptsEnabled, lastSeenEnabled)}
                    onPress={() => setPrivacyOpen((open) => !open)}
                    expanded={privacyOpen}
                />
                {privacyOpen && (<>
                {hasBiometricHw && (
                    <Row icon="finger-print-outline" title="Bloqueo de Aplicación" divider>
                        <Toggle value={biometricEnabled} onValueChange={handleToggleBiometric} />
                    </Row>
                )}
                <Row icon="checkmark-done-outline" title="Confirmaciones de Lectura" divider>
                    <Toggle value={readReceiptsEnabled} onValueChange={handleToggleReadReceipts} />
                </Row>
                <Row icon="time-outline" title="Última Vez en Línea" divider>
                    <Toggle value={lastSeenEnabled} onValueChange={handleToggleLastSeen} />
                </Row>
                </>)}
                <Row
                    divider
                    icon="notifications-outline"
                    title="Avisos de Ping"
                    subtitle={noticesSummary(dailySummaryEnabled, summaryHour, overdueNoticesEnabled)}
                    onPress={() => setNoticesOpen((open) => !open)}
                    expanded={noticesOpen}
                />
                {noticesOpen && (<>
                <Row icon="sunny-outline" title="Resumen de la mañana" divider>
                    <Toggle value={dailySummaryEnabled} onValueChange={handleToggleDailySummary} />
                </Row>
                {dailySummaryEnabled && (
                    <View style={[styles.row, styles.hourRow]}>
                        <Text style={styles.rowSubtitle}>Hora del resumen</Text>
                        <View style={styles.hourChips}>
                            {SUMMARY_HOURS.map((hour) => {
                                const selected = summaryHour === hour;
                                return (
                                    <TouchableOpacity
                                        key={hour}
                                        onPress={() => handleSelectSummaryHour(hour)}
                                        accessibilityLabel={`Resumen a las ${hour}`}
                                        accessibilityState={{ selected }}
                                        style={[styles.hourChip, selected && styles.hourChipActive]}
                                    >
                                        {selected && <LinearGradient colors={gradients.accent} style={StyleSheet.absoluteFill} />}
                                        <Text style={[styles.hourChipText, selected && styles.hourChipTextActive]}>{hour}</Text>
                                    </TouchableOpacity>
                                );
                            })}
                        </View>
                    </View>
                )}
                <Row icon="alarm-outline" title="Avisar si algo se me pasa" divider>
                    <Toggle value={overdueNoticesEnabled} onValueChange={handleToggleOverdueNotices} />
                </Row>
                </>)}
                <Row divider icon="bulb-outline" title="Lo que Ping recuerda" subtitle="Ver u olvidar lo que le contaste" onPress={() => setMemoryVisible(true)} />
                <Row divider icon="moon-outline" title="Modo foco" accessibilityLabel="Modo foco" onPress={() => setFocusModeVisible(true)}>
                    <Text style={[styles.rowStatus, focusActive && styles.rowStatusActive]}>{focusStatusLabel}</Text>
                </Row>
            </Section>

            {/* HELP AND LEGAL */}
            <Section order={2}>
                <Row icon="chatbox-ellipses-outline" title="Comentarios y sugerencias" subtitle="Cuéntanos qué mejorar" onPress={() => setFeedbackVisible(true)} />
                <Row divider icon="hand-left-outline" title="Personas bloqueadas" onPress={() => setBlockedVisible(true)} />
                <Row divider icon="download-outline" title="Descargar mis datos" subtitle={exportingData ? 'Preparando el archivo…' : 'Una copia de lo que guardaste en Ping'} onPress={handleExportData} />
                <Row divider icon="document-lock-outline" title="Política de privacidad" onPress={() => openLegal('privacy')} />
                <Row divider icon="document-text-outline" title="Términos de uso" onPress={() => openLegal('terms')} />
            </Section>

            {/* LOGOUT */}
            <Section order={3}>
                <TouchableOpacity style={[styles.row, styles.logoutRow]} onPress={handleLogout} accessibilityLabel="Cerrar sesión">
                    <Ionicons name="log-out-outline" size={19} color={colors.danger} />
                    <Text style={styles.logoutText}>Cerrar sesión</Text>
                </TouchableOpacity>
            </Section>
            <TouchableOpacity onPress={() => setDeleteAccountVisible(true)} accessibilityLabel="Eliminar mi cuenta" style={styles.deleteAccountLink}>
                <Text style={styles.deleteAccountText}>Eliminar mi cuenta</Text>
            </TouchableOpacity>
            <Text style={styles.versionText}>Ping v{appVersion}</Text>

            {/* SHEETS */}
            <EditProfileSheet
                visible={editProfileVisible}
                onClose={() => setEditProfileVisible(false)}
                user={user}
                initialFullName={fullName}
                initialPhone={phone}
                initialAvatarUrl={avatarUrl}
                initialCoverUrl={coverUrl}
                onSaveProfile={handleSaveProfile}
                onSaveAvatar={handleSaveAvatar}
                onSaveCover={setCoverUrl}
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

            <MemorySheet visible={memoryVisible} onClose={() => setMemoryVisible(false)} />
            <FeedbackSheet visible={feedbackVisible} onClose={() => setFeedbackVisible(false)} />
            <BlockedPeopleSheet visible={blockedVisible} onClose={() => setBlockedVisible(false)} />
            <DeleteAccountSheet visible={deleteAccountVisible} onClose={() => setDeleteAccountVisible(false)} />
        </ScrollView>
    );
}

// Morning summary hours the user can pick (the server accepts 5 to 11).
const SUMMARY_HOURS = [6, 7, 8, 9, 10];

// One group of settings: a label above a full-width glass band.
export function noticesSummary(morning: boolean, hour: number, overdue: boolean): string {
    const parts = [morning ? `Resumen ${hour}:00` : null, overdue ? 'Atrasados' : null].filter(Boolean);
    return parts.length ? parts.join(' · ') : 'Apagados';
}

export function privacySummary(lock: boolean, receipts: boolean, lastSeen: boolean): string {
    const parts = [lock ? 'Bloqueo' : null, receipts ? 'Confirmaciones' : null, lastSeen ? 'Última vez' : null].filter(Boolean);
    return parts.length ? `Visible: ${parts.join(' · ')}` : 'Todo oculto';
}

function Section({ order, children }: { order: number; children: React.ReactNode }) {
    return (
        <Reanimated.View entering={FadeInDown.delay(order * 50).duration(380)} style={styles.section}>
            <View style={styles.card}>
                <Glass style={[StyleSheet.absoluteFill, styles.cardGlass]} intensity={22} tint={colors.glassTintLight} />
                {children}
            </View>
        </Reanimated.View>
    );
}

type RowProps = {
    icon: React.ComponentProps<typeof Ionicons>['name'];
    title: string;
    subtitle?: string;
    divider?: boolean;
    onPress?: () => void;
    accessibilityLabel?: string;
    // Set on a row that opens and closes the rows under it.
    expanded?: boolean;
    children?: React.ReactNode;
};

function Row({ icon, title, subtitle, divider, onPress, accessibilityLabel, expanded, children }: RowProps) {
    const body = (
        <>
            {divider && <View pointerEvents="none" style={styles.divider} />}
            <View style={styles.iconBox}>
                <Ionicons name={icon} size={19} color={colors.accentBright} />
            </View>
            <View style={styles.rowBody}>
                <Text style={styles.rowTitle}>{title}</Text>
                {!!subtitle && <Text style={styles.rowSubtitle}>{subtitle}</Text>}
            </View>
            {children}
            {onPress && (
                <Ionicons
                    name={expanded === undefined ? 'chevron-forward' : expanded ? 'chevron-up' : 'chevron-down'}
                    size={18}
                    color={colors.textFaint}
                    style={styles.chevron}
                />
            )}
        </>
    );
    if (!onPress) return <View style={styles.row}>{body}</View>;
    return (
        <TouchableOpacity
            style={styles.row}
            onPress={onPress}
            accessibilityLabel={accessibilityLabel ?? title}
            accessibilityState={expanded === undefined ? undefined : { expanded }}
        >
            {body}
        </TouchableOpacity>
    );
}

function Toggle({ value, onValueChange }: { value: boolean; onValueChange: (value: boolean) => void }) {
    return (
        <Switch
            value={value}
            onValueChange={onValueChange}
            trackColor={{ false: colors.glassRaised, true: colors.accent }}
            thumbColor={colors.onAccent}
        />
    );
}

const AVATAR = 84;

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: 'transparent' },
    header: { paddingHorizontal: space.xl, paddingBottom: space.lg },
    headerTitle: { ...type.display, marginTop: 2 },

    heroWrap: { paddingHorizontal: space.lg },
    hero: {
        borderRadius: radius.xl,
        borderTopColor: colors.glassEdge,
        alignItems: 'center',
        paddingTop: space.xxl,
        paddingBottom: space.xl,
        paddingHorizontal: space.xl,
    },
    avatarRing: {
        padding: 3,
        borderRadius: radius.xl + 3,
        borderWidth: 1.5,
        borderColor: colors.accentBright,
        marginBottom: space.md,
    },
    avatar: {
        width: AVATAR,
        height: AVATAR,
        borderRadius: radius.xl,
        alignItems: 'center',
        justifyContent: 'center',
        overflow: 'hidden',
    },
    avatarImage: { width: AVATAR, height: AVATAR },
    cover: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0 },
    avatarText: { fontFamily: fonts.bold, fontSize: 34, color: colors.onAccent },
    heroName: { ...type.title, fontSize: 22, maxWidth: '100%' },
    heroEmail: { ...type.subhead, marginTop: 3, maxWidth: '100%' },
    heroPhone: { ...type.caption, color: colors.textFaint, marginTop: 2 },
    editBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        marginTop: space.lg,
        paddingHorizontal: space.xl,
        paddingVertical: 10,
        borderRadius: radius.full,
        overflow: 'hidden',
    },
    editBtnText: { fontFamily: fonts.semibold, fontSize: 14, color: colors.onAccent },

    section: { marginTop: space.lg, paddingHorizontal: space.lg },
    card: { borderRadius: radius.lg, overflow: 'hidden' },
    cardGlass: { borderRadius: radius.lg, borderTopColor: colors.glassEdge },
    row: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: space.lg,
        paddingVertical: 13,
    },
    divider: {
        position: 'absolute',
        top: 0,
        left: space.lg + 34 + space.md,
        right: 0,
        height: StyleSheet.hairlineWidth,
        backgroundColor: colors.separator,
    },
    iconBox: {
        width: 34,
        height: 34,
        borderRadius: radius.sm,
        alignItems: 'center',
        justifyContent: 'center',
        marginRight: space.md,
        backgroundColor: colors.accentTint,
    },
    rowBody: { flex: 1 },
    rowTitle: { fontFamily: fonts.medium, fontSize: 15, color: colors.text },
    rowSubtitle: { ...type.subhead, fontSize: 13, marginTop: 2 },
    rowStatus: { fontFamily: fonts.medium, fontSize: 13, color: colors.textFaint },
    rowStatusActive: { color: colors.accentBright },
    chevron: { marginLeft: space.xs },

    hourRow: { flexDirection: 'column', alignItems: 'flex-start', gap: space.sm, paddingTop: 0, paddingLeft: space.lg + 34 + space.md },
    hourChips: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
    hourChip: {
        minWidth: 34,
        height: 34,
        borderRadius: 17,
        alignItems: 'center',
        justifyContent: 'center',
        overflow: 'hidden',
        backgroundColor: colors.glassRaised,
    },
    hourChipActive: { backgroundColor: colors.accent },
    hourChipText: { fontFamily: fonts.semibold, fontSize: 14, color: colors.textSoft },
    hourChipTextActive: { color: colors.onAccent },

    logoutRow: { justifyContent: 'center', gap: space.sm, paddingVertical: 15 },
    logoutText: { fontFamily: fonts.semibold, fontSize: 15, color: colors.danger },
    versionText: { ...type.caption, color: colors.textFaint, textAlign: 'center', marginTop: space.lg },
    deleteAccountLink: { alignSelf: 'center', paddingVertical: space.sm, paddingHorizontal: space.lg, marginTop: space.sm },
    deleteAccountText: { fontFamily: fonts.medium, fontSize: 13.5, color: colors.textFaint, textDecorationLine: 'underline' },
});
